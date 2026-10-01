/**
 * Seira 0.0.7-s — Type & Generic Foundation Test Suite
 *
 * Validates:
 *   1. Generic Type Declarations (type Box<T>, duplicate params E4001, scope)
 *   2. Generic Functions (identity<T>, inference, explicit type args, E4001 arity)
 *   3. Generic Inference (first<T>(List<T>) -> Option<T>, failure E4002)
 *   4. Type Aliases (UserId = Int, identity preservation, compatibility)
 *   5. Union Types (ID = Int | String, assignments, operations safety E3002, match)
 *   6. Function Types ((Int) -> Int, compatibility, lambda contextual typing)
 *   7. Option<T> and Result<T, E> Generic Semantics (None contextual typing, Ok/Err validation)
 *   8. Trait Foundation (declaration, impl, coherence E4005, method checking E4004/E4006)
 *   9. Trait Constraints (<T: Trait>, satisfaction checking, call-site failure E4003)
 *  10. Higher-Order Generic Functions & Lambda Typing (apply<T, R>(f, x))
 *  11. Pipeline Generic Typing (val |> identity)
 *  12. Negative Tests (all structured diagnostics)
 */

import assert from 'node:assert';
import test from 'node:test';
import type { BindingStmt, FunctionDecl } from '../../../compiler/ast/ast.ts';
import { Lexer } from '../../../compiler/lexer/lexer.ts';
import { Parser } from '../../../compiler/parser/parser.ts';
import { Resolver } from '../../../compiler/resolver/index.ts';
import {
  formatType,
  TypeChecker,
} from '../../../compiler/typecheck/index.ts';
import { ExecutionEngine } from '../../../runtime/execution/engine.ts';
import { isNormal } from '../../../runtime/execution/outcomes.ts';
import {
  rtInt,
  rtString,
  rtSome,
  runtimeValuesEqual,
} from '../../../runtime/execution/values.ts';

function typecheckSource(src: string) {
  const tokens = new Lexer(src).tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  const resolver = new Resolver();
  const resResult = resolver.resolve(ast, 'test.sr');
  const typechecker = new TypeChecker(resResult.diagnostics);
  const tcResult = typechecker.check(ast, resResult, 'test.sr');
  return { ast, tcResult, diagnostics: tcResult.diagnostics };
}

const engine = new ExecutionEngine();

function runSource(src: string) {
  return engine.executeSource(src, 'test.sr');
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. Generic Type Declarations
// ══════════════════════════════════════════════════════════════════════════════

test('Generics: generic struct/type declaration parses and typechecks', () => {
  const source = `
    type Box<T> {
      value: T
    }
  `;
  const { tcResult, diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false);
  assert.strictEqual(tcResult.success, true);
});

test('Generics: duplicate generic parameter rejected with E4001', () => {
  const source = `
    type Box<T, T> {
      value: T
    }
  `;
  const { diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), true);
  assert.ok(diagnostics.getErrors().some((e) => e.code === 'E4001'));
});

test('Generics: generic parameter cannot be used as runtime value (E2001)', () => {
  const source = `
    fn test<T>() {
      x = T;
    }
  `;
  const { diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), true);
  assert.ok(diagnostics.getErrors().some((e) => e.code === 'E2001'));
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. Generic Functions & Inference
// ══════════════════════════════════════════════════════════════════════════════

test('Generics: generic identity function infers Int and String', () => {
  const source = `
    fn identity<T>(value: T) -> T {
      value
    }

    fn main() {
      a = identity(10);
      b = identity("Hello");
    }
  `;
  const { ast, tcResult, diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false);
  assert.strictEqual(tcResult.success, true);

  const mainFn = ast.items[1] as FunctionDecl;
  const stmts = mainFn.body.statements as BindingStmt[];
  assert.strictEqual(formatType(tcResult.nodeTypes.get(stmts[0])!), 'Int');
  assert.strictEqual(formatType(tcResult.nodeTypes.get(stmts[1])!), 'String');
});

test('Generics: explicit generic function invocation identity<Int>(10)', () => {
  const source = `
    fn identity<T>(value: T) -> T {
      value
    }

    fn main() {
      a = identity<Int>(10);
      b = identity<String>("Hello");
    }
  `;
  const { ast, tcResult, diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false);
  assert.strictEqual(tcResult.success, true);

  const mainFn = ast.items[1] as FunctionDecl;
  const stmts = mainFn.body.statements as BindingStmt[];
  assert.strictEqual(formatType(tcResult.nodeTypes.get(stmts[0])!), 'Int');
  assert.strictEqual(formatType(tcResult.nodeTypes.get(stmts[1])!), 'String');
});

test('Generics: explicit generic argument count mismatch emits E4001', () => {
  const source = `
    fn identity<T>(value: T) -> T {
      value
    }

    fn main() {
      x = identity<Int, String>(10);
    }
  `;
  const { diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), true);
  assert.ok(diagnostics.getErrors().some((e) => e.code === 'E4001'));
});

