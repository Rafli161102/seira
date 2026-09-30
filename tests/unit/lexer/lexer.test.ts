import assert from 'node:assert';
import test from 'node:test';
import { DiagnosticBag } from '../../../compiler/diagnostics/index.ts';
import { Lexer } from '../../../compiler/lexer/lexer.ts';
import { TokenType } from '../../../compiler/lexer/token.ts';

test('Lexer: tokenizes locked symbols', () => {
  const source = '= : -> => . |> ? ?. ?? ! @ ... .. ..<';
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
    TokenType.DotDot,
    TokenType.DotDotLess,
    TokenType.Eof,
  ];

  assert.strictEqual(tokens.length, expectedTypes.length);
  for (let i = 0; i < expectedTypes.length; i++) {
    assert.strictEqual(tokens[i].type, expectedTypes[i]);
  }
});

test('Lexer: tokenizes compound assignment operators', () => {
  const source = '+= -= *= /= %=';
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();

  const expectedTypes = [
    TokenType.PlusEqual,
    TokenType.MinusEqual,
    TokenType.StarEqual,
    TokenType.SlashEqual,
    TokenType.PercentEqual,
    TokenType.Eof,
  ];

  assert.strictEqual(tokens.length, expectedTypes.length);
  for (let i = 0; i < expectedTypes.length; i++) {
    assert.strictEqual(tokens[i].type, expectedTypes[i]);
  }
});

