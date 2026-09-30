/**
 * Seira High-Level Intermediate Representation (HIR) (Architectural Skeleton)
 *
 * Responsibilities:
 * - Lowering AST into canonical high-level IR
 * - Desugaring syntactic sugar (pipelines `|>`, default operators `??`, `with` blocks)
 * - Module linking and monomorphization preparation
 *
 * Milestone: Planned for Development Series (0.0.11-d+).
 */

import type { Program } from '../ast/ast.ts';
import { DiagnosticBag } from '../diagnostics/index.ts';

export interface HIRProgram {
  readonly version: string;
  readonly nodes: unknown[];
}

export class HIRLowering {
  private readonly diagnostics: DiagnosticBag;

  constructor(diagnostics?: DiagnosticBag) {
    this.diagnostics = diagnostics ?? new DiagnosticBag();
  }

  public lower(program: Program, file?: string): HIRProgram {
    this.diagnostics.reportInfo(
      'I1001',
      "HIR lowering is an architectural skeleton reserved for the Development Series.",
      program.span,
      file,
      "HIR transformation will be enabled in 0.0.11-d."
    );

    return {
      version: '0.0.1-s',
      nodes: [],
    };
  }
}
