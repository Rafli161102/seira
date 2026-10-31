/**
 * Seira CLI Check Command
 * Orchestrates file validation through CompilerDriver.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CompilerDriver, CompilerStage, printHIR } from '../../../compiler/index.ts';

export interface CheckOptions {
  readonly emitHir?: boolean;
}

export function runCheck(targetPath?: string, options?: CheckOptions): number {
  const driver = new CompilerDriver();
  const stopAfter = options?.emitHir ? CompilerStage.HIR : CompilerStage.Typecheck;

  if (!targetPath) {
    if (existsSync('Seira.toml')) {
      const result = driver.compilePackage(process.cwd(), { stopAfter });
      if (!result.success) {
        console.error(result.diagnostics.format());
        console.error(`\nCheck failed with errors in package '${result.package?.name ?? 'unknown'}'.`);
        return 1;
      }
      console.log(`✓ Check passed: Package '${result.package?.name}' (${result.sortedModules.length} module${result.sortedModules.length === 1 ? '' : 's'}).`);
      return 0;
    }
    console.error('Error: Missing target for check.');
    console.error('Usage: sr check [file.sr] [--emit-hir] or run inside a package directory with Seira.toml');
    return 1;
  }

  if (existsSync(join(targetPath, 'Seira.toml'))) {
    const result = driver.compilePackage(targetPath, { stopAfter });
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

  const result = driver.compileFile(targetPath, { stopAfter });

  if (!result.success) {
    const source = result.context.sourceManager.getFileByPath(targetPath)?.text;
    console.error(result.diagnostics.format(source));
    console.error(`\nCheck failed with errors in '${targetPath}'.`);
    return 1;
  }

  if (options?.emitHir && result.hir) {
    console.log(printHIR(result.hir));
    return 0;
  }

  const itemCount = result.ast?.items.length ?? 0;
  console.log(`✓ Check passed: '${targetPath}' (${itemCount} top-level item${itemCount === 1 ? '' : 's'}).`);
  return 0;
}
