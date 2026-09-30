import assert from 'node:assert';
import test from 'node:test';
import { DiagnosticBag } from '../../compiler/diagnostics/index.ts';
import { Lexer } from '../../compiler/lexer/lexer.ts';
import { TokenType } from '../../compiler/lexer/token.ts';

test('Lexer: tokenizes locked symbols', () => {
  const source = '= : -> => . |> ? ?. ?? ! @ ...';
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();

  const expectedTypes = [
    TokenType.Equal,
    TokenType.Colon,
    TokenType.Arrow,
    TokenType.FatArrow,
    TokenType.Dot,
    TokenType.Pipeline,
    TokenType.Question,
    TokenType.QuestionDot,
    TokenType.OptionFallback,
    TokenType.Bang,
    TokenType.At,
    TokenType.Spread,
    TokenType.Eof,
  ];

  assert.strictEqual(tokens.length, expectedTypes.length);
  for (let i = 0; i < expectedTypes.length; i++) {
    assert.strictEqual(tokens[i].type, expectedTypes[i]);
  }
});

test('Lexer: tokenizes boolean keywords and rejects && / ||', () => {
  const validSource = 'true and false or not true';
  const lexer = new Lexer(validSource);
  const tokens = lexer.tokenize();

  assert.strictEqual(tokens[0].type, TokenType.BoolLiteral);
  assert.strictEqual(tokens[1].type, TokenType.And);
  assert.strictEqual(tokens[2].type, TokenType.BoolLiteral);
  assert.strictEqual(tokens[3].type, TokenType.Or);
  assert.strictEqual(tokens[4].type, TokenType.Not);
  assert.strictEqual(tokens[5].type, TokenType.BoolLiteral);

  // Rejection of banned '&&'
  const bagAnd = new DiagnosticBag();
  new Lexer('a && b', 'test.sra', bagAnd).tokenize();
  assert.strictEqual(bagAnd.hasErrors(), true);
  assert.strictEqual(bagAnd.getDiagnostics()[0].code, 'SEIRA-E0104');

  // Rejection of banned '||'
  const bagOr = new DiagnosticBag();
  new Lexer('a || b', 'test.sra', bagOr).tokenize();
  assert.strictEqual(bagOr.hasErrors(), true);
  assert.strictEqual(bagOr.getDiagnostics()[0].code, 'SEIRA-E0103');
});

test('Lexer: rejects banned increment (++) and decrement (--)', () => {
  const bagInc = new DiagnosticBag();
  new Lexer('counter++', 'test.sra', bagInc).tokenize();
  assert.strictEqual(bagInc.hasErrors(), true);
  assert.strictEqual(bagInc.getDiagnostics()[0].code, 'SEIRA-E0101');

  const bagDec = new DiagnosticBag();
  new Lexer('counter--', 'test.sra', bagDec).tokenize();
  assert.strictEqual(bagDec.hasErrors(), true);
  assert.strictEqual(bagDec.getDiagnostics()[0].code, 'SEIRA-E0102');
});

test('Lexer: rejects null and suggests Option<T>', () => {
  const bag = new DiagnosticBag();
  new Lexer('let x = null', 'test.sra', bag).tokenize();
  assert.strictEqual(bag.hasErrors(), true);
  assert.strictEqual(bag.getDiagnostics()[0].code, 'SEIRA-E0106');
});

test('Lexer: tokenizes numbers, strings, and comments', () => {
  const source = `
    // single line comment
    /* block comment */
    let x = 42;
    let y = 3.1415;
    let hex = 0xFF;
    let bin = 0b1010;
    let msg = "Hello, \\"Seira\\"!\\n";
  `;

  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();

  const letTokens = tokens.filter((t) => t.type === TokenType.Let);
  assert.strictEqual(letTokens.length, 5);

  const numTokens = tokens.filter((t) => t.type === TokenType.IntLiteral || t.type === TokenType.FloatLiteral);
  assert.strictEqual(numTokens.length, 4);
  assert.strictEqual(numTokens[0].value, 42);
  assert.strictEqual(numTokens[1].value, 3.1415);
  assert.strictEqual(numTokens[2].value, 255);
  assert.strictEqual(numTokens[3].value, 10);

  const strToken = tokens.find((t) => t.type === TokenType.StringLiteral);
  assert.ok(strToken);
  assert.strictEqual(strToken?.value, 'Hello, "Seira"!\n');
});

test('Lexer: reports accurate line and column spans', () => {
  const source = 'fn main() {\n  return 100\n}';
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();

  const retToken = tokens.find((t) => t.type === TokenType.Return);
  assert.ok(retToken);
  assert.strictEqual(retToken?.span.line, 2);
  assert.strictEqual(retToken?.span.column, 3);
});
