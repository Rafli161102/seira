/**
 * Seira Compiler Type Checker & Inference Engine (Architectural Skeleton)
 *
 * ARCHITECTURAL SKELETON — NOT IMPLEMENTED
 *
 * Responsibilities:
 * - Aggressive type inference (Hindley-Milner / bidirectional)
 * - Static type checking for strong typing invariants
 * - Option<T> and Result<T, E> unwrap and propagation validation
 * - Effect tracking: verifying that effectful functions (!) are called only within effectful contexts or handlers
 * - Mutability checking: ensuring immutable values are never mutated without `mut`
 * - Trait conformance and generic constraint solving
 *
 * Milestone: Reserved for Seed Series (0.0.3-s / 0.0.4-s).
 */

import type { Program } from '../ast/ast.ts';
import { DiagnosticBag } from '../diagnostics/index.ts';

export type Type =
  | { readonly kind: 'Primitive'; readonly name: string }
  | { readonly kind: 'Function'; readonly params: ReadonlyArray<Type>; readonly returnType: Type; readonly isEffectful: boolean }
  | { readonly kind: 'Generic'; readonly base: string; readonly typeArguments: ReadonlyArray<Type> }
  | { readonly kind: 'Tuple'; readonly elements: ReadonlyArray<Type> }
  | { readonly kind: 'Unit' };

export interface TypecheckResult {
  readonly success: boolean;
  readonly diagnostics: DiagnosticBag;
}

export class TypeChecker {
  private readonly diagnostics: DiagnosticBag;

  constructor(diagnostics?: DiagnosticBag) {
    this.diagnostics = diagnostics ?? new DiagnosticBag();
  }

  public check(program: Program, file?: string): TypecheckResult {
    this.diagnostics.reportInfo(
      'E3001',
      'Type checker is an architectural skeleton reserved for Seed milestone 0.0.3-s.',
      program.span,
      file,
      'Static type inference and effect tracking will be activated in 0.0.3-s.'
    );

    return {
      success: true,
      diagnostics: this.diagnostics,
    };
  }
}
