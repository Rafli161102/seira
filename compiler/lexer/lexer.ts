/**
 * Seira Lexer
 * Scans UTF-8 Seira source code into a clean token stream.
 * Enforces locked syntax rules and provides informative diagnostics for invalid constructs.
 */

import { DiagnosticBag, type Span } from '../diagnostics/index.ts';
import { KEYWORDS, type Token, TokenType } from './token.ts';

export class Lexer {
  private readonly source: string;
  private readonly file?: string;
  private readonly diagnostics: DiagnosticBag;

  private cursor: number = 0;
  private line: number = 1;
  private column: number = 1;

  constructor(source: string, file?: string, diagnostics?: DiagnosticBag) {
    this.source = source;
    this.file = file;
    this.diagnostics = diagnostics ?? new DiagnosticBag();
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

    // Single-character or prefix checks
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
      case ':':
        return this.makeToken(TokenType.Colon, ':', startCursor, startLine, startCol);
      case '@':
        return this.makeToken(TokenType.At, '@', startCursor, startLine, startCol);
      case '*':
        return this.makeToken(TokenType.Star, '*', startCursor, startLine, startCol);
      case '%':
        return this.makeToken(TokenType.Percent, '%', startCursor, startLine, startCol);
      case '/':
        return this.makeToken(TokenType.Slash, '/', startCursor, startLine, startCol);

      case '=':
        if (this.match('=')) {
          return this.makeToken(TokenType.EqualEqual, '==', startCursor, startLine, startCol);
        }
        if (this.match('>')) {
          return this.makeToken(TokenType.FatArrow, '=>', startCursor, startLine, startCol);
        }
        return this.makeToken(TokenType.Equal, '=', startCursor, startLine, startCol);

      case '!':
        if (this.match('=')) {
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
            'SEIRA-E0101',
            "Increment operator '++' is not permitted in Seira.",
            startCursor,
            this.cursor,
            startLine,
            startCol,
            "Use 'x += 1' or 'x = x + 1' instead."
          );
          return null;
        }
        return this.makeToken(TokenType.Plus, '+', startCursor, startLine, startCol);

      case '-':
        if (this.match('-')) {
          this.reportBanned(
            'SEIRA-E0102',
            "Decrement operator '--' is not permitted in Seira.",
            startCursor,
            this.cursor,
            startLine,
            startCol,
            "Use 'x -= 1' or 'x = x - 1' instead."
          );
          return null;
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
            'SEIRA-E0103',
            "Logical operator '||' is not permitted in Seira.",
            startCursor,
            this.cursor,
            startLine,
            startCol,
            "Use the keyword 'or' for boolean disjunction."
          );
          return null;
        }
        this.reportError('SEIRA-E0100', `Unexpected character '|'`, startCursor, this.cursor, startLine, startCol);
        return null;

      case '&':
        if (this.match('&')) {
          this.reportBanned(
            'SEIRA-E0104',
            "Logical operator '&&' is not permitted in Seira.",
            startCursor,
            this.cursor,
            startLine,
            startCol,
            "Use the keyword 'and' for boolean conjunction."
          );
          return null;
        }
        this.reportError('SEIRA-E0100', `Unexpected character '&'`, startCursor, this.cursor, startLine, startCol);
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
        if (this.peek() === '.' && this.peekNext() === '.') {
          this.advance();
          this.advance();
          return this.makeToken(TokenType.Spread, '...', startCursor, startLine, startCol);
        }
        return this.makeToken(TokenType.Dot, '.', startCursor, startLine, startCol);

      case '"':
        return this.scanString(startCursor, startLine, startCol);

      default:
        if (this.isDigit(ch)) {
          return this.scanNumber(ch, startCursor, startLine, startCol);
        }
        if (this.isAlpha(ch)) {
          return this.scanIdentifier(startCursor, startLine, startCol);
        }

        this.reportError('SEIRA-E0100', `Unexpected character '${ch}'`, startCursor, this.cursor, startLine, startCol);
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
      this.reportError('SEIRA-E0105', 'Unterminated string literal', startCursor, this.cursor, startLine, startCol);
      return null;
    }

    // Consume closing quote
    this.advance();
    const lexeme = this.source.slice(startCursor, this.cursor);
    return {
      type: TokenType.StringLiteral,
      lexeme,
      value: result,
      span: {
        start: startCursor,
        end: this.cursor,
        line: startLine,
        column: startCol,
      },
    };
  }

  private scanNumber(firstDigit: string, startCursor: number, startLine: number, startCol: number): Token {
    // Check for hex or binary
    if (firstDigit === '0' && (this.peek() === 'x' || this.peek() === 'X')) {
      this.advance(); // consume 'x'
      while (this.isHexDigit(this.peek())) {
        this.advance();
      }
      const lexeme = this.source.slice(startCursor, this.cursor);
      return {
        type: TokenType.IntLiteral,
        lexeme,
        value: parseInt(lexeme, 16),
        span: { start: startCursor, end: this.cursor, line: startLine, column: startCol },
      };
    }

    if (firstDigit === '0' && (this.peek() === 'b' || this.peek() === 'B')) {
      this.advance(); // consume 'b'
      while (this.peek() === '0' || this.peek() === '1') {
        this.advance();
      }
      const lexeme = this.source.slice(startCursor, this.cursor);
      return {
        type: TokenType.IntLiteral,
        lexeme,
        value: parseInt(lexeme.slice(2), 2),
        span: { start: startCursor, end: this.cursor, line: startLine, column: startCol },
      };
    }

    while (this.isDigit(this.peek())) {
      this.advance();
    }

    // Float check: '.' followed by digit
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
        span: { start: startCursor, end: this.cursor, line: startLine, column: startCol },
      };
    }

    const lexeme = this.source.slice(startCursor, this.cursor);
    return {
      type: TokenType.IntLiteral,
      lexeme,
      value: parseInt(lexeme, 10),
      span: { start: startCursor, end: this.cursor, line: startLine, column: startCol },
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
        'SEIRA-E0106',
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
        span: { start: startCursor, end: this.cursor, line: startLine, column: startCol },
      };
    }

    return {
      type: TokenType.Identifier,
      lexeme,
      span: { start: startCursor, end: this.cursor, line: startLine, column: startCol },
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
      line: this.line,
      column: this.column,
    };
  }

  private makeToken(type: TokenType, lexeme: string, startCursor: number, startLine: number, startCol: number): Token {
    return {
      type,
      lexeme,
      span: {
        start: startCursor,
        end: this.cursor,
        line: startLine,
        column: startCol,
      },
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
    this.diagnostics.reportError(code, message, { start: startCursor, end: endCursor, line, column: col }, this.file, hint);
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
    this.diagnostics.reportError(code, message, { start: startCursor, end: endCursor, line, column: col }, this.file, hint);
  }
}
