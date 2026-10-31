import assert from 'node:assert';
import test from 'node:test';
import { CompilerDriver, CompilerStage, printHIR } from '../../../compiler/index.ts';

test('HIR Determinism: identical input produces identical HIR and identical printer output', () => {
  const source = `
    fn calculate(x: Int, y: Int) -> Int {
      let mut total = x + y;
      if total > 100 {
        total = total * 2;
      }
      return total;
    }
  `;

  const driver1 = new CompilerDriver();
  const res1 = driver1.compile(source, 'calc.sr', { stopAfter: CompilerStage.HIR });
  assert.strictEqual(res1.success, true);
  assert.ok(res1.hir);

  const driver2 = new CompilerDriver();
  const res2 = driver2.compile(source, 'calc.sr', { stopAfter: CompilerStage.HIR });
  assert.strictEqual(res2.success, true);
  assert.ok(res2.hir);

  // Both serialized representations must be character-for-character identical
  const output1 = printHIR(res1.hir);
  const output2 = printHIR(res2.hir);

  assert.strictEqual(output1, output2);
  assert.strictEqual(JSON.stringify(res1.hir), JSON.stringify(res2.hir));
});
