import assert from 'node:assert';
import test from 'node:test';
import type { BindingStmt, CallExpr, ExprStmt, FunctionDecl, Identifier } from '../../../compiler/ast/ast.ts';
import { Lexer } from '../../../compiler/lexer/lexer.ts';
import { Parser } from '../../../compiler/parser/parser.ts';
import { Resolver } from '../../../compiler/resolver/index.ts';

function resolveSource(src: string) {
  const tokens = new Lexer(src).tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  const resolver = new Resolver();
  const res = resolver.resolve(ast, 'test.sr');
  return { ast, res, diagnostics: res.diagnostics };
}

test('Resolver: simple binding resolution and identifier reference', () => {
  const source = `
    fn main() {
      x = 10;
      y = x;
    }
  `;
  const { res, ast, diagnostics } = resolveSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false);
  assert.strictEqual(res.success, true);

  const fn = ast.items[0] as FunctionDecl;
  const stmt1 = fn.body.statements[0] as BindingStmt;
  const stmt2 = fn.body.statements[1] as BindingStmt;
  const refX = stmt2.initializer as Identifier;

  const symX = res.declaredSymbols.get(stmt1);
  assert.ok(symX, 'stmt1 should declare symbol x');
  assert.strictEqual(symX.name, 'x');

  const resolved = res.resolvedSymbols.get(refX);
  assert.strictEqual(resolved, symX, 'Identifier x in y = x must resolve to declared x');
});

test('Resolver: nested scopes and name visibility across enclosing scopes', () => {
  const source = `
    fn main() {
      outer = 42;
      if true {
        inner = outer;
      }
    }
  `;
  const { res, diagnostics } = resolveSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false);
  assert.strictEqual(res.success, true);
});

test('Resolver: function scope and parameter symbol resolution', () => {
  const source = `
    fn add(a: Int, b: Int) -> Int {
      a + b
    }
  `;
  const { res, ast, diagnostics } = resolveSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false);
  assert.strictEqual(res.success, true);

  const fn = ast.items[0] as FunctionDecl;
  const paramA = fn.params[0];
  const paramB = fn.params[1];

  const symA = res.declaredSymbols.get(paramA);
  const symB = res.declaredSymbols.get(paramB);
  assert.ok(symA, 'Param a must be registered');
  assert.ok(symB, 'Param b must be registered');
  assert.strictEqual(symA.name, 'a');
  assert.strictEqual(symB.name, 'b');
});

test('Resolver: lexical shadowing distinguishes inner from outer declaration', () => {
  const source = `
    fn main() {
      x = 10;
      if true {
        x = 20;
        y = x;
      }
      z = x;
    }
  `;
  const { res, ast, diagnostics } = resolveSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false);
  assert.strictEqual(res.success, true);

  const fn = ast.items[0] as FunctionDecl;
  const outerXStmt = fn.body.statements[0] as BindingStmt;
  const outerSym = res.declaredSymbols.get(outerXStmt);
  assert.ok(outerSym, 'Outer x must be declared');

  const ifStmt = (fn.body.statements[1] as ExprStmt).expression as any;
  const innerXStmt = ifStmt.thenBranch.statements[0] as BindingStmt;
  const innerSym = res.declaredSymbols.get(innerXStmt);
  assert.ok(innerSym, 'Inner x must be declared in block scope');

  assert.notStrictEqual(outerSym, innerSym, 'Inner x must be distinct from outer x');

  const innerYStmt = ifStmt.thenBranch.statements[1] as BindingStmt;
  const innerRefX = innerYStmt.initializer as Identifier;
  assert.strictEqual(
    res.resolvedSymbols.get(innerRefX),
    innerSym,
    'inner y = x must resolve to inner x'
  );

  const outerZStmt = fn.body.statements[2] as BindingStmt;
  const outerRefX = outerZStmt.initializer as Identifier;
  assert.strictEqual(
    res.resolvedSymbols.get(outerRefX),
    outerSym,
    'outer z = x must resolve to outer x'
  );
});

