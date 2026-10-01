/**
 * Seira 0.0.9-s — Pipeline Integration Contract Tests
 *
 * Verifies end-to-end pipeline semantics (|>) composing Standard Library contracts:
 * collection -> iterator -> transformation -> collection,
 * Option pipelines, and Result pipelines.
 */

import assert from 'node:assert';
import test from 'node:test';
import { DiagnosticBag } from '../../../compiler/diagnostics/index.ts';
import { Lexer } from '../../../compiler/lexer/lexer.ts';
import { Parser } from '../../../compiler/parser/parser.ts';
import { ExecutionEngine } from '../../../runtime/execution/engine.ts';
import { Evaluator, ExecutionContext } from '../../../runtime/execution/evaluator.ts';

const engine = new ExecutionEngine();

function run(source: string) {
  return engine.executeSource(source, '<test-pipeline>', { enableOutput: false });
}

function runEvaluator(code: string) {
  const tokens = new Lexer(code).tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  const diag = new DiagnosticBag();
  const ctx = new ExecutionContext({ fileName: '<test-pipeline-evaluator>' }, diag);
  const evaluator = new Evaluator(ctx);
  const outcome = evaluator.executeProgram(ast);
  return { outcome, diagnostics: diag };
}

test('Pipeline: collection -> iterator -> transformations -> collection', () => {
  const r = run(`
fn is_even(n: Int) -> Bool {
  n % 2 == 0
}

fn square(n: Int) -> Int {
  n * n
}

nums = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
result = nums
  |> iter
  |> filter(is_even)
  |> map(square)
  |> take(3)
  |> collect

println(result)
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], '[4, 16, 36]');
});

test('Pipeline: Option transformation chain', () => {
  const r1 = run(`
val = Some(20)
  |> map((x: Int) => x * 2)
  |> unwrap_or(0)

println(val)
`);
  assert.strictEqual(r1.success, true, r1.diagnostics.format());
  assert.strictEqual(r1.output[0], '40');

  const r2 = run(`
val = None
  |> map((x: Int) => x * 2)
  |> unwrap_or(100)

println(val)
`);
  assert.strictEqual(r2.success, true, r2.diagnostics.format());
  assert.strictEqual(r2.output[0], '100');
});

test('Pipeline: Result transformation chain', () => {
  const r1 = run(`
res = Ok(15)
  |> map((x: Int) => x + 5)
  |> unwrap_or(0)

println(res)
`);
  assert.strictEqual(r1.success, true, r1.diagnostics.format());
  assert.strictEqual(r1.output[0], '20');

  const r2 = run(`
res = Err("bad data")
  |> map((x: Int) => x + 5)
  |> unwrap_or(-1)

println(res)
`);
  assert.strictEqual(r2.success, true, r2.diagnostics.format());
  assert.strictEqual(r2.output[0], '-1');
});

test('Pipeline: String transformations and breakdown', () => {
  const r = run(`
str = "  hello world  "
  |> trim
  |> replace("world", "seira")

println(str)
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], 'hello seira');
});

// ─── Regression Tests: Pipeline Type Soundness ───────────────────────────────

test('Pipeline: valid Option map infers mapped inner type', () => {
  const r = run(`
opt: Option<Int> = Some(10)
res: Option<String> = opt |> map((x: Int) => "value")
println(res)
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], 'Some(value)');
});

test('Pipeline: invalid Option map return type is rejected statically', () => {
  const r = run(`
opt: Option<Int> = Some(10)
res: Option<Int> = opt |> map((x: Int) => "string_value")
`);
  assert.strictEqual(r.success, false);
  assert.strictEqual(
    r.diagnostics.getDiagnostics().some((d) => d.code === 'E3001'),
    true,
    'Expected E3001 type mismatch for incompatible Option map assignment'
  );
});

test('Pipeline: valid Result map infers mapped Ok type', () => {
  const r = run(`
res: Result<Int, String> = Ok(10)
mapped: Result<String, String> = res |> map((x: Int) => "ok_val")
println(mapped)
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], 'Ok(ok_val)');
});

