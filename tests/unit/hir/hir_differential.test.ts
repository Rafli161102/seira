import assert from 'node:assert';
import test from 'node:test';
import { CompilerDriver, CompilerStage } from '../../../compiler/index.ts';
import type { HIRFunction } from '../../../compiler/index.ts';
import { ExecutionEngine } from '../../../runtime/index.ts';

test('HIR Differential: AST runtime execution and HIR lowering are semantically aligned', () => {
  const source = `
    fn add(a: Int, b: Int) -> Int {
      return a + b;
    }

    fn main() -> Int {
      let x = 10;
      let y = 20;
      return add(x, y);
    }
  `;

  // 1. Lower to HIR via CompilerDriver
  const driver = new CompilerDriver();
  const res = driver.compile(source, 'diff.sr', { stopAfter: CompilerStage.HIR });
  assert.strictEqual(res.success, true);
  assert.ok(res.hir);
  assert.ok(res.ast);

  // Validate HIR semantics
  const mainFn = res.hir.topLevelItems.find(
    (i) => i.kind === 'HIRFunction' && i.name === 'main'
  ) as HIRFunction;
  assert.ok(mainFn);
  assert.strictEqual(mainFn.returnType.id, 'type:Int');

  const addFn = res.hir.topLevelItems.find(
    (i) => i.kind === 'HIRFunction' && i.name === 'add'
  ) as HIRFunction;
  assert.ok(addFn);
  assert.strictEqual(addFn.params.length, 2);
  assert.strictEqual(addFn.params[0].type.id, 'type:Int');
  assert.strictEqual(addFn.params[1].type.id, 'type:Int');

  // 2. Execute via existing AST Runtime evaluator
  const engine = new ExecutionEngine();
  const execResult = engine.executeSource(source, 'diff.sr');
  assert.strictEqual(execResult.success, true);
  assert.strictEqual(execResult.displayValue, '30');
});
