/**
 * Seira Lexer
 * Scans UTF-8 Seira source code into a clean token stream.
 * Enforces locked syntax rules and provides informative diagnostics for invalid constructs:
 * - Rejects banned operators: ++, --, &&, ||, ===, !==, ::, null
 * - Recognizes locked symbols: =, :, ->, =>, ., |>, ?, ?., ??, !, @, ..., .., ..<
 * - Recognizes compound assignments: +=, -=, *=, /=, %=
 * - Scans characters, strings, numbers (dec, hex, bin, float, unsigned), booleans, identifiers, and keywords.
 */

import { DiagnosticBag } from '../diagnostics/index.ts';
import type { SourceId } from '../source/source_id.ts';
import type { Span } from '../source/span.ts';
import { KEYWORDS, type Token, TokenType } from './token.ts';

export class Lexer {
  private readonly source: string;
  private readonly file?: string;
  private readonly sourceId?: SourceId;
  private readonly diagnostics: DiagnosticBag;

  private cursor: number = 0;
  private line: number = 1;
  private column: number = 1;

  constructor(source: string, file?: string, diagnostics?: DiagnosticBag, sourceId?: SourceId) {
    this.source = source;
    this.file = file;
    this.diagnostics = diagnostics ?? new DiagnosticBag();
    this.sourceId = sourceId;
  }

  public tokenize(): Token[] {
    const tokens: Token[] = [];

    while (!this.isAtEnd()) {
      this.skipWhitespaceAndComments();
      if (this.isAtEnd()) {
        break;
      }

      const token = this.nextToken();
      if (token) {
        tokens.push(token);
      }
    }

    tokens.push({
      type: TokenType.Eof,
      lexeme: '',
      span: this.currentSpan(this.cursor, this.cursor),
    });

    return tokens;
  }

  public getDiagnostics(): DiagnosticBag {
    return this.diagnostics;
  }

