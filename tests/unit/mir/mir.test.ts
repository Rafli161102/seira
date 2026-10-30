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

test('MIR merges mutable bindings into SSA block parameters after if branches', () => {
  const source = `
    fn choose(flag: Bool) -> Int {
      let mut value = 0;
      if flag {
        value = 1;
      } else {
        value = 2;
      }
      value
    }
  `;
  const result = new CompilerDriver().compile(source, 'mutable-ssa.sr', { stopAfter: CompilerStage.MIR });
  assert.equal(result.success, true, result.diagnostics.format());
  const fn = result.mir!.functions.find((item) => item.name === 'choose');
  assert.ok(fn);
  const merge = fn.blocks.find((block) => block.name.startsWith('if.join'));
  assert.ok(merge);
  assert.ok(merge.parameters.length >= 2, 'expected result and mutable-local block parameters');
  assert.ok(merge.parameters.some((parameter) => parameter.symbolId?.includes('value')));
  assert.equal(validateMIR(result.mir!).success, true, validateMIR(result.mir!).errors.join('\n'));
});

test('MIR carries mutable locals through loop headers and exits', () => {
  const source = `
    fn count_up() -> Int {
      let mut count = 0;
      while count < 3 {
        count = count + 1;
      }
      count
    }
  `;
  const result = new CompilerDriver().compile(source, 'loop-ssa.sr', { stopAfter: CompilerStage.MIR });
  assert.equal(result.success, true, result.diagnostics.format());
  const fn = result.mir!.functions.find((item) => item.name === 'count_up');
  assert.ok(fn);
  const header = fn.blocks.find((block) => block.name.startsWith('loop.header'));
  const exit = fn.blocks.find((block) => block.name.startsWith('loop.exit'));
  assert.ok(header);
  assert.ok(exit);
  assert.equal(header.parameters.length, 1);
  assert.equal(exit.parameters.length, 1);
  assert.ok(header.parameters[0].symbolId?.includes('count'));
  assert.ok(exit.parameters[0].symbolId?.includes('count'));
  assert.equal(validateMIR(result.mir!).success, true, validateMIR(result.mir!).errors.join('\n'));
});

test('MIR verifier rejects a value use that is not dominated by its definition', () => {
  const intType = { id: 'type:Int', kind: 'Primitive', name: 'Int' } as const;
  const boolType = { id: 'type:Bool', kind: 'Primitive', name: 'Bool' } as const;
  const invalid = {
    name: 'invalid-dominance',
    functions: [{
      name: 'invalid',
      functionId: 'fn:invalid',
      parameters: [],
      returnType: intType,
      entry: 0,
      blocks: [
        { id: 0, name: 'entry', parameters: [], resourceOps: [],
          operations: [{ op: 'const', opcode: 'const', dest: 1, operands: [], type: boolType }],
          terminator: { kind: 'CondBranch', condition: 1, trueTarget: 1, trueArgs: [], falseTarget: 2, falseArgs: [] } },
        { id: 1, name: 'left', parameters: [], resourceOps: [],
          operations: [{ op: 'const', opcode: 'const', dest: 2, operands: [], type: intType }],
          terminator: { kind: 'Branch', target: 3, args: [] } },
        { id: 2, name: 'right', parameters: [], resourceOps: [],
          operations: [{ op: 'copy', opcode: 'copy', dest: 3, operands: [2], type: intType }],
          terminator: { kind: 'Branch', target: 3, args: [] } },
        { id: 3, name: 'merge', parameters: [], operations: [], resourceOps: [],
          terminator: { kind: 'Return' } },
      ],
    }],
  } as any;
  const validation = validateMIR(invalid);
  assert.equal(validation.success, false);
  assert.ok(validation.errors.some((error) => error.includes('does not dominate')));
});
