import assert from 'node:assert';
import test from 'node:test';
import { CompilerDriver, CompilerStage } from '../../../compiler/index.ts';
import type { HIRFunction } from '../../../compiler/index.ts';

test('HIR Effects: preserves isEffectful flag and effects metadata on functions', () => {
  const driver = new CompilerDriver();
  const source = `
    fn pure_fn(x: Int) -> Int { x + 1 }
    fn log_fn!(msg: String) {
      println(msg);
    }
  `;

  const res = driver.compile(source, 'effects.sr', { stopAfter: CompilerStage.HIR });
  assert.strictEqual(res.success, true);
  assert.ok(res.hir);

  const pureFn = res.hir.topLevelItems.find(
    (i) => i.kind === 'HIRFunction' && i.name === 'pure_fn'
  ) as HIRFunction;
  assert.strictEqual(pureFn.isEffectful, false);

  const logFn = res.hir.topLevelItems.find(
    (i) => i.kind === 'HIRFunction' && i.name === 'log_fn'
  ) as HIRFunction;
  assert.strictEqual(logFn.isEffectful, true);
});
