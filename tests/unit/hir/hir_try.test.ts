import assert from 'node:assert';
import test from 'node:test';
import { CompilerDriver, CompilerStage } from '../../../compiler/index.ts';
import type { HIRFunction } from '../../../compiler/index.ts';

test('HIR Try: preserves ? propagation as canonical HIRTryExpr with Result/Option kind', () => {
  const driver = new CompilerDriver();
  const source = `
    fn try_test(opt: Option<Int>) -> Option<Int> {
      let x = opt?;
      return Some(x);
    }
  `;

  const res = driver.compile(source, 'try.sr', { stopAfter: CompilerStage.HIR });
  assert.strictEqual(res.success, true);
  assert.ok(res.hir);

  const fnItem = res.hir.topLevelItems.find(
    (i) => i.kind === 'HIRFunction' && i.name === 'try_test'
  ) as HIRFunction;
  const letStmt = fnItem.body.statements[0] as any;
  const expr = letStmt.initializer;

  assert.strictEqual(expr.kind, 'HIRTryExpr');
  assert.strictEqual(expr.tryKind, 'Option');
  assert.strictEqual(expr.source.kind, 'Synthetic');
  assert.strictEqual(expr.source.reason, 'desugared_try_propagation');
});
