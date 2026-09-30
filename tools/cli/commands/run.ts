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
import { ExecutionEngine } from '../../../runtime/execution/engine.ts';
import { formatRuntimeValue } from '../../../runtime/execution/values.ts';

export function runRun(filePath?: string): number {
  if (!filePath) {
    console.error('Error: Missing file path for run.');
    console.error('Usage: seira run <file.sra>');
    return 1;
  }

  if (!existsSync(filePath)) {
    console.error(`Error: File not found: '${filePath}'`);
    return 1;
  }

  const engine = new ExecutionEngine();
  const result = engine.executeFile(filePath);

  if (!result.success) {
    const diagnostics = result.diagnostics.format();
    if (diagnostics) {
      console.error(diagnostics);
    }
    console.error(`\nExecution failed in '${filePath}'.`);
    return 1;
  }

  // Output is already printed inline during execution by println/print.
  // If the program produced a non-Unit final value, display it.
  if (result.value && result.value.tag !== 'Unit') {
    const display = formatRuntimeValue(result.value);
    // Only show the final value if nothing was already printed by println
    if (result.output.length === 0) {
      console.log(display);
    }
  }

  return 0;
}
