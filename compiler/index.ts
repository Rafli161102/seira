/**
 * Seira Compiler Core Entry Point
 *
 * Exposes the public architectural contracts and compiler pipeline interface:
 * CLI / Tooling -> Compiler Driver -> Compiler Subsystems -> Backend Interface
 */

import type { Program } from './ast/ast.ts';
import type { DiagnosticBag } from './diagnostics/index.ts';
import { CompilerDriver, type CompilationResult as DriverCompilationResult } from './driver/index.ts';
import type { Token } from './lexer/token.ts';

export * from './ast/ast.ts';
export * from './backend/index.ts';
export * from './diagnostics/index.ts';
export * from './driver/index.ts';
export * from './hir/index.ts';
export * from './lexer/lexer.ts';
export * from './lexer/token.ts';
export * from './mir/index.ts';
export * from './parser/parser.ts';
export * from './resolver/index.ts';
export * from './source/index.ts';
export * from './typecheck/index.ts';

export interface CompilationResult {
  readonly success: boolean;
  readonly tokens: ReadonlyArray<Token>;
  readonly ast?: Program;
  readonly diagnostics: DiagnosticBag;
}

/**
 * Compiles Seira source code through the parsing phase.
 * Provided for backward-compatible consumption by CLI and test suites.
 */
export function compileSource(source: string, file?: string): DriverCompilationResult {
  const driver = new CompilerDriver();
  return driver.compile(source, file, { stopAfter: 'parse' });
}
