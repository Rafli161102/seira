/**
 * Seira Parser
 * Recursive-descent parser constructing the Seira AST from tokens.
 * Enforces locked syntax rules:
 * - Pipelines: `|>`
 * - Option fallback: `??`
 * - Option propagation: `?`
 * - Effect tracking: `!`
 * - Mutation: `mut`
 * - Resource blocks: `with`
 * - Boolean keywords: `and`, `or`, `not`
 */

import type {
  Block,
  CallExpr,
  Expr,
  FunctionDecl,
  Identifier,
  LetStmt,
  Literal,
  OptionFallbackExpr,
  OptionPropagateExpr,
  Param,
  PipelineExpr,
  Program,
  ReturnStmt,
  Stmt,
  TopLevelItem,
  TypeAnnotation,
  WithStmt,
} from '../ast/ast.ts';
import { DiagnosticBag, type Span } from '../diagnostics/index.ts';
import { type Token, TokenType } from '../lexer/token.ts';

export class Parser {
  private readonly tokens: Token[];
  private readonly file?: string;
  private readonly diagnostics: DiagnosticBag;
  private current: number = 0;

  constructor(tokens: Token[], file?: string, diagnostics?: DiagnosticBag) {
    this.tokens = tokens;
    this.file = file;
    this.diagnostics = diagnostics ?? new DiagnosticBag();
  }

  public parse(): Program {
    const items: TopLevelItem[] = [];
    const startSpan = this.peek().span;

    while (!this.isAtEnd()) {
      try {
        const item = this.parseTopLevelItem();
        if (item) {
          items.push(item);
        }
      } catch {
        this.synchronize();
      }
    }

    const endSpan = this.previous()?.span ?? startSpan;
    return {
      kind: 'Program',
      items,
      span: {
        start: startSpan.start,
        end: endSpan.end,
        line: startSpan.line,
        column: startSpan.column,
      },
    };
  }

  public getDiagnostics(): DiagnosticBag {
    return this.diagnostics;
  }

  // ---------------------------------------------------------------------------
  // Top-Level Items
  // ---------------------------------------------------------------------------

  private parseTopLevelItem(): TopLevelItem | null {
    if (this.check(TokenType.Fn)) {
      return this.parseFunctionDecl();
    }
    // Allow statement at top-level (e.g. for scripting/minimal tests)
    return this.parseStatement();
  }

  private parseFunctionDecl(): FunctionDecl {
    const fnToken = this.consume(TokenType.Fn, "Expected 'fn' keyword.");
    let isEffectful = false;

    // Check for effect marker `!` on function name or definition
    const nameToken = this.consume(TokenType.Identifier, "Expected function name after 'fn'.");
    if (this.match(TokenType.Bang)) {
      isEffectful = true;
    }

    this.consume(TokenType.OpenParen, "Expected '(' after function name.");
    const params = this.parseParamList();
    this.consume(TokenType.CloseParen, "Expected ')' after parameter list.");

    let returnType: TypeAnnotation | undefined;
    if (this.match(TokenType.Arrow)) {
      returnType = this.parseTypeAnnotation();
    }

    const body = this.parseBlock();

    return {
      kind: 'FunctionDecl',
      name: nameToken.lexeme,
      isEffectful,
      params,
      returnType,
      body,
      span: {
        start: fnToken.span.start,
        end: body.span.end,
        line: fnToken.span.line,
        column: fnToken.span.column,
      },
    };
  }

  private parseParamList(): Param[] {
    const params: Param[] = [];
    if (!this.check(TokenType.CloseParen)) {
      do {
        let isMut = false;
        if (this.match(TokenType.Mut)) {
          isMut = true;
        }
        const paramName = this.consume(TokenType.Identifier, 'Expected parameter name.');
        let typeAnnotation: TypeAnnotation | undefined;
        if (this.match(TokenType.Colon)) {
          typeAnnotation = this.parseTypeAnnotation();
        }

        params.push({
          kind: 'Param',
          name: paramName.lexeme,
          isMut,
          typeAnnotation,
          span: {
            start: paramName.span.start,
            end: typeAnnotation?.span.end ?? paramName.span.end,
            line: paramName.span.line,
            column: paramName.span.column,
          },
        });
      } while (this.match(TokenType.Comma));
    }
    return params;
  }

