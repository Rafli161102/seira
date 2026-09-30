import assert from 'node:assert';
import test from 'node:test';
import type { BindingStmt, FunctionDecl } from '../../../compiler/ast/ast.ts';
import { Lexer } from '../../../compiler/lexer/lexer.ts';
import { Parser } from '../../../compiler/parser/parser.ts';
import { Resolver } from '../../../compiler/resolver/index.ts';
import {
  BOOL_TYPE,
  CHAR_TYPE,
  FLOAT_TYPE,
  formatType,
  INT_TYPE,
  STRING_TYPE,
  TypeChecker,
  UINT_TYPE,
} from '../../../compiler/typecheck/index.ts';

function typecheckSource(src: string) {
  const tokens = new Lexer(src).tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  const resolver = new Resolver();
  const resResult = resolver.resolve(ast, 'test.sra');
  const typechecker = new TypeChecker(resResult.diagnostics);
  const tcResult = typechecker.check(ast, resResult, 'test.sra');
  return { ast, tcResult, diagnostics: tcResult.diagnostics };
}

test('Typecheck: static type inference for primitive literals', () => {
  const source = `
    fn main() {
      i = 42;
      u = 42u;
      f = 3.14;
      b = true;
      c = 'z';
      s = "Seira";
    }
  `;
  const { ast, tcResult, diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false);
  assert.strictEqual(tcResult.success, true);

  const fn = ast.items[0] as FunctionDecl;
  const stmts = fn.body.statements as BindingStmt[];

  assert.strictEqual(formatType(tcResult.nodeTypes.get(stmts[0])!), 'Int');
  assert.strictEqual(formatType(tcResult.nodeTypes.get(stmts[1])!), 'UInt');
  assert.strictEqual(formatType(tcResult.nodeTypes.get(stmts[2])!), 'Float');
  assert.strictEqual(formatType(tcResult.nodeTypes.get(stmts[3])!), 'Bool');
  assert.strictEqual(formatType(tcResult.nodeTypes.get(stmts[4])!), 'Char');
  assert.strictEqual(formatType(tcResult.nodeTypes.get(stmts[5])!), 'String');
});

test('Typecheck: explicit type annotations compatibility', () => {
  const source = `
    fn main() {
      age: Int = 23;
      name: String = "Seira";
      active: Bool = true;
      ratio: Float = 0.75;
    }
  `;
  const { tcResult, diagnostics } = typecheckSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false);
  assert.strictEqual(tcResult.success, true);
});

test('Typecheck: rejects type mismatch on initialization (E3001)', () => {
  const source = `
    fn main() {
      age: Int = "hello";
    }
  `;
  const { tcResult, diagnostics } = typecheckSource(source);
  assert.strictEqual(tcResult.success, false);
  assert.strictEqual(diagnostics.hasErrors(), true);
  const errors = diagnostics.getErrors();
  assert.ok(errors.some((e) => e.code === 'E3001'));
});

test('Typecheck: strict Boolean requirement for if conditions - zero truthy/falsy coercion (E3005)', () => {
  // Valid Bool condition
  const validSource = `
    fn main() {
      if true {
        x = 10;
      }
    }
  `;
  const res1 = typecheckSource(validSource);
  assert.strictEqual(res1.tcResult.success, true);
  assert.strictEqual(res1.diagnostics.hasErrors(), false);

  // Invalid: Integer condition (no truthiness)
  const invalidInt = `
    fn main() {
      if 1 {
        x = 10;
      }
    }
  `;
  const res2 = typecheckSource(invalidInt);
  assert.strictEqual(res2.tcResult.success, false);
  assert.ok(res2.diagnostics.getErrors().some((e) => e.code === 'E3005'));

  // Invalid: String condition (no truthiness)
  const invalidStr = `
    fn main() {
      if "hello" {
        x = 10;
      }
    }
  `;
  const res3 = typecheckSource(invalidStr);
  assert.strictEqual(res3.tcResult.success, false);
  assert.ok(res3.diagnostics.getErrors().some((e) => e.code === 'E3005'));
});

