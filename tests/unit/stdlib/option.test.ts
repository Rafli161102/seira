/**
 * Seira 0.0.9-s — Option Contract Tests
 *
 * Verifies Option<T>, Some, None, safe absence, functional combinators,
 * and operator interactions (? and ??).
 */

import assert from 'node:assert';
import test from 'node:test';
import { ExecutionEngine } from '../../../runtime/execution/engine.ts';

const engine = new ExecutionEngine();

function run(source: string) {
  return engine.executeSource(source, '<test-option>', { enableOutput: false });
}

test('Option: Some and None value representations', () => {
  const r1 = run(`Some(42)`);
  assert.strictEqual(r1.success, true, r1.diagnostics.format());
  assert.strictEqual(r1.displayValue, 'Some(42)');

  const r2 = run(`None`);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.displayValue, 'None');
});

test('Option: is_some and is_none methods', () => {
  const r1 = run(`
opt = Some(10)
opt.is_some()
`);
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.displayValue, 'true');

  const r2 = run(`
opt = None
opt.is_none()
`);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.displayValue, 'true');

  const r3 = run(`
opt = None
opt.is_some()
`);
  assert.strictEqual(r3.success, true);
  assert.strictEqual(r3.displayValue, 'false');
});

test('Option: unwrap succeeds on Some and panics on None', () => {
  const r1 = run(`
opt = Some(99)
opt.unwrap()
`);
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.displayValue, '99');

  const r2 = run(`
opt = None
opt.unwrap()
`);
  assert.strictEqual(r2.success, false);
  assert.ok(r2.outcome && r2.outcome.kind === 'Panic');
  assert.ok(r2.diagnostics.format().includes('unwrap on a None value'));
});

test('Option: expect succeeds on Some and panics with custom message on None', () => {
  const r1 = run(`
opt = Some("hello")
opt.expect("value must exist")
`);
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.displayValue, 'hello');

  const r2 = run(`
opt = None
opt.expect("crucial data missing")
`);
  assert.strictEqual(r2.success, false);
  assert.ok(r2.diagnostics.format().includes('crucial data missing'));
});

test('Option: unwrap_or returns value on Some and fallback on None', () => {
  const r1 = run(`
opt = Some(5)
opt.unwrap_or(0)
`);
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.displayValue, '5');

  const r2 = run(`
opt = None
opt.unwrap_or(100)
`);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.displayValue, '100');
});

test('Option: unwrap_or_else executes closure on None', () => {
  const r1 = run(`
opt = Some(7)
opt.unwrap_or_else(() => 42)
`);
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.displayValue, '7');

  const r2 = run(`
opt = None
opt.unwrap_or_else(() => 42)
`);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.displayValue, '42');
});

test('Option: map transforms inner value on Some and preserves None', () => {
  const r1 = run(`
opt = Some(10)
opt.map((x: Int) => x * 2)
`);
  assert.strictEqual(r1.success, true, r1.diagnostics.format());
  assert.strictEqual(r1.displayValue, 'Some(20)');

  const r2 = run(`
opt = None
opt.map((x: Int) => x * 2)
`);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.displayValue, 'None');
});

test('Option: and_then chains computations producing Option', () => {
  const r1 = run(`
fn half_even(x: Int) -> Option<Int> {
  if x % 2 == 0 {
    Some(x / 2)
  } else {
    None
  }
}

opt = Some(8)
opt.and_then(half_even)
`);
  assert.strictEqual(r1.success, true, r1.diagnostics.format());
  assert.strictEqual(r1.displayValue, 'Some(4)');

  const r2 = run(`
fn half_even(x: Int) -> Option<Int> {
  if x % 2 == 0 {
    Some(x / 2)
  } else {
    None
  }
}

opt = Some(7)
opt.and_then(half_even)
`);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.displayValue, 'None');
});

test('Option: or_else provides fallback Option computation', () => {
  const r1 = run(`
opt = Some(10)
opt.or_else(() => Some(20))
`);
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.displayValue, 'Some(10)');

  const r2 = run(`
opt = None
opt.or_else(() => Some(20))
`);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.displayValue, 'Some(20)');
});

test('Option: fallback operator ?? evaluates lazily', () => {
  const r1 = run(`
Some(5) ?? 10
`);
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.displayValue, '5');

  const r2 = run(`
None ?? 10
`);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.displayValue, '10');
});

test('Option: propagation operator ? unwraps Some and propagates None', () => {
  const r1 = run(`
fn get_num(flag: Bool) -> Option<Int> {
  val = if flag { Some(10) } else { None }
  x = val?
  Some(x + 5)
}

fn main() {
  r = get_num(true)
  println(r)
}
`);
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.output[0], 'Some(15)');

  const r2 = run(`
fn get_num(flag: Bool) -> Option<Int> {
  val = if flag { Some(10) } else { None }
  x = val?
  Some(x + 5)
}

fn main() {
  r = get_num(false)
  println(r)
}
`);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.output[0], 'None');
});
