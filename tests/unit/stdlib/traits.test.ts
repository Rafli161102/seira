/**
 * Seira 0.0.9-s — Core Traits Contract Tests
 *
 * Verifies Eq, Ord, Hash, Display, Debug, Clone, Default, Iterator, Reader, Writer,
 * trait constraints in type checking, and structural equality invariants.
 */

import assert from 'node:assert';
import test from 'node:test';
import { Lexer } from '../../../compiler/lexer/lexer.ts';
import { Parser } from '../../../compiler/parser/parser.ts';
import { Resolver } from '../../../compiler/resolver/index.ts';
import { TypeChecker } from '../../../compiler/typecheck/index.ts';
import { ExecutionEngine } from '../../../runtime/execution/engine.ts';

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

function run(source: string) {
  return engine.executeSource(source, '<test-traits>', { enableOutput: false });
}

test('Traits: built-in Eq constraint satisfaction and value equality', () => {
  const source = `
fn check_eq<T: Eq>(a: T, b: T) -> Bool {
  a == b
}

fn main() {
  r1 = check_eq(10, 10);
  r2 = check_eq("abc", "abc");
  r3 = check_eq([1, 2, 3], [1, 2, 3]);
}
`;
  const { tcResult, diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false, diagnostics.format());
  assert.strictEqual(tcResult.success, true);
});

test('Traits: structural equality does NOT use JavaScript object identity', () => {
  const r1 = run(`[1, 2, 3] == [1, 2, 3]`);
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.displayValue, 'true');

  const r2 = run(`(1, "x") == (1, "x")`);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.displayValue, 'true');

  const r3 = run(`[1, 2] == [1, 3]`);
  assert.strictEqual(r3.success, true);
  assert.strictEqual(r3.displayValue, 'false');

  const r4 = run(`Some(42) == Some(42)`);
  assert.strictEqual(r4.success, true);
  assert.strictEqual(r4.displayValue, 'true');

  const r5 = run(`Some(42) == None`);
  assert.strictEqual(r5.success, true);
  assert.strictEqual(r5.displayValue, 'false');
});

test('Traits: built-in Ord constraint satisfaction', () => {
  const source = `
fn compare<T: Ord>(a: T, b: T) -> Bool {
  a < b
}

fn main() {
  r1 = compare(1, 2);
  r2 = compare("apple", "banana");
}
`;
  const { tcResult, diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false, diagnostics.format());
  assert.strictEqual(tcResult.success, true);
});

test('Traits: built-in Hash constraint satisfaction', () => {
  const source = `
fn key_exists<K: Hash>(key: K) -> K {
  key
}

fn main() {
  k1 = key_exists(42);
  k2 = key_exists("user_id");
}
`;
  const { tcResult, diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false, diagnostics.format());
  assert.strictEqual(tcResult.success, true);
});

test('Traits: built-in Display and Debug constraints', () => {
  const source = `
fn format_display<T: Display>(val: T) -> T {
  val
}

fn format_debug<T: Debug>(val: T) -> T {
  val
}

fn main() {
  d1 = format_display("hello");
  d2 = format_display(123);
  b1 = format_debug([1, 2, 3]);
}
`;
  const { tcResult, diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false, diagnostics.format());
  assert.strictEqual(tcResult.success, true);
});

test('Traits: built-in Clone and Default constraints', () => {
  const source = `
fn duplicate<T: Clone>(item: T) -> T {
  item
}

fn make_default<T: Default>(item: T) -> T {
  item
}

fn main() {
  c1 = duplicate(42);
  c2 = duplicate("string");
  c3 = duplicate([1, 2]);
  d1 = make_default(0);
  d2 = make_default("");
}
`;
  const { tcResult, diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false, diagnostics.format());
  assert.strictEqual(tcResult.success, true);
});

test('Traits: built-in Iterator constraint', () => {
  const source = `
fn consume<I: Iterator>(iter: I) -> I {
  iter
}

fn main() {
  list = [1, 2, 3];
  it = list.iter();
  res = consume(it);
}
`;
  const { tcResult, diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false, diagnostics.format());
  assert.strictEqual(tcResult.success, true);
});

test('Traits: built-in Reader and Writer constraints', () => {
  const source = `
fn read_data<R: Reader>(reader: R) -> R {
  reader
}

fn write_data<W: Writer>(writer: W) -> W {
  writer
}

fn main() {
  r = MemoryReader("test");
  w = MemoryWriter();
  s = MemoryStream();
  read_data(r);
  write_data(w);
  read_data(s);
  write_data(s);
}
`;
  const { tcResult, diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false, diagnostics.format());
  assert.strictEqual(tcResult.success, true);
});

test('Traits: custom type implementing a trait', () => {
  const source = `
struct Point {
  x: Int,
  y: Int
}

trait Measurable {
  fn measure() -> Int
}

impl Point: Measurable {
  fn measure() -> Int {
    0
  }
}

fn get_measurement<T: Measurable>(item: T) -> Int {
  0
}

fn main() {
  p: Point = Point;
  m = get_measurement(p);
}
`;
  const { tcResult, diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false, diagnostics.format());
  assert.strictEqual(tcResult.success, true);
});