test('Typecheck: logical operators (and, or, not) require Bool (E3002)', () => {
  // Valid Boolean operations
  const validSource = `
    fn main() {
      a = true and false;
      b = true or false;
      c = not true;
    }
  `;
  const res1 = typecheckSource(validSource);
  assert.strictEqual(res1.tcResult.success, true);
  assert.strictEqual(res1.diagnostics.hasErrors(), false);

  // Invalid: not with integer
  const invalidNot = `
    fn main() {
      x = not 10;
    }
  `;
  const res2 = typecheckSource(invalidNot);
  assert.strictEqual(res2.tcResult.success, false);
  assert.ok(res2.diagnostics.getErrors().some((e) => e.code === 'E3002'));

  // Invalid: and with integer
  const invalidAnd = `
    fn main() {
      x = 1 and true;
    }
  `;
  const res3 = typecheckSource(invalidAnd);
  assert.strictEqual(res3.tcResult.success, false);
  assert.ok(res3.diagnostics.getErrors().some((e) => e.code === 'E3002'));
});

test('Typecheck: arithmetic operators and no implicit type coercion (E3002)', () => {
  // Valid arithmetic
  const validSource = `
    fn main() {
      add = 10 + 20;
      sub = 20 - 5;
      mul = 4 * 5;
      div = 20 / 4;
      concat = "hello " + "world";
    }
  `;
  const res1 = typecheckSource(validSource);
  assert.strictEqual(res1.tcResult.success, true);
  assert.strictEqual(res1.diagnostics.hasErrors(), false);

  // Invalid: Int + String (no implicit coercion)
  const invalidCoercion1 = `
    fn main() {
      x = 10 + "hello";
    }
  `;
  const res2 = typecheckSource(invalidCoercion1);
  assert.strictEqual(res2.tcResult.success, false);
  assert.ok(res2.diagnostics.getErrors().some((e) => e.code === 'E3002'));

  // Invalid: Int + Float (no mixed-type coercion without explicit cast)
  const invalidCoercion2 = `
    fn main() {
      x = 10 + 3.14;
    }
  `;
  const res3 = typecheckSource(invalidCoercion2);
  assert.strictEqual(res3.tcResult.success, false);
  assert.ok(res3.diagnostics.getErrors().some((e) => e.code === 'E3002'));
});

test('Typecheck: comparison and equality typing', () => {
  const source = `
    fn main() {
      lt = 10 < 20;
      gt = 20 > 10;
      eq = 10 == 10;
      neq = "a" != "b";
    }
  `;
  const res = typecheckSource(source);
  assert.strictEqual(res.tcResult.success, true);
  assert.strictEqual(res.diagnostics.hasErrors(), false);
});

test('Typecheck: function call validation - argument count and types (E3003)', () => {
  // Valid call
  const validCall = `
    fn add(a: Int, b: Int) -> Int {
      a + b
    }
    fn main() {
      result = add(10, 20);
    }
  `;
  const res1 = typecheckSource(validCall);
  assert.strictEqual(res1.tcResult.success, true);
  assert.strictEqual(res1.diagnostics.hasErrors(), false);

  // Wrong argument count
  const wrongCount = `
    fn add(a: Int, b: Int) -> Int {
      a + b
    }
    fn main() {
      result = add(10);
    }
  `;
  const res2 = typecheckSource(wrongCount);
  assert.strictEqual(res2.tcResult.success, false);
  assert.ok(res2.diagnostics.getErrors().some((e) => e.code === 'E3003'));

  // Wrong argument type
  const wrongType = `
    fn add(a: Int, b: Int) -> Int {
      a + b
    }
    fn main() {
      result = add(10, "wrong");
    }
  `;
  const res3 = typecheckSource(wrongType);
  assert.strictEqual(res3.tcResult.success, false);
  assert.ok(res3.diagnostics.getErrors().some((e) => e.code === 'E3003'));
});

