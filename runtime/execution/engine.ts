/**
 * Seira Execution Engine — Public Interface (0.0.5-s Execution Foundation)
 *
 * Provides the unified API for executing semantically validated Seira programs.
 * Integrates with the existing compiler pipeline without duplicating any
 * front-end infrastructure.
 *
 * Usage:
 *   const engine = new ExecutionEngine();
 *   const result = engine.executeSource(source, filePath);
 */

import { CompilerDriver } from '../../compiler/driver/driver.ts';
import { CompilerStage } from '../../compiler/driver/stage.ts';
import { DiagnosticBag, formatDiagnostic } from '../../compiler/diagnostics/index.ts';
import { Evaluator, ExecutionContext, type ExecutionConfig } from './evaluator.ts';
import { isPanic, isReturn, normalOutcome, type RuntimeOutcome } from './outcomes.ts';
import { UNIT_VALUE, formatRuntimeValue, type RuntimeValue } from './values.ts';

export * from './values.ts';
export * from './outcomes.ts';
export { Evaluator, ExecutionContext } from './evaluator.ts';
export type { ExecutionConfig, CallFrame } from './evaluator.ts';

// ─── Execution Result ─────────────────────────────────────────────────────────

export interface ExecutionResult {
  /** True iff compilation and execution both succeeded with no errors. */
  readonly success: boolean;
  /** The final runtime value produced by the program. */
  readonly value?: RuntimeValue;
  /** Formatted string representation of the final value (Seira-idiomatic). */
  readonly displayValue?: string;
  /** Structured diagnostics (compile-time and runtime). */
  readonly diagnostics: DiagnosticBag;
  /** Lines emitted by println/print during execution. */
  readonly output: ReadonlyArray<string>;
  /** The raw runtime outcome (Normal, Return, or Panic). */
  readonly outcome?: RuntimeOutcome;
}

// ─── Execution Engine ─────────────────────────────────────────────────────────

/**
 * Seira Execution Engine
 *
 * Orchestrates the full Seira execution pipeline:
 *   Source → Compiler → Validated AST → Tree-Walking Evaluator → RuntimeOutcome
 *
 * The engine reuses the existing CompilerDriver and does NOT duplicate
 * any compiler infrastructure.
 */
export class ExecutionEngine {
  private readonly compilerDriver: CompilerDriver;

  constructor() {
    this.compilerDriver = new CompilerDriver();
  }

  /**
   * Compiles and executes a Seira source string.
   */
  public executeSource(
    source: string,
    filePath?: string,
    config?: Partial<ExecutionConfig>
  ): ExecutionResult {
    // Phase 1: Compile through type-check (full front-end validation)
    const compileResult = this.compilerDriver.compile(source, filePath, {
      stopAfter: CompilerStage.Typecheck,
    });

    if (!compileResult.success || !compileResult.ast) {
      return {
        success: false,
        diagnostics: compileResult.diagnostics,
        output: [],
      };
    }

    // Phase 2: Execute validated AST
    const ctx = new ExecutionContext(
      { ...config, fileName: filePath },
      compileResult.diagnostics
    );
    const evaluator = new Evaluator(ctx);
    const outcome = evaluator.executeProgram(compileResult.ast);

    return this.buildResult(outcome, ctx);
  }

  /**
   * Compiles and executes a Seira source file.
   */
  public executeFile(
    filePath: string,
    config?: Partial<ExecutionConfig>
  ): ExecutionResult {
    // Phase 1: Compile
    const compileResult = this.compilerDriver.compileFile(filePath, {
      stopAfter: CompilerStage.Typecheck,
    });

    if (!compileResult.success || !compileResult.ast) {
      return {
        success: false,
        diagnostics: compileResult.diagnostics,
        output: [],
      };
    }

    // Phase 2: Execute validated AST
    const ctx = new ExecutionContext(
      { ...config, fileName: filePath },
      compileResult.diagnostics
    );
    const evaluator = new Evaluator(ctx);
    const outcome = evaluator.executeProgram(compileResult.ast);

    return this.buildResult(outcome, ctx);
  }

  private buildResult(outcome: RuntimeOutcome, ctx: ExecutionContext): ExecutionResult {
    const output = Array.from(ctx.getCapturedOutput());

    if (isPanic(outcome)) {
      ctx.reportRuntimeError(outcome.error);
      return {
        success: false,
        diagnostics: ctx.diagnostics,
        output,
        outcome,
      };
    }

    const value = outcome.kind === 'Normal' || outcome.kind === 'Return'
      ? outcome.value
      : UNIT_VALUE;

    return {
      success: true,
      value,
      displayValue: formatRuntimeValue(value),
      diagnostics: ctx.diagnostics,
      output,
      outcome,
    };
  }
}

// ─── Diagnostic Formatting ────────────────────────────────────────────────────

/**
 * Formats an execution result's diagnostics for CLI display.
 */
export function formatExecutionDiagnostics(
  result: ExecutionResult,
  sourceText?: string
): string {
  return result.diagnostics.format(sourceText);
}
