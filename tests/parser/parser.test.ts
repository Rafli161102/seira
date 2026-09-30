import assert from 'node:assert';
import test from 'node:test';
import {
  type CallExpr,
  type FunctionDecl,
  type LetStmt,
  type OptionFallbackExpr,
  type OptionPropagateExpr,
  type PipelineExpr,
  type WithStmt,
} from '../../compiler/ast/ast.ts';
import { Lexer } from '../../compiler/lexer/lexer.ts';
import { Parser } from '../../compiler/parser/parser.ts';

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
