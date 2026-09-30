/**
 * Seira Compiler Backend Architecture (Architectural Skeleton)
 *
 * Responsibilities:
 * - Native Code Generation: Emission via LLVM IR (targeting x86_64, AArch64)
 * - WebAssembly Generation: Emission of Wasm bytecode & component model
 * - Pluggable backend interface
 *
 * Milestone: Planned for Alpha Series (0.1.0-alpha).
 */

import { DiagnosticBag } from '../diagnostics/index.ts';

export type TargetBackend = 'native' | 'wasm32';

export interface BackendOptions {
  target: TargetBackend;
  optLevel: 0 | 1 | 2 | 3;
  debug: boolean;
}

export interface BackendResult {
  readonly success: boolean;
  readonly target: TargetBackend;
  readonly outputBytes?: Uint8Array;
  readonly diagnostics: DiagnosticBag;
}

export class CompilerBackend {
  private readonly diagnostics: DiagnosticBag;

  constructor(diagnostics?: DiagnosticBag) {
    this.diagnostics = diagnostics ?? new DiagnosticBag();
  }

  public emit(options: BackendOptions): BackendResult {
    this.diagnostics.report(
      'SEIRA-E0600',
      `Backend code generation for '${options.target}' is reserved for Alpha release 0.1.0-alpha.`,
      { start: 0, end: 0, line: 1, column: 1 },
      'error',
      undefined,
      "Code generation targets will become operational during the Alpha series."
    );

    return {
      success: false,
      target: options.target,
      diagnostics: this.diagnostics,
    };
  }
}
