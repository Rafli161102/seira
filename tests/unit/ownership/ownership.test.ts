import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeOwnership,
  CompilerDriver,
  CompilerStage,
} from '../../../compiler/index.ts';
import type { MIRModule, MIROperation, MIRResourceOp } from '../../../compiler/index.ts';

const UNIT = { id: 'type:Unit', kind: 'Primitive', name: 'Unit' } as const;
const INT = { id: 'type:Int', kind: 'Primitive', name: 'Int' } as const;

function operation(
  opcode: string,
  operands: number[] = [],
  dest?: number,
): MIROperation {
  return {
    op: opcode,
    opcode,
    operands,
    ...(dest === undefined ? {} : { dest, type: INT }),
  };
}

function ownershipModule(
  operations: MIROperation[],
  resourceOps: MIRResourceOp[] = [],
  terminator: any = { kind: 'Return' },
): MIRModule {
  return {
    name: 'ownership-tests',
    functions: [{
      name: 'subject',
      functionId: 'fn:subject',
      parameters: [],
      returnType: UNIT,
      entry: 0,
      blocks: [{
        id: 0,
        name: 'entry',
        parameters: [],
        operations,
        resourceOps,
        terminator,
      }],
    }],
  };
}

function codes(module: MIRModule): string[] {
  return analyzeOwnership(module).issues.map((issue) => issue.code);
}

test('Ownership: ResourceCheck stage accepts a resource with a complete with lifecycle', () => {
  const source = `
    fn main() {
      with res = open_resource("db_conn") {
        let value = 1;
      }
    }
  `;
  const result = new CompilerDriver().compile(source, 'ownership-with.sr', {
    stopAfter: CompilerStage.ResourceCheck,
  });

  assert.equal(result.stage, CompilerStage.ResourceCheck);
  assert.equal(result.success, true, result.diagnostics.format());
  assert.equal(result.ownership?.success, true);
  assert.deepEqual(result.ownership?.issues, []);
});

test('Ownership: source-level shared borrow is lowered and ended at lexical scope exit', () => {
  const result = new CompilerDriver().compile(`fn inspect(value: &Int) {} fn main() { let count = 7; inspect(&count); }`, 'shared-borrow.sr', { stopAfter: CompilerStage.ResourceCheck });
  assert.equal(result.success, true, result.diagnostics.format());
  const operations = result.mir!.functions.flatMap((fn) => fn.blocks.flatMap((block) => block.operations));
  assert.ok(operations.some((op) => op.opcode === 'borrow.shared'));
  assert.ok(operations.some((op) => op.opcode === 'borrow.end'));
});

test('Ownership: temporary call-argument borrows end after the call', () => {
  const result = new CompilerDriver().compile(`fn inspect(value: &Int) {} fn update(value: &mut Int) {} fn main() { mut count = 7; inspect(&count); update(&mut count); }`, 'borrow-call-lifetime.sr', { stopAfter: CompilerStage.ResourceCheck });
  assert.equal(result.success, true, result.diagnostics.format());
});

test('Ownership: rejects conflicting mutable and shared source-level borrows', () => {
  const result = new CompilerDriver().compile(`fn main() { mut count = 7; shared = &count; exclusive = &mut count; }`, 'borrow-conflict.sr', { stopAfter: CompilerStage.ResourceCheck });
  assert.equal(result.success, false);
  assert.ok(result.diagnostics.getErrors().some((error) => error.code === 'E7005'));
});

test('Ownership: validates dereference read and write through an incoming mutable reference', () => {
  const result = new CompilerDriver().compile(`
    fn read(value: &Int) -> Int { *value }
    fn increment(value: &mut Int) { *value += 1; }
    fn main() { mut number = 1; increment(&mut number); result = read(&number); }
  `, 'borrowed-mutation.sr', { stopAfter: CompilerStage.ResourceCheck });
  assert.equal(result.success, true, result.diagnostics.format());
  const operations = result.mir!.functions.flatMap((fn) => fn.blocks.flatMap((block) => block.operations));
  assert.ok(operations.some((op) => op.opcode === 'deref.load'));
  assert.ok(operations.some((op) => op.opcode === 'deref.store'));
  assert.equal(result.ownership?.success, true, JSON.stringify(result.ownership?.issues));
});

