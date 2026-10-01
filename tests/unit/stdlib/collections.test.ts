/**
 * Seira 0.0.9-s — Collection Foundation Contract Tests
 *
 * Verifies List, Map, Set, Tuple:
 * - Safe indexing returning Option<T>
 * - Foundation methods (length, is_empty, contains, first, last, push, insert, remove, keys, values)
 * - Structural equality (value semantics, not JS object identity)
 * - Immutability by default
 */

import assert from 'node:assert';
import test from 'node:test';
import { ExecutionEngine } from '../../../runtime/execution/engine.ts';

const engine = new ExecutionEngine();

function run(source: string) {
  return engine.executeSource(source, '<test-collections>', { enableOutput: false });
}

test('Collections: List safe indexing returning Option<T>', () => {
  const r1 = run(`
list = [10, 20, 30]
list[0]
`);
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.displayValue, 'Some(10)');

  const r2 = run(`
list = [10, 20, 30]
list[2]
`);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.displayValue, 'Some(30)');

  const r3 = run(`
list = [10, 20, 30]
list[5]
`);
  assert.strictEqual(r3.success, true);
  assert.strictEqual(r3.displayValue, 'None');

  const r4 = run(`
list = [10, 20, 30]
list[-1]
`);
  assert.strictEqual(r4.success, true);
  assert.strictEqual(r4.displayValue, 'None');
});

test('Collections: List methods (length, is_empty, contains, first, last, push)', () => {
  const r1 = run(`
list = [1, 2, 3]
list.length()
`);
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.displayValue, '3');

  const r2 = run(`
list = [1, 2, 3]
list.is_empty()
`);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.displayValue, 'false');

  const r3 = run(`
list = []
list.is_empty()
`);
  assert.strictEqual(r3.success, true);
  assert.strictEqual(r3.displayValue, 'true');

  const r4 = run(`
list = [1, 2, 3]
list.contains(2)
`);
  assert.strictEqual(r4.success, true);
  assert.strictEqual(r4.displayValue, 'true');

  const r5 = run(`
list = [1, 2, 3]
list.first()
`);
  assert.strictEqual(r5.success, true);
  assert.strictEqual(r5.displayValue, 'Some(1)');

  const r6 = run(`
list = [1, 2, 3]
list.last()
`);
  assert.strictEqual(r6.success, true);
  assert.strictEqual(r6.displayValue, 'Some(3)');

  const r7 = run(`
list = []
list.first()
`);
  assert.strictEqual(r7.success, true);
  assert.strictEqual(r7.displayValue, 'None');

  // Immutability: push returns a new List, original list is unchanged
  const r8 = run(`
l1 = [1, 2]
l2 = l1.push(3)
println(l1.length())
println(l2.length())
`);
  assert.strictEqual(r8.success, true);
  assert.strictEqual(r8.output[0], '2');
  assert.strictEqual(r8.output[1], '3');
});

test('Collections: List structural equality', () => {
  const r1 = run(`[1, 2, 3] == [1, 2, 3]`);
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.displayValue, 'true');

  const r2 = run(`[1, 2] == [2, 1]`);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.displayValue, 'false');

  const r3 = run(`[1, 2] == [1, 2, 3]`);
  assert.strictEqual(r3.success, true);
  assert.strictEqual(r3.displayValue, 'false');
});

test('Collections: Map safe indexing returning Option<Value>', () => {
  const r1 = run(`
m = {"a": 100, "b": 200}
m["a"]
`);
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.displayValue, 'Some(100)');

  const r2 = run(`
m = {"a": 100, "b": 200}
m["c"]
`);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.displayValue, 'None');
});

test('Collections: Map methods (length, is_empty, contains, insert, remove, keys, values)', () => {
  const r1 = run(`
m = {"x": 1, "y": 2}
m.length()
`);
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.displayValue, '2');

  const r2 = run(`
m = {"x": 1}
m.contains("x")
`);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.displayValue, 'true');

  const r3 = run(`
m = {"x": 1}
m.contains("z")
`);
  assert.strictEqual(r3.success, true);
  assert.strictEqual(r3.displayValue, 'false');

  // Immutability: insert returns new map, original unchanged
  const r4 = run(`
m1 = {"a": 1}
m2 = m1.insert("b", 2)
println(m1.contains("b"))
println(m2.contains("b"))
`);
  assert.strictEqual(r4.success, true);
  assert.strictEqual(r4.output[0], 'false');
  assert.strictEqual(r4.output[1], 'true');

  // remove returns new map
  const r5 = run(`
m1 = {"a": 1, "b": 2}
m2 = m1.remove("a")
println(m2.contains("a"))
println(m2.length())
`);
  assert.strictEqual(r5.success, true);
  assert.strictEqual(r5.output[0], 'false');
  assert.strictEqual(r5.output[1], '1');
});

test('Collections: Set uniqueness and methods (contains, insert, remove, length)', () => {
  const r1 = run(`
s = Set([1, 2, 2, 3])
s.length()
`);
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.displayValue, '3');

  const r2 = run(`
s = Set([1, 2, 3])
s.contains(2)
`);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.displayValue, 'true');

  const r3 = run(`
s = Set([1, 2, 3])
s.contains(99)
`);
  assert.strictEqual(r3.success, true);
  assert.strictEqual(r3.displayValue, 'false');

  // Immutability: insert returns new set
  const r4 = run(`
s1 = Set([1, 2])
s2 = s1.insert(3)
println(s1.contains(3))
println(s2.contains(3))
`);
  assert.strictEqual(r4.success, true);
  assert.strictEqual(r4.output[0], 'false');
  assert.strictEqual(r4.output[1], 'true');

  // remove returns new set
  const r5 = run(`
s1 = Set([1, 2, 3])
s2 = s1.remove(2)
println(s2.contains(2))
println(s2.length())
`);
  assert.strictEqual(r5.success, true);
  assert.strictEqual(r5.output[0], 'false');
  assert.strictEqual(r5.output[1], '2');
});

test('Collections: Tuple positional access and safe indexing', () => {
  const r1 = run(`
t = (10, "alpha", true)
t[0]
`);
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.displayValue, 'Some(10)');

  const r2 = run(`
t = (10, "alpha", true)
t[1]
`);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.displayValue, 'Some(alpha)');

  const r3 = run(`
t = (10, "alpha", true)
t[5]
`);
  assert.strictEqual(r3.success, true);
  assert.strictEqual(r3.displayValue, 'None');
});

test('Collections: Tuple structural equality', () => {
  const r1 = run(`(1, "x") == (1, "x")`);
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.displayValue, 'true');

  const r2 = run(`(1, "x") == (2, "x")`);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.displayValue, 'false');

  const r3 = run(`(1, "x") == (1, "y")`);
  assert.strictEqual(r3.success, true);
  assert.strictEqual(r3.displayValue, 'false');
});
