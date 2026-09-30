/**
 * Seira CLI Check Command
 * Validates Seira source syntax via Seed Lexer and Parser.
 */

import { existsSync, readFileSync } from 'node:fs';
import { compileSource } from '../../../compiler/index.ts';

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

  const source = readFileSync(filePath, 'utf-8');
  const result = compileSource(source, filePath);

  if (!result.success) {
    console.error(result.diagnostics.format(source));
    console.error(`\nCheck failed with errors in '${filePath}'.`);
    return 1;
  }

  const itemCount = result.ast?.items.length ?? 0;
  console.log(`✓ Syntax check passed: '${filePath}' (${itemCount} top-level item${itemCount === 1 ? '' : 's'}).`);
  return 0;
}