test('Pipeline: valid List map infers element type', () => {
  const r = run(`
items: List<Int> = [1, 2, 3]
mapped: List<String> = items |> map((x: Int) => "item")
println(mapped)
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], '[item, item, item]');
});

test('Pipeline: valid unwrap_or preserves inner type', () => {
  const r = run(`
none_val: Option<Int> = None
val: Int = none_val |> unwrap_or(42)
println(val)
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], '42');
});

test('Pipeline: invalid unwrap_or fallback type is rejected statically with E3003', () => {
  const r = run(`
none_val: Option<Int> = None
val: Int = none_val |> unwrap_or("not an int")
`);
  assert.strictEqual(r.success, false);
  assert.strictEqual(
    r.diagnostics.getDiagnostics().some((d) => d.code === 'E3003'),
    true,
    'Expected E3003 for incompatible fallback type in unwrap_or'
  );
});

test('Pipeline: invalid String builtin receiver is rejected statically with E3003', () => {
  const r1 = run(`println(123 |> replace("a", "b"))`);
  assert.strictEqual(r1.success, false);
  assert.strictEqual(
    r1.diagnostics.getDiagnostics().some((d) => d.code === 'E3003'),
    true,
    'Expected E3003 for Int receiver in replace'
  );

  const r2 = run(`println(123 |> trim)`);
  assert.strictEqual(r2.success, false);
  assert.strictEqual(
    r2.diagnostics.getDiagnostics().some((d) => d.code === 'E3003'),
    true,
    'Expected E3003 for Int receiver in trim'
  );
});

test('Pipeline: valid String builtin calls succeed', () => {
  const r = run(`
s = "  hello seira  "
t = s |> trim
rep = t |> replace("seira", "world")
sp = rep |> split(" ")
c = rep |> contains("world")
println(t)
println(rep)
println(sp)
println(c)
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], 'hello seira');
  assert.strictEqual(r.output[1], 'hello world');
  assert.strictEqual(r.output[2], '[hello, world]');
  assert.strictEqual(r.output[3], 'true');
});

// ─── Regression Tests: Runtime Invalid Target Error Handling ─────────────────

test('Runtime: invalid replace target produces R0002', () => {
  const res = runEvaluator('val = 123 |> replace("a", "b")');
  assert.strictEqual(res.outcome.kind, 'Panic');
  assert.strictEqual((res.outcome as any).error?.code, 'R0002');
  assert.strictEqual(
    (res.outcome as any).error?.message.includes("Unsupported operation 'replace on Int'"),
    true
  );
});

test('Runtime: invalid trim target produces R0002', () => {
  const res = runEvaluator('val = 123 |> trim');
  assert.strictEqual(res.outcome.kind, 'Panic');
  assert.strictEqual((res.outcome as any).error?.code, 'R0002');
  assert.strictEqual(
    (res.outcome as any).error?.message.includes("Unsupported operation 'trim on Int'"),
    true
  );
});

test('Runtime: invalid split target produces R0002', () => {
  const res = runEvaluator('val = 123 |> split(",")');
  assert.strictEqual(res.outcome.kind, 'Panic');
  assert.strictEqual((res.outcome as any).error?.code, 'R0002');
  assert.strictEqual(
    (res.outcome as any).error?.message.includes("Unsupported operation 'split on Int'"),
    true
  );
});

test('Runtime: invalid contains target produces R0002', () => {
  const res = runEvaluator('val = 123 |> contains("a")');
  assert.strictEqual(res.outcome.kind, 'Panic');
  assert.strictEqual((res.outcome as any).error?.code, 'R0002');
  assert.strictEqual(
    (res.outcome as any).error?.message.includes("Unsupported operation 'contains on Int'"),
    true
  );
});

test('Runtime: invalid map and unwrap_or targets produce R0002', () => {
  const resMap = runEvaluator('val = 123 |> map((x: Int) => x)');
  assert.strictEqual(resMap.outcome.kind, 'Panic');
  assert.strictEqual((resMap.outcome as any).error?.code, 'R0002');

  const resUnwrapOr = runEvaluator('val = 123 |> unwrap_or(0)');
  assert.strictEqual(resUnwrapOr.outcome.kind, 'Panic');
  assert.strictEqual((resUnwrapOr.outcome as any).error?.code, 'R0002');
});

