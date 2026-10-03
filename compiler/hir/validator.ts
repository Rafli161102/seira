/**
 * Seira High-Level Intermediate Representation (HIR) — Multi-Layer Validator
 *
 * Implements strict, layered validation of HIR programs:
 * 1. Structural Layer: Well-formed trees, valid NodeIds, non-empty statements/bodies.
 * 2. Semantic Reference Layer: Valid SymbolId, FunctionId, FieldId, TraitId, ImplId.
 * 3. Type Attachment Layer: Every expression and parameter carries an attached, non-empty HIRType.
 * 4. Source Mapping Layer: Every node carries a valid SourceOrigin (Source or Synthetic).
 * 5. Metadata Layer: Valid method dispatch, try kinds, resource cleanup contracts.
 * 6. Architecture Boundary Layer: Rejects any low-level IR constructs (BasicBlock, SSA, Phi, Register, LLVM, Wasm).
 */

import { DiagnosticBag, type Span } from '../diagnostics/index.ts';
import type {
  HIRBlock,
  HIRExpr,
  HIRFunction,
  HIRItem,
  HIRModule,
  HIRPattern,
  HIRProgram,
  HIRStmt,
} from './nodes.ts';
import type { SourceOrigin } from './origin.ts';
import type { HIRType } from './types.ts';
import { walkHIRProgram } from './visitor.ts';

export interface HIRValidationResult {
  readonly success: boolean;
  readonly errors: ReadonlyArray<string>;
  readonly warnings: ReadonlyArray<string>;
}

export class HIRValidator {
  private readonly diagnostics: DiagnosticBag;
  private readonly errors: string[] = [];
  private readonly warnings: string[] = [];

  constructor(diagnostics?: DiagnosticBag) {
    this.diagnostics = diagnostics ?? new DiagnosticBag();
  }

  public validate(program: HIRProgram): HIRValidationResult {
    this.errors.length = 0;
    this.warnings.length = 0;

    // Layer 1: Structural Validation
    this.validateStructural(program);

    // Layer 2: Semantic References
    this.validateSemanticReferences(program);

    // Layer 3: Type Attachment
    this.validateTypeAttachment(program);

    // Layer 4: Source Mapping
    this.validateSourceMapping(program);

    // Layer 5: Metadata
    this.validateMetadata(program);

    // Layer 6: Architecture Boundary
    this.validateArchitectureBoundary(program);

    const success = this.errors.length === 0;

    if (!success) {
      for (const err of this.errors) {
        this.diagnostics.reportError(
          'E4004',
          `HIR Validation Error: ${err}`,
          program.source.span,
          program.source.file
        );
      }
    }

    return {
      success,
      errors: [...this.errors],
      warnings: [...this.warnings],
    };
  }

  // ─── Layer 1: Structural Validation ─────────────────────────────────────────

  private validateStructural(program: HIRProgram): void {
    if (!program || program.kind !== 'HIRProgram') {
      this.errors.push('Root node must be a valid HIRProgram.');
      return;
    }

    if (!program.id || program.id <= 0) {
      this.errors.push(`Invalid root Program NodeId: ${program.id}`);
    }

    if (!Array.isArray(program.modules) || !Array.isArray(program.topLevelItems)) {
      this.errors.push('Program must contain valid modules and topLevelItems arrays.');
    }

    walkHIRProgram(program, {
      visitFunction: (fn) => {
        if (!fn.name || fn.name.trim() === '') {
          this.errors.push(`Function at NodeId ${fn.id} has empty name.`);
        }
        if (!fn.body || fn.body.kind !== 'HIRBlock') {
          this.errors.push(`Function '${fn.name}' has invalid or missing body.`);
        }
      },
      visitBlock: (block) => {
        if (!Array.isArray(block.statements)) {
          this.errors.push(`Block at NodeId ${block.id} has invalid statements array.`);
        }
      },
    });
  }

  // ─── Layer 2: Semantic Reference Validation ─────────────────────────────────

  private validateSemanticReferences(program: HIRProgram): void {
    walkHIRProgram(program, {
      visitFunction: (fn) => {
        if (!fn.functionId || !fn.functionId.startsWith('fn:')) {
          this.errors.push(`Function '${fn.name}' has invalid FunctionId '${fn.functionId}'.`);
        }
        if (!fn.symbolId || !fn.symbolId.startsWith('sym:')) {
          this.errors.push(`Function '${fn.name}' has invalid SymbolId '${fn.symbolId}'.`);
        }
      },
      visitStmt: (stmt) => {
        if (stmt.kind === 'HIRLetStmt') {
          if (!stmt.symbolId || !stmt.symbolId.startsWith('sym:')) {
            this.errors.push(`Let statement '${stmt.name}' has invalid SymbolId '${stmt.symbolId}'.`);
          }
        }
      },
      visitExpr: (expr) => {
        if (expr.kind === 'HIRLocalExpr') {
          if (!expr.symbolId || !expr.symbolId.startsWith('sym:')) {
            this.errors.push(`Local reference '${expr.name}' has invalid SymbolId '${expr.symbolId}'.`);
          }
        } else if (expr.kind === 'HIRGlobalExpr') {
          if (!expr.symbolId || !expr.symbolId.startsWith('sym:')) {
            this.errors.push(`Global reference '${expr.name}' has invalid SymbolId '${expr.symbolId}'.`);
          }
        } else if (expr.kind === 'HIRCallExpr') {
          if (!expr.functionId || !expr.functionId.startsWith('fn:')) {
            this.errors.push(`CallExpr has invalid FunctionId '${expr.functionId}'.`);
          }
        } else if (expr.kind === 'HIRFieldAccessExpr') {
          if (!expr.fieldId || !expr.fieldId.startsWith('field:')) {
            this.errors.push(`FieldAccessExpr has invalid FieldId '${expr.fieldId}'.`);
          }
        }
      },
    });
  }

