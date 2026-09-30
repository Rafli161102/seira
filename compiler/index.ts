/**
 * Seira Compiler Entry Point
 * Orchestrates the compilation phases:
 * Source -> Lexer -> Parser -> AST -> Diagnostics
 */

import type { Program } from './ast/ast.ts';
import { DiagnosticBag } from './diagnostics/index.ts';
import { Lexer } from './lexer/lexer.ts';
import type { Token } from './lexer/token.ts';
import { Parser } from './parser/parser.ts';

export * from './ast/ast.ts';
export * from './backend/index.ts';
export * from './diagnostics/index.ts';
export * from './hir/index.ts';
export * from './lexer/lexer.ts';
export * from './lexer/token.ts';
export * from './mir/index.ts';
export * from './parser/parser.ts';
export * from './resolver/index.ts';
export * from './typecheck/index.ts';

export interface CompilationResult {
  readonly success: boolean;
  readonly tokens: Token[];
  readonly ast?: Program;
  readonly diagnostics: DiagnosticBag;
}

export function compileSource(source: string, file?: string): CompilationResult {
  const diagnostics = new DiagnosticBag();

  // Phase 1: Lexical Analysis
  const lexer = new Lexer(source, file, diagnostics);
  const tokens = lexer.tokenize();

  if (diagnostics.hasErrors()) {
    return {
      success: false,
      tokens,
      diagnostics,
    };
  }

  // Phase 2: Parsing & AST Construction
  const parser = new Parser(tokens, file, diagnostics);
  let ast: Program | undefined;

  try {
    ast = parser.parse();
  } catch {
    // Parsing error recorded in diagnostics
  }

  const success = !diagnostics.hasErrors() && ast !== undefined;

  return {
    success,
    tokens,
    ast,
    diagnostics,
  };
}
