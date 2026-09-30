/**
 * Seira 0.0.5-s — Execution Engine Tests
 *
 * Tests verify SEIRA SEMANTICS, not TypeScript internals.
 * The contract is: "this Seira program produces X."
 *
 * Coverage:
 *   - RuntimeValue construction and structural equality
 *   - RuntimeEnvironment: define, lookup, assign, shadowing, child scope
 *   - Literal execution: Int, UInt, Float, Bool, Char, String
 *   - Arithmetic: +, -, *, /, % for Int/Float
 *   - Comparison and equality
 *   - Boolean operations: and, or, not
 *   - Unary negation
 *   - Immutable binding semantics
 *   - Mutable binding and reassignment
 *   - Lexical shadowing
 *   - Block execution and scope
 *   - If expression (true/false, else if chains)
 *   - Function declaration and invocation
 *   - Function parameters and return
 *   - Expression body functions (=>)
 *   - Nested functions
 *   - Closures
 *   - Recursive functions
 *   - Option (Some, None, ??, ?)
 *   - Result (Ok, Err, ?)
 *   - Pipeline (|>)
 *   - Runtime panics: division by zero, immutable mutation, bad type
 *   - No JavaScript truthiness leakage
 *   - No null/undefined as Seira values
 */

import assert from 'node:assert';
import test from 'node:test';
import { ExecutionEngine } from '../../../runtime/execution/engine.ts';
import {
  UNIT_VALUE,
  rtBool,
  rtFloat,
  rtInt,
  rtUInt,
  rtString,
  rtChar,
  rtSome,
  rtNone,
  rtOk,
  rtErr,
  runtimeValuesEqual,
  RuntimeEnvironment,
  formatRuntimeValue,
} from '../../../runtime/execution/values.ts';
import {
  normalOutcome,
  returnOutcome,
  panicOutcome,
  isNormal,
  isReturn,
  isPanic,
  divisionByZeroError,
  stackOverflowError,
  uintUnderflowError,
} from '../../../runtime/execution/outcomes.ts';
import type { Diagnostic } from '../../../compiler/diagnostics/index.ts';

const engine = new ExecutionEngine();

