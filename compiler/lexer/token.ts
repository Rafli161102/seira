/**
 * Seira Lexical Token Definitions
 *
 * Adheres to locked Seira syntax principles:
 * - Locked symbols: =, :, ->, =>, ., |>, ?, ?., ??, !, @, ..., .., ..<
 * - Compound assignments: +=, -=, *=, /=, %=
 * - Boolean keywords: and, or, not (rejection of &&, ||)
 * - Mutation: mut
 * - Resource lifecycle: with
 * - Expanded 0.0.3-s keyword set: enum, const, pub, priv, for, while, loop, break, continue, async, await, pure, unsafe, use, self
 */

import type { Span } from '../source/span.ts';

export const TokenType = {
  // Literals & Identifiers
  Identifier: 'Identifier',
  IntLiteral: 'IntLiteral',
  UIntLiteral: 'UIntLiteral',
  FloatLiteral: 'FloatLiteral',
  StringLiteral: 'StringLiteral',
  CharLiteral: 'CharLiteral',
  BoolLiteral: 'BoolLiteral',

  // Keywords
  Fn: 'Fn',
  Let: 'Let',
  Const: 'Const',
  Mut: 'Mut',
  With: 'With',
  And: 'And',
  Or: 'Or',
  Not: 'Not',
  If: 'If',
  Else: 'Else',
  Match: 'Match',
  For: 'For',
  While: 'While',
  Loop: 'Loop',
  Break: 'Break',
  Continue: 'Continue',
  Return: 'Return',
  Type: 'Type',
  Struct: 'Struct',
  Enum: 'Enum',
  Trait: 'Trait',
  Impl: 'Impl',
  Import: 'Import',
  Export: 'Export',
  Use: 'Use',
  As: 'As',
  Pub: 'Pub',
  Priv: 'Priv',
  Async: 'Async',
  Await: 'Await',
  Pure: 'Pure',
  Unsafe: 'Unsafe',
  Self: 'Self',

  // Locked Symbols
  Equal: '=',
  Colon: ':',
  Arrow: '->',
  FatArrow: '=>',
  Dot: '.',
  DotDot: '..',
  DotDotLess: '..<',
  Pipeline: '|>',
  Question: '?',
  QuestionDot: '?.',
  OptionFallback: '??',
  Bang: '!',
  At: '@',
  Spread: '...',

  // Compound Assignment Operators
  PlusEqual: '+=',
  MinusEqual: '-=',
  StarEqual: '*=',
  SlashEqual: '/=',
  PercentEqual: '%=',

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
  readonly type: TokenType;
  readonly lexeme: string;
  readonly value?: string | number | boolean;
  readonly span: Span;
}

export const KEYWORDS: Record<string, TokenType> = {
  fn: TokenType.Fn,
  let: TokenType.Let,
  const: TokenType.Const,
  mut: TokenType.Mut,
  with: TokenType.With,
  and: TokenType.And,
  or: TokenType.Or,
  not: TokenType.Not,
  if: TokenType.If,
  else: TokenType.Else,
  match: TokenType.Match,
  for: TokenType.For,
  while: TokenType.While,
  loop: TokenType.Loop,
  break: TokenType.Break,
  continue: TokenType.Continue,
  return: TokenType.Return,
  type: TokenType.Type,
  struct: TokenType.Struct,
  enum: TokenType.Enum,
  trait: TokenType.Trait,
  impl: TokenType.Impl,
  import: TokenType.Import,
  export: TokenType.Export,
  use: TokenType.Use,
  as: TokenType.As,
  pub: TokenType.Pub,
  priv: TokenType.Priv,
  async: TokenType.Async,
  await: TokenType.Await,
  pure: TokenType.Pure,
  unsafe: TokenType.Unsafe,
  self: TokenType.Self,
  true: TokenType.BoolLiteral,
  false: TokenType.BoolLiteral,
};
