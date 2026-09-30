/**
 * Seira 0.0.6-s — Data & Control Foundation Test Suite
 *
 * Validates:
 *   1. Control Flow (if expression, while, for ... in, loop, break, continue)
 *   2. Pattern Matching (literal, wildcard, binding, Some, None, Ok, Err, exhaustiveness)
 *   3. Collections (List, Tuple, Map, Set, safe indexing with Option, methods, equality)
 *   4. Iteration (List, Set)
 *   5. Functions (lambdas, lexical closures, higher-order functions)
 *   6. Option & Result Integration (?, ??, match)
 *   7. Pipeline Composition (functions, lambdas, chained)
 *   8. Diagnostics & Negative Tests (break/continue outside loop, exhaustiveness, invalid arity/types)
 */

import assert from 'node:assert';
import test from 'node:test';
import { ExecutionEngine } from '../../../runtime/execution/engine.ts';
import {
  rtBool,
  rtInt,
  rtString,
  rtSome,
  rtNone,
  rtOk,
  rtErr,
  rtList,
  rtTuple,
  rtMap,
  rtSet,
  runtimeValuesEqual,
} from '../../../runtime/execution/values.ts';
import { isNormal } from '../../../runtime/execution/outcomes.ts';
import { CompilerDriver } from '../../../compiler/driver/driver.ts';
import { CompilerStage } from '../../../compiler/driver/stage.ts';

const engine = new ExecutionEngine();
const driver = new CompilerDriver();

function run(source: string) {
  return engine.executeSource(source, '<test>');
}