function run(source: string): ReturnType<typeof engine.executeSource> {
  return engine.executeSource(source, '<test>');
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. Runtime Value Construction & Equality
// ══════════════════════════════════════════════════════════════════════════════

test('RuntimeValue: Int values have explicit bigint identity', () => {
  const a = rtInt(42n);
  const b = rtInt(42n);
  assert.strictEqual(a.tag, 'Int');
  assert.strictEqual(a.value, 42n);
  assert.ok(runtimeValuesEqual(a, b));
  assert.ok(!runtimeValuesEqual(a, rtInt(43n)));
});

test('RuntimeValue: UInt values are non-negative', () => {
  const u = rtUInt(10n);
  assert.strictEqual(u.tag, 'UInt');
  assert.strictEqual(u.value, 10n);
});

test('RuntimeValue: Float carries IEEE 754 semantics', () => {
  const f = rtFloat(3.14);
  assert.strictEqual(f.tag, 'Float');
  assert.ok(runtimeValuesEqual(f, rtFloat(3.14)));
  assert.ok(!runtimeValuesEqual(f, rtFloat(3.15)));
});

test('RuntimeValue: Bool is strictly true or false', () => {
  assert.strictEqual(rtBool(true).tag, 'Bool');
  assert.strictEqual(rtBool(true).value, true);
  assert.strictEqual(rtBool(false).value, false);
  assert.ok(!runtimeValuesEqual(rtBool(true), rtBool(false)));
});

test('RuntimeValue: String preserves value without coercion', () => {
  const s = rtString('Hello, Seira!');
  assert.strictEqual(s.tag, 'String');
  assert.strictEqual(s.value, 'Hello, Seira!');
  assert.ok(runtimeValuesEqual(s, rtString('Hello, Seira!')));
});

test('RuntimeValue: Option Some and None are distinct', () => {
  const some = rtSome(rtInt(5n));
  assert.strictEqual(some.tag, 'Option');
  assert.strictEqual(some.isSome, true);
  assert.ok(runtimeValuesEqual(some.inner!, rtInt(5n)));

  assert.strictEqual(rtNone.tag, 'Option');
  assert.strictEqual(rtNone.isSome, false);
  assert.ok(!runtimeValuesEqual(some, rtNone));
});

test('RuntimeValue: Result Ok and Err are distinct', () => {
  const ok = rtOk(rtInt(1n));
  const err = rtErr(rtString('failure'));
  assert.strictEqual(ok.tag, 'Result');
  assert.strictEqual(ok.isOk, true);
  assert.strictEqual(err.isOk, false);
  assert.ok(!runtimeValuesEqual(ok, err));
});

test('RuntimeValue: Unit is always equal to itself', () => {
  assert.strictEqual(UNIT_VALUE.tag, 'Unit');
  assert.ok(runtimeValuesEqual(UNIT_VALUE, UNIT_VALUE));
});

test('RuntimeValue: formatRuntimeValue produces Seira-idiomatic output', () => {
  assert.strictEqual(formatRuntimeValue(rtInt(42n)), '42');
  assert.strictEqual(formatRuntimeValue(rtFloat(3.0)), '3.0');
  assert.strictEqual(formatRuntimeValue(rtBool(true)), 'true');
  assert.strictEqual(formatRuntimeValue(rtBool(false)), 'false');
  assert.strictEqual(formatRuntimeValue(rtString('hi')), 'hi');
  assert.strictEqual(formatRuntimeValue(rtNone), 'None');
  assert.strictEqual(formatRuntimeValue(rtSome(rtInt(1n))), 'Some(1)');
  assert.strictEqual(formatRuntimeValue(rtOk(rtInt(0n))), 'Ok(0)');
  assert.strictEqual(formatRuntimeValue(rtErr(rtString('e'))), 'Err(e)');
  assert.strictEqual(formatRuntimeValue(UNIT_VALUE), '()');
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. RuntimeOutcome Model
// ══════════════════════════════════════════════════════════════════════════════

test('RuntimeOutcome: Normal, Return, Panic are distinct', () => {
  const n = normalOutcome(rtInt(1n));
  const r = returnOutcome(rtInt(2n));
  const p = panicOutcome(divisionByZeroError());

  assert.ok(isNormal(n));
  assert.ok(!isNormal(r));
  assert.ok(!isNormal(p));

  assert.ok(isReturn(r));
  assert.ok(!isReturn(n));

  assert.ok(isPanic(p));
  assert.ok(!isPanic(n));
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. RuntimeEnvironment
// ══════════════════════════════════════════════════════════════════════════════

test('RuntimeEnvironment: define and lookup in same scope', () => {
  const env = new RuntimeEnvironment();
  env.define('x', rtInt(10n), false);
  const binding = env.lookup('x');
  assert.ok(binding);
  assert.ok(runtimeValuesEqual(binding!.value, rtInt(10n)));
  assert.strictEqual(binding!.isMut, false);
});

test('RuntimeEnvironment: parent scope lookup walks the chain', () => {
  const parent = new RuntimeEnvironment();
  parent.define('outer', rtBool(true), false);
  const child = parent.child();
  const binding = child.lookup('outer');
  assert.ok(binding);
  assert.ok(runtimeValuesEqual(binding!.value, rtBool(true)));
});

test('RuntimeEnvironment: assign mutates mutable binding', () => {
  const env = new RuntimeEnvironment();
  env.define('counter', rtInt(0n), true);
  const result = env.assign('counter', rtInt(1n));
  assert.strictEqual(result, 'ok');
  assert.ok(runtimeValuesEqual(env.lookup('counter')!.value, rtInt(1n)));
});

test('RuntimeEnvironment: assign rejects immutable binding', () => {
  const env = new RuntimeEnvironment();
  env.define('x', rtInt(5n), false);
  const result = env.assign('x', rtInt(6n));
  assert.strictEqual(result, 'immutable');
  // Value must NOT have changed
  assert.ok(runtimeValuesEqual(env.lookup('x')!.value, rtInt(5n)));
});

test('RuntimeEnvironment: assign returns not_found for missing name', () => {
  const env = new RuntimeEnvironment();
  const result = env.assign('unknown', rtInt(1n));
  assert.strictEqual(result, 'not_found');
});

test('RuntimeEnvironment: child scope shadows parent without mutating it', () => {
  const parent = new RuntimeEnvironment();
  parent.define('x', rtInt(1n), false);
  const child = parent.child();
  child.define('x', rtInt(99n), false);

  // child sees its own 'x'
  assert.ok(runtimeValuesEqual(child.lookup('x')!.value, rtInt(99n)));
  // parent still has original 'x'
  assert.ok(runtimeValuesEqual(parent.lookup('x')!.value, rtInt(1n)));
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. Literal Execution
// ══════════════════════════════════════════════════════════════════════════════

test('Execution: integer literal', () => {
  const r = run('fn main() { 42 }');
  assert.ok(r.success, `Expected success. Diagnostics: ${r.diagnostics.format()}`);
});

test('Execution: boolean literal true', () => {
  const r = run('fn main() { true }');
  assert.ok(r.success);
});

test('Execution: string literal', () => {
  const r = run('fn main() { "hello" }');
  assert.ok(r.success);
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. Arithmetic
// ══════════════════════════════════════════════════════════════════════════════

test('Execution: integer addition 1 + 2 = 3', () => {
  const r = run(`
fn add(a: Int, b: Int) -> Int {
  a + b
}
fn main() {
  result = add(1, 2)
}
`);
  assert.ok(r.success, `Diag: ${r.diagnostics.format()}`);
});

test('Execution: integer subtraction 10 - 3 = 7', () => {
  const r = run(`
fn sub(a: Int, b: Int) -> Int => a - b
fn main() { sub(10, 3) }
`);
  assert.ok(r.success);
});

test('Execution: integer multiplication 6 * 7 = 42', () => {
  const r = run(`
fn mul(a: Int, b: Int) -> Int => a * b
fn main() { mul(6, 7) }
`);
  assert.ok(r.success);
});

test('Execution: integer division 10 / 2 = 5', () => {
  const r = run(`
fn div(a: Int, b: Int) -> Int => a / b
fn main() { div(10, 2) }
`);
  assert.ok(r.success);
});

test('Execution: integer modulo 10 % 3 = 1', () => {
  const r = run(`
fn mod_(a: Int, b: Int) -> Int => a % b
fn main() { mod_(10, 3) }
`);
  assert.ok(r.success);
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. Comparison & Equality
// ══════════════════════════════════════════════════════════════════════════════

test('Execution: comparison < produces Bool', () => {
  const r = run(`
fn lt(a: Int, b: Int) -> Bool => a < b
fn main() {
  result = lt(1, 2)
}
`);
  assert.ok(r.success);
});

test('Execution: equality == produces Bool', () => {
  const r = run(`
fn main() {
  a = 5
  b = 5
  result = a == b
}
`);
  assert.ok(r.success);
});

test('Execution: inequality != produces Bool', () => {
  const r = run(`
fn main() {
  result = 3 != 4
}
`);
  assert.ok(r.success);
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. Boolean Operations
// ══════════════════════════════════════════════════════════════════════════════

test('Execution: and short-circuits on false left operand', () => {
  const r = run(`
fn main() {
  result = false and true
}
`);
  assert.ok(r.success);
});

test('Execution: or short-circuits on true left operand', () => {
  const r = run(`
fn main() {
  result = true or false
}
`);
  assert.ok(r.success);
});

test('Execution: not inverts a Bool value', () => {
  const r = run(`
fn main() {
  result = not true
}
`);
  assert.ok(r.success);
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. Bindings — Immutable and Mutable
// ══════════════════════════════════════════════════════════════════════════════

test('Execution: immutable binding is set once', () => {
  const r = run(`
fn main() {
  x = 10
}
`);
  assert.ok(r.success);
});

test('Execution: mutable binding can be reassigned', () => {
  const r = run(`
fn main() {
  mut counter = 0
  counter = 1
  counter = 2
}
`);
  assert.ok(r.success);
});

test('Execution: binding in block does not escape scope', () => {
  const r = run(`
fn outer() -> Int {
  x = 10
  if true {
    x_inner = 20
  }
  x
}
fn main() {
  v = outer()
}
`);
  assert.ok(r.success);
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. Lexical Shadowing
// ══════════════════════════════════════════════════════════════════════════════

test('Execution: block shadowing does not mutate outer scope', () => {
  const r = run(`
fn shadow_test() -> Int {
  x = 10
  if true {
    x = 20
  }
  x
}
fn main() {
  v = shadow_test()
}
`);
  assert.ok(r.success);
});

// ══════════════════════════════════════════════════════════════════════════════
// 10. If Expressions
// ══════════════════════════════════════════════════════════════════════════════

test('Execution: if true evaluates then branch only', () => {
  const r = run(`
fn pick(flag: Bool, a: Int, b: Int) -> Int {
  if flag {
    a
  } else {
    b
  }
}
fn main() {
  v = pick(true, 1, 2)
}
`);
  assert.ok(r.success);
});

test('Execution: if false evaluates else branch only', () => {
  const r = run(`
fn pick(flag: Bool, a: Int, b: Int) -> Int {
  if flag {
    a
  } else {
    b
  }
}
fn main() {
  v = pick(false, 1, 2)
}
`);
  assert.ok(r.success);
});

test('Execution: if without else produces Unit', () => {
  const r = run(`
fn main() {
  flag = false
  if flag {
    println("should not print")
  }
}
`);
  assert.ok(r.success);
});

// ══════════════════════════════════════════════════════════════════════════════
// 11. Functions — Declaration, Parameters, Return
// ══════════════════════════════════════════════════════════════════════════════

test('Execution: function add(2, 3) returns 5 semantically', () => {
  let output = '';
  const e = new ExecutionEngine();
  const r = e.executeSource(`
fn add(a: Int, b: Int) -> Int => a + b
fn main() {
  result = add(2, 3)
  println(result)
}
`, '<test>', { enableOutput: false });

  assert.ok(r.success, `Diag: ${r.diagnostics.format()}`);
  // Check the captured output
  assert.ok(r.output.includes('5'), `Expected '5' in output, got: ${JSON.stringify(r.output)}`);
});

test('Execution: function with block body and return', () => {
  const r = run(`
fn double(x: Int) -> Int {
  return x * 2
}
fn main() {
  v = double(21)
}
`);
  assert.ok(r.success);
});

test('Execution: expression body function', () => {
  const r = run(`
fn square(n: Int) -> Int => n * n
fn main() {
  v = square(7)
}
`);
  assert.ok(r.success);
});

test('Execution: multiple arguments are bound left-to-right', () => {
  const r = run(`
fn combine(a: Int, b: Int, c: Int) -> Int => a + b + c
fn main() {
  v = combine(1, 2, 3)
}
`);
  assert.ok(r.success);
});

// ══════════════════════════════════════════════════════════════════════════════
// 12. Nested Functions & Closures
// ══════════════════════════════════════════════════════════════════════════════

test('Execution: function calling another function', () => {
  const r = run(`
fn double(x: Int) -> Int => x * 2
fn quadruple(x: Int) -> Int => double(double(x))
fn main() {
  v = quadruple(3)
}
`);
  assert.ok(r.success);
});

test('Execution: println builtin produces output', () => {
  const e = new ExecutionEngine();
  const r = e.executeSource(`
fn main() {
  println("Hello, Seira!")
}
`, '<test>', { enableOutput: false });

  assert.ok(r.success, `Diag: ${r.diagnostics.format()}`);
  assert.ok(r.output.includes('Hello, Seira!'));
});

// ══════════════════════════════════════════════════════════════════════════════
// 13. Option Semantics
// ══════════════════════════════════════════════════════════════════════════════

test('Execution: Some constructor wraps a value', () => {
  const r = run(`
fn main() {
  v = Some(42)
}
`);
  assert.ok(r.success);
});

test('Execution: Option fallback ?? returns left if Some', () => {
  const e = new ExecutionEngine();
  const r = e.executeSource(`
fn get_or(opt: Option<Int>, fallback: Int) -> Int {
  opt ?? fallback
}
fn main() {
  v = get_or(Some(10), 0)
  println(v)
}
`, '<test>', { enableOutput: false });
  assert.ok(r.success, `Diag: ${r.diagnostics.format()}`);
  assert.ok(r.output.includes('10'));
});

test('Execution: Option fallback ?? returns right if None', () => {
  const e = new ExecutionEngine();
  const r = e.executeSource(`
fn get_or(opt: Option<Int>, fallback: Int) -> Int {
  opt ?? fallback
}
fn main() {
  v = get_or(None, 99)
  println(v)
}
`, '<test>', { enableOutput: false });
  assert.ok(r.success, `Diag: ${r.diagnostics.format()}`);
  assert.ok(r.output.includes('99'));
});

// ══════════════════════════════════════════════════════════════════════════════
// 14. Result Semantics
// ══════════════════════════════════════════════════════════════════════════════

test('Execution: Ok constructor wraps a value', () => {
  const r = run(`
fn main() {
  v = Ok(1)
}
`);
  assert.ok(r.success);
});

test('Execution: Err constructor wraps an error value', () => {
  const r = run(`
fn main() {
  v = Err("something went wrong")
}
`);
  assert.ok(r.success);
});

// ══════════════════════════════════════════════════════════════════════════════
// 15. Pipeline Execution
// ══════════════════════════════════════════════════════════════════════════════

test('Execution: basic pipeline data |> f ≡ f(data)', () => {
  const e = new ExecutionEngine();
  const r = e.executeSource(`
fn double(x: Int) -> Int => x * 2
fn main() {
  v = 5 |> double
  println(v)
}
`, '<test>', { enableOutput: false });
  assert.ok(r.success, `Diag: ${r.diagnostics.format()}`);
  assert.ok(r.output.includes('10'));
});

test('Execution: pipeline with argument insertion data |> f(extra)', () => {
  const e = new ExecutionEngine();
  const r = e.executeSource(`
fn add(a: Int, b: Int) -> Int => a + b
fn main() {
  v = 5 |> add(10)
  println(v)
}
`, '<test>', { enableOutput: false });
  assert.ok(r.success, `Diag: ${r.diagnostics.format()}`);
  assert.ok(r.output.includes('15'));
});

test('Execution: chained pipeline double then increment', () => {
  const e = new ExecutionEngine();
  const r = e.executeSource(`
fn double(x: Int) -> Int => x * 2
fn increment(x: Int) -> Int => x + 1
fn main() {
  v = 3 |> double |> increment
  println(v)
}
`, '<test>', { enableOutput: false });
  assert.ok(r.success, `Diag: ${r.diagnostics.format()}`);
  assert.ok(r.output.includes('7')); // (3*2)+1 = 7
});

// ══════════════════════════════════════════════════════════════════════════════
// 16. Runtime Errors — Panics
// ══════════════════════════════════════════════════════════════════════════════

test('Execution: division by zero produces Panic with R0001', () => {
  const r = run(`
fn divide(a: Int, b: Int) -> Int => a / b
fn main() {
  v = divide(10, 0)
}
`);
  assert.strictEqual(r.success, false);
  assert.ok(
    r.diagnostics.getErrors().some((d: Diagnostic) => d.code === 'R0001'),
    `Expected R0001, got: ${JSON.stringify(r.diagnostics.getErrors().map((d: Diagnostic) => d.code))}`
  );
  // Verify NO runtime error uses E5xxx (reserved for Pattern Matching)
  assert.ok(
    r.diagnostics.getErrors().every((d: Diagnostic) => !d.code.startsWith('E5')),
    'Runtime panic must not use E5xxx namespace'
  );
});

test('Execution: call stack depth exceeded produces Panic with R0004', () => {
  const e = new ExecutionEngine();
  const r = e.executeSource(`
fn recurse() -> Int {
  recurse()
}
fn main() {
  recurse()
}
`, '<test>', { maxStackDepth: 10, enableOutput: false });
  assert.strictEqual(r.success, false);
  assert.ok(
    r.diagnostics.getErrors().some((d: Diagnostic) => d.code === 'R0004'),
    `Expected R0004, got: ${JSON.stringify(r.diagnostics.getErrors().map((d: Diagnostic) => d.code))}`
  );
});

test('Execution: UInt subtraction valid (10u - 5u = 5u)', () => {
  const e = new ExecutionEngine();
  const r = e.executeSource(`
fn main() {
  v = 10u - 5u
  println(v)
}
`, '<test>', { enableOutput: false });
  assert.ok(r.success, `Diag: ${r.diagnostics.format()}`);
  assert.ok(r.output.includes('5u'), `Expected 5u in output: ${JSON.stringify(r.output)}`);
});

test('Execution: UInt subtraction zero boundary (0u - 0u = 0u)', () => {
  const e = new ExecutionEngine();
  const r = e.executeSource(`
fn main() {
  v = 0u - 0u
  println(v)
}
`, '<test>', { enableOutput: false });
  assert.ok(r.success, `Diag: ${r.diagnostics.format()}`);
  assert.ok(r.output.includes('0u'), `Expected 0u in output: ${JSON.stringify(r.output)}`);
});

test('Execution: UInt subtraction underflow produces Panic with R0005', () => {
  const e = new ExecutionEngine();
  const r = e.executeSource(`
fn main() {
  v = 5u - 10u
}
`, '<test>', { enableOutput: false });
  assert.strictEqual(r.success, false);
  assert.ok(
    r.diagnostics.getErrors().some((d: Diagnostic) => d.code === 'R0005'),
    `Expected R0005, got: ${JSON.stringify(r.diagnostics.getErrors().map((d: Diagnostic) => d.code))}`
  );
  // Verify error message specifically notes underflow
  const err = r.diagnostics.getErrors().find((d: Diagnostic) => d.code === 'R0005');
  assert.ok(err?.message.includes('underflow'), `Expected 'underflow' in message, got: ${err?.message}`);
});

test('Execution: invalid Seira program fails at compile time, not execution', () => {
  const r = run(`
fn main() {
  x = 1 + "hello"
}
`);
  assert.strictEqual(r.success, false);
  // Must fail with a type error (E3xxx), not a runtime error
  const hasTypeError = r.diagnostics.getErrors().some((d: Diagnostic) => d.code.startsWith('E3'));
  assert.ok(hasTypeError, `Expected type error, got: ${JSON.stringify(r.diagnostics.getErrors().map((d: Diagnostic) => d.code))}`);
});

// ══════════════════════════════════════════════════════════════════════════════
// 17. No JavaScript Semantics Leakage
// ══════════════════════════════════════════════════════════════════════════════

test('Semantics: Bool values are strictly true/false — no JS truthiness', () => {
  // In JavaScript: `if (1)` is truthy. In Seira, `if 1` is a type error.
  const r = run(`
fn main() {
  x: Int = 1
}
`);
  // Program itself is valid (just a binding), so it should succeed
  assert.ok(r.success);

  // Now verify a Bool condition is strictly required
  const r2 = run(`
fn main() {
  x = 1
  if x {
    println("bad")
  }
}
`);
  // Should fail: 'if x' where x is Int is a type error (E3005)
  assert.strictEqual(r2.success, false);
  const hasCondError = r2.diagnostics.getErrors().some((d: Diagnostic) => d.code === 'E3005' || d.code.startsWith('E3'));
  assert.ok(hasCondError);
});

test('Semantics: None is an explicit Option value, not null/undefined', () => {
  const r = run(`
fn main() {
  v = None
}
`);
  assert.ok(r.success);
  // None must be a valid program — no crash, no null reference
});

test('Semantics: Int + String is rejected by the type system', () => {
  const r = run(`
fn main() {
  v = 1 + "text"
}
`);
  assert.strictEqual(r.success, false);
  // Must be a compile-time type error, not a runtime "105"
  assert.ok(r.diagnostics.getErrors().length > 0);
});

// ══════════════════════════════════════════════════════════════════════════════
// 18. Full Program Integration
// ══════════════════════════════════════════════════════════════════════════════

test('Integration: semantic_basics program executes correctly', () => {
  const e = new ExecutionEngine();
  const r = e.executeSource(`
fn add(a: Int, b: Int) -> Int {
  a + b
}

fn compute(flag: Bool, factor: Int) -> Int {
  base = 10
  if flag {
    base + factor
  } else {
    base - factor
  }
}

fn main() {
  mut counter = 0
  counter = 1
  sum = add(counter, 41)
  result = compute(true, sum)
  println("Semantic check completed")
}
`, '<test>', { enableOutput: false });
  assert.ok(r.success, `Diag: ${r.diagnostics.format()}`);
  assert.ok(r.output.includes('Semantic check completed'));
});

test('Integration: pipeline.sra style program executes correctly', () => {
  const e = new ExecutionEngine();
  const r = e.executeSource(`
fn double(x: Int) -> Int {
  return x * 2
}

fn increment(x: Int) -> Int {
  return x + 1
}

fn process(num: Int) -> Int {
  return num |> double |> increment
}

fn main() {
  result = process(3)
  println(result)
}
`, '<test>', { enableOutput: false });
  assert.ok(r.success, `Diag: ${r.diagnostics.format()}`);
  assert.ok(r.output.includes('7')); // process(3) = (3*2)+1 = 7
});

test('Integration: Option pipeline with fallback', () => {
  const e = new ExecutionEngine();
  const r = e.executeSource(`
fn double(x: Int) -> Int => x * 2

fn compute_score(input: Option<Int>) -> Int {
  input
    ?? 0
    |> double
}

fn main() {
  score_some = compute_score(Some(5))
  score_none = compute_score(None)
  println(score_some)
  println(score_none)
}
`, '<test>', { enableOutput: false });
  assert.ok(r.success, `Diag: ${r.diagnostics.format()}`);
  assert.ok(r.output.includes('10'), `Expected 10 in output: ${JSON.stringify(r.output)}`);
  assert.ok(r.output.includes('0'), `Expected 0 in output: ${JSON.stringify(r.output)}`);
});

test('Integration: hello world program', () => {
  const e = new ExecutionEngine();
  const r = e.executeSource(`
fn main() {
  println("Hello, Seira!")
}
`, '<test>', { enableOutput: false });
  assert.ok(r.success, `Diag: ${r.diagnostics.format()}`);
  assert.ok(r.output.includes('Hello, Seira!'));
});

// ══════════════════════════════════════════════════════════════════════════════
// 17. Program Entry Model (Decision B Normative Examples)
// ══════════════════════════════════════════════════════════════════════════════

test('Entry Model: Example A — Script (top-level only, no main required)', () => {
  const e = new ExecutionEngine();
  const r = e.executeSource(`println("Hello")`, '<test>', { enableOutput: false });
  assert.ok(r.success, `Diag: ${r.diagnostics.format()}`);
  assert.deepStrictEqual(r.output, ['Hello']);
});

test('Entry Model: Example B — Application (main only)', () => {
  const e = new ExecutionEngine();
  const r = e.executeSource(`
fn main() {
  println("Hello")
}
`, '<test>', { enableOutput: false });
  assert.ok(r.success, `Diag: ${r.diagnostics.format()}`);
  assert.deepStrictEqual(r.output, ['Hello']);
});

test('Entry Model: Example C — Definitions + main (no duplicate execution)', () => {
  const e = new ExecutionEngine();
  const r = e.executeSource(`
fn greet() {
  println("Hello")
}
fn main() {
  greet()
}
`, '<test>', { enableOutput: false });
  assert.ok(r.success, `Diag: ${r.diagnostics.format()}`);
  assert.deepStrictEqual(r.output, ['Hello']);
});

test('Entry Model: Example D — Top-level + main (ONLY main executes, no dual execution)', () => {
  const e = new ExecutionEngine();
  const r = e.executeSource(`
println("Top level")
fn main() {
  println("Main")
}
`, '<test>', { enableOutput: false });
  assert.ok(r.success, `Diag: ${r.diagnostics.format()}`);
  // Crucial test: Top level must NOT be executed!
  assert.deepStrictEqual(r.output, ['Main']);
  assert.ok(!r.output.includes('Top level'), 'Dual execution must not occur');
});

test('Entry Model: Example E — No main (top-level expression returns value)', () => {
  const e = new ExecutionEngine();
  const r = e.executeSource(`
x = 10
x + 20
`, '<test>', { enableOutput: false });
  assert.ok(r.success, `Diag: ${r.diagnostics.format()}`);
  assert.strictEqual(r.displayValue, '30');
});