test('Resolver: detects unresolved identifier (E2001)', () => {
  const source = `
    fn main() {
      y = unknown_variable;
    }
  `;
  const { res, diagnostics } = resolveSource(source);
  assert.strictEqual(res.success, false);
  assert.strictEqual(diagnostics.hasErrors(), true);
  const errors = diagnostics.getErrors();
  assert.ok(errors.some((e) => e.code === 'E2001' && e.message.includes('unknown_variable')));
});

test('Resolver: detects duplicate binding in the same lexical scope (E2002)', () => {
  const source = `
    fn main() {
      let val = 10;
      let val = 20;
    }
  `;
  const { res, diagnostics } = resolveSource(source);
  assert.strictEqual(res.success, false);
  assert.strictEqual(diagnostics.hasErrors(), true);
  const errors = diagnostics.getErrors();
  assert.ok(errors.some((e) => e.code === 'E2002' && e.message.includes('val')));
});

test('Resolver: detects duplicate function parameters (E2002)', () => {
  const source = `
    fn duplicate_params(a: Int, a: Int) {
    }
  `;
  const { res, diagnostics } = resolveSource(source);
  assert.strictEqual(res.success, false);
  const errors = diagnostics.getErrors();
  assert.ok(errors.some((e) => e.code === 'E2002' && e.message.includes('a')));
});

test('Resolver: detects duplicate top-level functions (E2002)', () => {
  const source = `
    fn foo() {}
    fn foo() {}
  `;
  const { res, diagnostics } = resolveSource(source);
  assert.strictEqual(res.success, false);
  const errors = diagnostics.getErrors();
  assert.ok(errors.some((e) => e.code === 'E2002' && e.message.includes('foo')));
});

test('Resolver: scope exit prevents referencing inner bindings from outside (E2001)', () => {
  const source = `
    fn main() {
      if true {
        scoped_val = 99;
      }
      y = scoped_val;
    }
  `;
  const { res, diagnostics } = resolveSource(source);
  assert.strictEqual(res.success, false);
  const errors = diagnostics.getErrors();
  assert.ok(errors.some((e) => e.code === 'E2001' && e.message.includes('scoped_val')));
});

test('Resolver: mutability and assignment validation', () => {
  // Valid mutable reassignment
  const validMut = `
    fn main() {
      mut count = 0;
      count = 1;
    }
  `;
  const res1 = resolveSource(validMut);
  assert.strictEqual(res1.res.success, true);
  assert.strictEqual(res1.diagnostics.hasErrors(), false);

  // Invalid immutable reassignment (E2003)
  const invalidImmutable = `
    fn main() {
      count = 0;
      count = 1;
    }
  `;
  const res2 = resolveSource(invalidImmutable);
  assert.strictEqual(res2.res.success, false);
  const errors = res2.diagnostics.getErrors();
  assert.ok(errors.some((e) => e.code === 'E2003' && e.message.includes('count')));
});

test('Resolver: top-level declaration hoisting allows forward references', () => {
  const source = `
    fn caller() {
      callee();
    }
    fn callee() {
    }
  `;
  const { res, ast, diagnostics } = resolveSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false);
  assert.strictEqual(res.success, true);

  const fnCaller = ast.items[0] as FunctionDecl;
  const fnCallee = ast.items[1] as FunctionDecl;
  const callStmt = fnCaller.body.statements[0] as ExprStmt;
  const callExpr = callStmt.expression as CallExpr;
  const calleeId = callExpr.callee as Identifier;

  const calleeSym = res.declaredSymbols.get(fnCallee);
  assert.ok(calleeSym, 'callee must be declared');
  assert.strictEqual(
    res.resolvedSymbols.get(calleeId),
    calleeSym,
    'callee() inside caller must resolve to hoisted callee function'
  );
});
