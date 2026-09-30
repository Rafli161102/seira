/**
 * Seira Parser
 *
 * Recursive-descent parser constructing a source-aware AST from tokens.
 * Enforces locked syntax rules and operator precedence:
 * - Assignment & Bindings: =, +=, -=, *=, /=, %=
 * - Pipelines: |>
 * - Option fallback: ??
 * - Logical disjunction: or
 * - Logical conjunction: and
 * - Equality: ==, !=
 * - Comparison: <, <=, >, >=
 * - Range: .., ..<
 * - Additive: +, -
 * - Multiplicative: *, /, %
 * - Unary: not, -
 * - Postfix: propagation ?, calls (), member access ., safe access ?.
 * - Primary: literals (int, uint, float, string, char, bool), identifiers, grouping, if expressions, block expressions
 * - Functions: block body { ... } and expression body => expr
 * - Deterministic error recovery synchronizing on statement and declaration boundaries.
 */

import type {
  AssignmentExpr,
  AssignStmt,
  BindingStmt,
  Block,
  BlockExpr,
  CallExpr,
  ConstStmt,
  EnumDecl,
  EnumVariant,
  Expr,
  FunctionDecl,
  Identifier,
  IfExpr,
  ImportDecl,
  LetStmt,
  Literal,
  ModuleDecl,
  OptionFallbackExpr,
  OptionPropagateExpr,
  Param,
  PipelineExpr,
  Program,
  RangeExpr,
  ReturnStmt,
  Stmt,
  StructDecl,
  TopLevelItem,
  TraitDecl,
  TypeAliasDecl,
  TypeAnnotation,
  WithStmt,
} from '../ast/ast.ts';
import { DiagnosticBag } from '../diagnostics/index.ts';
import type { Span } from '../source/span.ts';
import { type Token, TokenType } from '../lexer/token.ts';

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

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
      } catch (err) {
        if (err instanceof ParseError) {
          this.synchronize();
        } else {
          throw err;
        }
      }
    }

    const endSpan = this.previous()?.span ?? startSpan;
    return {
      kind: 'Program',
      items,
      span: {
        start: startSpan.start,
        end: endSpan.end,
        sourceId: startSpan.sourceId,
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
    if (this.check(TokenType.Struct)) {
      return this.parseStructDecl();
    }
    if (this.check(TokenType.Enum)) {
      return this.parseEnumDecl();
    }
    if (this.check(TokenType.Type)) {
      return this.parseTypeAliasDecl();
    }
    if (this.check(TokenType.Trait)) {
      return this.parseTraitDecl();
    }
    if (this.check(TokenType.Import)) {
      return this.parseImportDecl();
    }

    return this.parseStatement();
  }

  // ---------------------------------------------------------------------------
  // Declarations
  // ---------------------------------------------------------------------------

  private parseFunctionDecl(): FunctionDecl {
    const fnToken = this.consume(TokenType.Fn, "Expected 'fn' keyword.");
    let isEffectful = false;

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

    // Expression-style function: fn add(a, b) => a + b
    if (this.match(TokenType.FatArrow)) {
      const expr = this.parseExpression();
      this.match(TokenType.Semicolon); // optional semicolon
      const blockSpan: Span = {
        start: expr.span.start,
        end: expr.span.end,
        sourceId: expr.span.sourceId,
        line: expr.span.line,
        column: expr.span.column,
      };

      const block: Block = {
        kind: 'Block',
        statements: [
          {
            kind: 'ReturnStmt',
            value: expr,
            span: expr.span,
          },
        ],
        span: blockSpan,
      };

      return {
        kind: 'FunctionDecl',
        name: nameToken.lexeme,
        isEffectful,
        params,
        returnType,
        body: block,
        bodyExpr: expr,
        isExpressionBody: true,
        span: {
          start: fnToken.span.start,
          end: expr.span.end,
          sourceId: fnToken.span.sourceId,
          line: fnToken.span.line,
          column: fnToken.span.column,
        },
      };
    }

    // Standard block body: fn name(...) { ... }
    const body = this.parseBlock();

    return {
      kind: 'FunctionDecl',
      name: nameToken.lexeme,
      isEffectful,
      params,
      returnType,
      body,
      isExpressionBody: false,
      span: {
        start: fnToken.span.start,
        end: body.span.end,
        sourceId: fnToken.span.sourceId,
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
            sourceId: paramName.span.sourceId,
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
        sourceId: nameToken.span.sourceId,
        line: nameToken.span.line,
        column: nameToken.span.column,
      },
    };
  }

  private parseStructDecl(): StructDecl {
    const structToken = this.consume(TokenType.Struct, "Expected 'struct'.");
    const nameToken = this.consume(TokenType.Identifier, 'Expected struct name.');
    this.consume(TokenType.OpenBrace, "Expected '{' after struct name.");

    const fields: { name: string; type: TypeAnnotation }[] = [];
    while (!this.check(TokenType.CloseBrace) && !this.isAtEnd()) {
      const fieldName = this.consume(TokenType.Identifier, 'Expected field name.');
      this.consume(TokenType.Colon, "Expected ':' after field name.");
      const fieldType = this.parseTypeAnnotation();
      fields.push({ name: fieldName.lexeme, type: fieldType });
      this.match(TokenType.Comma);
    }

    const closeBrace = this.consume(TokenType.CloseBrace, "Expected '}' after struct body.");
    return {
      kind: 'StructDecl',
      name: nameToken.lexeme,
      fields,
      span: {
        start: structToken.span.start,
        end: closeBrace.span.end,
        sourceId: structToken.span.sourceId,
        line: structToken.span.line,
        column: structToken.span.column,
      },
    };
  }

  private parseEnumDecl(): EnumDecl {
    const enumToken = this.consume(TokenType.Enum, "Expected 'enum'.");
    const nameToken = this.consume(TokenType.Identifier, 'Expected enum name.');
    this.consume(TokenType.OpenBrace, "Expected '{' after enum name.");

    const variants: EnumVariant[] = [];
    while (!this.check(TokenType.CloseBrace) && !this.isAtEnd()) {
      const variantName = this.consume(TokenType.Identifier, 'Expected enum variant name.');
      let typeAnnotation: TypeAnnotation | undefined;
      if (this.match(TokenType.OpenParen)) {
        typeAnnotation = this.parseTypeAnnotation();
        this.consume(TokenType.CloseParen, "Expected ')' after enum variant type.");
      }
      variants.push({
        name: variantName.lexeme,
        typeAnnotation,
        span: {
          start: variantName.span.start,
          end: this.previous().span.end,
          sourceId: variantName.span.sourceId,
          line: variantName.span.line,
          column: variantName.span.column,
        },
      });
      this.match(TokenType.Comma);
    }

    const closeBrace = this.consume(TokenType.CloseBrace, "Expected '}' after enum body.");
    return {
      kind: 'EnumDecl',
      name: nameToken.lexeme,
      variants,
      span: {
        start: enumToken.span.start,
        end: closeBrace.span.end,
        sourceId: enumToken.span.sourceId,
        line: enumToken.span.line,
        column: enumToken.span.column,
      },
    };
  }

  private parseTypeAliasDecl(): TypeAliasDecl {
    const typeToken = this.consume(TokenType.Type, "Expected 'type'.");
    const nameToken = this.consume(TokenType.Identifier, 'Expected type alias name.');
    this.consume(TokenType.Equal, "Expected '=' after type alias name.");
    const targetType = this.parseTypeAnnotation();
    this.match(TokenType.Semicolon);

    return {
      kind: 'TypeAliasDecl',
      name: nameToken.lexeme,
      targetType,
      span: {
        start: typeToken.span.start,
        end: targetType.span.end,
        sourceId: typeToken.span.sourceId,
        line: typeToken.span.line,
        column: typeToken.span.column,
      },
    };
  }

  private parseTraitDecl(): TraitDecl {
    const traitToken = this.consume(TokenType.Trait, "Expected 'trait'.");
    const nameToken = this.consume(TokenType.Identifier, 'Expected trait name.');
    this.consume(TokenType.OpenBrace, "Expected '{' after trait name.");

    const methods: FunctionDecl[] = [];
    while (!this.check(TokenType.CloseBrace) && !this.isAtEnd()) {
      if (this.check(TokenType.Fn)) {
        methods.push(this.parseFunctionDecl());
      } else {
        this.advance();
      }
    }

    const closeBrace = this.consume(TokenType.CloseBrace, "Expected '}' after trait body.");
    return {
      kind: 'TraitDecl',
      name: nameToken.lexeme,
      methods,
      span: {
        start: traitToken.span.start,
        end: closeBrace.span.end,
        sourceId: traitToken.span.sourceId,
        line: traitToken.span.line,
        column: traitToken.span.column,
      },
    };
  }

  private parseImportDecl(): ImportDecl {
    const importToken = this.consume(TokenType.Import, "Expected 'import'.");
    const pathToken = this.consume(TokenType.Identifier, 'Expected module path.');
    let alias: string | undefined;

    if (this.match(TokenType.As)) {
      const aliasToken = this.consume(TokenType.Identifier, "Expected identifier after 'as'.");
      alias = aliasToken.lexeme;
    }

    this.match(TokenType.Semicolon);

    return {
      kind: 'ImportDecl',
      path: pathToken.lexeme,
      alias,
      span: {
        start: importToken.span.start,
        end: this.previous().span.end,
        sourceId: importToken.span.sourceId,
        line: importToken.span.line,
        column: importToken.span.column,
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
    if (this.check(TokenType.Const)) {
      return this.parseConstStatement();
    }
    if (this.check(TokenType.Mut)) {
      return this.parseBareBindingStatement(true);
    }
    if (this.check(TokenType.With)) {
      return this.parseWithStatement();
    }
    if (this.check(TokenType.Return)) {
      return this.parseReturnStatement();
    }

    // Check if statement is bare immutable binding: name = expr
    if (this.isBareBinding()) {
      return this.parseBareBindingStatement(false);
    }

    return this.parseExpressionStatement();
  }

  private isBareBinding(): boolean {
    if (this.current + 1 < this.tokens.length) {
      const first = this.tokens[this.current];
      const second = this.tokens[this.current + 1];
      if (first.type === TokenType.Identifier && second.type === TokenType.Equal) {
        return true;
      }
      if (
        first.type === TokenType.Identifier &&
        second.type === TokenType.Colon &&
        this.current + 3 < this.tokens.length
      ) {
        // e.g. name: Type = expr
        let idx = this.current + 2;
        while (idx < this.tokens.length && this.tokens[idx].type !== TokenType.Equal && this.tokens[idx].type !== TokenType.Semicolon) {
          idx++;
        }
        return idx < this.tokens.length && this.tokens[idx].type === TokenType.Equal;
      }
    }
    return false;
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

    this.consume(TokenType.Semicolon, "Expected ';' after let statement.");

    return {
      kind: 'LetStmt',
      isMut,
      name: nameToken.lexeme,
      typeAnnotation,
      initializer,
      span: {
        start: letToken.span.start,
        end: initializer?.span.end ?? nameToken.span.end,
        sourceId: letToken.span.sourceId,
        line: letToken.span.line,
        column: letToken.span.column,
      },
    };
  }

  private parseConstStatement(): ConstStmt {
    const constToken = this.consume(TokenType.Const, "Expected 'const'.");
    const nameToken = this.consume(TokenType.Identifier, 'Expected identifier after const.');
    let typeAnnotation: TypeAnnotation | undefined;
    if (this.match(TokenType.Colon)) {
      typeAnnotation = this.parseTypeAnnotation();
    }

    this.consume(TokenType.Equal, "Expected '=' in const declaration.");
    const initializer = this.parseExpression();
    this.match(TokenType.Semicolon);

    return {
      kind: 'ConstStmt',
      name: nameToken.lexeme,
      typeAnnotation,
      initializer,
      span: {
        start: constToken.span.start,
        end: initializer.span.end,
        sourceId: constToken.span.sourceId,
        line: constToken.span.line,
        column: constToken.span.column,
      },
    };
  }

  private parseBareBindingStatement(isMut: boolean): BindingStmt {
    let startSpan: Span;
    if (isMut) {
      const mutToken = this.consume(TokenType.Mut, "Expected 'mut'.");
      startSpan = mutToken.span;
    }

    const nameToken = this.consume(TokenType.Identifier, 'Expected identifier.');
    if (!isMut) {
      startSpan = nameToken.span;
    }

    let typeAnnotation: TypeAnnotation | undefined;
    if (this.match(TokenType.Colon)) {
      typeAnnotation = this.parseTypeAnnotation();
    }

    this.consume(TokenType.Equal, "Expected '=' in binding.");
    const initializer = this.parseExpression();
    this.match(TokenType.Semicolon);

    return {
      kind: 'BindingStmt',
      isMut,
      name: nameToken.lexeme,
      typeAnnotation,
      initializer,
      span: {
        start: startSpan!.start,
        end: initializer.span.end,
        sourceId: startSpan!.sourceId,
        line: startSpan!.line,
        column: startSpan!.column,
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
        sourceId: withToken.span.sourceId,
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
        sourceId: returnToken.span.sourceId,
        line: returnToken.span.line,
        column: returnToken.span.column,
      },
    };
  }

  private parseExpressionStatement(): Stmt {
    const expr = this.parseExpression();

    // Check for compound assignment or reassignment: target += value
    if (
      this.match(
        TokenType.Equal,
        TokenType.PlusEqual,
        TokenType.MinusEqual,
        TokenType.StarEqual,
        TokenType.SlashEqual,
        TokenType.PercentEqual
      )
    ) {
      const op = this.previous().lexeme;
      const value = this.parseExpression();
      this.match(TokenType.Semicolon);
      return {
        kind: 'AssignStmt',
        operator: op,
        target: expr,
        value,
        span: {
          start: expr.span.start,
          end: value.span.end,
          sourceId: expr.span.sourceId,
          line: expr.span.line,
          column: expr.span.column,
        },
      };
    }

    this.match(TokenType.Semicolon); // optional semicolon

    return {
      kind: 'ExprStmt',
      expression: expr,
      span: expr.span,
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
      } catch (err) {
        if (err instanceof ParseError) {
          this.synchronize();
        } else {
          throw err;
        }
      }
    }

    const closeBrace = this.consume(TokenType.CloseBrace, "Expected '}' to end block.");

    return {
      kind: 'Block',
      statements,
      span: {
        start: openBrace.span.start,
        end: closeBrace.span.end,
        sourceId: openBrace.span.sourceId,
        line: openBrace.span.line,
        column: openBrace.span.column,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Expressions (Precedence Climbing / Pratt Hierarchy)
  // ---------------------------------------------------------------------------

  public parseExpression(): Expr {
    return this.parseAssignment();
  }

  // Precedence 1: Assignment & Compound Assignment (Right-associative)
  private parseAssignment(): Expr {
    const expr = this.parsePipeline();

    if (
      this.match(
        TokenType.Equal,
        TokenType.PlusEqual,
        TokenType.MinusEqual,
        TokenType.StarEqual,
        TokenType.SlashEqual,
        TokenType.PercentEqual
      )
    ) {
      const op = this.previous().lexeme;
      const value = this.parseAssignment();
      return {
        kind: 'AssignmentExpr',
        operator: op,
        target: expr,
        value,
        span: {
          start: expr.span.start,
          end: value.span.end,
          sourceId: expr.span.sourceId,
          line: expr.span.line,
          column: expr.span.column,
        },
      };
    }

    return expr;
  }

  // Precedence 2: Pipeline Operator: left |> right (Left-associative)
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
          sourceId: expr.span.sourceId,
          line: expr.span.line,
          column: expr.span.column,
        },
      } as PipelineExpr;
    }

    return expr;
  }

  // Precedence 3: Option Fallback: left ?? right (Left-associative)
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
          sourceId: expr.span.sourceId,
          line: expr.span.line,
          column: expr.span.column,
        },
      } as OptionFallbackExpr;
    }

    return expr;
  }

  // Precedence 4: Logical OR: left or right (Left-associative)
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
          sourceId: expr.span.sourceId,
          line: expr.span.line,
          column: expr.span.column,
        },
      };
    }

    return expr;
  }

  // Precedence 5: Logical AND: left and right (Left-associative)
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
          sourceId: expr.span.sourceId,
          line: expr.span.line,
          column: expr.span.column,
        },
      };
    }

    return expr;
  }

  // Precedence 6: Equality: ==, != (Left-associative)
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
          sourceId: expr.span.sourceId,
          line: expr.span.line,
          column: expr.span.column,
        },
      };
    }

    return expr;
  }

  // Precedence 7: Comparison: <, <=, >, >= (Left-associative)
  private parseComparison(): Expr {
    let expr = this.parseRange();

    while (this.match(TokenType.Less, TokenType.LessEqual, TokenType.Greater, TokenType.GreaterEqual)) {
      const operator = this.previous().lexeme;
      const right = this.parseRange();
      expr = {
        kind: 'BinaryExpr',
        operator,
        left: expr,
        right,
        span: {
          start: expr.span.start,
          end: right.span.end,
          sourceId: expr.span.sourceId,
          line: expr.span.line,
          column: expr.span.column,
        },
      };
    }

    return expr;
  }

  // Precedence 8: Range: .., ..< (Left-associative)
  private parseRange(): Expr {
    let expr = this.parseAdditive();

    if (this.match(TokenType.DotDot, TokenType.DotDotLess)) {
      const op = this.previous().type;
      const isHalfOpen = op === TokenType.DotDotLess;
      let end: Expr | undefined;

      // Range can be half-bounded (e.g. 0..)
      if (!this.check(TokenType.CloseParen) && !this.check(TokenType.CloseBracket) && !this.check(TokenType.CloseBrace) && !this.check(TokenType.Semicolon) && !this.check(TokenType.Comma) && !this.isAtEnd()) {
        end = this.parseAdditive();
      }

      expr = {
        kind: 'RangeExpr',
        start: expr,
        end,
        isHalfOpen,
        span: {
          start: expr.span.start,
          end: end?.span.end ?? this.previous().span.end,
          sourceId: expr.span.sourceId,
          line: expr.span.line,
          column: expr.span.column,
        },
      } as RangeExpr;
    }

    return expr;
  }

  // Precedence 9: Additive: +, - (Left-associative)
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
          sourceId: expr.span.sourceId,
          line: expr.span.line,
          column: expr.span.column,
        },
      };
    }

    return expr;
  }

  // Precedence 10: Multiplicative: *, /, % (Left-associative)
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
          sourceId: expr.span.sourceId,
          line: expr.span.line,
          column: expr.span.column,
        },
      };
    }

    return expr;
  }

  // Precedence 11: Unary Prefix: not, -
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
          sourceId: op.span.sourceId,
          line: op.span.line,
          column: op.span.column,
        },
      };
    }

    return this.parsePostfix();
  }

  // Precedence 12: Postfix: ?, (), ., ?.
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
            sourceId: expr.span.sourceId,
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
            sourceId: expr.span.sourceId,
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
            sourceId: expr.span.sourceId,
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
            sourceId: expr.span.sourceId,
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

  // Precedence 13: Primary: Literals, Identifiers, Grouping, IfExpr, BlockExpr
  private parsePrimary(): Expr {
    // If expression: if cond { ... } else { ... }
    if (this.check(TokenType.If)) {
      return this.parseIfExpr();
    }

    // Block expression: { ... }
    if (this.check(TokenType.OpenBrace)) {
      const block = this.parseBlock();
      return {
        kind: 'BlockExpr',
        block,
        span: block.span,
      };
    }

    // Literals
    if (
      this.match(
        TokenType.IntLiteral,
        TokenType.UIntLiteral,
        TokenType.FloatLiteral,
        TokenType.StringLiteral,
        TokenType.CharLiteral,
        TokenType.BoolLiteral
      )
    ) {
      const tok = this.previous();
      const literalKind =
        tok.type === TokenType.IntLiteral
          ? 'int'
          : tok.type === TokenType.UIntLiteral
          ? 'uint'
          : tok.type === TokenType.FloatLiteral
          ? 'float'
          : tok.type === TokenType.StringLiteral
          ? 'string'
          : tok.type === TokenType.CharLiteral
          ? 'char'
          : 'bool';

      return {
        kind: 'Literal',
        value: tok.value as string | number | boolean,
        raw: tok.lexeme,
        literalKind,
        span: tok.span,
      } as Literal;
    }

    // Identifiers
    if (this.match(TokenType.Identifier)) {
      const tok = this.previous();
      return {
        kind: 'Identifier',
        name: tok.lexeme,
        span: tok.span,
      } as Identifier;
    }

    // Parenthesized grouping
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
      this.file,
      "Expected an expression (identifier, literal, grouped expression, or 'if')."
    );
    throw new ParseError(`Parse error at line ${currentToken.span.line}`);
  }

  private parseIfExpr(): IfExpr {
    const ifToken = this.consume(TokenType.If, "Expected 'if'.");
    const condition = this.parseExpression();
    const thenBranch = this.parseBlock();
    let elseBranch: Block | IfExpr | undefined;

    if (this.match(TokenType.Else)) {
      if (this.check(TokenType.If)) {
        elseBranch = this.parseIfExpr();
      } else {
        elseBranch = this.parseBlock();
      }
    }

    const endSpan = elseBranch?.span ?? thenBranch.span;
    return {
      kind: 'IfExpr',
      condition,
      thenBranch,
      elseBranch,
      span: {
        start: ifToken.span.start,
        end: endSpan.end,
        sourceId: ifToken.span.sourceId,
        line: ifToken.span.line,
        column: ifToken.span.column,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers & Error Recovery
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
    throw new ParseError(message);
  }

  private synchronize(): void {
    this.advance();

    while (!this.isAtEnd()) {
      if (this.previous().type === TokenType.Semicolon) return;

      switch (this.peek().type) {
        case TokenType.Fn:
        case TokenType.Let:
        case TokenType.Const:
        case TokenType.Mut:
        case TokenType.With:
        case TokenType.Return:
        case TokenType.Struct:
        case TokenType.Enum:
        case TokenType.Type:
        case TokenType.Trait:
        case TokenType.If:
        case TokenType.While:
        case TokenType.For:
        case TokenType.Loop:
          return;
      }

      this.advance();
    }
  }
}
