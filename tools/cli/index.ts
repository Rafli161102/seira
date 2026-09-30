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
import { runVersion } from './commands/version.ts';

export function main(argv: string[] = process.argv.slice(2)): number {
  if (argv.length === 0) {
    runHelp();
    return 0;
  }

  const firstArg = argv[0];

  // Global flags
  if (firstArg === '--version' || firstArg === '-v' || firstArg === 'version') {
    runVersion();
    return 0;
  }

  if (firstArg === '--help' || firstArg === '-h' || firstArg === 'help') {
    runHelp();
    return 0;
  }

  // Subcommands
  switch (firstArg) {
    case 'info':
      runInfo();
      return 0;

    case 'check':
      return runCheck(argv[1]);

    case 'init':
      return runInit();

    case 'new':
      return runNew(argv[1]);

    // Reserved long-term toolchain commands
    case 'build':
    case 'run':
    case 'test':
    case 'fmt':
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
      console.error(`Run 'seira --help' for available commands.`);
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