function check(source: string) {
  return driver.compile(source, '<test>', { stopAfter: CompilerStage.Typecheck });
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. Control Flow
// ══════════════════════════════════════════════════════════════════════════════

test('Control Flow: if-else produces expression value', () => {
  const result = run(`
    age = 20
    status = if age >= 18 { "adult" } else { "minor" }
    status
  `);
  assert.ok(result.success && isNormal(result.outcome));
  assert.ok(runtimeValuesEqual(result.outcome.value, rtString('adult')));
});

test('Control Flow: nested if expression evaluation', () => {
  const result = run(`
    score = 85
    grade = if score >= 90 {
      "A"
    } else {
      if score >= 80 {
        "B"
      } else {
        "C"
      }
    }
    grade
  `);
  assert.ok(result.success && isNormal(result.outcome));
  assert.ok(runtimeValuesEqual(result.outcome.value, rtString('B')));
});

test('Control Flow: while loop execution with mutation', () => {
  const result = run(`
    mut sum = 0
    mut i = 1
    while i <= 5 {
      sum = sum + i
      i = i + 1
    }
    sum
  `);
  assert.ok(result.success && isNormal(result.outcome));
  assert.ok(runtimeValuesEqual(result.outcome.value, rtInt(15n)));
});

test('Control Flow: loop with explicit break', () => {
  const result = run(`
    mut count = 0
    loop {
      count = count + 1
      if count == 3 {
        break
      }
    }
    count
  `);
  assert.ok(result.success && isNormal(result.outcome));
  assert.ok(runtimeValuesEqual(result.outcome.value, rtInt(3n)));
});

test('Control Flow: loop with continue and break', () => {
  const result = run(`
    mut sum = 0
    mut i = 0
    while i < 10 {
      i = i + 1
      if i % 2 == 0 {
        continue
      }
      sum = sum + i
    }
    sum
  `);
  assert.ok(result.success && isNormal(result.outcome));
  // Odd numbers from 1 to 9: 1 + 3 + 5 + 7 + 9 = 25
  assert.ok(runtimeValuesEqual(result.outcome.value, rtInt(25n)));
});

test('Control Flow: nested loops with inner break', () => {
  const result = run(`
    mut total = 0
    mut outer = 0
    while outer < 3 {
      outer = outer + 1
      mut inner = 0
      while inner < 10 {
        inner = inner + 1
        if inner > 2 {
          break
        }
        total = total + 1
      }
    }
    total
  `);
  assert.ok(result.success && isNormal(result.outcome));
  // 3 outer iterations * 2 inner iterations = 6
  assert.ok(runtimeValuesEqual(result.outcome.value, rtInt(6n)));
});

test('Control Flow: for in loop over List', () => {
  const result = run(`
    numbers = [10, 20, 30]
    mut sum = 0
    for n in numbers {
      sum = sum + n
    }
    sum
  `);
  assert.ok(result.success && isNormal(result.outcome));
  assert.ok(runtimeValuesEqual(result.outcome.value, rtInt(60n)));
});

test('Control Flow: for in loop over Set', () => {
  const result = run(`
    items = set[1, 2, 3]
    mut sum = 0
    for x in items {
      sum = sum + x
    }
    sum
  `);
  assert.ok(result.success && isNormal(result.outcome));
  assert.ok(runtimeValuesEqual(result.outcome.value, rtInt(6n)));
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. Pattern Matching
// ══════════════════════════════════════════════════════════════════════════════

test('Pattern Matching: literal pattern matching', () => {
  const result = run(`
    val = 1
    result = match val {
      0 => "zero"
      1 => "one"
      _ => "other"
    }
    result
  `);
  assert.ok(result.success && isNormal(result.outcome));
  assert.ok(runtimeValuesEqual(result.outcome.value, rtString('one')));
});

test('Pattern Matching: wildcard pattern matching', () => {
  const result = run(`
    val = 99
    result = match val {
      0 => "zero"
      _ => "other"
    }
    result
  `);
  assert.ok(result.success && isNormal(result.outcome));
  assert.ok(runtimeValuesEqual(result.outcome.value, rtString('other')));
});

test('Pattern Matching: variable binding pattern', () => {
  const result = run(`
    val = 42
    result = match val {
      x => x * 2
    }
    result
  `);
  assert.ok(result.success && isNormal(result.outcome));
  assert.ok(runtimeValuesEqual(result.outcome.value, rtInt(84n)));
});

test('Pattern Matching: Option Some and None patterns', () => {
  const resultSome = run(`
    opt = Some(10)
    match opt {
      Some(x) => x + 5
      None => 0
    }
  `);
  assert.ok(resultSome.success && isNormal(resultSome.outcome));
  assert.ok(runtimeValuesEqual(resultSome.outcome.value, rtInt(15n)));

  const resultNone = run(`
    opt = None
    match opt {
      Some(x) => x + 5
      None => 0
    }
  `);
  assert.ok(resultNone.success && isNormal(resultNone.outcome));
  assert.ok(runtimeValuesEqual(resultNone.outcome.value, rtInt(0n)));
});

test('Pattern Matching: Result Ok and Err patterns', () => {
  const resultOk = run(`
    res = Ok(100)
    match res {
      Ok(val) => val
      Err(err) => 0
    }
  `);
  assert.ok(resultOk.success && isNormal(resultOk.outcome));
  assert.ok(runtimeValuesEqual(resultOk.outcome.value, rtInt(100n)));

  const resultErr = run(`
    res = Err("failed")
    match res {
      Ok(val) => 1
      Err(err) => 0
    }
  `);
  assert.ok(resultErr.success && isNormal(resultErr.outcome));
  assert.ok(runtimeValuesEqual(resultErr.outcome.value, rtInt(0n)));
});

test('Pattern Matching: nested match expression', () => {
  const result = run(`
    opt = Some(5)
    match opt {
      Some(x) => match x {
        5 => "five"
        _ => "other"
      }
      None => "none"
    }
  `);
  assert.ok(result.success && isNormal(result.outcome));
  assert.ok(runtimeValuesEqual(result.outcome.value, rtString('five')));
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. Collections & Safe Indexing
// ══════════════════════════════════════════════════════════════════════════════

test('Collections: List creation and safe indexing produces Option', () => {
  const resultValid = run(`
    numbers = [10, 20, 30]
    numbers[0]
  `);
  assert.ok(resultValid.success && isNormal(resultValid.outcome));
  assert.ok(runtimeValuesEqual(resultValid.outcome.value, rtSome(rtInt(10n))));

  const resultOOB = run(`
    numbers = [10, 20, 30]
    numbers[99]
  `);
  assert.ok(resultOOB.success && isNormal(resultOOB.outcome));
  assert.ok(runtimeValuesEqual(resultOOB.outcome.value, rtNone));
});

test('Collections: List length property', () => {
  const result = run(`
    numbers = [1, 2, 3, 4, 5]
    numbers.length
  `);
  assert.ok(result.success && isNormal(result.outcome));
  assert.ok(runtimeValuesEqual(result.outcome.value, rtInt(5n)));
});

test('Collections: Tuple literal and positional access', () => {
  const result = run(`
    user = ("Rafli", 23)
    name = user.0
    age = user.1
    name
  `);
  assert.ok(result.success && isNormal(result.outcome));
  assert.ok(runtimeValuesEqual(result.outcome.value, rtString('Rafli')));

  const resultAge = run(`
    user = ("Rafli", 23)
    user.1
  `);
  assert.ok(resultAge.success && isNormal(resultAge.outcome));
  assert.ok(runtimeValuesEqual(resultAge.outcome.value, rtInt(23n)));
});

test('Collections: Map literal and safe key lookup produces Option', () => {
  const resultFound = run(`
    users = {
      "name": "Rafli",
      "city": "Bandung"
    }
    users["name"]
  `);
  assert.ok(resultFound.success && isNormal(resultFound.outcome));
  assert.ok(runtimeValuesEqual(resultFound.outcome.value, rtSome(rtString('Rafli'))));

  const resultMissing = run(`
    users = {
      "name": "Rafli"
    }
    users["missing"]
  `);
  assert.ok(resultMissing.success && isNormal(resultMissing.outcome));
  assert.ok(runtimeValuesEqual(resultMissing.outcome.value, rtNone));
});

test('Collections: Set creation, contains, insert, remove, length', () => {
  const result = run(`
    numbers = set[1, 2, 3]
    hasTwo = numbers.contains(2)
    hasNine = numbers.contains(9)
    lenBefore = numbers.length

    added = numbers.insert(4)
    hasFour = added.contains(4)

    removed = numbers.remove(2)
    stillHasTwo = removed.contains(2)

    hasTwo and not hasNine and lenBefore == 3 and hasFour and not stillHasTwo
  `);
  assert.ok(result.success && isNormal(result.outcome));
  assert.ok(runtimeValuesEqual(result.outcome.value, rtBool(true)));
});

test('Collections: Value equality (==) for collections', () => {
  const resultList = run(`
    [1, 2, 3] == [1, 2, 3]
  `);
  assert.ok(resultList.success && isNormal(resultList.outcome));
  assert.ok(runtimeValuesEqual(resultList.outcome.value, rtBool(true)));

  const resultTuple = run(`
    ("Rafli", 23) == ("Rafli", 23)
  `);
  assert.ok(resultTuple.success && isNormal(resultTuple.outcome));
  assert.ok(runtimeValuesEqual(resultTuple.outcome.value, rtBool(true)));

  const resultSet = run(`
    set[1, 2] == set[2, 1]
  `);
  assert.ok(resultSet.success && isNormal(resultSet.outcome));
  assert.ok(runtimeValuesEqual(resultSet.outcome.value, rtBool(true)));
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. Lambdas, Closures, Higher-Order Functions
// ══════════════════════════════════════════════════════════════════════════════

test('Functions: lambda invocation', () => {
  const result = run(`
    double = x => x * 2
    double(10)
  `);
  assert.ok(result.success && isNormal(result.outcome));
  assert.ok(runtimeValuesEqual(result.outcome.value, rtInt(20n)));
});

test('Functions: multi-parameter lambda', () => {
  const result = run(`
    add = (a, b) => a + b
    add(15, 25)
  `);
  assert.ok(result.success && isNormal(result.outcome));
  assert.ok(runtimeValuesEqual(result.outcome.value, rtInt(40n)));
});

test('Functions: closure captures lexical environment', () => {
  const result = run(`
    multiplier = 3
    multiply = x => x * multiplier
    multiply(10)
  `);
  assert.ok(result.success && isNormal(result.outcome));
  assert.ok(runtimeValuesEqual(result.outcome.value, rtInt(30n)));
});

test('Functions: nested closures and function factory', () => {
  const result = run(`
    fn make_adder(n) => (x => x + n)
    add5 = make_adder(5)
    add5(20)
  `);
  assert.ok(result.success && isNormal(result.outcome));
  assert.ok(runtimeValuesEqual(result.outcome.value, rtInt(25n)));
});

test('Functions: higher-order function receiving function argument', () => {
  const result = run(`
    fn apply(f, value) => f(value)
    apply(x => x * 2, 10)
  `);
  assert.ok(result.success && isNormal(result.outcome));
  assert.ok(runtimeValuesEqual(result.outcome.value, rtInt(20n)));
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. Option & Result Integration
// ══════════════════════════════════════════════════════════════════════════════

test('Option Integration: fallback ?? with safe indexing', () => {
  const result = run(`
    numbers = [100, 200]
    first = numbers[0] ?? 0
    missing = numbers[99] ?? -1
    first + missing
  `);
  assert.ok(result.success && isNormal(result.outcome));
  assert.ok(runtimeValuesEqual(result.outcome.value, rtInt(99n)));
});

test('Option Integration: ? operator unwrap and early exit', () => {
  const resultSuccess = run(`
    fn get_first(list) => {
      item = list[0]?
      item * 2
    }
    get_first([5, 10])
  `);
  assert.ok(resultSuccess.success && isNormal(resultSuccess.outcome));
  assert.ok(runtimeValuesEqual(resultSuccess.outcome.value, rtInt(10n)));

  const resultEmpty = run(`
    fn get_first(list) => {
      item = list[0]?
      item * 2
    }
    get_first([])
  `);
  assert.ok(resultEmpty.success && isNormal(resultEmpty.outcome));
  assert.ok(runtimeValuesEqual(resultEmpty.outcome.value, rtNone));
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. Pipeline Composition
// ══════════════════════════════════════════════════════════════════════════════

test('Pipeline: pipeline with function variable', () => {
  const result = run(`
    double = x => x * 2
    10 |> double
  `);
  assert.ok(result.success && isNormal(result.outcome));
  assert.ok(runtimeValuesEqual(result.outcome.value, rtInt(20n)));
});

test('Pipeline: pipeline with lambda expression', () => {
  const result = run(`
    10 |> (x => x + 5)
  `);
  assert.ok(result.success && isNormal(result.outcome));
  assert.ok(runtimeValuesEqual(result.outcome.value, rtInt(15n)));
});

test('Pipeline: chained pipeline with multiple transformations', () => {
  const result = run(`
    fn inc(x) => x + 1
    fn double(x) => x * 2
    5 |> inc |> double
  `);
  assert.ok(result.success && isNormal(result.outcome));
  assert.ok(runtimeValuesEqual(result.outcome.value, rtInt(12n)));
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. Negative Tests & Structured Diagnostics
// ══════════════════════════════════════════════════════════════════════════════

test('Diagnostics: break outside loop produces E2004', () => {
  const res = check(`
    break
  `);
  assert.strictEqual(res.success, false);
  assert.ok(res.diagnostics.getErrors().some((e) => e.code === 'E2004'));
});

test('Diagnostics: continue outside loop produces E2004', () => {
  const res = check(`
    continue
  `);
  assert.strictEqual(res.success, false);
  assert.ok(res.diagnostics.getErrors().some((e) => e.code === 'E2004'));
});

test('Diagnostics: non-exhaustive match without wildcard produces E5001', () => {
  const res = check(`
    val = 1
    match val {
      0 => "zero"
      1 => "one"
    }
  `);
  assert.strictEqual(res.success, false);
  assert.ok(res.diagnostics.getErrors().some((e) => e.code === 'E5001'));
});

test('Diagnostics: non-exhaustive Option match produces E5001', () => {
  const res = check(`
    val = Some(1)
    match val {
      Some(x) => x
    }
  `);
  assert.strictEqual(res.success, false);
  assert.ok(res.diagnostics.getErrors().some((e) => e.code === 'E5001'));
});

test('Diagnostics: wrong function arity produces E3003', () => {
  const res = check(`
    fn add(a, b) => a + b
    add(1)
  `);
  assert.strictEqual(res.success, false);
  assert.ok(res.diagnostics.getErrors().some((e) => e.code === 'E3003'));
});

test('Diagnostics: incompatible if branch types produces E3001', () => {
  const res = check(`
    if true { 1 } else { "string" }
  `);
  assert.strictEqual(res.success, false);
  assert.ok(res.diagnostics.getErrors().some((e) => e.code === 'E3001'));
});

test('Diagnostics: invalid iteration target produces E3007', () => {
  const res = check(`
    for x in 42 {
      x
    }
  `);
  assert.strictEqual(res.success, false);
  assert.ok(res.diagnostics.getErrors().some((e) => e.code === 'E3007'));
});
