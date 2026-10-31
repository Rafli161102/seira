import assert from 'node:assert/strict';
import test from 'node:test';
import { CompilerDriver, CompilerStage } from '../../../compiler/index.ts';
import { MIRInterpreter } from '../../../compiler/mir/interpreter.ts';
import type { MIRModule } from '../../../compiler/mir/index.ts';
import { HIR_INT_TYPE } from '../../../compiler/hir/types.ts';
import { ExecutionEngine } from '../../../runtime/index.ts';

function compileToMIR(source: string, file: string): MIRModule {
  const result = new CompilerDriver().compile(source, file, {
    stopAfter: CompilerStage.Optimize,
    config: { optLevel: 0 },
  });
  assert.equal(result.success, true, result.diagnostics.format());
  assert.ok(result.mir);
  return result.mir;
}
function assertDifferential(source: string, file: string): void {
  const compilation = new CompilerDriver().compile(source, file, {
    stopAfter: CompilerStage.Optimize,
    config: { optLevel: 0 },
  });
  assert.equal(compilation.success, true, compilation.diagnostics.format());
  assert.ok(compilation.mir);
  const compiled = compilation.mir;
  const ast = new ExecutionEngine().executeSource(source, file, { enableOutput: false });
  assert.equal(ast.success, true, ast.diagnostics.format());
  const mir = new MIRInterpreter(compiled).execute();
  const mirDump = compiled.functions.map((fn) => ({
    name: fn.name,
    blocks: fn.blocks.map((block) => ({
      id: block.id,
      name: block.name,
      parameters: block.parameters.map((parameter) => ({ id: parameter.id, symbolId: parameter.symbolId, name: parameter.name })),
      operations: block.operations.map((operation) => ({
        opcode: operation.opcode, dest: operation.dest, operands: operation.operands, attributes: operation.attributes,
      })),
      terminator: block.terminator,
    })),
  }));
  const hirDump = compilation.hir?.topLevelItems.map((item) => (
    item.kind === 'HIRFunction'
      ? { kind: item.kind, name: item.name, body: item.body }
      : { kind: item.kind }
  ));
  assert.equal(mir.success, true, (mir.error?.message ?? '') + '\nHIR=' + JSON.stringify(hirDump) + '\nMIR=' + JSON.stringify(mirDump));
  assert.equal(mir.displayValue, ast.displayValue);
}

test('MIR interpreter executes scalar arithmetic and direct calls', () => {
  assertDifferential(`
    fn add(a: Int, b: Int) -> Int { return a + b; }
    fn main() -> Int { let left = 10; let right = 20; return add(left, right); }
  `, 'mir-call.sr');
});

test('MIR interpreter executes loop-carried SSA block parameters', () => {
  assertDifferential(`
    fn main() -> Int {
      let mut count = 0;
      while count < 4 { count = count + 1; }
      return count;
    }
  `, 'mir-loop.sr');
});

test('MIR interpreter executes compound assignment through loop-carried SSA values', () => {
  assertDifferential(`
    fn main() -> Int {
      let mut count = 0;
      while count < 5 { count += 2; }
      return count;
    }
  `, 'mir-compound-loop.sr');
});

test('MIR interpreter executes conditional branches with strict Bool semantics', () => {
  assertDifferential(`
    fn main() -> Int {
      let value = 2;
      if value == 2 { return 7; } else { return 9; }
    }
  `, 'mir-branch.sr');
});

test('MIR interpreter fails closed for unsupported opcodes', () => {
  const module: MIRModule = {
    name: 'unsupported-operation',
    functions: [{
      name: 'main', functionId: 'fn:main', parameters: [], returnType: HIR_INT_TYPE, entry: 0,
      blocks: [{
        id: 0, name: 'entry', parameters: [],
        operations: [{
          op: 'construct', opcode: 'construct', dest: 1, operands: [], type: HIR_INT_TYPE,
          attributes: { constructKind: 'List', elementCount: 0 },
        }],
        resourceOps: [], terminator: { kind: 'Return', value: 1 },
      }],
    }],
  };
  const result = new MIRInterpreter(module).execute();
  assert.equal(result.success, false);
  assert.equal(result.error?.code, 'E9101');
  assert.match(result.error?.message ?? '', /construct/);
});

test('MIR interpreter enforces the execution step budget', () => {
  const source = `
    fn main() -> Int {
      let mut count = 0;
      while count < 3 { count = count + 1; }
      return count;
    }
  `;
  const limited = new MIRInterpreter(compileToMIR(source, 'mir-step-limit.sr'), { maxSteps: 3 }).execute();
  assert.equal(limited.success, false);
  assert.equal(limited.error?.code, 'E9103');
});


test('MIR interpreter enforces the call-depth budget for recursion', () => {
  const source = `
    fn descend(value: Int) -> Int {
      if value == 0 { return 0; }
      return descend(value - 1);
    }
    fn main() -> Int { return descend(20); }
  `;
  const compiled = compileToMIR(source, 'mir-call-depth.sr');
  const limited = new MIRInterpreter(compiled, { maxCallDepth: 4 }).execute();
  assert.equal(limited.success, false);
  assert.equal(limited.error?.code, 'E9104');
});

test('MIR interpreter reports a missing entry function explicitly', () => {
  const module = compileToMIR('fn main() -> Int { return 1; }', 'mir-missing-entry.sr');
  const result = new MIRInterpreter(module).execute('not_found');
  assert.equal(result.success, false);
  assert.equal(result.error?.code, 'E9100');
});

test('MIR interpreter rejects invalid MIR before executing it', () => {
  const module: MIRModule = {
    name: 'invalid-mir',
    functions: [{
      name: 'main', functionId: 'fn:main', parameters: [], returnType: HIR_INT_TYPE, entry: 99,
      blocks: [],
    }],
  };
  const result = new MIRInterpreter(module).execute();
  assert.equal(result.success, false);
  assert.equal(result.error?.code, 'E9003');
});