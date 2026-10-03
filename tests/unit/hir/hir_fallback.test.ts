import assert from 'node:assert';
import test from 'node:test';
import { CompilerDriver, CompilerStage } from '../../../compiler/index.ts';
import type { HIRFunction } from '../../../compiler/index.ts';

test('HIR Fallback: preserves ?? as canonical HIRFallbackExpr with lazy semantics and synthetic origin', () => {
  const driver = new CompilerDriver();
  const source = `
    fn fallback_test(opt: Option<Int>) -> Int {
      let val = opt ?? 0;
      return val;
    }
  `;

  const res = driver.compile(source, 'fallback.sr', { stopAfter: CompilerStage.HIR });
  assert.strictEqual(res.success, true);
  assert.ok(res.hir);

  const fnItem = res.hir.topLevelItems.find(
    (i) => i.kind === 'HIRFunction' && i.name === 'fallback_test'
  ) as HIRFunction;
  const letStmt = fnItem.body.statements[0] as any;
  const expr = letStmt.initializer;

  assert.strictEqual(expr.kind, 'HIRFallbackExpr');
  assert.strictEqual(expr.left.kind, 'HIRLocalExpr');
  assert.strictEqual(expr.right.kind, 'HIRLiteralExpr');

  assert.strictEqual(expr.source.kind, 'Synthetic');
  assert.strictEqual(expr.source.reason, 'desugared_option_fallback');
});