test('Typecheck: function return type validation (E3004)', () => {
  // Valid return
  const validReturn = `
    fn add(a: Int, b: Int) -> Int {
      a + b
    }
  `;
  const res1 = typecheckSource(validReturn);
  assert.strictEqual(res1.tcResult.success, true);
  assert.strictEqual(res1.diagnostics.hasErrors(), false);

  // Invalid return in expression block
  const invalidReturnBlock = `
    fn add(a: Int, b: Int) -> Int {
      "wrong"
    }
  `;
  const res2 = typecheckSource(invalidReturnBlock);
  assert.strictEqual(res2.tcResult.success, false);
  assert.ok(res2.diagnostics.getErrors().some((e) => e.code === 'E3004'));

  // Invalid explicit return statement
  const invalidExplicitReturn = `
    fn add(a: Int, b: Int) -> Int {
      return "wrong";
    }
  `;
  const res3 = typecheckSource(invalidExplicitReturn);
  assert.strictEqual(res3.tcResult.success, false);
  assert.ok(res3.diagnostics.getErrors().some((e) => e.code === 'E3004'));
});

test('Typecheck: mutability and assignment type preservation (E3001)', () => {
  // Valid reassignment with same type
  const validAssign = `
    fn main() {
      mut count = 0;
      count = 1;
    }
  `;
  const res1 = typecheckSource(validAssign);
  assert.strictEqual(res1.tcResult.success, true);
  assert.strictEqual(res1.diagnostics.hasErrors(), false);

  // Invalid reassignment with incompatible type
  const invalidAssignType = `
    fn main() {
      mut count = 0;
      count = "hello";
    }
  `;
  const res2 = typecheckSource(invalidAssignType);
  assert.strictEqual(res2.tcResult.success, false);
  assert.ok(res2.diagnostics.getErrors().some((e) => e.code === 'E3001'));
});

test('Typecheck: Option and Result foundation semantics', () => {
  const source = `
    fn main() {
      some_val = Some(42);
      none_val = None;
      ok_val = Ok(100);
      err_val = Err("network failure");
      fallback = some_val ?? 0;
      prop = some_val?;
    }
  `;
  const res = typecheckSource(source);
  assert.strictEqual(res.tcResult.success, true);
  assert.strictEqual(res.diagnostics.hasErrors(), false);

  // Incompatible fallback type (E3002)
  const invalidFallback = `
    fn main() {
      opt = Some(42);
      val = opt ?? "string default";
    }
  `;
  const res2 = typecheckSource(invalidFallback);
  assert.strictEqual(res2.tcResult.success, false);
  assert.ok(res2.diagnostics.getErrors().some((e) => e.code === 'E3002'));

  // Operator ? on non-Option/Result (E3002)
  const invalidProp = `
    fn main() {
      x = 10?;
    }
  `;
  const res3 = typecheckSource(invalidProp);
  assert.strictEqual(res3.tcResult.success, false);
  assert.ok(res3.diagnostics.getErrors().some((e) => e.code === 'E3002'));
});

test('Typecheck: pipeline expression validation (|>)', () => {
  // Valid pipeline
  const validPipe = `
    fn double(x: Int) -> Int {
      x * 2
    }
    fn add(x: Int, y: Int) -> Int {
      x + y
    }
    fn main() {
      a = 5 |> double;
      b = 5 |> add(10);
    }
  `;
  const res1 = typecheckSource(validPipe);
  assert.strictEqual(res1.tcResult.success, true);
  assert.strictEqual(res1.diagnostics.hasErrors(), false);

  // Pipeline type mismatch (E3003)
  const invalidPipeType = `
    fn greet(name: String) -> String {
      name
    }
    fn main() {
      bad = 10 |> greet;
    }
  `;
  const res2 = typecheckSource(invalidPipeType);
  assert.strictEqual(res2.tcResult.success, false);
  assert.ok(res2.diagnostics.getErrors().some((e) => e.code === 'E3003'));
});
