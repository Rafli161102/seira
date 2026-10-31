import assert from 'node:assert';
import test from 'node:test';
import { CompilerDriver, CompilerStage } from '../../../compiler/index.ts';
import type { HIRFunction } from '../../../compiler/index.ts';

test('HIR Closures: lowers lambda expression into HIRClosureExpr with parameters and body', () => {
  const driver = new CompilerDriver();
  const source = `
    fn test_closure() {
      let f = (x: Int) => x * 2;
    }
  `;

  const res = driver.compile(source, 'closure.sr', { stopAfter: CompilerStage.HIR });
  assert.strictEqual(res.success, true);
  assert.ok(res.hir);

  const fnItem = res.hir.topLevelItems[0] as HIRFunction;
  const letStmt = fnItem.body.statements[0] as any;
  const closure = letStmt.initializer;

  assert.strictEqual(closure.kind, 'HIRClosureExpr');
  assert.strictEqual(closure.params.length, 1);
  assert.strictEqual(closure.params[0].name, 'x');
  assert.strictEqual(closure.params[0].type.id, 'type:Int');
  assert.ok(closure.body);
});
