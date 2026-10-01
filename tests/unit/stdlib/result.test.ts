/**
 * Seira 0.0.9-s — Result Contract Tests
 *
 * Verifies Result<T, E>, Ok, Err, error value integrity, functional combinators,
 * and operator interactions (?).
 */

import assert from 'node:assert';
import test from 'node:test';
import { ExecutionEngine } from '../../../runtime/execution/engine.ts';

const engine = new ExecutionEngine();

function run(source: string) {
  return engine.executeSource(source, '<test-result>', { enableOutput: false });
}

test('Result: Ok and Err value representations', () => {
  const r1 = run(`Ok(42)`);
  assert.strictEqual(r1.success, true, r1.diagnostics.format());
  assert.strictEqual(r1.displayValue, 'Ok(42)');

  const r2 = run(`Err("failed operation")`);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.displayValue, 'Err(failed operation)');
});

test('Result: is_ok and is_err methods', () => {
  const r1 = run(`
res = Ok(10)
res.is_ok()
`);
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.displayValue, 'true');

  const r2 = run(`
res = Err("bad")
res.is_err()
`);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.displayValue, 'true');

  const r3 = run(`
res = Err("bad")
res.is_ok()
`);
  assert.strictEqual(r3.success, true);
  assert.strictEqual(r3.displayValue, 'false');
});

test('Result: unwrap succeeds on Ok and panics on Err', () => {
  const r1 = run(`
res = Ok(99)
res.unwrap()
`);
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.displayValue, '99');

  const r2 = run(`
res = Err("timeout")
res.unwrap()
`);
  assert.strictEqual(r2.success, false);
  assert.ok(r2.outcome && r2.outcome.kind === 'Panic');
  assert.ok(r2.diagnostics.format().includes('unwrap on an Err value: timeout'));
});

test('Result: expect succeeds on Ok and panics with message on Err', () => {
  const r1 = run(`
res = Ok("success")
res.expect("should not fail")
`);
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.displayValue, 'success');

  const r2 = run(`
res = Err("disk full")
res.expect("failed to save data")
`);
  assert.strictEqual(r2.success, false);
  assert.ok(r2.diagnostics.format().includes('failed to save data'));
  assert.ok(r2.diagnostics.format().includes('disk full'));
});

test('Result: unwrap_or returns inner value on Ok and fallback on Err', () => {
  const r1 = run(`
res = Ok(10)
res.unwrap_or(0)
`);
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.displayValue, '10');

  const r2 = run(`
res = Err("bad")
res.unwrap_or(0)
`);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.displayValue, '0');
});

test('Result: unwrap_or_else executes closure on Err', () => {
  const r1 = run(`
res = Ok(25)
res.unwrap_or_else((err: String) => 0)
`);
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.displayValue, '25');

  const r2 = run(`
res = Err("calculation error")
res.unwrap_or_else((err: String) => 42)
`);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.displayValue, '42');
});

test('Result: map transforms inner value on Ok and preserves Err', () => {
  const r1 = run(`
res = Ok(21)
res.map((x: Int) => x * 2)
`);
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.displayValue, 'Ok(42)');

  const r2 = run(`
res = Err("connection lost")
res.map((x: Int) => x * 2)
`);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.displayValue, 'Err(connection lost)');
});

test('Result: map_err transforms error on Err and preserves Ok', () => {
  const r1 = run(`
res = Err("not found")
res.map_err((e: String) => "Error: " + e)
`);
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.displayValue, 'Err(Error: not found)');

  const r2 = run(`
res = Ok(100)
res.map_err((e: String) => "Error: " + e)
`);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.displayValue, 'Ok(100)');
});

test('Result: and_then chains computations producing Result', () => {
  const r1 = run(`
fn safe_div(a: Int, b: Int) -> Result<Int, String> {
  if b == 0 {
    Err("division by zero")
  } else {
    Ok(a / b)
  }
}

res = Ok(20)
res.and_then((n: Int) => safe_div(n, 2))
`);
  assert.strictEqual(r1.success, true, r1.diagnostics.format());
  assert.strictEqual(r1.displayValue, 'Ok(10)');

  const r2 = run(`
fn safe_div(a: Int, b: Int) -> Result<Int, String> {
  if b == 0 {
    Err("division by zero")
  } else {
    Ok(a / b)
  }
}

res = Ok(20)
res.and_then((n: Int) => safe_div(n, 0))
`);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.displayValue, 'Err(division by zero)');
});

test('Result: or_else provides fallback Result computation', () => {
  const r1 = run(`
res = Ok(10)
res.or_else((err: String) => Ok(20))
`);
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.displayValue, 'Ok(10)');

  const r2 = run(`
res = Err("primary failed")
res.or_else((err: String) => Ok(20))
`);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.displayValue, 'Ok(20)');
});

test('Result: question mark operator ? unwraps Ok and propagates Err', () => {
  const r1 = run(`
fn calculate(success: Bool) -> Result<Int, String> {
  val = if success { Ok(50) } else { Err("failed step") }
  x = val?
  Ok(x + 50)
}

fn main() {
  r = calculate(true)
  println(r)
}
`);
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.output[0], 'Ok(100)');

  const r2 = run(`
fn calculate(success: Bool) -> Result<Int, String> {
  val = if success { Ok(50) } else { Err("failed step") }
  x = val?
  Ok(x + 50)
}

fn main() {
  r = calculate(false)
  println(r)
}
`);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.output[0], 'Err(failed step)');
});
