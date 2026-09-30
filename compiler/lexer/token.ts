/**
 * Seira Lexical Token Definitions
 * Adheres to locked Seira syntax principles:
 * - Locked symbols: =, :, ->, =>, ., |>, ?, ?., ??, !, @, ...
 * - Boolean keywords: and, or, not (no &&, ||)
 * - Mutation: mut
 * - Resource lifecycle: with
 */

import type { Span } from '../diagnostics/index.ts';

export const TokenType = {
  // Literals & Identifiers
  Identifier: 'Identifier',
  IntLiteral: 'IntLiteral',
  FloatLiteral: 'FloatLiteral',
  StringLiteral: 'StringLiteral',
  BoolLiteral: 'BoolLiteral',

  // Keywords
  Fn: 'Fn',
  Let: 'Let',
  Mut: 'Mut',
  With: 'With',
  And: 'And',
  Or: 'Or',
  Not: 'Not',
  If: 'If',
  Else: 'Else',
  Match: 'Match',
  Return: 'Return',
  Type: 'Type',
  Struct: 'Struct',
  Trait: 'Trait',
  Impl: 'Impl',
  Import: 'Import',
  Export: 'Export',
  As: 'As',

  // Locked Symbols
  Equal: '=',
  Colon: ':',
  Arrow: '->',
  FatArrow: '=>',
  Dot: '.',
  Pipeline: '|>',
  Question: '?',
  QuestionDot: '?.',
  OptionFallback: '??',
  Bang: '!',
  At: '@',
  Spread: '...',

  // Delimiters
  OpenParen: '(',
  CloseParen: ')',
  OpenBrace: '{',
  CloseBrace: '}',
  OpenBracket: '[',
  CloseBracket: ']',
  Comma: ',',
  Semicolon: ';',

  // Arithmetic & Comparison Operators
  Plus: '+',
  Minus: '-',
  Star: '*',
  Slash: '/',
  Percent: '%',
  EqualEqual: '==',
  BangEqual: '!=',
  Less: '<',
  LessEqual: '<=',
  Greater: '>',
  GreaterEqual: '>=',

  // Special
  Eof: 'EOF',
  Illegal: 'Illegal',
} as const;

export type TokenType = (typeof TokenType)[keyof typeof TokenType];

export interface Token {
  type: TokenType;
  lexeme: string;
  value?: string | number | boolean;
  span: Span;
}

export const KEYWORDS: Record<string, TokenType> = {
  fn: TokenType.Fn,
  let: TokenType.Let,
  mut: TokenType.Mut,
  with: TokenType.With,
  and: TokenType.And,
  or: TokenType.Or,
  not: TokenType.Not,
  if: TokenType.If,
  else: TokenType.Else,
  match: TokenType.Match,
  return: TokenType.Return,
  type: TokenType.Type,
  struct: TokenType.Struct,
  trait: TokenType.Trait,
  impl: TokenType.Impl,
  import: TokenType.Import,
  export: TokenType.Export,
  as: TokenType.As,
  true: TokenType.BoolLiteral,
  false: TokenType.BoolLiteral,
};
