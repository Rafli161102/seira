import assert from 'node:assert';
import test from 'node:test';
import { CompilerDriver, CompilerStage } from '../../../compiler/index.ts';
import type { HIRFunction } from '../../../compiler/index.ts';

test('HIR Pipeline: desugars data |> f into canonical CallExpr with synthetic origin', () => {
  const driver = new CompilerDriver();
  const source = `
    fn double(x: Int) -> Int { x * 2 }
    fn pipeline_test() {
      let r = 10 |> double;
    }
  `;

  const res = driver.compile(source, 'pipe.sr', { stopAfter: CompilerStage.HIR });
  assert.strictEqual(res.success, true);
  assert.ok(res.hir);

  const fnItem = res.hir.topLevelItems.find(
    (i) => i.kind === 'HIRFunction' && i.name === 'pipeline_test'
  ) as HIRFunction;
  const letStmt = fnItem.body.statements[0] as any;
  const expr = letStmt.initializer;

  // Canonical call semantics
  assert.ok(expr.kind === 'HIRCallExpr' || expr.kind === 'HIRFunctionValueCallExpr');
  assert.strictEqual(expr.args.length, 1);
  assert.strictEqual(expr.args[0].kind, 'HIRLiteralExpr');

  // Synthetic origin tracking
  assert.strictEqual(expr.source.kind, 'Synthetic');
  assert.strictEqual(expr.source.reason, 'desugared_pipeline');
});