test('Ownership: detects direct owner reads during an active mutable borrow', () => {
  const result = new CompilerDriver().compile(`fn main() { mut count = 7; exclusive = &mut count; println(count); }`, 'mutable-borrow-read.sr', { stopAfter: CompilerStage.ResourceCheck });
  assert.equal(result.success, false);
  assert.ok(result.diagnostics.getErrors().some((error) => error.code === 'E7006'));
});

test('Ownership: detects use after release using ordered MIR resource events', () => {
  const result = ownershipModule([
    operation('call.method', [11], 21),
    operation('call.method', [11], 22),
  ], [
    { action: 'acquire', resourceId: 11, cleanup: 'close', position: 0 },
    { action: 'release', resourceId: 11, cleanup: 'close', position: 1 },
  ]);

  assert.ok(codes(result).includes('E7001'));
});

test('Ownership: detects double release', () => {
  const result = ownershipModule([], [
    { action: 'acquire', resourceId: 11, cleanup: 'close', position: 0 },
    { action: 'release', resourceId: 11, cleanup: 'close', position: 0 },
    { action: 'release', resourceId: 11, cleanup: 'close', position: 0 },
  ]);

  assert.ok(codes(result).includes('E7002'));
});

test('Ownership: detects a resource that reaches return without release or transfer', () => {
  const result = ownershipModule([], [
    { action: 'acquire', resourceId: 11, cleanup: 'close', position: 0 },
  ]);

  assert.ok(codes(result).includes('E7003'));
});

test('Borrow checker: permits overlapping shared borrows and validates their end', () => {
  const result = ownershipModule([
    operation('borrow.shared', [11], 21),
    operation('borrow.shared', [11], 22),
    operation('call', [21, 22], 23),
    operation('borrow.end', [21]),
    operation('borrow.end', [22]),
  ]);

  assert.deepEqual(codes(result), []);
});

test('Borrow checker: rejects a mutable borrow while a shared borrow is active', () => {
  const result = ownershipModule([
    operation('borrow.shared', [11], 21),
    operation('borrow.mutable', [11], 22),
    operation('borrow.end', [21]),
    operation('borrow.end', [22]),
  ]);

  assert.ok(codes(result).includes('E7005'));
});

test('Borrow checker: rejects direct owner access while a mutable borrow is active', () => {
  const result = ownershipModule([
    operation('borrow.mutable', [11], 21),
    operation('call.method', [11], 22),
    operation('borrow.end', [21]),
  ]);

  assert.ok(codes(result).includes('E7006'));
});

test('Ownership: rejects use of a moved value', () => {
  const result = ownershipModule([
    operation('ownership.move', [11], 21),
    operation('call', [11], 22),
  ]);

  assert.ok(codes(result).includes('E7006'));
});

test('Borrow checker: rejects a borrow that remains active at function return', () => {
  const result = ownershipModule([
    operation('borrow.shared', [11], 21),
  ]);

  assert.ok(codes(result).includes('E7007'));
});

test('Ownership: data-flow merge detects a resource leaked on one predecessor path', () => {
  const branchModule: MIRModule = {
    name: 'conditional-ownership',
    functions: [{
      name: 'branch_leak',
      functionId: 'fn:branch_leak',
      parameters: [],
      returnType: UNIT,
      entry: 0,
      blocks: [
        {
          id: 0, name: 'entry', parameters: [], operations: [], resourceOps: [],
          terminator: { kind: 'CondBranch', condition: 1, trueTarget: 1, trueArgs: [], falseTarget: 2, falseArgs: [] },
        },
        {
          id: 1, name: 'acquire-path', parameters: [], operations: [],
          resourceOps: [{ action: 'acquire', resourceId: 11, cleanup: 'close', position: 0 }],
          terminator: { kind: 'Branch', target: 3, args: [] },
        },
        {
          id: 2, name: 'no-acquire-path', parameters: [], operations: [], resourceOps: [],
          terminator: { kind: 'Branch', target: 3, args: [] },
        },
        {
          id: 3, name: 'merge', parameters: [], operations: [], resourceOps: [],
          terminator: { kind: 'Return' },
        },
      ],
    }],
  };
  const result = analyzeOwnership(branchModule);
  assert.equal(result.success, false);
  assert.ok(result.issues.some((issue) => issue.code === 'E7003' && issue.message.includes('may reach')));
});

test('Ownership: returning an owned resource transfers it to the caller', () => {
  const result = ownershipModule(
    [],
    [{ action: 'acquire', resourceId: 11, cleanup: 'close', position: 0 }],
    { kind: 'Return', value: 11 },
  );
  assert.deepEqual(codes(result), []);
});
