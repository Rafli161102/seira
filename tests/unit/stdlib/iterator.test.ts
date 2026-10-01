/**
 * Seira 0.0.9-s — Iterator Foundation Contract Tests
 *
 * Verifies Iterator:
 * - Lazy evaluation semantics
 * - Combinators: next, map, filter, take, skip, enumerate, zip, fold, reduce, collect
 * - Pipeline integration (|>) and method chaining
 * - Materialization boundary with collect()
 */

import assert from 'node:assert';
import test from 'node:test';
import { ExecutionEngine } from '../../../runtime/execution/engine.ts';

const engine = new ExecutionEngine();

function run(source: string) {
  return engine.executeSource(source, '<test-iterator>', { enableOutput: false });
}

test('Iterator: iter() and next() traversal returning Option', () => {
  const r = run(`
it = [10, 20].iter()
n1 = it.next()
n2 = it.next()
n3 = it.next()
println(n1)
println(n2)
println(n3)
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], 'Some(10)');
  assert.strictEqual(r.output[1], 'Some(20)');
  assert.strictEqual(r.output[2], 'None');
});

test('Iterator: collect() materializes iterator into List', () => {
  const r = run(`
[1, 2, 3].iter().collect()
`);
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.displayValue, '[1, 2, 3]');
});

test('Iterator: map combinator', () => {
  const r = run(`
[1, 2, 3]
  .iter()
  .map((x: Int) => x * 2)
  .collect()
`);
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.displayValue, '[2, 4, 6]');
});

test('Iterator: filter combinator', () => {
  const r = run(`
[1, 2, 3, 4, 5]
  .iter()
  .filter((x: Int) => x % 2 == 0)
  .collect()
`);
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.displayValue, '[2, 4]');
});

test('Iterator: take and skip combinators', () => {
  const r1 = run(`
[1, 2, 3, 4, 5].iter().take(3).collect()
`);
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.displayValue, '[1, 2, 3]');

  const r2 = run(`
[1, 2, 3, 4, 5].iter().skip(2).collect()
`);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.displayValue, '[3, 4, 5]');
});

test('Iterator: enumerate combinator produces index-value tuples', () => {
  const r = run(`
["a", "b"].iter().enumerate().collect()
`);
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.displayValue, '[(0, a), (1, b)]');
});

test('Iterator: zip combinator pairs two iterables', () => {
  const r = run(`
[1, 2, 3].iter().zip(["a", "b"]).collect()
`);
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.displayValue, '[(1, a), (2, b)]');
});

test('Iterator: fold combinator accumulates values', () => {
  const r = run(`
[1, 2, 3, 4].iter().fold(0, (acc: Int, x: Int) => acc + x)
`);
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.displayValue, '10');
});

test('Iterator: reduce combinator returns Option of accumulated value', () => {
  const r1 = run(`
[1, 2, 3, 4].iter().reduce((acc: Int, x: Int) => acc + x)
`);
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.displayValue, 'Some(10)');

  const r2 = run(`
[].iter().reduce((acc: Int, x: Int) => acc + x)
`);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.displayValue, 'None');
});

test('Iterator: pipeline integration (|>)', () => {
  const r = run(`
result = [1, 2, 3, 4, 5, 6]
  |> iter
  |> filter((x: Int) => x % 2 == 1)
  |> map((x: Int) => x * 10)
  |> take(2)
  |> collect

println(result)
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], '[10, 30]');
});

test('Iterator: lazy evaluation — does not compute unneeded items', () => {
  const r = run(`
mut evaluated_count = 0

fn track_and_double(x: Int) -> Int {
  evaluated_count = evaluated_count + 1
  x * 2
}

it = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].iter().map(track_and_double).take(3)
res = it.collect()
println(res)
println(evaluated_count)
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], '[2, 4, 6]');
  // Only 3 items were evaluated due to lazy take(3)!
  assert.strictEqual(r.output[1], '3');
});
