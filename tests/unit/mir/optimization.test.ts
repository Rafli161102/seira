import assert from 'node:assert/strict';
import test from 'node:test';
import { CompilerDriver, CompilerStage, validateMIR } from '../../../compiler/index.ts';
import { optimizeMIR } from '../../../compiler/mir/optimizer.ts';
import type { MIRModule } from '../../../compiler/mir/index.ts';
import { HIR_BOOL_TYPE, HIR_INT_TYPE } from '../../../compiler/hir/types.ts';

const source = {
  hirNodeId: 1,
  span: { start: 0, end: 1, line: 1, column: 1 },
};

function operation(opcode: string, dest: number, operands: number[], type = HIR_INT_TYPE, attributes?: Record<string, string | number | boolean | null>) {
  return { op: opcode, opcode, dest, operands, type, attributes, source };
}

function block(id: number, operations: any[], terminator: any, name = 'block') {
  return { id, name, parameters: [], operations, resourceOps: [], terminator };
}

function moduleOf(blocks: any[]): MIRModule {
  return {
    name: 'optimization-test',
    functions: [{
      name: 'main',
      functionId: 'fn:main',
      parameters: [],
      returnType: HIR_INT_TYPE,
      entry: 0,
      blocks,
    }],
  };
}

test('MIR optimization folds constant integer arithmetic and preserves the return value', () => {
  const input = moduleOf([
    block(0, [
      operation('const', 1, [], HIR_INT_TYPE, { literalKind: 'Int', value: '20', raw: '20' }),
      operation('const', 2, [], HIR_INT_TYPE, { literalKind: 'Int', value: '22', raw: '22' }),
      operation('binary', 3, [1, 2], HIR_INT_TYPE, { operator: '+' }),
    ], { kind: 'Return', value: 3 }, 'entry'),
  ]);
  const result = optimizeMIR(input, 1);
  const operations = result.module.functions[0].blocks[0].operations;
  assert.equal(result.stats.constantFolds, 1);
  assert.ok(operations.some((op) => op.dest === 3 && op.opcode === 'const' && op.attributes?.value === '42'));
  assert.equal(validateMIR(result.module).success, true);
});

test('MIR optimization folds constant branches and removes unreachable blocks', () => {
  const input = moduleOf([
    block(0, [
      operation('const', 1, [], HIR_BOOL_TYPE, { literalKind: 'Bool', value: true, raw: 'true' }),
    ], { kind: 'CondBranch', condition: 1, trueTarget: 1, trueArgs: [], falseTarget: 2, falseArgs: [] }, 'entry'),
    block(1, [operation('const', 2, [], HIR_INT_TYPE, { literalKind: 'Int', value: '7', raw: '7' })],
      { kind: 'Return', value: 2 }, 'taken'),
    block(2, [operation('const', 3, [], HIR_INT_TYPE, { literalKind: 'Int', value: '9', raw: '9' })],
      { kind: 'Return', value: 3 }, 'dead'),
  ]);
  const result = optimizeMIR(input, 1);
  const fn = result.module.functions[0];
  assert.equal(fn.blocks.length, 2);
  assert.equal(fn.blocks[0].terminator.kind, 'Branch');
  assert.equal(result.stats.branchesFolded, 1);
  assert.equal(result.stats.unreachableBlocksRemoved, 1);
  assert.equal(validateMIR(result.module).success, true);
});

test('MIR optimization never removes calls, resource events, or potentially trapping division', () => {
  const call = { op: 'call', opcode: 'call', dest: 4, operands: [], type: HIR_INT_TYPE, attributes: {}, source };
  const division = operation('binary', 5, [1, 2], HIR_INT_TYPE, { operator: '/' });
  const resource = { action: 'acquire' as const, resourceId: 4, cleanup: 'close', position: 1, source };
  const input = moduleOf([
    {
      id: 0, name: 'entry', parameters: [],
      operations: [
        operation('const', 1, [], HIR_INT_TYPE, { literalKind: 'Int', value: '1', raw: '1' }),
        operation('const', 2, [], HIR_INT_TYPE, { literalKind: 'Int', value: '0', raw: '0' }),
        call, division,
      ],
      resourceOps: [resource],
      terminator: { kind: 'Return', value: 4 },
    },
  ]);
  const result = optimizeMIR(input, 1);
  const operations = result.module.functions[0].blocks[0].operations;
  assert.ok(operations.some((op) => op.opcode === 'call'));
  assert.ok(operations.some((op) => op.opcode === 'binary' && op.attributes?.operator === '/'));
  assert.equal(result.module.functions[0].blocks[0].resourceOps[0].position, 1);
  assert.equal(validateMIR(result.module).success, true);
});

test('Compiler driver runs and validates MIR optimizations when optLevel is enabled', () => {
  const driver = new CompilerDriver();
  const result = driver.compile(
    'fn answer() -> Int { return 1 + 2; }',
    'optimized.sr',
    { stopAfter: CompilerStage.Optimize, config: { optLevel: 1 } }
  );
  assert.equal(result.success, true, result.diagnostics.format());
  assert.equal(result.stage, CompilerStage.Optimize);
  const operations = result.mir!.functions.flatMap((fn) => fn.blocks.flatMap((b) => b.operations));
  assert.ok(operations.some((op) => op.opcode === 'const' && op.attributes?.value === '3'));
  assert.ok(!operations.some((op) => op.opcode === 'binary'));
  assert.equal(validateMIR(result.mir!).success, true);
});