  private nextToken(): Token | null {
    const startCursor = this.cursor;
    const startLine = this.line;
    const startCol = this.column;

    const ch = this.advance();

    switch (ch) {
      case '(':
        return this.makeToken(TokenType.OpenParen, '(', startCursor, startLine, startCol);
      case ')':
        return this.makeToken(TokenType.CloseParen, ')', startCursor, startLine, startCol);
      case '{':
        return this.makeToken(TokenType.OpenBrace, '{', startCursor, startLine, startCol);
      case '}':
        return this.makeToken(TokenType.CloseBrace, '}', startCursor, startLine, startCol);
      case '[':
        return this.makeToken(TokenType.OpenBracket, '[', startCursor, startLine, startCol);
      case ']':
        return this.makeToken(TokenType.CloseBracket, ']', startCursor, startLine, startCol);
      case ',':
        return this.makeToken(TokenType.Comma, ',', startCursor, startLine, startCol);
      case ';':
        return this.makeToken(TokenType.Semicolon, ';', startCursor, startLine, startCol);
      case '@':
        return this.makeToken(TokenType.At, '@', startCursor, startLine, startCol);

      case ':':
        if (this.match(':')) {
          this.reportBanned(
            'E1010',
            "Scope resolution operator '::' is not permitted in Seira.",
            startCursor,
            this.cursor,
            startLine,
            startCol,
            "Use '.' for namespace and member access."
          );
          return null;
        }
        return this.makeToken(TokenType.Colon, ':', startCursor, startLine, startCol);

      case '*':
        if (this.match('=')) {
          return this.makeToken(TokenType.StarEqual, '*=', startCursor, startLine, startCol);
        }
        return this.makeToken(TokenType.Star, '*', startCursor, startLine, startCol);

      case '%':
        if (this.match('=')) {
          return this.makeToken(TokenType.PercentEqual, '%=', startCursor, startLine, startCol);
        }
        return this.makeToken(TokenType.Percent, '%', startCursor, startLine, startCol);

      case '/':
        if (this.match('=')) {
          return this.makeToken(TokenType.SlashEqual, '/=', startCursor, startLine, startCol);
        }
        return this.makeToken(TokenType.Slash, '/', startCursor, startLine, startCol);

      case '=':
        if (this.match('=')) {
          if (this.match('=')) {
            this.reportBanned(
              'E1009',
              "Strict equality operator '===' is not permitted in Seira.",
              startCursor,
              this.cursor,
              startLine,
              startCol,
              "Use '==' for value equality."
            );
            return null;
          }
          return this.makeToken(TokenType.EqualEqual, '==', startCursor, startLine, startCol);
        }
        if (this.match('>')) {
          return this.makeToken(TokenType.FatArrow, '=>', startCursor, startLine, startCol);
        }
        return this.makeToken(TokenType.Equal, '=', startCursor, startLine, startCol);

      case '!':
        if (this.match('=')) {
          if (this.match('=')) {
            this.reportBanned(
              'E1009',
              "Strict inequality operator '!==' is not permitted in Seira.",
              startCursor,
              this.cursor,
              startLine,
              startCol,
              "Use '!=' for value inequality."
            );
            return null;
          }
          return this.makeToken(TokenType.BangEqual, '!=', startCursor, startLine, startCol);
        }
        return this.makeToken(TokenType.Bang, '!', startCursor, startLine, startCol);

      case '<':
        if (this.match('=')) {
          return this.makeToken(TokenType.LessEqual, '<=', startCursor, startLine, startCol);
        }
        return this.makeToken(TokenType.Less, '<', startCursor, startLine, startCol);

      case '>':
        if (this.match('=')) {
          return this.makeToken(TokenType.GreaterEqual, '>=', startCursor, startLine, startCol);
        }
        return this.makeToken(TokenType.Greater, '>', startCursor, startLine, startCol);

      case '+':
        if (this.match('+')) {
          this.reportBanned(
            'E1002',
            "Increment operator '++' is not permitted in Seira.",
            startCursor,
            this.cursor,
            startLine,
            startCol,
            "Use 'x += 1' or 'x = x + 1' instead."
          );
          return null;
        }
        if (this.match('=')) {
          return this.makeToken(TokenType.PlusEqual, '+=', startCursor, startLine, startCol);
        }
        return this.makeToken(TokenType.Plus, '+', startCursor, startLine, startCol);

      case '-':
        if (this.match('-')) {
          this.reportBanned(
            'E1003',
            "Decrement operator '--' is not permitted in Seira.",
            startCursor,
            this.cursor,
            startLine,
            startCol,
            "Use 'x -= 1' or 'x = x - 1' instead."
          );
          return null;
        }
        if (this.match('=')) {
          return this.makeToken(TokenType.MinusEqual, '-=', startCursor, startLine, startCol);
        }
        if (this.match('>')) {
          return this.makeToken(TokenType.Arrow, '->', startCursor, startLine, startCol);
        }
        return this.makeToken(TokenType.Minus, '-', startCursor, startLine, startCol);

      case '|':
        if (this.match('>')) {
          return this.makeToken(TokenType.Pipeline, '|>', startCursor, startLine, startCol);
        }
        if (this.match('|')) {
          this.reportBanned(
            'E1004',
            "Logical operator '||' is not permitted in Seira.",
            startCursor,
            this.cursor,
            startLine,
            startCol,
            "Use the keyword 'or' for boolean disjunction."
          );
          return null;
        }
        return this.makeToken(TokenType.Pipe, '|', startCursor, startLine, startCol);

      case '&':
        if (this.match('&')) {
          this.reportBanned(
            'E1005',
            "Logical operator '&&' is not permitted in Seira.",
            startCursor,
            this.cursor,
            startLine,
            startCol,
            "Use the keyword 'and' for boolean conjunction."
          );
          return null;
        }
        this.reportError('E1001', `Unexpected character '&'`, startCursor, this.cursor, startLine, startCol);
        return null;

      case '?':
        if (this.match('?')) {
          return this.makeToken(TokenType.OptionFallback, '??', startCursor, startLine, startCol);
        }
        if (this.match('.')) {
          return this.makeToken(TokenType.QuestionDot, '?.', startCursor, startLine, startCol);
        }
        return this.makeToken(TokenType.Question, '?', startCursor, startLine, startCol);

      case '.':
        if (this.peek() === '.') {
          this.advance(); // consume second '.'
          if (this.match('<')) {
            return this.makeToken(TokenType.DotDotLess, '..<', startCursor, startLine, startCol);
          }
          if (this.match('.')) {
            return this.makeToken(TokenType.Spread, '...', startCursor, startLine, startCol);
          }
          return this.makeToken(TokenType.DotDot, '..', startCursor, startLine, startCol);
        }
        return this.makeToken(TokenType.Dot, '.', startCursor, startLine, startCol);

      case '"':
        return this.scanString(startCursor, startLine, startCol);

      case "'":
        return this.scanChar(startCursor, startLine, startCol);

      default:
        if (this.isDigit(ch)) {
          return this.scanNumber(ch, startCursor, startLine, startCol);
        }
        if (this.isAlpha(ch)) {
          return this.scanIdentifier(startCursor, startLine, startCol);
        }

        this.reportError('E1001', `Unexpected character '${ch}'`, startCursor, this.cursor, startLine, startCol);
        return null;
    }
  }

