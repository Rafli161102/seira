/**
 * Seira CLI Run Command (0.0.5-s Execution Foundation)
 *
 * Orchestrates the full Seira execution pipeline:
 *   1. Load source
 *   2. Lex
 *   3. Parse
 *   4. Resolve
 *   5. Type-check
 *   6. Execute (Tree-Walking Engine)
 *   7. Display result / output
 *   8. Display structured diagnostics on failure
 *
 * IMPORTANT: 'seira run' always performs full front-end validation before
 * execution. It never bypasses the compiler pipeline to force execution.
 *
 * Distinction from 'seira check':
 *   check — validate only (no execution)
 *   run   — validate AND execute
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ExecutionEngine, type ExecutionResult } from '../../../runtime/execution/engine.ts';
import { formatRuntimeValue } from '../../../runtime/execution/values.ts';

function handleExecutionResult(result: ExecutionResult, targetName: string): number {
  if (!result.success) {
    const diagnostics = result.diagnostics.format();
    if (diagnostics) {
      console.error(diagnostics);
    }
    console.error(`\nExecution failed in '${targetName}'.`);
    return 1;
  }

  // Output is already printed inline during execution by println/print.
  // If the program produced a non-Unit final value, display it.
  if (result.value && result.value.tag !== 'Unit') {
    const display = formatRuntimeValue(result.value);
    if (result.output.length === 0) {
      console.log(display);
    }
  }

  return 0;
}

export function runRun(targetPath?: string): number {
  const engine = new ExecutionEngine();

  // If no target provided, check for Seira.toml in current directory
  if (!targetPath) {
    if (existsSync('Seira.toml')) {
      const result = engine.executePackage(process.cwd());
      return handleExecutionResult(result, 'package');
    }
    console.error('Error: Missing target for run.');
    console.error('Usage: sr run [file.sr] or run inside a package directory with Seira.toml');
    return 1;
  }

  // If target directory has Seira.toml
  if (existsSync(join(targetPath, 'Seira.toml'))) {
    const result = engine.executePackage(targetPath);
    return handleExecutionResult(result, targetPath);
  }

  if (!existsSync(targetPath)) {
    console.error(`Error: File not found: '${targetPath}'`);
    return 1;
  }

  const result = engine.executeFile(targetPath);
  return handleExecutionResult(result, targetPath);
}
