import assert from 'node:assert/strict';
import test from 'node:test';
import { CompilerDriver, CompilerStage, validateMIR } from '../../../compiler/index.ts';

test('MIR lowers typed functions and if expressions into a validated CFG', () => {
  const source = `
    fn add_one(x: Int) -> Int { x + 1 }
    fn main() -> Int {
      let x = 2;
      let y = add_one(x);
      if y > 2 { y } else { 0 }
    }
  `;
  const result = new CompilerDriver().compile(source, 'mir.sr', { stopAfter: CompilerStage.MIR });
  assert.equal(result.success, true, result.diagnostics.format());
  assert.ok(result.hir);
  assert.ok(result.mir);
  assert.equal(result.mir.functions.length, 2);
  const main = result.mir.functions.find((fn) => fn.name === 'main');
  assert.ok(main);
  assert.ok(main.blocks.length >= 4);
  assert.ok(main.blocks.some((block) => block.parameters.length > 0), 'if expression should merge values with block parameters');
  assert.equal(validateMIR(result.mir).success, true);
});

test('MIR emits resource acquire and release operations for HIR with blocks', () => {
  const source = `
    fn main() {
      with res = open_resource("db_conn") {
        let value = 1;
      }
    }
  `;
  const result = new CompilerDriver().compile(source, 'resource-mir.sr', { stopAfter: CompilerStage.MIR });
  assert.equal(result.success, true, result.diagnostics.format());
  const resourceOps = result.mir!.functions.flatMap((fn) => fn.blocks.flatMap((block) => block.resourceOps));
  assert.ok(resourceOps.some((op) => op.action === 'acquire'));
  assert.ok(resourceOps.some((op) => op.action === 'release'));
  assert.equal(validateMIR(result.mir!).success, true);
});
