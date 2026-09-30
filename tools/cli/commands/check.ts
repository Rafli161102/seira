/**
 * Seira CLI Check Command
 * Orchestrates file validation through CompilerDriver.
 */

import { existsSync } from 'node:fs';
import { CompilerDriver } from '../../../compiler/driver/index.ts';

export function runCheck(filePath?: string): number {
  if (!filePath) {
    console.error('Error: Missing file path for check.');
    console.error('Usage: seira check <file.sra>');
    return 1;
  }

  if (!existsSync(filePath)) {
    console.error(`Error: File not found: '${filePath}'`);
    return 1;
  }

  const driver = new CompilerDriver();
  const result = driver.compileFile(filePath, { stopAfter: 'typecheck' });

  if (!result.success) {
    const source = result.context.sourceManager.getFileByPath(filePath)?.text;
    console.error(result.diagnostics.format(source));
    console.error(`\nCheck failed with errors in '${filePath}'.`);
    return 1;
  }

  const itemCount = result.ast?.items.length ?? 0;
  console.log(`✓ Check passed: '${filePath}' (${itemCount} top-level item${itemCount === 1 ? '' : 's'}).`);
  return 0;
}
