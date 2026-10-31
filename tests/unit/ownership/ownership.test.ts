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
  const result = new CompilerDriver().compile(`fn main() { mut count = 7; shared = &count; exclusive = &mut count; println(*shared); *exclusive += 1; }`, 'borrow-conflict.sr', { stopAfter: CompilerStage.ResourceCheck });
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


test('Ownership: non-lexical lifetime ends a mutable loan after its last semantic use', () => {
  const result = new CompilerDriver().compile(
    `fn main() { mut count = 7; exclusive = &mut count; *exclusive += 1; println(count); }`,
    'borrow-nll-last-use.sr',
    { stopAfter: CompilerStage.ResourceCheck },
  );
  assert.equal(result.success, true, result.diagnostics.format());
  assert.equal(result.ownership?.success, true, JSON.stringify(result.ownership?.issues));
});


test('Ownership: mutable borrows of disjoint struct fields are independent', () => {
  const result = ownershipModule([
    { ...operation('borrow.mutable', [11], 21), attributes: { placePath: 'left' } },
    { ...operation('borrow.mutable', [11], 22), attributes: { placePath: 'right' } },
    operation('deref.load', [21], 31),
    operation('deref.load', [22], 32),
  ]);
  assert.deepEqual(codes(result), []);
});

test('Ownership: mutable borrows of the same field conflict', () => {
  const result = ownershipModule([
    { ...operation('borrow.mutable', [11], 21), attributes: { placePath: 'profile.name' } },
    { ...operation('borrow.mutable', [11], 22), attributes: { placePath: 'profile.name' } },
    operation('deref.load', [21], 31),
    operation('deref.load', [22], 32),
  ]);
  assert.ok(codes(result).includes('E7005'));
});

test('Ownership: parent and nested field places overlap', () => {
  const result = ownershipModule([
    { ...operation('borrow.mutable', [11], 21), attributes: { placePath: 'profile' } },
    { ...operation('borrow.mutable', [11], 22), attributes: { placePath: 'profile.name' } },
    operation('deref.load', [21], 31),
    operation('deref.load', [22], 32),
  ]);
  assert.ok(codes(result).includes('E7005'));
});

test('Ownership: disjoint field reads remain available during a field borrow', () => {
  const allowed = ownershipModule([
    { ...operation('borrow.mutable', [11], 21), attributes: { placePath: 'name' } },
    {
      ...operation('field.get', [11], 31),
      attributes: { rootId: 11, placePath: 'age', fieldName: 'age' },
    },
    operation('deref.load', [21], 32),
  ]);
  assert.deepEqual(codes(allowed), []);

  const blocked = ownershipModule([
    { ...operation('borrow.mutable', [11], 21), attributes: { placePath: 'name' } },
    {
      ...operation('field.get', [11], 31),
      attributes: { rootId: 11, placePath: 'name', fieldName: 'name' },
    },
    operation('deref.load', [21], 32),
  ]);
  assert.ok(codes(blocked).includes('E7006'));
});

test('Ownership: source field borrows lower to independent MIR places', () => {
  const result = new CompilerDriver().compile(`
    type Pair { left: Int, right: Int }
    fn main() {
      mut pair = Pair { left: 1, right: 2 };
      left_ref = &mut pair.left;
      right_ref = &mut pair.right;
      println(*left_ref);
      println(*right_ref);
    }
  `, 'field-sensitive-borrows.sr', { stopAfter: CompilerStage.ResourceCheck });
  assert.equal(result.success, true, result.diagnostics.format());
  const operations = result.mir!.functions.flatMap((fn) => fn.blocks.flatMap((block) => block.operations));
  const fieldLoans = operations.filter((op) => op.opcode === 'borrow.mutable' && typeof op.attributes?.placePath === 'string');
  assert.deepEqual(fieldLoans.map((op) => op.attributes?.placePath).sort(), ['left', 'right']);
});

test('Ownership: detects direct owner reads during an active mutable borrow', () => {
  const result = new CompilerDriver().compile(`fn main() { mut count = 7; exclusive = &mut count; println(count); *exclusive += 1; }`, 'mutable-borrow-read.sr', { stopAfter: CompilerStage.ResourceCheck });
  assert.equal(result.success, false);
  assert.ok(result.diagnostics.getErrors().some((error) => error.code === 'E7006'));
});


test('Ownership: NLL permits owner access when a created reference is never used', () => {
  const result = new CompilerDriver().compile(
    `fn main() { mut count = 7; exclusive = &mut count; println(count); }`,
    'borrow-nll-unused.sr',
    { stopAfter: CompilerStage.ResourceCheck },
  );
  assert.equal(result.success, true, result.diagnostics.format());
});

