/**
 * Seira CLI Check Command
 * Orchestrates file validation through CompilerDriver.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CompilerDriver } from '../../../compiler/driver/index.ts';

export function runCheck(targetPath?: string): number {
  const driver = new CompilerDriver();

  if (!targetPath) {
    if (existsSync('Seira.toml')) {
      const result = driver.compilePackage(process.cwd(), { stopAfter: 'typecheck' });
      if (!result.success) {
        console.error(result.diagnostics.format());
        console.error(`\nCheck failed with errors in package '${result.package?.name ?? 'unknown'}'.`);
        return 1;
      }
      console.log(`✓ Check passed: Package '${result.package?.name}' (${result.sortedModules.length} module${result.sortedModules.length === 1 ? '' : 's'}).`);
      return 0;
    }
    console.error('Error: Missing target for check.');
    console.error('Usage: sr check [file.sr] or run inside a package directory with Seira.toml');
    return 1;
  }

  if (existsSync(join(targetPath, 'Seira.toml'))) {
    const result = driver.compilePackage(targetPath, { stopAfter: 'typecheck' });
    if (!result.success) {
      console.error(result.diagnostics.format());
      console.error(`\nCheck failed with errors in package '${result.package?.name ?? 'unknown'}'.`);
      return 1;
    }
    console.log(`✓ Check passed: Package '${result.package?.name}' (${result.sortedModules.length} module${result.sortedModules.length === 1 ? '' : 's'}).`);
    return 0;
  }

  if (!existsSync(targetPath)) {
    console.error(`Error: File not found: '${targetPath}'`);
    return 1;
  }

  const result = driver.compileFile(targetPath, { stopAfter: 'typecheck' });

  if (!result.success) {
    const source = result.context.sourceManager.getFileByPath(targetPath)?.text;
    console.error(result.diagnostics.format(source));
    console.error(`\nCheck failed with errors in '${targetPath}'.`);
    return 1;
  }

  const itemCount = result.ast?.items.length ?? 0;
  console.log(`✓ Check passed: '${targetPath}' (${itemCount} top-level item${itemCount === 1 ? '' : 's'}).`);
  return 0;
}
