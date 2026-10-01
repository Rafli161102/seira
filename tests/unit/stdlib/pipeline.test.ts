/**
 * Seira 0.0.9-s — Pipeline Integration Contract Tests
 *
 * Verifies end-to-end pipeline semantics (|>) composing Standard Library contracts:
 * collection -> iterator -> transformation -> collection,
 * Option pipelines, and Result pipelines.
 */

import assert from 'node:assert';
import test from 'node:test';
import { ExecutionEngine } from '../../../runtime/execution/engine.ts';

const engine = new ExecutionEngine();

function run(source: string) {
  return engine.executeSource(source, '<test-pipeline>', { enableOutput: false });
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
