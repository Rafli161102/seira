import assert from 'node:assert';
import test from 'node:test';
import { CompilerDriver, CompilerStage } from '../../../compiler/index.ts';
import type { HIRFunction } from '../../../compiler/index.ts';

test('HIR Expressions: lowers literals with correct kind and type', () => {
  const driver = new CompilerDriver();
  const source = `
    fn literals() {
      let a = 42;
      let b = 3.14;
      let c = true;
      let d = "hello";
    }
  `;

  const res = driver.compile(source, 'lit.sr', { stopAfter: CompilerStage.HIR });
  assert.strictEqual(res.success, true);
  assert.ok(res.hir);

  const fnItem = res.hir.topLevelItems[0] as HIRFunction;
  const stmts = fnItem.body.statements as any[];

  assert.strictEqual(stmts[0].initializer.kind, 'HIRLiteralExpr');
  assert.strictEqual(stmts[0].initializer.literalKind, 'int');
  assert.strictEqual(stmts[0].initializer.type.id, 'type:Int');

  assert.strictEqual(stmts[1].initializer.kind, 'HIRLiteralExpr');
  assert.strictEqual(stmts[1].initializer.literalKind, 'float');

  assert.strictEqual(stmts[2].initializer.kind, 'HIRLiteralExpr');
  assert.strictEqual(stmts[2].initializer.literalKind, 'bool');
  assert.strictEqual(stmts[2].initializer.type.id, 'type:Bool');

  assert.strictEqual(stmts[3].initializer.kind, 'HIRLiteralExpr');
  assert.strictEqual(stmts[3].initializer.literalKind, 'string');
  assert.strictEqual(stmts[3].initializer.type.id, 'type:String');
});

test('HIR Expressions: lowers struct construction and field access', () => {
  const driver = new CompilerDriver();
  const source = `
    struct Point {
      x: Int,
      y: Int
    }
    fn make_point() {
      p: Point = Point;
      let px = p.x;
    }
  `;

  const res = driver.compile(source, 'point.sr', { stopAfter: CompilerStage.HIR });
  assert.strictEqual(res.success, true);
  assert.ok(res.hir);

  const fnItem = res.hir.topLevelItems.find((i) => i.kind === 'HIRFunction') as HIRFunction;
  const stmts = fnItem.body.statements as any[];

  const fieldAccess = stmts[1].initializer;
  assert.strictEqual(fieldAccess.kind, 'HIRFieldAccessExpr');
  assert.strictEqual(fieldAccess.fieldName, 'x');
  assert.ok(fieldAccess.fieldId.startsWith('field:Point.x'));
});

test('HIR Expressions: lowers lists, tuples, and indexing', () => {
  const driver = new CompilerDriver();
  const source = `
    fn collections() {
      let list = [1, 2, 3];
      let item = list[0];
    }
  `;

  const res = driver.compile(source, 'coll.sr', { stopAfter: CompilerStage.HIR });
  assert.strictEqual(res.success, true);
  assert.ok(res.hir);

  const fnItem = res.hir.topLevelItems.find((i) => i.kind === 'HIRFunction') as HIRFunction;
  const stmts = fnItem.body.statements as any[];

  const listConstruct = stmts[0].initializer;
  assert.strictEqual(listConstruct.kind, 'HIRConstructExpr');
  assert.strictEqual(listConstruct.constructKind, 'List');
  assert.strictEqual(listConstruct.elements.length, 3);

  const indexExpr = stmts[1].initializer;
  assert.strictEqual(indexExpr.kind, 'HIRIndexExpr');
  assert.strictEqual(indexExpr.index.kind, 'HIRLiteralExpr');
});
