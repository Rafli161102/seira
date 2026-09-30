/**
 * Seira High-Level Intermediate Representation (HIR)
 *
 * ARCHITECTURAL SKELETON — NOT IMPLEMENTED
 *
 * Responsibilities:
 * - Lowering AST into canonical high-level semantic representation
 * - Desugaring syntactic sugar (pipelines `|>`, default operators `??`, `with` blocks)
 * - Module linking and monomorphization preparation
 * - Semantic annotations (resolved symbols, validated types, effect signatures)
 *
 * Milestone: Planned for Development Series (0.0.11-d+).
 */

import type { Program } from '../ast/ast.ts';
import { DiagnosticBag } from '../diagnostics/index.ts';
import type { Span } from '../source/span.ts';

export type HIRId = number;

export interface HIRProgram {
  readonly version: string;
  readonly modules: ReadonlyArray<HIRModule>;
  readonly functions: ReadonlyArray<HIRFunction>;
}

export interface HIRModule {
  readonly id: HIRId;
  readonly name: string;
  readonly span: Span;
}

export interface HIRFunction {
  readonly id: HIRId;
  readonly name: string;
  readonly isEffectful: boolean;
  readonly body: HIRBlock;
  readonly span: Span;
}

export interface HIRBlock {
  readonly id: HIRId;
  readonly statements: ReadonlyArray<HIRStmt>;
  readonly span: Span;
}

export interface HIRStmt {
  readonly id: HIRId;
  readonly kind: string;
  readonly span: Span;
}

export interface HIRExpr {
  readonly id: HIRId;
  readonly kind: string;
  readonly span: Span;
}

export class HIRLowering {
  private readonly diagnostics: DiagnosticBag;

  constructor(diagnostics?: DiagnosticBag) {
    this.diagnostics = diagnostics ?? new DiagnosticBag();
  }

  public lower(program: Program, file?: string): HIRProgram {
    this.diagnostics.reportInfo(
      'I1001',
      'HIR lowering is an architectural skeleton reserved for the Development Series.',
      program.span,
      file,
      'HIR transformation will be enabled in 0.0.11-d.'
    );

    return {
      version: '0.0.4-s',
      modules: [],
      functions: [],
    };
  }
}
