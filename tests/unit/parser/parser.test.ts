import assert from 'node:assert';
import test from 'node:test';
import {
  type AssignStmt,
  type BinaryExpr,
  type BindingStmt,
  type CallExpr,
  type EnumDecl,
  type FunctionDecl,
  type IfExpr,
  type LetStmt,
  type OptionFallbackExpr,
  type OptionPropagateExpr,
  type PipelineExpr,
  type RangeExpr,
  type StructDecl,
  type TypeAliasDecl,
  type WithStmt,
} from '../../../compiler/ast/ast.ts';
import { Lexer } from '../../../compiler/lexer/lexer.ts';
import { Parser } from '../../../compiler/parser/parser.ts';

function parseSource(src: string) {
  const tokens = new Lexer(src).tokenize();
  const parser = new Parser(tokens);
  return { ast: parser.parse(), diagnostics: parser.getDiagnostics() };
}

test('Parser: parses standard function declaration', () => {
  const source = `
    fn main() {
      println("Hello, Seira!")
    }
  `;
  const { ast, diagnostics } = parseSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false);
  assert.strictEqual(ast.items.length, 1);

  const fn = ast.items[0] as FunctionDecl;
  assert.strictEqual(fn.kind, 'FunctionDecl');
  assert.strictEqual(fn.name, 'main');
  assert.strictEqual(fn.isEffectful, false);
  assert.strictEqual(fn.params.length, 0);
  assert.strictEqual(fn.body.statements.length, 1);
});

test('Parser: parses expression-style function declaration (=>)', () => {
  const source = `
    fn add(a: Int, b: Int) => a + b;
  `;
  const { ast, diagnostics } = parseSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false);

  const fn = ast.items[0] as FunctionDecl;
  assert.strictEqual(fn.name, 'add');
  assert.strictEqual(fn.isExpressionBody, true);
  assert.ok(fn.bodyExpr);
  assert.strictEqual(fn.body.statements.length, 1);
  assert.strictEqual(fn.body.statements[0].kind, 'ReturnStmt');
});

test('Parser: parses effectful functions with typed parameters', () => {
  const source = `
    fn write_file!(mut buffer: Buffer, path: String) -> Result<Unit, Error> {
      return 0
    }
  `;
  const { ast, diagnostics } = parseSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false);

  const fn = ast.items[0] as FunctionDecl;
  assert.strictEqual(fn.name, 'write_file');
  assert.strictEqual(fn.isEffectful, true);
  assert.strictEqual(fn.params.length, 2);
  assert.strictEqual(fn.params[0].isMut, true);
  assert.strictEqual(fn.params[0].name, 'buffer');
  assert.strictEqual(fn.params[1].isMut, false);
  assert.strictEqual(fn.params[1].name, 'path');
  assert.strictEqual(fn.returnType?.name, 'Result');
  assert.strictEqual(fn.returnType?.generics?.length, 2);
});

test('Parser: parses bare immutable and mutable bindings', () => {
  const source = `
    fn test_bindings() {
      x = 10;
      mut y = 20;
      z: Int = 30;
      mut w: Int = 40;
    }
  `;
  const { ast, diagnostics } = parseSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false);

  const fn = ast.items[0] as FunctionDecl;
  assert.strictEqual(fn.body.statements.length, 4);

  const x = fn.body.statements[0] as BindingStmt;
  assert.strictEqual(x.kind, 'BindingStmt');
  assert.strictEqual(x.name, 'x');
  assert.strictEqual(x.isMut, false);

  const y = fn.body.statements[1] as BindingStmt;
  assert.strictEqual(y.kind, 'BindingStmt');
  assert.strictEqual(y.name, 'y');
  assert.strictEqual(y.isMut, true);

  const z = fn.body.statements[2] as BindingStmt;
  assert.strictEqual(z.name, 'z');
  assert.strictEqual(z.isMut, false);
  assert.strictEqual(z.typeAnnotation?.name, 'Int');

  const w = fn.body.statements[3] as BindingStmt;
  assert.strictEqual(w.name, 'w');
  assert.strictEqual(w.isMut, true);
});

test('Parser: parses let and const statements', () => {
  const source = `
    fn main() {
      let a = 1;
      let mut b = 2;
      const MAX: Int = 100;
    }
  `;
  const { ast, diagnostics } = parseSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false);

  const fn = ast.items[0] as FunctionDecl;
  assert.strictEqual(fn.body.statements.length, 3);
  assert.strictEqual(fn.body.statements[0].kind, 'LetStmt');
  assert.strictEqual((fn.body.statements[0] as LetStmt).isMut, false);
  assert.strictEqual(fn.body.statements[1].kind, 'LetStmt');
  assert.strictEqual((fn.body.statements[1] as LetStmt).isMut, true);
  assert.strictEqual(fn.body.statements[2].kind, 'ConstStmt');
});

test('Parser: parses pipeline expressions (|>)', () => {
  const source = `
    fn process(items: List) {
      items |> filter |> sort |> to_json
    }
  `;
  const { ast, diagnostics } = parseSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false);

  const fn = ast.items[0] as FunctionDecl;
  const stmt = fn.body.statements[0];
  assert.strictEqual(stmt.kind, 'ExprStmt');

  const pipeline = (stmt as any).expression as PipelineExpr;
  assert.strictEqual(pipeline.kind, 'PipelineExpr');
  assert.strictEqual(pipeline.left.kind, 'PipelineExpr');
});

