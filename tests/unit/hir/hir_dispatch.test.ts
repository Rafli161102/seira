import assert from 'node:assert';
import test from 'node:test';
import { CompilerDriver, CompilerStage } from '../../../compiler/index.ts';
import type { HIRFunction } from '../../../compiler/index.ts';

test('HIR Dispatch: direct function call uses canonical FunctionId', () => {
  const driver = new CompilerDriver();
  const source = `
    fn add(a: Int, b: Int) -> Int { a + b }
    fn main() {
      let r = add(10, 20);
    }
  `;

  const res = driver.compile(source, 'call.sr', { stopAfter: CompilerStage.HIR });
  assert.strictEqual(res.success, true);
  assert.ok(res.hir);

  const mainFn = res.hir.topLevelItems.find(
    (i) => i.kind === 'HIRFunction' && i.name === 'main'
  ) as HIRFunction;
  const letStmt = mainFn.body.statements[0] as any;
  const callExpr = letStmt.initializer;

  assert.strictEqual(callExpr.kind, 'HIRCallExpr');
  assert.strictEqual(callExpr.functionId, 'fn:add');
  assert.strictEqual(callExpr.args.length, 2);
});

test('HIR Dispatch: builtin method calls carry Builtin dispatch metadata', () => {
  const driver = new CompilerDriver();
  const source = `
    fn test_builtin() {
      let s = "hello";
      let len = s.length();
    }
  `;

  const res = driver.compile(source, 'method.sr', { stopAfter: CompilerStage.HIR });
  assert.strictEqual(res.success, true);
  assert.ok(res.hir);

  const fnItem = res.hir.topLevelItems.find((i) => i.kind === 'HIRFunction') as HIRFunction;
  const letStmt = fnItem.body.statements[1] as any;
  const methodCall = letStmt.initializer;

  assert.strictEqual(methodCall.kind, 'HIRMethodCallExpr');
  assert.strictEqual(methodCall.method, 'length');
  assert.strictEqual(methodCall.dispatch.kind, 'Builtin');
});

test('HIR Dispatch: trait method calls carry Trait dispatch metadata', () => {
  const driver = new CompilerDriver();
  const source = `
    trait Greeter {
      fn greet() -> String;
    }
    struct Person { name: String }
    impl Person: Greeter {
      fn greet() -> String { "hello" }
    }
    fn run(p: Person) {
      let msg = p.greet();
    }
  `;

  const res = driver.compile(source, 'trait_call.sr', { stopAfter: CompilerStage.HIR });
  assert.strictEqual(res.success, true);
  assert.ok(res.hir);

  const runFn = res.hir.topLevelItems.find(
    (i) => i.kind === 'HIRFunction' && i.name === 'run'
  ) as HIRFunction;
  const letStmt = runFn.body.statements[0] as any;
  const methodCall = letStmt.initializer;

  assert.strictEqual(methodCall.kind, 'HIRMethodCallExpr');
  assert.strictEqual(methodCall.method, 'greet');
  assert.ok(methodCall.dispatch.kind === 'Trait' || methodCall.dispatch.kind === 'Concrete');
});
