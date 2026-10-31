import assert from 'node:assert';
import test from 'node:test';
import { CompilerDriver, CompilerStage } from '../../../compiler/index.ts';
import type { HIRFunction, HIRLetStmt } from '../../../compiler/index.ts';

test('HIR Lowering: lowers functions, parameters, and let bindings with semantic symbols', () => {
  const driver = new CompilerDriver();
  const source = `
    fn add(a: Int, b: Int) -> Int {
      let sum = a + b;
      return sum;
    }
  `;

  const res = driver.compile(source, 'math.sr', { stopAfter: CompilerStage.HIR });
  assert.strictEqual(res.success, true);
  assert.ok(res.hir);

  const fnItem = res.hir.topLevelItems.find((i) => i.kind === 'HIRFunction') as HIRFunction;
  assert.ok(fnItem);
  assert.strictEqual(fnItem.name, 'add');
  assert.strictEqual(fnItem.functionId, 'fn:add');
  assert.strictEqual(fnItem.params.length, 2);
  assert.strictEqual(fnItem.params[0].name, 'a');
  assert.strictEqual(fnItem.params[0].type.id, 'type:Int');
  assert.ok(fnItem.params[0].symbolId.startsWith('sym:'));

  const body = fnItem.body;
  assert.ok(body.statements.length >= 2);

  const letStmt = body.statements[0] as HIRLetStmt;
  assert.strictEqual(letStmt.kind, 'HIRLetStmt');
  assert.strictEqual(letStmt.name, 'sum');
  assert.strictEqual(letStmt.type.id, 'type:Int');
  assert.ok(letStmt.symbolId.startsWith('sym:'));
  assert.ok(letStmt.initializer);
  assert.strictEqual(letStmt.initializer.kind, 'HIRBinaryExpr');
});

test('HIR Lowering: preserves mutable bindings and assignments', () => {
  const driver = new CompilerDriver();
  const source = `
    fn counter() {
      let mut count = 0;
      count = count + 1;
    }
  `;

  const res = driver.compile(source, 'counter.sr', { stopAfter: CompilerStage.HIR });
  assert.strictEqual(res.success, true);
  assert.ok(res.hir);

  const fnItem = res.hir.topLevelItems.find((i) => i.kind === 'HIRFunction') as HIRFunction;
  const letStmt = fnItem.body.statements[0] as HIRLetStmt;
  assert.strictEqual(letStmt.isMut, true);

  const assignStmt = fnItem.body.statements[1] as any;
  assert.strictEqual(assignStmt.kind, 'HIRAssignStmt');
  assert.strictEqual(assignStmt.operator, '=');
});