test('Lexer: tokenizes keywords accurately without treating identifiers as keywords', () => {
  const source = 'fn let const mut with if else match for while loop break continue return type struct enum trait impl import export use as pub priv async await pure unsafe self';
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();

  const expected = [
    TokenType.Fn,
    TokenType.Let,
    TokenType.Const,
    TokenType.Mut,
    TokenType.With,
    TokenType.If,
    TokenType.Else,
    TokenType.Match,
    TokenType.For,
    TokenType.While,
    TokenType.Loop,
    TokenType.Break,
    TokenType.Continue,
    TokenType.Return,
    TokenType.Type,
    TokenType.Struct,
    TokenType.Enum,
    TokenType.Trait,
    TokenType.Impl,
    TokenType.Import,
    TokenType.Export,
    TokenType.Use,
    TokenType.As,
    TokenType.Pub,
    TokenType.Priv,
    TokenType.Async,
    TokenType.Await,
    TokenType.Pure,
    TokenType.Unsafe,
    TokenType.Self,
    TokenType.Eof,
  ];

  assert.strictEqual(tokens.length, expected.length);
  for (let i = 0; i < expected.length; i++) {
    assert.strictEqual(tokens[i].type, expected[i]);
  }

  // Identifiers that share prefixes with keywords
  const idSource = 'fn_name let_val mut_x loop_count self_service';
  const idTokens = new Lexer(idSource).tokenize();
  assert.strictEqual(idTokens.length, 6); // 5 ids + EOF
  for (let i = 0; i < 5; i++) {
    assert.strictEqual(idTokens[i].type, TokenType.Identifier);
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
  assert.strictEqual(bagAnd.getDiagnostics()[0].code, 'E1005');

  // Rejection of banned '||'
  const bagOr = new DiagnosticBag();
  new Lexer('a || b', 'test.sra', bagOr).tokenize();
  assert.strictEqual(bagOr.hasErrors(), true);
  assert.strictEqual(bagOr.getDiagnostics()[0].code, 'E1004');
});

test('Lexer: rejects banned operators ++, --, ===, !==, ::, null', () => {
  const bagInc = new DiagnosticBag();
  new Lexer('counter++', 'test.sra', bagInc).tokenize();
  assert.strictEqual(bagInc.getDiagnostics()[0].code, 'E1002');

  const bagDec = new DiagnosticBag();
  new Lexer('counter--', 'test.sra', bagDec).tokenize();
  assert.strictEqual(bagDec.getDiagnostics()[0].code, 'E1003');

  const bagStrictEq = new DiagnosticBag();
  new Lexer('a === b', 'test.sra', bagStrictEq).tokenize();
  assert.strictEqual(bagStrictEq.getDiagnostics()[0].code, 'E1009');

  const bagStrictNeq = new DiagnosticBag();
  new Lexer('a !== b', 'test.sra', bagStrictNeq).tokenize();
  assert.strictEqual(bagStrictNeq.getDiagnostics()[0].code, 'E1009');

  const bagScope = new DiagnosticBag();
  new Lexer('std::io', 'test.sra', bagScope).tokenize();
  assert.strictEqual(bagScope.getDiagnostics()[0].code, 'E1010');

  const bagNull = new DiagnosticBag();
  new Lexer('let x = null', 'test.sra', bagNull).tokenize();
  assert.strictEqual(bagNull.getDiagnostics()[0].code, 'E1007');
});

test('Lexer: tokenizes numbers (int, uint, float, hex, bin)', () => {
  const source = '42 100u 0xFF 0b1010 3.1415';
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();

  assert.strictEqual(tokens[0].type, TokenType.IntLiteral);
  assert.strictEqual(tokens[0].value, 42);

  assert.strictEqual(tokens[1].type, TokenType.UIntLiteral);
  assert.strictEqual(tokens[1].value, 100);

  assert.strictEqual(tokens[2].type, TokenType.IntLiteral);
  assert.strictEqual(tokens[2].value, 255);

  assert.strictEqual(tokens[3].type, TokenType.IntLiteral);
  assert.strictEqual(tokens[3].value, 10);

  assert.strictEqual(tokens[4].type, TokenType.FloatLiteral);
  assert.strictEqual(tokens[4].value, 3.1415);
});

test('Lexer: tokenizes string and character literals with escape sequences', () => {
  const source = `"hello\\nworld" 'a' '\\n' '\\t' '\\''`;
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();

  assert.strictEqual(tokens[0].type, TokenType.StringLiteral);
  assert.strictEqual(tokens[0].value, 'hello\nworld');

  assert.strictEqual(tokens[1].type, TokenType.CharLiteral);
  assert.strictEqual(tokens[1].value, 'a');

  assert.strictEqual(tokens[2].type, TokenType.CharLiteral);
  assert.strictEqual(tokens[2].value, '\n');

  assert.strictEqual(tokens[3].type, TokenType.CharLiteral);
  assert.strictEqual(tokens[3].value, '\t');

  assert.strictEqual(tokens[4].type, TokenType.CharLiteral);
  assert.strictEqual(tokens[4].value, "'");
});

test('Lexer: rejects empty or multi-character char literals', () => {
  const bagEmpty = new DiagnosticBag();
  new Lexer("''", 'test.sra', bagEmpty).tokenize();
  assert.strictEqual(bagEmpty.hasErrors(), true);
  assert.strictEqual(bagEmpty.getDiagnostics()[0].code, 'E1008');

  const bagMulti = new DiagnosticBag();
  new Lexer("'ab'", 'test.sra', bagMulti).tokenize();
  assert.strictEqual(bagMulti.hasErrors(), true);
  assert.strictEqual(bagMulti.getDiagnostics()[0].code, 'E1008');
});

test('Lexer: preserves accurate line and column spans across comments', () => {
  const source = `// Single line comment
/* Multi-line
   block comment */
fn main() {
    return 100;
}`;

  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();

  const fnToken = tokens.find((t) => t.type === TokenType.Fn);
  assert.ok(fnToken);
  assert.strictEqual(fnToken?.span.line, 4);
  assert.strictEqual(fnToken?.span.column, 1);

  const retToken = tokens.find((t) => t.type === TokenType.Return);
  assert.ok(retToken);
  assert.strictEqual(retToken?.span.line, 5);
  assert.strictEqual(retToken?.span.column, 5);
});