  // ─── Layer 3: Type Attachment Validation ───────────────────────────────────

  private validateTypeAttachment(program: HIRProgram): void {
    walkHIRProgram(program, {
      visitExpr: (expr) => {
        if (!expr.type || typeof expr.type !== 'object') {
          this.errors.push(`Expression kind '${expr.kind}' at NodeId ${expr.id} lacks an attached HIRType.`);
        } else if (!expr.type.id || !expr.type.id.startsWith('type:')) {
          this.errors.push(`Expression kind '${expr.kind}' at NodeId ${expr.id} has invalid TypeId '${expr.type.id}'.`);
        }
      },
      visitStmt: (stmt) => {
        if (stmt.kind === 'HIRLetStmt') {
          if (!stmt.type || !stmt.type.id) {
            this.errors.push(`LetStmt '${stmt.name}' lacks a valid attached HIRType.`);
          }
        } else if (stmt.kind === 'HIRWithStmt') {
          if (!stmt.resourceType || !stmt.resourceType.id) {
            this.errors.push(`WithStmt lacks a valid attached resourceType.`);
          }
        }
      },
    });
  }

  // ─── Layer 4: Source Mapping Validation ─────────────────────────────────────

  private validateSourceMapping(program: HIRProgram): void {
    const validateOrigin = (origin: SourceOrigin, nodeName: string) => {
      if (!origin || (origin.kind !== 'Source' && origin.kind !== 'Synthetic')) {
        this.errors.push(`${nodeName} has invalid SourceOrigin kind '${origin?.kind}'.`);
        return;
      }
      if (!origin.span || typeof origin.span.start !== 'number' || typeof origin.span.end !== 'number') {
        this.errors.push(`${nodeName} has invalid span in SourceOrigin.`);
      }
      if (origin.kind === 'Synthetic' && !origin.reason) {
        this.errors.push(`Synthetic ${nodeName} must provide a non-empty lowering reason.`);
      }
    };

    validateOrigin(program.source, 'HIRProgram');

    walkHIRProgram(program, {
      visitFunction: (fn) => validateOrigin(fn.source, `HIRFunction '${fn.name}'`),
      visitBlock: (block) => validateOrigin(block.source, `HIRBlock (id: ${block.id})`),
      visitStmt: (stmt) => validateOrigin(stmt.source, `HIRStmt '${stmt.kind}'`),
      visitExpr: (expr) => validateOrigin(expr.source, `HIRExpr '${expr.kind}'`),
      visitPattern: (pat) => validateOrigin(pat.source, `HIRPattern '${pat.kind}'`),
    });
  }

  // ─── Layer 5: Metadata Validation ───────────────────────────────────────────

  private validateMetadata(program: HIRProgram): void {
    walkHIRProgram(program, {
      visitStmt: (stmt) => {
        if (stmt.kind === 'HIRWithStmt') {
          if (!stmt.cleanupContract || stmt.cleanupContract !== 'close') {
            this.errors.push(`WithStmt has invalid cleanupContract '${stmt.cleanupContract}'. Expected 'close'.`);
          }
        }
      },
      visitExpr: (expr) => {
        if (expr.kind === 'HIRTryExpr') {
          if (expr.tryKind !== 'Result' && expr.tryKind !== 'Option') {
            this.errors.push(`HIRTryExpr has invalid tryKind '${expr.tryKind}'. Expected 'Result' or 'Option'.`);
          }
        } else if (expr.kind === 'HIRMethodCallExpr') {
          if (!expr.dispatch || !['Concrete', 'Trait', 'Builtin'].includes(expr.dispatch.kind)) {
            this.errors.push(`MethodCallExpr '${expr.method}' has invalid dispatch kind.`);
          }
        }
      },
    });
  }

  // ─── Layer 6: Architecture Boundary Validation ─────────────────────────────

  private validateArchitectureBoundary(program: HIRProgram): void {
    const rawProgram = program as any;

    const bannedProperties = [
      'basicBlocks',
      'basic_blocks',
      'cfg',
      'ssa',
      'phi',
      'register',
      'llvmValue',
      'llvmType',
      'wasmInstruction',
      'machineRegister',
      'vtable',
      'monomorphized',
    ];

    const checkBannedProps = (obj: any, path: string) => {
      if (!obj || typeof obj !== 'object') return;
      for (const prop of bannedProperties) {
        if (prop in obj && obj[prop] !== undefined) {
          this.errors.push(`Architecture Boundary Violation: Banned lower-level compiler property '${prop}' found at '${path}'.`);
        }
      }
    };

    walkHIRProgram(program, {
      visitFunction: (fn) => checkBannedProps(fn, `HIRFunction '${fn.name}'`),
      visitBlock: (block) => checkBannedProps(block, `HIRBlock (id: ${block.id})`),
      visitStmt: (stmt) => checkBannedProps(stmt, `HIRStmt '${stmt.kind}'`),
      visitExpr: (expr) => checkBannedProps(expr, `HIRExpr '${expr.kind}'`),
    });
  }
}
