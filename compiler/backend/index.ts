/**
 * Seira Compiler Backend Boundary and Readiness Contract
 *
 * ABI/target validation is implemented; code generation remains NOT IMPLEMENTED
 *
 * Responsibilities:
 * - Code generation consumes MIR (compiler IR), NOT raw source or AST
 * - Native Code Generation: Emission via LLVM IR (targeting x86_64, AArch64)
 * - WebAssembly Generation: Emission of Wasm bytecode & component model
 * - Pluggable backend emitter contract
 *
 * Milestone: Reserved for Alpha Series (0.1.0-alpha).
 */

import { DiagnosticBag } from '../diagnostics/index.ts';
import { validateMIR, type MIRModule } from '../mir/index.ts';
import { validateBackendContract, type BackendTargetContract } from './contract.ts';

export * from './contract.ts';
import type { Span } from '../source/span.ts';

export type TargetBackend = 'native' | 'wasm32';

export interface BackendOptions {
  readonly target: TargetBackend;
  readonly optLevel: 0 | 1 | 2 | 3;
  readonly debug: boolean;
}

export interface BackendResult {
  readonly success: boolean;
  readonly target: TargetBackend;
  readonly outputBytes?: Uint8Array;
  readonly diagnostics: DiagnosticBag;
}

export interface BackendEmitter {
  readonly target: TargetBackend;
  emit(mir?: MIRModule | BackendOptions, options?: Partial<BackendOptions>): BackendResult;
}

export class CompilerBackend implements BackendEmitter {
  public readonly target: TargetBackend;
  private readonly diagnostics: DiagnosticBag;

  constructor(target: TargetBackend = 'native', diagnostics?: DiagnosticBag) {
    this.target = target;
    this.diagnostics = diagnostics ?? new DiagnosticBag();
  }

  public emit(
    mirOrOptions?: MIRModule | BackendOptions,
    options?: Partial<BackendOptions>
  ): BackendResult {
    let selectedTarget: TargetBackend = this.target;
    if (mirOrOptions && 'target' in mirOrOptions) {
      selectedTarget = (mirOrOptions as BackendOptions).target;
    } else if (options?.target) {
      selectedTarget = options.target;
    }

    if (mirOrOptions && !('target' in mirOrOptions)) {
      const mirValidation = validateMIR(mirOrOptions as MIRModule);
      if (!mirValidation.success) {
        for (const error of mirValidation.errors) {
          this.diagnostics.reportError(
            'E9003',
            `Backend rejected invalid MIR: ${error}`,
            { start: 0, end: 0, line: 1, column: 1 } as Span,
          );
        }
        return { success: false, target: selectedTarget, diagnostics: this.diagnostics };
      }
    }

    this.diagnostics.reportError(
      'E9001',
      `Backend code generation for '${selectedTarget}' is reserved for Alpha release 0.1.0-alpha.`,
      { start: 0, end: 0, line: 1, column: 1 } as Span,
      undefined,
      'Code generation targets will become operational during the Alpha series.'
    );

    return {
      success: false,
      target: selectedTarget,
      diagnostics: this.diagnostics,
    };
  }
}