test('MIR optimization level zero preserves the original module without rewriting', () => {
  const input = moduleOf([
    block(0, [
      operation('const', 1, [], HIR_INT_TYPE, { literalKind: 'Int', value: '2', raw: '2' }),
      operation('const', 2, [], HIR_INT_TYPE, { literalKind: 'Int', value: '3', raw: '3' }),
      operation('binary', 3, [1, 2], HIR_INT_TYPE, { operator: '+' }),
    ], { kind: 'Return', value: 3 }, 'entry'),
  ]);
  const result = optimizeMIR(input, 0);
  assert.equal(result.module, input);
  assert.deepEqual(result.stats, {
    constantFolds: 0,
    branchesFolded: 0,
    unreachableBlocksRemoved: 0,
    deadOperationsRemoved: 0,
  });
});

test('MIR optimization adjusts resource event positions after dead pure operations are removed', () => {
  const input = moduleOf([
    {
      id: 0,
      name: 'entry',
      parameters: [],
      operations: [
        operation('const', 1, [], HIR_INT_TYPE, { literalKind: 'Int', value: '4', raw: '4' }),
        operation('const', 2, [], HIR_INT_TYPE, { literalKind: 'Int', value: '5', raw: '5' }),
        operation('binary', 3, [1, 2], HIR_INT_TYPE, { operator: '+' }),
        { op: 'call', opcode: 'call', dest: 4, operands: [], type: HIR_INT_TYPE, attributes: {}, source },
      ],
      resourceOps: [{ action: 'acquire', resourceId: 4, cleanup: 'close', position: 4, source }],
      terminator: { kind: 'Return', value: 4 },
    },
  ]);
  const result = optimizeMIR(input, 1);
  const optimizedBlock = result.module.functions[0].blocks[0];
  assert.deepEqual(optimizedBlock.operations.map((op) => op.opcode), ['call']);
  assert.equal(optimizedBlock.resourceOps[0].position, 1);
  assert.equal(validateMIR(result.module).success, true);
});


test('MIR optimization level zero preserves the original module without rewriting', () => {
  const input = moduleOf([
    block(0, [
      operation('const', 1, [], HIR_INT_TYPE, { literalKind: 'Int', value: '2', raw: '2' }),
      operation('const', 2, [], HIR_INT_TYPE, { literalKind: 'Int', value: '3', raw: '3' }),
      operation('binary', 3, [1, 2], HIR_INT_TYPE, { operator: '+' }),
    ], { kind: 'Return', value: 3 }, 'entry'),
  ]);
  const result = optimizeMIR(input, 0);
  assert.equal(result.module, input);
  assert.deepEqual(result.stats, { constantFolds: 0, branchesFolded: 0, unreachableBlocksRemoved: 0, deadOperationsRemoved: 0 });
});

test('MIR optimization remaps resource event positions after removing dead pure operations', () => {
  const input = moduleOf([{
    id: 0, name: 'entry', parameters: [],
    operations: [
      operation('const', 1, [], HIR_INT_TYPE, { literalKind: 'Int', value: '4', raw: '4' }),
      operation('const', 2, [], HIR_INT_TYPE, { literalKind: 'Int', value: '5', raw: '5' }),
      operation('binary', 3, [1, 2], HIR_INT_TYPE, { operator: '+' }),
      { op: 'call', opcode: 'call', dest: 4, operands: [], type: HIR_INT_TYPE, attributes: {}, source },
    ],
    resourceOps: [{ action: 'acquire', resourceId: 4, cleanup: 'close', position: 4, source }],
    terminator: { kind: 'Return', value: 4 },
  }]);
  const result = optimizeMIR(input, 1);
  const optimized = result.module.functions[0].blocks[0];
  assert.deepEqual(optimized.operations.map((op) => op.opcode), ['call']);
  assert.equal(optimized.resourceOps[0].position, 1);
  assert.equal(validateMIR(result.module).success, true);
});


test('MIR pass manager verifies each pass and stops before committing an invalid candidate', () => {
  const input = moduleOf([
    block(0, [
      operation('const', 1, [], HIR_INT_TYPE, { literalKind: 'Int', value: '8', raw: '8' }),
      operation('const', 2, [], HIR_INT_TYPE, { literalKind: 'Int', value: '9', raw: '9' }),
      operation('binary', 3, [1, 2], HIR_INT_TYPE, { operator: '+' }),
    ], { kind: 'Return', value: 3 }, 'entry'),
  ]);
  const checked: string[] = [];
  const result = optimizeMIR(input, 1, (_candidate, passName) => {
    checked.push(passName);
    return passName === 'unreachable-block-elimination' ? ['synthetic verifier rejection'] : [];
  });
  assert.deepEqual(checked, ['constant-fold-and-branch-simplification', 'unreachable-block-elimination']);
  assert.deepEqual(result.passesRun, ['constant-fold-and-branch-simplification']);
  assert.equal(result.verificationFailures.length, 1);
  assert.equal(result.verificationFailures[0].passName, 'unreachable-block-elimination');
  assert.equal(result.module.functions[0].blocks[0].operations.find((op) => op.dest === 3)?.opcode, 'const');
});
