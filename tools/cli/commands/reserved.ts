/**
 * Seira CLI Reserved Command Handler
 * Emits clear diagnostic status for commands planned for future milestones.
 */

import { SEIRA_VERSION } from './version.ts';

const RESERVED_ROADMAP: Record<string, string> = {
  build: '0.1.0-alpha (Native LLVM & WebAssembly Backend)',
  run: '0.1.0-alpha (Execution Engine & Bytecode/Binary Runner)',
  test: '0.1.0-alpha (Integrated Test Runner)',
  fmt: '0.0.11-d (Source Code Formatter)',
  doc: '0.0.11-d (Docstring Generator)',
  clean: '0.0.11-d (Cache Cleaner)',
  cache: '0.0.11-d (Compilation Cache Manager)',
  add: '0.0.12-d (Package Manager Dependency Resolution)',
  remove: '0.0.12-d (Package Manager Dependency Resolution)',
  update: '0.0.12-d (Package Manager Dependency Resolution)',
  fetch: '0.0.12-d (Package Manager Dependency Resolution)',
};

export function runReserved(commandName: string): number {
  const milestone = RESERVED_ROADMAP[commandName] ?? 'Future Release';
  console.log(`Seira ${SEIRA_VERSION} (Seed Foundation)`);
  console.log(`Notice: Command 'seira ${commandName}' is reserved and not implemented in 0.0.1-s.`);
  console.log(`Target Milestone:      ${milestone}`);
  console.log(`Architecture Document: docs/architecture/overview.md`);
  console.log(`Run 'seira --help' to see currently active commands.`);
  return 0;
}
