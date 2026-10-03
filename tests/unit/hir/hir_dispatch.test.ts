import assert from 'node:assert';
import test from 'node:test';
import { CompilerDriver, CompilerStage, HIRValidator } from '../../../compiler/index.ts';
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

test('HIR Dispatch: builtin method calls use locked Trait dispatch with canonical IDs', () => {
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
  // Locked HIR dispatch model: Trait { trait_id, impl_id, method_id }
  assert.strictEqual(methodCall.dispatch.kind, 'Trait');
  assert.strictEqual(methodCall.dispatch.traitId, 'trait:Sized');
  assert.strictEqual(methodCall.dispatch.implId, 'impl:String:Sized');
  assert.strictEqual(methodCall.dispatch.methodId, 'fn:Sized::length');
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
  assert.strictEqual(methodCall.dispatch.kind, 'Trait');
  assert.strictEqual(methodCall.dispatch.traitId, 'trait:Greeter');
  assert.strictEqual(methodCall.dispatch.implId, 'impl:Person:Greeter');
  assert.strictEqual(methodCall.dispatch.methodId, 'fn:Greeter::greet');
});

test('HIR Dispatch Regression: inherent builtin methods use Concrete dispatch with canonical IDs', () => {
  const driver = new CompilerDriver();
  const source = `
    fn test_inherent() {
      let s = "  hello  ";
      let trimmed = s.trim();
    }
  `;

  const res = driver.compile(source, 'trim.sr', { stopAfter: CompilerStage.HIR });
  assert.strictEqual(res.success, true);
  assert.ok(res.hir);

  const fnItem = res.hir.topLevelItems.find((i) => i.kind === 'HIRFunction') as HIRFunction;
  const letStmt = fnItem.body.statements[1] as any;
  const methodCall = letStmt.initializer;

  assert.strictEqual(methodCall.kind, 'HIRMethodCallExpr');
  assert.strictEqual(methodCall.method, 'trim');
  assert.strictEqual(methodCall.dispatch.kind, 'Concrete');
  assert.strictEqual(methodCall.dispatch.implId, 'impl:String:core');
  assert.strictEqual(methodCall.dispatch.methodId, 'fn:String::trim');
});

test('HIR Dispatch Regression: Builtin dispatch category is strictly forbidden and rejected', () => {
  const invalidDispatchProgram: any = {
    kind: 'HIRProgram',
    id: 1,
    version: '0.0.4-s',
    modules: [],
    topLevelItems: [],
    source: { kind: 'Source', span: { start: 0, end: 10, sourceId: 1, line: 1, column: 1 }, file: 'test.sr' },
  };

  const validator = new HIRValidator();

  const invalidCallExpr: any = {
    kind: 'HIRMethodCallExpr',
    id: 2,
    receiver: {
      kind: 'HIRLiteralExpr',
      id: 3,
      literalKind: 'string',
      value: 'test',
      raw: '"test"',
      type: { id: 'type:String', kind: 'Primitive', name: 'String' },
      source: { kind: 'Source', span: { start: 0, end: 4, sourceId: 1, line: 1, column: 1 } },
    },
    method: 'length',
    dispatch: { kind: 'Builtin', operation: 'length' },
    args: [],
    type: { id: 'type:Int', kind: 'Primitive', name: 'Int' },
    source: { kind: 'Source', span: { start: 0, end: 10, sourceId: 1, line: 1, column: 1 } },
  };

  const fnWithInvalidCall: any = {
    kind: 'HIRFunction',
    id: 4,
    functionId: 'fn:test',
    symbolId: 'sym:fn:test',
    name: 'test',
    params: [],
    returnType: { id: 'type:Unit', kind: 'Primitive', name: 'Unit' },
    body: {
      kind: 'HIRBlock',
      id: 5,
      statements: [{ kind: 'HIRExprStmt', id: 6, expr: invalidCallExpr, source: { kind: 'Source', span: { start: 0, end: 10, sourceId: 1, line: 1, column: 1 } } }],
      source: { kind: 'Source', span: { start: 0, end: 10, sourceId: 1, line: 1, column: 1 } },
    },
    source: { kind: 'Source', span: { start: 0, end: 10, sourceId: 1, line: 1, column: 1 } },
  };

  invalidDispatchProgram.topLevelItems = [fnWithInvalidCall];
  const validationRes = validator.validate(invalidDispatchProgram);
  assert.strictEqual(validationRes.success, false);
  assert.ok(validationRes.errors.some((e: string) => e.includes("invalid dispatch kind 'Builtin'")));
});