  private scanString(startCursor: number, startLine: number, startCol: number): Token | null {
    let result = '';
    while (!this.isAtEnd() && this.peek() !== '"') {
      const ch = this.advance();
      if (ch === '\\') {
        if (this.isAtEnd()) {
          break;
        }
        const esc = this.advance();
        switch (esc) {
          case 'n':
            result += '\n';
            break;
          case 't':
            result += '\t';
            break;
          case 'r':
            result += '\r';
            break;
          case '0':
            result += '\0';
            break;
          case '"':
            result += '"';
            break;
          case '\\':
            result += '\\';
            break;
          default:
            result += esc;
            break;
        }
      } else {
        result += ch;
      }
    }

    if (this.isAtEnd()) {
      this.reportError('E1006', 'Unterminated string literal', startCursor, this.cursor, startLine, startCol);
      return null;
    }

    // Consume closing quote
    this.advance();
    const lexeme = this.source.slice(startCursor, this.cursor);
    return {
      type: TokenType.StringLiteral,
      lexeme,
      value: result,
      span: this.span(startCursor, this.cursor, startLine, startCol),
    };
  }

  private scanChar(startCursor: number, startLine: number, startCol: number): Token | null {
    if (this.isAtEnd() || this.peek() === "'") {
      this.advance(); // consume closing quote if present
      this.reportError(
        'E1008',
        'Empty character literal is not allowed.',
        startCursor,
        this.cursor,
        startLine,
        startCol,
        "A character literal must contain exactly one character, e.g. 'a' or '\\n'."
      );
      return null;
    }

    let charVal = '';
    const ch = this.advance();
    if (ch === '\\') {
      if (this.isAtEnd()) {
        this.reportError('E1008', 'Unterminated character literal', startCursor, this.cursor, startLine, startCol);
        return null;
      }
      const esc = this.advance();
      switch (esc) {
        case 'n':
          charVal = '\n';
          break;
        case 't':
          charVal = '\t';
          break;
        case 'r':
          charVal = '\r';
          break;
        case '0':
          charVal = '\0';
          break;
        case "'":
          charVal = "'";
          break;
        case '\\':
          charVal = '\\';
          break;
        default:
          charVal = esc;
          break;
      }
    } else {
      if (ch.charCodeAt(0) >= 0xD800 && ch.charCodeAt(0) <= 0xDBFF && !this.isAtEnd()) {
        const next = this.peek();
        if (next.charCodeAt(0) >= 0xDC00 && next.charCodeAt(0) <= 0xDFFF) {
          charVal = ch + this.advance();
        } else {
          charVal = ch;
        }
      } else {
        charVal = ch;
      }
    }

    if (this.peek() !== "'") {
      this.reportError(
        'E1008',
        'Character literal must contain exactly one character.',
        startCursor,
        this.cursor,
        startLine,
        startCol,
        "Use double quotes for multi-character strings: \"string\"."
      );
      while (!this.isAtEnd() && this.peek() !== "'" && this.peek() !== '\n') {
        this.advance();
      }
      if (this.peek() === "'") {
        this.advance();
      }
      return null;
    }

    // Consume closing quote
    this.advance();
    const lexeme = this.source.slice(startCursor, this.cursor);
    return {
      type: TokenType.CharLiteral,
      lexeme,
      value: charVal,
      span: this.span(startCursor, this.cursor, startLine, startCol),
    };
  }

