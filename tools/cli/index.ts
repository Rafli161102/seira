/**
 * Seira CLI Dispatcher
 * Official Command Line Interface for the Seira Programming Language.
 */

import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCheck } from './commands/check.ts';
import { runHelp } from './commands/help.ts';
import { runInfo } from './commands/info.ts';
import { runInit, runNew } from './commands/init.ts';
import { runReserved } from './commands/reserved.ts';
import { runRun } from './commands/run.ts';
import { runVersion } from './commands/version.ts';

export function main(argv: string[] = process.argv.slice(2)): number {
  if (argv.length === 0) {
    runHelp();
    return 0;
  }

  const firstArg = argv[0];

  // Global flags
  if (firstArg === '--version' || firstArg === '-v' || firstArg === 'version' || firstArg === 'v') {
    runVersion();
    return 0;
  }

  if (firstArg === '--help' || firstArg === '-h' || firstArg === 'help' || firstArg === 'h') {
    runHelp();
    return 0;
  }

  // Subcommands
  switch (firstArg) {
    case 'info':
    case 'i':
      runInfo();
      return 0;

    case 'check':
    case 'c': {
      const rest = argv.slice(1);
      const emitHir = rest.includes('--emit-hir');
      const target = rest.find((arg) => !arg.startsWith('--'));
      return runCheck(target, { emitHir });
    }

    case 'run':
    case 'r':
      return runRun(argv[1]);

    case 'init':
      return runInit(argv[1]);

    case 'new':
      return runNew(argv[1]);

    // Reserved long-term toolchain commands
    case 'build':
    case 'b':
    case 'test':
    case 't':
    case 'fmt':
    case 'f':
    case 'doc':
    case 'clean':
    case 'cache':
    case 'add':
    case 'remove':
    case 'update':
    case 'fetch':
      return runReserved(firstArg);

    default:
      console.error(`Error: Unknown command or flag '${firstArg}'.`);
      console.error(`Run 'sr --help' for available commands.`);
      return 1;
  }
}

// Execute if run as entry point
function isDirectExecution(): boolean {
  if (!process.argv[1]) return false;
  try {
    const metaPath = realpathSync(fileURLToPath(import.meta.url));
    const entryPath = realpathSync(process.argv[1]);
    return metaPath === entryPath;
  } catch {
    return resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
  }
}

if (isDirectExecution()) {
  const exitCode = main();
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}