test('Generics: generic argument inference from List<T>', () => {
  const source = `
    fn first<T>(items: List<T>) -> Option<T> {
      None
    }

    fn main() {
      numbers: List<Int> = [1, 2, 3];
      value = first(numbers);
    }
  `;
  const { ast, tcResult, diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false);
  assert.strictEqual(tcResult.success, true);

  const mainFn = ast.items[1] as FunctionDecl;
  const stmts = mainFn.body.statements as BindingStmt[];
  assert.strictEqual(formatType(tcResult.nodeTypes.get(stmts[1])!), 'Option<Int>');
});

test('Generics: generic inference failure emits E4002', () => {
  const source = `
    fn make<T>() -> T {
      10
    }

    fn main() {
      x = make();
    }
  `;
  const { diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), true);
  assert.ok(diagnostics.getErrors().some((e) => e.code === 'E4002'));
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. Type Aliases
// ══════════════════════════════════════════════════════════════════════════════

test('Type Aliases: type UserId = Int is transparently compatible with Int', () => {
  const source = `
    type UserId = Int

    fn get_id(id: UserId) -> Int {
      id
    }

    fn make_id(n: Int) -> UserId {
      n
    }

    fn main() {
      uid: UserId = 42;
      x: Int = uid;
      y = get_id(100);
      z = make_id(200);
    }
  `;
  const { tcResult, diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false);
  assert.strictEqual(tcResult.success, true);
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. Union Types
// ══════════════════════════════════════════════════════════════════════════════

test('Union Types: type ID = Int | String supports both alternatives', () => {
  const source = `
    type ID = Int | String

    fn print_id(id: ID) -> ID {
      id
    }

    fn main() {
      a: ID = 10;
      b: ID = "abc";
      c = print_id(20);
      d = print_id("xyz");
    }
  `;
  const { tcResult, diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false);
  assert.strictEqual(tcResult.success, true);
});

test('Union Types: invalid operation on union emits E3002', () => {
  const source = `
    type ID = Int | String

    fn process(id: ID) {
      x = id - 1;
    }
  `;
  const { diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), true);
  assert.ok(diagnostics.getErrors().some((e) => e.code === 'E3002'));
});

test('Union Types: match on union type evaluates statically', () => {
  const source = `
    type ID = Int | String

    fn describe(id: ID) -> String {
      match id {
        10 => "ten",
        "abc" => "string abc",
        _ => "other",
      }
    }
  `;
  const { tcResult, diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false);
  assert.strictEqual(tcResult.success, true);
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. Function Types & Higher-Order Functions
// ══════════════════════════════════════════════════════════════════════════════

test('Function Types: function type parameters and return checking', () => {
  const source = `
    fn apply(f: (Int) -> Int, value: Int) -> Int {
      f(value)
    }

    fn double(n: Int) -> Int {
      n * 2
    }

    fn main() {
      x = apply(double, 10);
      y = apply(x => x * 3, 10);
    }
  `;
  const { ast, tcResult, diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false);
  assert.strictEqual(tcResult.success, true);

  const mainFn = ast.items[2] as FunctionDecl;
  const stmts = mainFn.body.statements as BindingStmt[];
  assert.strictEqual(formatType(tcResult.nodeTypes.get(stmts[0])!), 'Int');
  assert.strictEqual(formatType(tcResult.nodeTypes.get(stmts[1])!), 'Int');
});

test('Function Types: incompatible function parameter emits E3003', () => {
  const source = `
    fn apply(f: (Int) -> Int, value: Int) -> Int {
      f(value)
    }

    fn bad_fn(s: String) -> Int {
      42
    }

    fn main() {
      x = apply(bad_fn, 10);
    }
  `;
  const { diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), true);
  assert.ok(diagnostics.getErrors().some((e) => e.code === 'E3003'));
});

test('Function Types: higher-order generic function apply<T, R>', () => {
  const source = `
    fn apply<T, R>(f: (T) -> R, value: T) -> R {
      f(value)
    }

    fn main() {
      result = apply(x => x * 2, 10);
    }
  `;
  const { ast, tcResult, diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false);
  assert.strictEqual(tcResult.success, true);

  const mainFn = ast.items[1] as FunctionDecl;
  const stmts = mainFn.body.statements as BindingStmt[];
  assert.strictEqual(formatType(tcResult.nodeTypes.get(stmts[0])!), 'Int');
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. Option<T> & Result<T, E> Generics
// ══════════════════════════════════════════════════════════════════════════════

test('Option / Result: contextual None and Result parameter checking', () => {
  const source = `
    fn get_opt() -> Option<Int> {
      None
    }

    fn get_res() -> Result<Int, String> {
      Ok(42)
    }

    fn get_err() -> Result<Int, String> {
      Err("failed")
    }

    fn main() {
      opt: Option<Int> = None;
      r1 = get_res();
      r2 = get_err();
    }
  `;
  const { tcResult, diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false);
  assert.strictEqual(tcResult.success, true);
});

test('Option / Result: invalid error type in Result emits E3001', () => {
  const source = `
    fn fail() -> Result<Int, String> {
      Err(42)
    }
  `;
  const { diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), true);
  assert.ok(diagnostics.getErrors().some((e) => e.code === 'E3004' || e.code === 'E3001'));
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. Trait Foundation & Constraints
// ══════════════════════════════════════════════════════════════════════════════

test('Traits: valid trait declaration and implementation', () => {
  const source = `
    struct User {
      id: Int
    }

    trait Printable {
      fn print()
    }

    impl User: Printable {
      fn print() {
      }
    }
  `;
  const { tcResult, diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false);
  assert.strictEqual(tcResult.success, true);
});

test('Traits: missing method in impl emits E4004', () => {
  const source = `
    struct User {
      id: Int
    }

    trait Printable {
      fn print()
    }

    impl User: Printable {
    }
  `;
  const { diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), true);
  assert.ok(diagnostics.getErrors().some((e) => e.code === 'E4004'));
});

test('Traits: method signature mismatch in impl emits E4006', () => {
  const source = `
    struct User {
      id: Int
    }

    trait Printable {
      fn print()
    }

    impl User: Printable {
      fn print(value: Int) {
      }
    }
  `;
  const { diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), true);
  assert.ok(diagnostics.getErrors().some((e) => e.code === 'E4006'));
});

test('Traits: duplicate trait implementation emits E4005', () => {
  const source = `
    struct User {
      id: Int
    }

    trait Printable {
      fn print()
    }

    impl User: Printable {
      fn print() {}
    }

    impl User: Printable {
      fn print() {}
    }
  `;
  const { diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), true);
  assert.ok(diagnostics.getErrors().some((e) => e.code === 'E4005'));
});

test('Traits: unknown trait in impl emits E4004', () => {
  const source = `
    struct User {
      id: Int
    }

    impl User: UnknownTrait {
      fn test() {}
    }
  `;
  const { diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), true);
  assert.ok(diagnostics.getErrors().some((e) => e.code === 'E4004'));
});

test('Traits: valid trait constraint satisfaction', () => {
  const source = `
    struct User {
      id: Int
    }

    trait Printable {
      fn print()
    }

    impl User: Printable {
      fn print() {}
    }

    fn show<T: Printable>(item: T) -> T {
      item
    }

    fn main() {
      u: User = User;
      result = show(u);
    }
  `;
  const { tcResult, diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false);
  assert.strictEqual(tcResult.success, true);
});

test('Traits: trait constraint failure at call site emits E4003', () => {
  const source = `
    struct NotPrintable {
      id: Int
    }

    trait Printable {
      fn print()
    }

    fn show<T: Printable>(item: T) -> T {
      item
    }

    fn main() {
      item: NotPrintable = NotPrintable;
      result = show(item);
    }
  `;
  const { diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), true);
  assert.ok(diagnostics.getErrors().some((e) => e.code === 'E4003'));
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. Pipeline Generic Typing
// ══════════════════════════════════════════════════════════════════════════════

test('Pipeline: generic function in pipeline infers input type', () => {
  const source = `
    fn identity<T>(value: T) -> T {
      value
    }

    fn main() {
      x = 42 |> identity;
      s = "hello" |> identity;
    }
  `;
  const { ast, tcResult, diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false);
  assert.strictEqual(tcResult.success, true);

  const mainFn = ast.items[1] as FunctionDecl;
  const stmts = mainFn.body.statements as BindingStmt[];
  assert.strictEqual(formatType(tcResult.nodeTypes.get(stmts[0])!), 'Int');
  assert.strictEqual(formatType(tcResult.nodeTypes.get(stmts[1])!), 'String');
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. Runtime Execution of Generics and Trait Code
// ══════════════════════════════════════════════════════════════════════════════

test('Execution: generic identity function executes cleanly', () => {
  const source = `
    fn identity<T>(value: T) -> T {
      value
    }
    identity(42)
  `;
  const result = runSource(source);
  assert.ok(result.success && isNormal(result.outcome));
  assert.ok(runtimeValuesEqual(result.outcome.value, rtInt(42n)));
});

test('Execution: explicit generic argument identity<Int>(99) executes cleanly', () => {
  const source = `
    fn identity<T>(value: T) -> T {
      value
    }
    identity<Int>(99)
  `;
  const result = runSource(source);
  assert.ok(result.success && isNormal(result.outcome));
  assert.ok(runtimeValuesEqual(result.outcome.value, rtInt(99n)));
});

test('Execution: higher-order generic apply function executes cleanly', () => {
  const source = `
    fn apply<T, R>(f: (T) -> R, value: T) -> R {
      f(value)
    }
    apply(x => x * 3, 10)
  `;
  const result = runSource(source);
  assert.ok(result.success && isNormal(result.outcome));
  assert.ok(runtimeValuesEqual(result.outcome.value, rtInt(30n)));
});

test('Execution: generic function in pipeline executes cleanly', () => {
  const source = `
    fn wrap<T>(value: T) -> Option<T> {
      Some(value)
    }
    50 |> wrap
  `;
  const result = runSource(source);
  assert.ok(result.success && isNormal(result.outcome));
  assert.ok(runtimeValuesEqual(result.outcome.value, rtSome(rtInt(50n))));
});

// ══════════════════════════════════════════════════════════════════════════════
// 10. Additional Edge Cases & Regression Safeguards
// ══════════════════════════════════════════════════════════════════════════════

test('Generics: nested generic type instantiation', () => {
  const source = `
    type Box<T> {
      value: T
    }

    fn unwrap_nested<T>(b: Box<Box<T>>) -> T {
      b.value.value
    }
  `;
  const { tcResult, diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false);
  assert.strictEqual(tcResult.success, true);
});

test('Generics: function returning Result with generic types', () => {
  const source = `
    fn parse_or_default<T>(val: Option<T>, default_val: T) -> Result<T, String> {
      match val {
        Some(x) => Ok(x),
        None => Ok(default_val),
      }
    }

    fn main() {
      opt: Option<Int> = Some(10);
      res = parse_or_default(opt, 0);
    }
  `;
  const { ast, tcResult, diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false);
  assert.strictEqual(tcResult.success, true);

  const mainFn = ast.items[1] as FunctionDecl;
  const stmts = mainFn.body.statements as BindingStmt[];
  assert.strictEqual(formatType(tcResult.nodeTypes.get(stmts[1])!), 'Result<Int, String>');
});

test('Traits: multiple traits and multiple types with deterministic resolution', () => {
  const source = `
    struct Cat {
      name: String
    }

    struct Dog {
      name: String
    }

    trait Speak {
      fn speak() -> String
    }

    trait Describe {
      fn describe() -> String
    }

    impl Cat: Speak {
      fn speak() -> String {
        "meow"
      }
    }

    impl Dog: Speak {
      fn speak() -> String {
        "woof"
      }
    }

    impl Cat: Describe {
      fn describe() -> String {
        "cat"
      }
    }

    fn make_speak<T: Speak>(animal: T) {
    }

    fn main() {
      c: Cat = Cat;
      d: Dog = Dog;
      make_speak(c);
      make_speak(d);
    }
  `;
  const { tcResult, diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false);
  assert.strictEqual(tcResult.success, true);
});

test('Function Types: wrong parameter count emits E3003', () => {
  const source = `
    fn execute(f: (Int, Int) -> Int) {
    }

    fn unary(x: Int) -> Int {
      x
    }

    fn main() {
      execute(unary);
    }
  `;
  const { diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), true);
  assert.ok(diagnostics.getErrors().some((e) => e.code === 'E3003'));
});

test('Function Types: wrong return type emits E3003', () => {
  const source = `
    fn execute(f: (Int) -> Int) {
    }

    fn str_return(x: Int) -> String {
      "hello"
    }

    fn main() {
      execute(str_return);
    }
  `;
  const { diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), true);
  assert.ok(diagnostics.getErrors().some((e) => e.code === 'E3003'));
});

test('Diagnostics: E4002 error message provides clear context', () => {
  const source = `
    fn uninferrable<T>() -> T {
      10
    }
    fn main() {
      x = uninferrable();
    }
  `;
  const { diagnostics } = typecheckSource(source);
  const error = diagnostics.getErrors().find((e) => e.code === 'E4002');
  assert.ok(error !== undefined);
  assert.ok(error.message.includes("Cannot infer generic parameter 'T' for function 'uninferrable'"));
});

test('Diagnostics: E4003 error message provides clear constraint context', () => {
  const source = `
    trait Printable {
      fn print()
    }
    struct User {}
    fn print_val<T: Printable>(x: T) {}
    fn main() {
      u: User = User;
      print_val(u);
    }
  `;
  const { diagnostics } = typecheckSource(source);
  const error = diagnostics.getErrors().find((e) => e.code === 'E4003');
  assert.ok(error !== undefined);
  assert.ok(error.message.includes("does not satisfy trait constraint 'Printable'"));
});