  private scanNumber(firstDigit: string, startCursor: number, startLine: number, startCol: number): Token {
    // Check for hex (0x...) or binary (0b...)
    if (firstDigit === '0' && (this.peek() === 'x' || this.peek() === 'X')) {
      this.advance(); // consume 'x'
      while (this.isHexDigit(this.peek())) {
        this.advance();
      }
      const isUnsigned = this.peek() === 'u' || this.peek() === 'U';
      if (isUnsigned) {
        this.advance();
        if (this.peek() === '3' && this.peekNext() === '2') {
          this.advance();
          this.advance();
        } else if (this.peek() === '6' && this.peekNext() === '4') {
          this.advance();
          this.advance();
        }
      }
      const lexeme = this.source.slice(startCursor, this.cursor);
      const cleanLexeme = isUnsigned ? lexeme.replace(/[uU]\d*$/, '') : lexeme;
      return {
        type: isUnsigned ? TokenType.UIntLiteral : TokenType.IntLiteral,
        lexeme,
        value: parseInt(cleanLexeme, 16),
        span: this.span(startCursor, this.cursor, startLine, startCol),
      };
    }

    if (firstDigit === '0' && (this.peek() === 'b' || this.peek() === 'B')) {
      this.advance(); // consume 'b'
      while (this.peek() === '0' || this.peek() === '1') {
        this.advance();
      }
      const isUnsigned = this.peek() === 'u' || this.peek() === 'U';
      if (isUnsigned) {
        this.advance();
        if (this.peek() === '3' && this.peekNext() === '2') {
          this.advance();
          this.advance();
        } else if (this.peek() === '6' && this.peekNext() === '4') {
          this.advance();
          this.advance();
        }
      }
      const lexeme = this.source.slice(startCursor, this.cursor);
      const cleanLexeme = isUnsigned ? lexeme.replace(/[uU]\d*$/, '') : lexeme;
      return {
        type: isUnsigned ? TokenType.UIntLiteral : TokenType.IntLiteral,
        lexeme,
        value: parseInt(cleanLexeme.slice(2), 2),
        span: this.span(startCursor, this.cursor, startLine, startCol),
      };
    }

    while (this.isDigit(this.peek())) {
      this.advance();
    }

    // Float check: '.' followed by digit (NOT followed by '.' which is range '..')
    if (this.peek() === '.' && this.isDigit(this.peekNext())) {
      this.advance(); // consume '.'
      while (this.isDigit(this.peek())) {
        this.advance();
      }
      const lexeme = this.source.slice(startCursor, this.cursor);
      return {
        type: TokenType.FloatLiteral,
        lexeme,
        value: parseFloat(lexeme),
        span: this.span(startCursor, this.cursor, startLine, startCol),
      };
    }

    // Check for unsigned suffix 'u', 'u32', 'u64'
    if (this.peek() === 'u' || this.peek() === 'U') {
      this.advance();
      if (this.peek() === '3' && this.peekNext() === '2') {
        this.advance();
        this.advance();
      } else if (this.peek() === '6' && this.peekNext() === '4') {
        this.advance();
        this.advance();
      }
      const lexeme = this.source.slice(startCursor, this.cursor);
      const cleanLexeme = lexeme.replace(/[uU]\d*$/, '');
      return {
        type: TokenType.UIntLiteral,
        lexeme,
        value: parseInt(cleanLexeme, 10),
        span: this.span(startCursor, this.cursor, startLine, startCol),
      };
    }

    const lexeme = this.source.slice(startCursor, this.cursor);
    return {
      type: TokenType.IntLiteral,
      lexeme,
      value: parseInt(lexeme, 10),
      span: this.span(startCursor, this.cursor, startLine, startCol),
    };
  }

