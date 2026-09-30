/**
 * Seira Compiler Name Resolver (Architectural Skeleton)
 *
 * ARCHITECTURAL SKELETON — NOT IMPLEMENTED
 *
 * Responsibilities:
 * - Scoped symbol table construction
 * - Lexical scope hierarchy (block, function, module, global)
 * - Variable binding and resolution (shadowing, mutability constraints)
 * - Function and type name resolution
 * - Import / export module graph analysis
 *
 * Milestone: Reserved for Seed Series (0.0.3-s+).
 */

import type { Program } from '../ast/ast.ts';
import { DiagnosticBag, type Span } from '../diagnostics/index.ts';

export type ScopeKind = 'global' | 'module' | 'function' | 'block';

export interface SymbolTable {
  readonly kind: ScopeKind;
  readonly parent?: SymbolTable;
  readonly symbols: Map<string, SymbolInfo>;
}

export interface SymbolInfo {
  readonly name: string;
  readonly kind: 'variable' | 'function' | 'type' | 'trait' | 'effect' | 'module';
  readonly span: Span;
  readonly isMut?: boolean;
}

export interface ResolverResult {
  readonly success: boolean;
  readonly globalScope?: SymbolTable;
  readonly diagnostics: DiagnosticBag;
}

export class Resolver {
  private readonly diagnostics: DiagnosticBag;

  constructor(diagnostics?: DiagnosticBag) {
    this.diagnostics = diagnostics ?? new DiagnosticBag();
  }

  public resolve(program: Program, file?: string): ResolverResult {
    this.diagnostics.reportInfo(
      'E2001',
      'Name resolver is an architectural skeleton reserved for Seed milestone 0.0.3-s.',
      program.span,
      file,
      'Scope resolution and symbol binding will be activated in 0.0.3-s.'
    );

    return {
      success: true,
      diagnostics: this.diagnostics,
    };
  }
}