  private parseTypeAnnotation(): TypeAnnotation {
    const nameToken = this.consume(TokenType.Identifier, 'Expected type name.');
    let isEffectful = false;
    if (this.match(TokenType.Bang)) {
      isEffectful = true;
    }

    const generics: TypeAnnotation[] = [];
    if (this.match(TokenType.Less)) {
      do {
        generics.push(this.parseTypeAnnotation());
      } while (this.match(TokenType.Comma));
      this.consume(TokenType.Greater, "Expected '>' to close generic argument list.");
    }

    return {
      kind: 'TypeAnnotation',
      name: nameToken.lexeme,
      generics: generics.length > 0 ? generics : undefined,
      isEffectful,
      span: {
        start: nameToken.span.start,
        end: this.previous().span.end,
        line: nameToken.span.line,
        column: nameToken.span.column,
      },
    };
  }

  private parseBlock(): Block {
    const openBrace = this.consume(TokenType.OpenBrace, "Expected '{' to start block.");
    const statements: Stmt[] = [];

    while (!this.check(TokenType.CloseBrace) && !this.isAtEnd()) {
      try {
        const stmt = this.parseStatement();
        if (stmt) {
          statements.push(stmt);
        }
      } catch {
        this.synchronize();
      }
    }

    const closeBrace = this.consume(TokenType.CloseBrace, "Expected '}' to end block.");

    return {
      kind: 'Block',
      statements,
      span: {
        start: openBrace.span.start,
        end: closeBrace.span.end,
        line: openBrace.span.line,
        column: openBrace.span.column,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Statements
  // ---------------------------------------------------------------------------

  private parseStatement(): Stmt {
    if (this.check(TokenType.Let)) {
      return this.parseLetStatement();
    }
    if (this.check(TokenType.With)) {
      return this.parseWithStatement();
    }
    if (this.check(TokenType.Return)) {
      return this.parseReturnStatement();
    }
    return this.parseExpressionStatement();
  }

  private parseLetStatement(): LetStmt {
    const letToken = this.consume(TokenType.Let, "Expected 'let'.");
    let isMut = false;
    if (this.match(TokenType.Mut)) {
      isMut = true;
    }

    const nameToken = this.consume(TokenType.Identifier, 'Expected identifier after let.');
    let typeAnnotation: TypeAnnotation | undefined;
    if (this.match(TokenType.Colon)) {
      typeAnnotation = this.parseTypeAnnotation();
    }

    let initializer: Expr | undefined;
    if (this.match(TokenType.Equal)) {
      initializer = this.parseExpression();
    }

    this.match(TokenType.Semicolon); // optional semicolon

    return {
      kind: 'LetStmt',
      isMut,
      name: nameToken.lexeme,
      typeAnnotation,
      initializer,
      span: {
        start: letToken.span.start,
        end: initializer?.span.end ?? nameToken.span.end,
        line: letToken.span.line,
        column: letToken.span.column,
      },
    };
  }

  private parseWithStatement(): WithStmt {
    const withToken = this.consume(TokenType.With, "Expected 'with'.");
    const resource = this.parseExpression();
    let alias: string | undefined;

    if (this.match(TokenType.As)) {
      const aliasToken = this.consume(TokenType.Identifier, "Expected identifier after 'as'.");
      alias = aliasToken.lexeme;
    }

    const body = this.parseBlock();

    return {
      kind: 'WithStmt',
      resource,
      alias,
      body,
      span: {
        start: withToken.span.start,
        end: body.span.end,
        line: withToken.span.line,
        column: withToken.span.column,
      },
    };
  }

  private parseReturnStatement(): ReturnStmt {
    const returnToken = this.consume(TokenType.Return, "Expected 'return'.");
    let value: Expr | undefined;

    if (!this.check(TokenType.Semicolon) && !this.check(TokenType.CloseBrace)) {
      value = this.parseExpression();
    }

    this.match(TokenType.Semicolon);

    return {
      kind: 'ReturnStmt',
      value,
      span: {
        start: returnToken.span.start,
        end: value?.span.end ?? returnToken.span.end,
        line: returnToken.span.line,
        column: returnToken.span.column,
      },
    };
  }

  private parseExpressionStatement(): Stmt {
    const expr = this.parseExpression();
    this.match(TokenType.Semicolon); // optional semicolon

    return {
      kind: 'ExprStmt',
      expression: expr,
      span: expr.span,
    };
  }

  // ---------------------------------------------------------------------------
  // Expressions (Precedence Climbing)
  // ---------------------------------------------------------------------------

  public parseExpression(): Expr {
    return this.parsePipeline();
  }

  // Pipeline Operator: left |> right
  private parsePipeline(): Expr {
    let expr = this.parseOptionFallback();

    while (this.match(TokenType.Pipeline)) {
      const right = this.parseOptionFallback();
      expr = {
        kind: 'PipelineExpr',
        left: expr,
        right,
        span: {
          start: expr.span.start,
          end: right.span.end,
          line: expr.span.line,
          column: expr.span.column,
        },
      } as PipelineExpr;
    }

    return expr;
  }

  // Option Fallback: left ?? right
  private parseOptionFallback(): Expr {
    let expr = this.parseLogicalOr();

    while (this.match(TokenType.OptionFallback)) {
      const right = this.parseLogicalOr();
      expr = {
        kind: 'OptionFallbackExpr',
        left: expr,
        right,
        span: {
          start: expr.span.start,
          end: right.span.end,
          line: expr.span.line,
          column: expr.span.column,
        },
      } as OptionFallbackExpr;
    }

    return expr;
  }

  // Logical OR: left or right
  private parseLogicalOr(): Expr {
    let expr = this.parseLogicalAnd();

    while (this.match(TokenType.Or)) {
      const operator = 'or';
      const right = this.parseLogicalAnd();
      expr = {
        kind: 'BinaryExpr',
        operator,
        left: expr,
        right,
        span: {
          start: expr.span.start,
          end: right.span.end,
          line: expr.span.line,
          column: expr.span.column,
        },
      };
    }

    return expr;
  }

  // Logical AND: left and right
  private parseLogicalAnd(): Expr {
    let expr = this.parseEquality();

    while (this.match(TokenType.And)) {
      const operator = 'and';
      const right = this.parseEquality();
      expr = {
        kind: 'BinaryExpr',
        operator,
        left: expr,
        right,
        span: {
          start: expr.span.start,
          end: right.span.end,
          line: expr.span.line,
          column: expr.span.column,
        },
      };
    }

    return expr;
  }

  // Equality: ==, !=
  private parseEquality(): Expr {
    let expr = this.parseComparison();

    while (this.match(TokenType.EqualEqual, TokenType.BangEqual)) {
      const operator = this.previous().lexeme;
      const right = this.parseComparison();
      expr = {
        kind: 'BinaryExpr',
        operator,
        left: expr,
        right,
        span: {
          start: expr.span.start,
          end: right.span.end,
          line: expr.span.line,
          column: expr.span.column,
        },
      };
    }

    return expr;
  }

  // Comparison: <, <=, >, >=
  private parseComparison(): Expr {
    let expr = this.parseAdditive();

    while (this.match(TokenType.Less, TokenType.LessEqual, TokenType.Greater, TokenType.GreaterEqual)) {
      const operator = this.previous().lexeme;
      const right = this.parseAdditive();
      expr = {
        kind: 'BinaryExpr',
        operator,
        left: expr,
        right,
        span: {
          start: expr.span.start,
          end: right.span.end,
          line: expr.span.line,
          column: expr.span.column,
        },
      };
    }

    return expr;
  }

  // Additive: +, -
  private parseAdditive(): Expr {
    let expr = this.parseMultiplicative();

    while (this.match(TokenType.Plus, TokenType.Minus)) {
      const operator = this.previous().lexeme;
      const right = this.parseMultiplicative();
      expr = {
        kind: 'BinaryExpr',
        operator,
        left: expr,
        right,
        span: {
          start: expr.span.start,
          end: right.span.end,
          line: expr.span.line,
          column: expr.span.column,
        },
      };
    }

    return expr;
  }

  // Multiplicative: *, /, %
  private parseMultiplicative(): Expr {
    let expr = this.parseUnary();

    while (this.match(TokenType.Star, TokenType.Slash, TokenType.Percent)) {
      const operator = this.previous().lexeme;
      const right = this.parseUnary();
      expr = {
        kind: 'BinaryExpr',
        operator,
        left: expr,
        right,
        span: {
          start: expr.span.start,
          end: right.span.end,
          line: expr.span.line,
          column: expr.span.column,
        },
      };
    }

    return expr;
  }

  // Unary: not, -
  private parseUnary(): Expr {
    if (this.match(TokenType.Not, TokenType.Minus)) {
      const op = this.previous();
      const operand = this.parseUnary();
      return {
        kind: 'UnaryExpr',
        operator: op.lexeme,
        operand,
        span: {
          start: op.span.start,
          end: operand.span.end,
          line: op.span.line,
          column: op.span.column,
        },
      };
    }

    return this.parsePostfix();
  }

  // Postfix: ?, (), ., ?.
  private parsePostfix(): Expr {
    let expr = this.parsePrimary();

    while (true) {
      if (this.match(TokenType.Question)) {
        // Option/Result propagation: expr?
        expr = {
          kind: 'OptionPropagateExpr',
          operand: expr,
          span: {
            start: expr.span.start,
            end: this.previous().span.end,
            line: expr.span.line,
            column: expr.span.column,
          },
        } as OptionPropagateExpr;
      } else if (this.match(TokenType.OpenParen)) {
        // Function call: expr(args)
        const args: Expr[] = [];
        if (!this.check(TokenType.CloseParen)) {
          do {
            args.push(this.parseExpression());
          } while (this.match(TokenType.Comma));
        }
        const closeParen = this.consume(TokenType.CloseParen, "Expected ')' after call arguments.");
        expr = {
          kind: 'CallExpr',
          callee: expr,
          args,
          span: {
            start: expr.span.start,
            end: closeParen.span.end,
            line: expr.span.line,
            column: expr.span.column,
          },
        } as CallExpr;
      } else if (this.match(TokenType.Dot)) {
        // Member access: expr.prop
        const prop = this.consume(TokenType.Identifier, 'Expected property identifier after dot.');
        expr = {
          kind: 'MemberExpr',
          object: expr,
          property: prop.lexeme,
          isOptional: false,
          span: {
            start: expr.span.start,
            end: prop.span.end,
            line: expr.span.line,
            column: expr.span.column,
          },
        };
      } else if (this.match(TokenType.QuestionDot)) {
        // Safe navigation: expr?.prop
        const prop = this.consume(TokenType.Identifier, 'Expected property identifier after ?. operator.');
        expr = {
          kind: 'MemberExpr',
          object: expr,
          property: prop.lexeme,
          isOptional: true,
          span: {
            start: expr.span.start,
            end: prop.span.end,
            line: expr.span.line,
            column: expr.span.column,
          },
        };
      } else {
        break;
      }
    }

    return expr;
  }

  // Primary: Identifiers, Literals, Grouping
  private parsePrimary(): Expr {
    if (this.match(TokenType.IntLiteral, TokenType.FloatLiteral, TokenType.StringLiteral, TokenType.BoolLiteral)) {
      const tok = this.previous();
      return {
        kind: 'Literal',
        value: tok.value as string | number | boolean,
        raw: tok.lexeme,
        span: tok.span,
      } as Literal;
    }

    if (this.match(TokenType.Identifier)) {
      const tok = this.previous();
      return {
        kind: 'Identifier',
        name: tok.lexeme,
        span: tok.span,
      } as Identifier;
    }

    if (this.match(TokenType.OpenParen)) {
      const expr = this.parseExpression();
      this.consume(TokenType.CloseParen, "Expected ')' after grouped expression.");
      return expr;
    }

    const currentToken = this.peek();
    this.diagnostics.reportError(
      'E1010',
      `Unexpected token '${currentToken.lexeme || currentToken.type}' in expression`,
      currentToken.span,
      this.file
    );
    throw new Error(`Parse error at line ${currentToken.span.line}`);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.Eof;
  }

  private peek(): Token {
    return this.tokens[this.current] ?? this.tokens[this.tokens.length - 1];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();

    const tok = this.peek();
    this.diagnostics.reportError('E1011', message, tok.span, this.file);
    throw new Error(message);
  }

  private synchronize(): void {
    this.advance();

    while (!this.isAtEnd()) {
      if (this.previous().type === TokenType.Semicolon) return;

      switch (this.peek().type) {
        case TokenType.Fn:
        case TokenType.Let:
        case TokenType.With:
        case TokenType.Return:
        case TokenType.Struct:
        case TokenType.Trait:
          return;
      }

      this.advance();
    }
  }
}
