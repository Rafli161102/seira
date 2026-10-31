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
  const compiled = compileToMIR(source, file);
  const ast = new ExecutionEngine().executeSource(source, file, { enableOutput: false });
  assert.equal(ast.success, true, ast.diagnostics.format());
  const mir = new MIRInterpreter(compiled).execute();
  assert.equal(mir.success, true, mir.error?.message);
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
