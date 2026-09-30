import assert from 'node:assert';
import test from 'node:test';
import type {
  Attribute,
  FunctionDecl,
  IdentifierPattern,
  ImportDecl,
  LiteralPattern,
  ModuleDecl,
  Program,
  WildcardPattern,
} from '../../../compiler/ast/ast.ts';
import { createSpan } from '../../../compiler/source/span.ts';

test('AST: constructs Program and declaration nodes preserving spans', () => {
  const dummySpan = createSpan(0, 50, 1, 1, 1);

  const moduleNode: ModuleDecl = {
    kind: 'ModuleDecl',
    name: 'math.core',
    span: dummySpan,
  };
  assert.strictEqual(moduleNode.kind, 'ModuleDecl');
  assert.strictEqual(moduleNode.name, 'math.core');
  assert.strictEqual(moduleNode.span.start, 0);

  const importNode: ImportDecl = {
    kind: 'ImportDecl',
    path: 'std.io',
    alias: 'io',
    importedItems: ['println', 'print'],
    span: dummySpan,
  };
  assert.strictEqual(importNode.kind, 'ImportDecl');
  assert.strictEqual(importNode.alias, 'io');
  assert.strictEqual(importNode.importedItems?.length, 2);

  const program: Program = {
    kind: 'Program',
    items: [moduleNode, importNode],
    span: dummySpan,
  };
  assert.strictEqual(program.kind, 'Program');
  assert.strictEqual(program.items.length, 2);
});

test('AST: supports attributes on declarations', () => {
  const span = createSpan(0, 20, 1, 1, 1);
  const inlineAttr: Attribute = {
    kind: 'Attribute',
    name: 'inline',
    args: ['always'],
    span,
  };

  const fnNode: FunctionDecl = {
    kind: 'FunctionDecl',
    name: 'fast_calc',
    isEffectful: false,
    params: [],
    body: {
      kind: 'Block',
      statements: [],
      span,
    },
    attributes: [inlineAttr],
    span,
  };

  assert.strictEqual(fnNode.attributes?.length, 1);
  assert.strictEqual(fnNode.attributes?.[0].name, 'inline');
  assert.strictEqual(fnNode.attributes?.[0].args?.[0], 'always');
});

test('AST: supports pattern representations', () => {
  const span = createSpan(0, 10, 1, 1, 1);

  const idPattern: IdentifierPattern = {
    kind: 'IdentifierPattern',
    name: 'count',
    isMut: true,
    span,
  };
  assert.strictEqual(idPattern.kind, 'IdentifierPattern');
  assert.strictEqual(idPattern.name, 'count');
  assert.strictEqual(idPattern.isMut, true);

  const wildcard: WildcardPattern = {
    kind: 'WildcardPattern',
    span,
  };
  assert.strictEqual(wildcard.kind, 'WildcardPattern');

  const litPattern: LiteralPattern = {
    kind: 'LiteralPattern',
    literal: {
      kind: 'Literal',
      value: 100,
      raw: '100',
      span,
    },
    span,
  };
  assert.strictEqual(litPattern.kind, 'LiteralPattern');
  assert.strictEqual(litPattern.literal.value, 100);
});
