/**
 * Seira Compiler Name Resolver (Architectural Skeleton)
 *
 * Responsibilities:
 * - Scoped symbol table construction
 * - Lexical scope hierarchy (block, function, module, global)
 * - Variable binding and resolution (shadowing, mutability constraints)
 * - Function and type name resolution
 * - Import / export module graph analysis
 *
 * Milestone: Planned for Seed Series (0.0.2-s / 0.0.3-s).
 */

import type { Program } from '../ast/ast.ts';
import { DiagnosticBag, type Span } from '../diagnostics/index.ts';

export interface SymbolTable {
  parent?: SymbolTable;
  symbols: Map<string, SymbolInfo>;
}

export interface SymbolInfo {
  name: string;
  kind: 'variable' | 'function' | 'type' | 'trait' | 'effect';
  span: Span;
  isMut?: boolean;
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
    // SKELETON: Reserved for 0.0.2-s Seed release.
    this.diagnostics.report(
      'SEIRA-E0300',
      "Name resolver is an architectural skeleton reserved for Seed milestone 0.0.2-s.",
      program.span,
      'info',
      file,
      "Scope resolution and symbol binding will be activated in 0.0.2-s."
    );

    return {
      success: true,
      diagnostics: this.diagnostics,
    };
  }
}