test('Parser: parses Option fallback (??) and propagation (?)', () => {
  const source = `
    fn compute(maybe_val: Option<Int>) {
      let x = maybe_val ?? 42;
      let y = fetch_data()?;
    }
  `;
  const { ast, diagnostics } = parseSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false);

  const fn = ast.items[0] as FunctionDecl;
  const letX = fn.body.statements[0] as LetStmt;
  const letY = fn.body.statements[1] as LetStmt;

  const fallback = letX.initializer as OptionFallbackExpr;
  assert.strictEqual(fallback.kind, 'OptionFallbackExpr');

  const propagate = letY.initializer as OptionPropagateExpr;
  assert.strictEqual(propagate.kind, 'OptionPropagateExpr');
  assert.strictEqual((propagate.operand as CallExpr).kind, 'CallExpr');
});

test('Parser: parses range expressions (.. and ..<)', () => {
  const source = `
    fn ranges() {
      let r1 = 0..10;
      let r2 = 0..<10;
    }
  `;
  const { ast, diagnostics } = parseSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false);

  const fn = ast.items[0] as FunctionDecl;
  const letR1 = fn.body.statements[0] as LetStmt;
  const letR2 = fn.body.statements[1] as LetStmt;

  const range1 = letR1.initializer as RangeExpr;
  assert.strictEqual(range1.kind, 'RangeExpr');
  assert.strictEqual(range1.isHalfOpen, false);

  const range2 = letR2.initializer as RangeExpr;
  assert.strictEqual(range2.kind, 'RangeExpr');
  assert.strictEqual(range2.isHalfOpen, true);
});

test('Parser: parses if expressions as values and statements', () => {
  const source = `
    fn check(score: Int) {
      let status = if score >= 50 {
        "pass"
      } else {
        "fail"
      };

      if score == 100 {
        congratulate();
      }
    }
  `;
  const { ast, diagnostics } = parseSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false);

  const fn = ast.items[0] as FunctionDecl;
  const letStmt = fn.body.statements[0] as LetStmt;
  const ifExpr = letStmt.initializer as IfExpr;
  assert.strictEqual(ifExpr.kind, 'IfExpr');
  assert.strictEqual(ifExpr.thenBranch.statements.length, 1);
  assert.ok(ifExpr.elseBranch);

  const stmt2 = fn.body.statements[1];
  assert.strictEqual(stmt2.kind, 'ExprStmt');
  assert.strictEqual((stmt2 as any).expression.kind, 'IfExpr');
});

test('Parser: preserves operator precedence hierarchy', () => {
  // Precedence: 1 + 2 * 3 -> 1 + (2 * 3)
  const source = `fn prec() => 1 + 2 * 3;`;
  const { ast } = parseSource(source);
  const fn = ast.items[0] as FunctionDecl;
  const bin = fn.bodyExpr as BinaryExpr;
  assert.strictEqual(bin.operator, '+');
  assert.strictEqual((bin.right as BinaryExpr).operator, '*');

  // Precedence: a and b or c -> (a and b) or c
  const boolSrc = `fn b() => a and b or c;`;
  const { ast: boolAst } = parseSource(boolSrc);
  const boolFn = boolAst.items[0] as FunctionDecl;
  const boolBin = boolFn.bodyExpr as BinaryExpr;
  assert.strictEqual(boolBin.operator, 'or');
  assert.strictEqual((boolBin.left as BinaryExpr).operator, 'and');
});

test('Parser: parses deterministic resource lifecycle with blocks', () => {
  const source = `
    fn main() {
      with open_file("log.txt") as file {
        file.write("entry")
      }
    }
  `;
  const { ast, diagnostics } = parseSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false);

  const fn = ast.items[0] as FunctionDecl;
  const withStmt = fn.body.statements[0] as WithStmt;
  assert.strictEqual(withStmt.kind, 'WithStmt');
  assert.strictEqual(withStmt.alias, 'file');
  assert.strictEqual(withStmt.body.statements.length, 1);
});

test('Parser: parses struct, enum, and type declarations', () => {
  const source = `
    struct User {
      id: Int,
      name: String,
    }

    enum Status {
      Active,
      Pending(Int),
    }

    type UserId = Int;
  `;
  const { ast, diagnostics } = parseSource(source);
  assert.strictEqual(diagnostics.hasErrors(), false);
  assert.strictEqual(ast.items.length, 3);

  const user = ast.items[0] as StructDecl;
  assert.strictEqual(user.kind, 'StructDecl');
  assert.strictEqual(user.fields.length, 2);

  const status = ast.items[1] as EnumDecl;
  assert.strictEqual(status.kind, 'EnumDecl');
  assert.strictEqual(status.variants.length, 2);
  assert.strictEqual(status.variants[1].name, 'Pending');

  const alias = ast.items[2] as TypeAliasDecl;
  assert.strictEqual(alias.kind, 'TypeAliasDecl');
  assert.strictEqual(alias.targetType.name, 'Int');
});

test('Parser: recovers from syntax errors and reports multiple diagnostics', () => {
  const source = `
    fn good_one() {
      let x = 1;
    }

    fn broken_syntax( {
      let invalid = ;
    }

    fn good_two() {
      let y = 2;
    }
  `;
  const { ast, diagnostics } = parseSource(source);

  // Both good functions should be present in AST thanks to error recovery!
  const functionNames = ast.items
    .filter((it): it is FunctionDecl => it.kind === 'FunctionDecl')
    .map((f) => f.name);

  assert.ok(functionNames.includes('good_one'));
  assert.ok(functionNames.includes('good_two'));
  assert.strictEqual(diagnostics.hasErrors(), true);
  assert.ok(diagnostics.getDiagnostics().length >= 1);
});