  private scanIdentifier(startCursor: number, startLine: number, startCol: number): Token {
    while (this.isAlphaNumeric(this.peek())) {
      this.advance();
    }

    const lexeme = this.source.slice(startCursor, this.cursor);

    // Check for locked language violation: 'null'
    if (lexeme === 'null') {
      this.reportBanned(
        'E1007',
        "Seira does not have 'null'.",
        startCursor,
        this.cursor,
        startLine,
        startCol,
        "Use 'Option<T>' with 'None' to represent missing values."
      );
    }

    const keywordType = KEYWORDS[lexeme];
    if (keywordType !== undefined) {
      const boolVal = lexeme === 'true' ? true : lexeme === 'false' ? false : undefined;
      return {
        type: keywordType,
        lexeme,
        value: boolVal,
        span: this.span(startCursor, this.cursor, startLine, startCol),
      };
    }

    return {
      type: TokenType.Identifier,
      lexeme,
      span: this.span(startCursor, this.cursor, startLine, startCol),
    };
  }

  private skipWhitespaceAndComments(): void {
    while (!this.isAtEnd()) {
      const ch = this.peek();
      if (ch === ' ' || ch === '\t' || ch === '\r') {
        this.advance();
      } else if (ch === '\n') {
        this.advance();
      } else if (ch === '/' && this.peekNext() === '/') {
        // Line comment
        while (!this.isAtEnd() && this.peek() !== '\n') {
          this.advance();
        }
      } else if (ch === '/' && this.peekNext() === '*') {
        // Block comment
        this.advance(); // /
        this.advance(); // *
        while (!this.isAtEnd() && !(this.peek() === '*' && this.peekNext() === '/')) {
          this.advance();
        }
        if (!this.isAtEnd()) {
          this.advance(); // *
          this.advance(); // /
        }
      } else {
        break;
      }
    }
  }

  private advance(): string {
    const ch = this.source[this.cursor++];
    if (ch === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return ch;
  }

  private match(expected: string): boolean {
    if (this.isAtEnd() || this.source[this.cursor] !== expected) {
      return false;
    }
    this.advance();
    return true;
  }

  private peek(): string {
    if (this.isAtEnd()) return '\0';
    return this.source[this.cursor];
  }

  private peekNext(): string {
    if (this.cursor + 1 >= this.source.length) return '\0';
    return this.source[this.cursor + 1];
  }

  private isDigit(ch: string): boolean {
    return ch >= '0' && ch <= '9';
  }

  private isHexDigit(ch: string): boolean {
    return (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F');
  }

  private isAlpha(ch: string): boolean {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
  }

  private isAlphaNumeric(ch: string): boolean {
    return this.isAlpha(ch) || this.isDigit(ch);
  }

  private isAtEnd(): boolean {
    return this.cursor >= this.source.length;
  }

  private currentSpan(start: number, end: number): Span {
    return {
      start,
      end,
      sourceId: this.sourceId,
      line: this.line,
      column: this.column,
    };
  }

  private span(start: number, end: number, line: number, column: number): Span {
    return {
      start,
      end,
      sourceId: this.sourceId,
      line,
      column,
    };
  }

  private makeToken(type: TokenType, lexeme: string, startCursor: number, startLine: number, startCol: number): Token {
    return {
      type,
      lexeme,
      span: this.span(startCursor, this.cursor, startLine, startCol),
    };
  }

  private reportError(
    code: string,
    message: string,
    startCursor: number,
    endCursor: number,
    line: number,
    col: number,
    hint?: string
  ): void {
    this.diagnostics.reportError(
      code,
      message,
      { start: startCursor, end: endCursor, sourceId: this.sourceId, line, column: col },
      this.file,
      hint
    );
  }

  private reportBanned(
    code: string,
    message: string,
    startCursor: number,
    endCursor: number,
    line: number,
    col: number,
    hint: string
  ): void {
    this.diagnostics.reportError(
      code,
      message,
      { start: startCursor, end: endCursor, sourceId: this.sourceId, line, column: col },
      this.file,
      hint
    );
  }
}