test('Ownership: loan liveness follows a reference passed through a MIR block parameter', () => {
  const referenceType = {
    id: 'type:Reference<Int>',
    kind: 'Reference',
    name: '&mut Int',
    innerType: INT,
    isMutableReference: true,
  } as any;
  const module: MIRModule = {
    name: 'borrow-block-parameter',
    functions: [{
      name: 'subject',
      functionId: 'fn:subject',
      parameters: [],
      returnType: UNIT,
      entry: 0,
      blocks: [
        {
          id: 0, name: 'entry', parameters: [],
          operations: [operation('borrow.mutable', [11], 21), operation('call.method', [11], 22)],
          resourceOps: [],
          terminator: { kind: 'Branch', target: 1, args: [21] },
        },
        {
          id: 1, name: 'borrowed', parameters: [{ id: 23, type: referenceType, typeName: '&mut Int' }],
          operations: [operation('call', [23], 24)],
          resourceOps: [],
          terminator: { kind: 'Return' },
        },
      ],
    }],
  };
  assert.ok(codes(module).includes('E7006'));
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
    operation('call', [21], 23),
    operation('borrow.end', [21]),
    operation('borrow.end', [22]),
  ]);

  assert.ok(codes(result).includes('E7005'));
});

test('Borrow checker: rejects direct owner access while a mutable borrow is active', () => {
  const result = ownershipModule([
    operation('borrow.mutable', [11], 21),
    operation('call.method', [11], 22),
    operation('call.method', [21], 23),
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

test('Borrow checker: rejects a live borrow that reaches function return', () => {
  const result = ownershipModule(
    [operation('borrow.shared', [11], 21)],
    [],
    { kind: 'Return', value: 21 },
  );

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

test('Ownership: mutable child reborrow suspends its parent until the child ends', () => {
  const blocked = ownershipModule([
    operation('borrow.mutable', [11], 21),
    { ...operation('borrow.mutable', [21], 22), attributes: { reborrow: true } },
    operation('call', [21], 23),
    operation('call', [22], 24),
  ]);
  assert.ok(codes(blocked).includes('E7005'));

  const resumed = ownershipModule([
    operation('borrow.mutable', [11], 31),
    { ...operation('borrow.mutable', [31], 32), attributes: { reborrow: true } },
    operation('call', [32], 33),
    operation('borrow.end', [32]),
    operation('call', [31], 34),
    operation('borrow.end', [31]),
  ]);
  assert.deepEqual(codes(resumed), []);
});

test('Ownership: shared children can coexist under a shared parent and keep the parent readable', () => {
  const result = ownershipModule([
    operation('borrow.shared', [11], 21),
    { ...operation('borrow.shared', [21], 22), attributes: { reborrow: true } },
    { ...operation('borrow.shared', [21], 23), attributes: { reborrow: true } },
    operation('call', [21, 22, 23], 24),
  ]);
  assert.deepEqual(codes(result), []);
});

test('Ownership: mutable reborrow is rejected when its parent is shared', () => {
  const result = ownershipModule([
    operation('borrow.shared', [11], 21),
    { ...operation('borrow.mutable', [21], 22), attributes: { reborrow: true } },
    operation('call', [22], 23),
  ]);
  assert.ok(codes(result).includes('E7005'));
});

test('Ownership: shared child reborrow prevents parent use when parent is mutable', () => {
  const result = ownershipModule([
    operation('borrow.mutable', [11], 21),
    { ...operation('borrow.shared', [21], 22), attributes: { reborrow: true } },
    operation('call', [21], 23),
    operation('call', [22], 24),
  ]);
  assert.ok(codes(result).includes('E7005'));
});

test('Ownership: source-level reborrows obey child lifetime and parent resumption', () => {
  const valid = new CompilerDriver().compile(`
    fn main() {
      mut count = 7;
      parent = &mut count;
      child = &mut *parent;
      *child += 1;
      *parent += 1;
    }
  `, 'reborrow-valid.sr', { stopAfter: CompilerStage.ResourceCheck });
  assert.equal(valid.success, true, valid.diagnostics.format());

  const invalid = new CompilerDriver().compile(`
    fn main() {
      mut count = 7;
      parent = &mut count;
      child = &mut *parent;
      *parent += 1;
      *child += 1;
    }
  `, 'reborrow-parent-suspended.sr', { stopAfter: CompilerStage.ResourceCheck });
  assert.equal(invalid.success, false);
  assert.ok(invalid.diagnostics.getErrors().some((error) => error.code === 'E7005'));
});

test('Ownership: rejects mutable reborrow from a shared reference at the source level', () => {
  const result = new CompilerDriver().compile(`
    fn main() {
      value = 7;
      parent = &value;
      child = &mut *parent;
      println(*child);
    }
  `, 'reborrow-shared-to-mutable.sr', { stopAfter: CompilerStage.ResourceCheck });
  assert.equal(result.success, false);
  assert.ok(result.diagnostics.getErrors().some((error) => error.code === 'E3008'));
});

test('Ownership: shared parent can be read while shared child reborrows are live', () => {
  const result = new CompilerDriver().compile(`
    fn main() {
      value = 7;
      parent = &value;
      child = &*parent;
      println(*parent);
      println(*child);
    }
  `, 'reborrow-shared-parent.sr', { stopAfter: CompilerStage.ResourceCheck });
  assert.equal(result.success, true, result.diagnostics.format());
});
