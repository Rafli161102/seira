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
  BreakStmt,
  CallExpr,
  ConstStmt,
  ConstructorPattern,
  ContinueStmt,
  EnumDecl,
  EnumVariant,
  Expr,
  ForStmt,
  FunctionDecl,
  GenericParamNode,
  Identifier,
  IdentifierPattern,
  IfExpr,
  ImplDecl,
  ImportDecl,
  IndexExpr,
  LambdaExpr,
  LetStmt,
  ListLiteral,
  Literal,
  LiteralPattern,
  LoopStmt,
  MapEntry,
  MapLiteral,
  MatchArm,
  MatchExpr,
  MemberExpr,
  ModuleDecl,
  OptionFallbackExpr,
  OptionPropagateExpr,
  Param,
  Pattern,
  PipelineExpr,
  Program,
  RangeExpr,
  ReturnStmt,
  SetLiteral,
  Stmt,
  StructDecl,
  TopLevelItem,
  TraitDecl,
  TupleLiteral,
  TypeAliasDecl,
  TypeAnnotation,
  UseDecl,
  WhileStmt,
  WildcardPattern,
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
    if (this.match(TokenType.Pub)) {
      const pubToken = this.previous();
      if (this.check(TokenType.Fn)) {
        return this.parseFunctionDecl(false, true, pubToken);
      }
      if (this.check(TokenType.Struct)) {
        return this.parseStructDecl(true, pubToken);
      }
      if (this.check(TokenType.Enum)) {
        return this.parseEnumDecl(true, pubToken);
      }
      if (this.check(TokenType.Type)) {
        return this.parseTypeAliasDecl(true, pubToken);
      }
      if (this.check(TokenType.Trait)) {
        return this.parseTraitDecl(true, pubToken);
      }
      if (this.check(TokenType.Const)) {
        return this.parseConstStatement(true, pubToken);
      }
      if (this.check(TokenType.Use)) {
        return this.parseUseDecl(true, pubToken);
      }
      if (this.check(TokenType.Import)) {
        return this.parseImportDecl(true, pubToken);
      }
      this.diagnostics.reportError(
        'E1010',
        "Expected 'fn', 'struct', 'enum', 'type', 'trait', 'const', 'use', or 'import' after 'pub'.",
        pubToken.span,
        this.file
      );
      return null;
    }

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
    if (this.check(TokenType.Impl)) {
      return this.parseImplDecl();
    }
    if (this.check(TokenType.Import)) {
      return this.parseImportDecl();
    }
    if (this.check(TokenType.Use)) {
      return this.parseUseDecl();
    }

    return this.parseStatement();
  }

  // ---------------------------------------------------------------------------
  // Declarations
  // ---------------------------------------------------------------------------

  private parseGenericParamList(): GenericParamNode[] {
    this.consume(TokenType.Less, "Expected '<'.");
    const params: GenericParamNode[] = [];
    do {
      const nameToken = this.consume(TokenType.Identifier, 'Expected generic parameter name.');
      let constraint: TypeAnnotation | undefined;
      if (this.match(TokenType.Colon)) {
        constraint = this.parseTypeAnnotation();
      }
      params.push({
        kind: 'GenericParam',
        name: nameToken.lexeme,
        constraint,
        span: {
          start: nameToken.span.start,
          end: constraint ? constraint.span.end : nameToken.span.end,
          sourceId: nameToken.span.sourceId,
          line: nameToken.span.line,
          column: nameToken.span.column,
        },
      });
    } while (this.match(TokenType.Comma));
    this.consume(TokenType.Greater, "Expected '>' after generic parameter list.");
    return params;
  }

  private parseFunctionDecl(allowSignatureOnly = false, isPublic: boolean = false, pubToken?: Token): FunctionDecl {
    const fnToken = this.consume(TokenType.Fn, "Expected 'fn' keyword.");
    const startSpan = pubToken ? pubToken.span : fnToken.span;
    let isEffectful = false;

    const nameToken = this.consume(TokenType.Identifier, "Expected function name after 'fn'.");
    if (this.match(TokenType.Bang)) {
      isEffectful = true;
    }

    let genericParams: GenericParamNode[] | undefined;
    if (this.check(TokenType.Less)) {
      genericParams = this.parseGenericParamList();
    }

    this.consume(TokenType.OpenParen, "Expected '(' after function name.");
    const params = this.parseParamList();
    this.consume(TokenType.CloseParen, "Expected ')' after parameter list.");

    let returnType: TypeAnnotation | undefined;
    if (this.match(TokenType.Arrow)) {
      returnType = this.parseTypeAnnotation();
    }

    if (allowSignatureOnly && !this.check(TokenType.FatArrow) && !this.check(TokenType.OpenBrace)) {
      return {
        kind: 'FunctionDecl',
        name: nameToken.lexeme,
        isEffectful,
        genericParams,
        params,
        returnType,
        isPublic,
        body: {
          kind: 'Block',
          statements: [],
          span: {
            start: startSpan.start,
            end: this.previous().span.end,
            sourceId: startSpan.sourceId,
            line: startSpan.line,
            column: startSpan.column,
          },
        },
        isExpressionBody: false,
        span: {
          start: startSpan.start,
          end: this.previous().span.end,
          sourceId: startSpan.sourceId,
          line: startSpan.line,
          column: startSpan.column,
        },
      };
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
        genericParams,
        params,
        returnType,
        isPublic,
        body: block,
        bodyExpr: expr,
        isExpressionBody: true,
        span: {
          start: startSpan.start,
          end: expr.span.end,
          sourceId: startSpan.sourceId,
          line: startSpan.line,
          column: startSpan.column,
        },
      };
    }

    // Standard block body: fn name(...) { ... }
    const body = this.parseBlock();

    return {
      kind: 'FunctionDecl',
      name: nameToken.lexeme,
      isEffectful,
      genericParams,
      params,
      returnType,
      isPublic,
      body,
      isExpressionBody: false,
      span: {
        start: startSpan.start,
        end: body.span.end,
        sourceId: startSpan.sourceId,
        line: startSpan.line,
        column: startSpan.column,
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
    const primary = this.parsePrimaryTypeAnnotation();

    if (this.check(TokenType.Pipe)) {
      const unionTypes: TypeAnnotation[] = [primary];
      while (this.match(TokenType.Pipe)) {
        unionTypes.push(this.parsePrimaryTypeAnnotation());
      }
      return {
        kind: 'TypeAnnotation',
        name: 'Union',
        unionTypes,
        span: {
          start: primary.span.start,
          end: unionTypes[unionTypes.length - 1].span.end,
          sourceId: primary.span.sourceId,
          line: primary.span.line,
          column: primary.span.column,
        },
      };
    }

    return primary;
  }

  private parsePrimaryTypeAnnotation(): TypeAnnotation {
    if (this.match(TokenType.OpenParen)) {
      const startTok = this.previous();
      const innerTypes: TypeAnnotation[] = [];
      if (!this.check(TokenType.CloseParen)) {
        do {
          innerTypes.push(this.parseTypeAnnotation());
        } while (this.match(TokenType.Comma));
      }
      const closeParen = this.consume(TokenType.CloseParen, "Expected ')' in type annotation.");

      let isEffectful = false;
      if (this.match(TokenType.Bang)) {
        isEffectful = true;
      }

      if (this.match(TokenType.Arrow)) {
        const returnType = this.parseTypeAnnotation();
        return {
          kind: 'TypeAnnotation',
          name: 'Function',
          functionParams: innerTypes,
          returnType,
          isEffectful,
          span: {
            start: startTok.span.start,
            end: returnType.span.end,
            sourceId: startTok.span.sourceId,
            line: startTok.span.line,
            column: startTok.span.column,
          },
        };
      }

      if (innerTypes.length === 0) {
        return {
          kind: 'TypeAnnotation',
          name: 'Unit',
          span: {
            start: startTok.span.start,
            end: closeParen.span.end,
            sourceId: startTok.span.sourceId,
            line: startTok.span.line,
            column: startTok.span.column,
          },
        };
      } else if (innerTypes.length === 1) {
        return innerTypes[0];
      } else {
        return {
          kind: 'TypeAnnotation',
          name: 'Tuple',
          generics: innerTypes,
          span: {
            start: startTok.span.start,
            end: closeParen.span.end,
            sourceId: startTok.span.sourceId,
            line: startTok.span.line,
            column: startTok.span.column,
          },
        };
      }
    }

    const nameToken = this.consume(TokenType.Identifier, 'Expected type name.');
    let typeName = nameToken.lexeme;
    let endSpan = nameToken.span;
    while (this.match(TokenType.Dot)) {
      const part = this.consume(TokenType.Identifier, 'Expected identifier after dot in type name.');
      typeName += '.' + part.lexeme;
      endSpan = part.span;
    }

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
      name: typeName,
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

  private parseStructDecl(isPublic: boolean = false, pubToken?: Token): StructDecl {
    const structToken = this.consume(TokenType.Struct, "Expected 'struct'.");
    const startSpan = pubToken ? pubToken.span : structToken.span;
    const nameToken = this.consume(TokenType.Identifier, 'Expected struct name.');
    let genericParams: GenericParamNode[] | undefined;
    if (this.check(TokenType.Less)) {
      genericParams = this.parseGenericParamList();
    }
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
      genericParams,
      fields,
      isPublic,
      span: {
        start: startSpan.start,
        end: closeBrace.span.end,
        sourceId: startSpan.sourceId,
        line: startSpan.line,
        column: startSpan.column,
      },
    };
  }

  private parseEnumDecl(isPublic: boolean = false, pubToken?: Token): EnumDecl {
    const enumToken = this.consume(TokenType.Enum, "Expected 'enum'.");
    const startSpan = pubToken ? pubToken.span : enumToken.span;
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
      isPublic,
      span: {
        start: startSpan.start,
        end: closeBrace.span.end,
        sourceId: startSpan.sourceId,
        line: startSpan.line,
        column: startSpan.column,
      },
    };
  }

  private parseTypeAliasDecl(isPublic: boolean = false, pubToken?: Token): TypeAliasDecl | StructDecl {
    const typeToken = this.consume(TokenType.Type, "Expected 'type'.");
    const startSpan = pubToken ? pubToken.span : typeToken.span;
    const nameToken = this.consume(TokenType.Identifier, 'Expected type name.');
    let genericParams: GenericParamNode[] | undefined;
    if (this.check(TokenType.Less)) {
      genericParams = this.parseGenericParamList();
    }

    // type Box<T> { value: T }
    if (this.check(TokenType.OpenBrace)) {
      this.consume(TokenType.OpenBrace, "Expected '{'.");
      const fields: { name: string; type: TypeAnnotation }[] = [];
      while (!this.check(TokenType.CloseBrace) && !this.isAtEnd()) {
        const fieldName = this.consume(TokenType.Identifier, 'Expected field name.');
        this.consume(TokenType.Colon, "Expected ':' after field name.");
        const fieldType = this.parseTypeAnnotation();
        fields.push({ name: fieldName.lexeme, type: fieldType });
        this.match(TokenType.Comma);
      }
      const closeBrace = this.consume(TokenType.CloseBrace, "Expected '}' after body.");
      return {
        kind: 'StructDecl',
        name: nameToken.lexeme,
        genericParams,
        fields,
        isPublic,
        span: {
          start: startSpan.start,
          end: closeBrace.span.end,
          sourceId: startSpan.sourceId,
          line: startSpan.line,
          column: startSpan.column,
        },
      };
    }

    this.consume(TokenType.Equal, "Expected '=' after type alias name.");
    const targetType = this.parseTypeAnnotation();
    this.match(TokenType.Semicolon);

    return {
      kind: 'TypeAliasDecl',
      name: nameToken.lexeme,
      genericParams,
      targetType,
      isPublic,
      span: {
        start: startSpan.start,
        end: targetType.span.end,
        sourceId: startSpan.sourceId,
        line: startSpan.line,
        column: startSpan.column,
      },
    };
  }

  private parseTraitDecl(isPublic: boolean = false, pubToken?: Token): TraitDecl {
    const traitToken = this.consume(TokenType.Trait, "Expected 'trait'.");
    const startSpan = pubToken ? pubToken.span : traitToken.span;
    const nameToken = this.consume(TokenType.Identifier, 'Expected trait name.');
    let genericParams: GenericParamNode[] | undefined;
    if (this.check(TokenType.Less)) {
      genericParams = this.parseGenericParamList();
    }
    this.consume(TokenType.OpenBrace, "Expected '{' after trait name.");

    const methods: FunctionDecl[] = [];
    while (!this.check(TokenType.CloseBrace) && !this.isAtEnd()) {
      if (this.check(TokenType.Fn)) {
        methods.push(this.parseFunctionDecl(true));
      } else {
        this.advance();
      }
    }

    const closeBrace = this.consume(TokenType.CloseBrace, "Expected '}' after trait body.");
    return {
      kind: 'TraitDecl',
      name: nameToken.lexeme,
      genericParams,
      methods,
      isPublic,
      span: {
        start: startSpan.start,
        end: closeBrace.span.end,
        sourceId: traitToken.span.sourceId,
        line: traitToken.span.line,
        column: traitToken.span.column,
      },
    };
  }

  private parseImplDecl(): ImplDecl {
    const implToken = this.consume(TokenType.Impl, "Expected 'impl'.");
    const targetType = this.parseTypeAnnotation();
    this.consume(TokenType.Colon, "Expected ':' after target type in impl.");
    const traitToken = this.consume(TokenType.Identifier, "Expected trait name after ':' in impl.");
    this.consume(TokenType.OpenBrace, "Expected '{' to start impl body.");

    const methods: FunctionDecl[] = [];
    while (!this.check(TokenType.CloseBrace) && !this.isAtEnd()) {
      if (this.check(TokenType.Fn)) {
        methods.push(this.parseFunctionDecl(false));
      } else {
        this.advance();
      }
    }

    const closeBrace = this.consume(TokenType.CloseBrace, "Expected '}' after impl body.");
    return {
      kind: 'ImplDecl',
      targetType,
      traitName: traitToken.lexeme,
      methods,
      span: {
        start: implToken.span.start,
        end: closeBrace.span.end,
        sourceId: implToken.span.sourceId,
        line: implToken.span.line,
        column: implToken.span.column,
      },
    };
  }

  private parseImportDecl(isPublic: boolean = false, pubToken?: Token): ImportDecl {
    const importToken = this.consume(TokenType.Import, "Expected 'import'.");
    const startSpan = pubToken ? pubToken.span : importToken.span;

    // Check for wildcard import: import *
    if (this.check(TokenType.Star)) {
      const starToken = this.advance();
      this.diagnostics.reportError(
        'E6006',
        "Wildcard imports ('import *') are forbidden in Seira.",
        starToken.span,
        this.file,
        undefined,
        "Import specific modules explicitly."
      );
      this.match(TokenType.Semicolon);
      return {
        kind: 'ImportDecl',
        path: '*',
        isPublic,
        span: {
          start: startSpan.start,
          end: starToken.span.end,
          sourceId: startSpan.sourceId,
          line: startSpan.line,
          column: startSpan.column,
        },
      };
    }

    const parts: string[] = [];
    if (this.check(TokenType.Identifier)) {
      parts.push(this.advance().lexeme);
      while (this.match(TokenType.Dot)) {
        if (this.check(TokenType.Star)) {
          const starToken = this.advance();
          this.diagnostics.reportError(
            'E6006',
            "Wildcard imports ('import ...*') are forbidden in Seira.",
            starToken.span,
            this.file,
            undefined,
            "Import specific modules explicitly."
          );
          break;
        }
        const part = this.consume(TokenType.Identifier, "Expected identifier after '.' in import path.");
        parts.push(part.lexeme);
      }
    } else {
      this.diagnostics.reportError(
        'E6006',
        "Expected module path after 'import'.",
        this.peek().span,
        this.file
      );
    }

    const path = parts.join('.');
    let alias: string | undefined;

    if (this.match(TokenType.As)) {
      const aliasToken = this.consume(TokenType.Identifier, "Expected identifier after 'as'.");
      alias = aliasToken.lexeme;
    }

    this.match(TokenType.Semicolon);

    return {
      kind: 'ImportDecl',
      path,
      alias,
      isPublic,
      span: {
        start: startSpan.start,
        end: this.previous().span.end,
        sourceId: startSpan.sourceId,
        line: startSpan.line,
        column: startSpan.column,
      },
    };
  }

  private parseUseDecl(isPublic: boolean = false, pubToken?: Token): UseDecl {
    const useToken = this.consume(TokenType.Use, "Expected 'use'.");
    const startSpan = pubToken ? pubToken.span : useToken.span;

    // Check for wildcard use: use *
    if (this.check(TokenType.Star)) {
      const starToken = this.advance();
      this.diagnostics.reportError(
        'E6007',
        "Wildcard imports ('use *') are forbidden in Seira.",
        starToken.span,
        this.file,
        undefined,
        "Import specific symbols explicitly with 'use path.Symbol'."
      );
      this.match(TokenType.Semicolon);
      return {
        kind: 'UseDecl',
        path: '*',
        isPublic,
        span: {
          start: startSpan.start,
          end: starToken.span.end,
          sourceId: startSpan.sourceId,
          line: startSpan.line,
          column: startSpan.column,
        },
      };
    }

    const parts: string[] = [];
    if (this.check(TokenType.Identifier)) {
      parts.push(this.advance().lexeme);
      while (this.match(TokenType.Dot)) {
        if (this.check(TokenType.Star)) {
          const starToken = this.advance();
          this.diagnostics.reportError(
            'E6007',
            "Wildcard imports ('use ...*') are forbidden in Seira.",
            starToken.span,
            this.file,
            undefined,
            "Import specific symbols explicitly."
          );
          break;
        }
        const part = this.consume(TokenType.Identifier, "Expected identifier after '.' in use path.");
        parts.push(part.lexeme);
      }
    } else {
      this.diagnostics.reportError(
        'E6007',
        "Expected symbol path after 'use'.",
        this.peek().span,
        this.file
      );
    }

    const path = parts.join('.');
    let alias: string | undefined;

    if (this.match(TokenType.As)) {
      const aliasToken = this.consume(TokenType.Identifier, "Expected identifier after 'as'.");
      alias = aliasToken.lexeme;
    }

    this.match(TokenType.Semicolon);

    return {
      kind: 'UseDecl',
      path,
      alias,
      isPublic,
      span: {
        start: startSpan.start,
        end: this.previous().span.end,
        sourceId: startSpan.sourceId,
        line: startSpan.line,
        column: startSpan.column,
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
    if (this.check(TokenType.Use)) {
      return this.parseUseDecl() as unknown as Stmt;
    }
    if (this.check(TokenType.Import)) {
      return this.parseImportDecl() as unknown as Stmt;
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
    if (this.check(TokenType.While)) {
      return this.parseWhileStatement();
    }
    if (this.check(TokenType.For)) {
      return this.parseForStatement();
    }
    if (this.check(TokenType.Loop)) {
      return this.parseLoopStatement();
    }
    if (this.check(TokenType.Break)) {
      return this.parseBreakStatement();
    }
    if (this.check(TokenType.Continue)) {
      return this.parseContinueStatement();
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

  private parseConstStatement(isPublic: boolean = false, pubToken?: Token): ConstStmt {
    const constToken = this.consume(TokenType.Const, "Expected 'const'.");
    const startSpan = pubToken ? pubToken.span : constToken.span;
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
      isPublic,
      span: {
        start: startSpan.start,
        end: initializer.span.end,
        sourceId: startSpan.sourceId,
        line: startSpan.line,
        column: startSpan.column,
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
    let resource: Expr;
    let alias: string | undefined;

    if (this.peek().type === TokenType.Identifier && this.peekAhead(1)?.type === TokenType.Equal) {
      const aliasToken = this.advance();
      alias = aliasToken.lexeme;
      this.consume(TokenType.Equal, "Expected '=' after identifier in with statement.");
      resource = this.parseExpression();
    } else {
      resource = this.parseExpression();
      if (this.match(TokenType.As)) {
        const aliasToken = this.consume(TokenType.Identifier, "Expected identifier after 'as'.");
        alias = aliasToken.lexeme;
      }
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

  private parseWhileStatement(): WhileStmt {
    const whileToken = this.consume(TokenType.While, "Expected 'while'.");
    const condition = this.parseExpression();
    const body = this.parseBlock();
    return {
      kind: 'WhileStmt',
      condition,
      body,
      span: {
        start: whileToken.span.start,
        end: body.span.end,
        sourceId: whileToken.span.sourceId,
        line: whileToken.span.line,
        column: whileToken.span.column,
      },
    };
  }

  private parseForStatement(): ForStmt {
    const forToken = this.consume(TokenType.For, "Expected 'for'.");
    const varToken = this.consume(TokenType.Identifier, "Expected loop variable name after 'for'.");
    this.consume(TokenType.In, "Expected 'in' after loop variable.");
    const iterable = this.parseExpression();
    const body = this.parseBlock();
    return {
      kind: 'ForStmt',
      variable: varToken.lexeme,
      iterable,
      body,
      span: {
        start: forToken.span.start,
        end: body.span.end,
        sourceId: forToken.span.sourceId,
        line: forToken.span.line,
        column: forToken.span.column,
      },
    };
  }

  private parseLoopStatement(): LoopStmt {
    const loopToken = this.consume(TokenType.Loop, "Expected 'loop'.");
    const body = this.parseBlock();
    return {
      kind: 'LoopStmt',
      body,
      span: {
        start: loopToken.span.start,
        end: body.span.end,
        sourceId: loopToken.span.sourceId,
        line: loopToken.span.line,
        column: loopToken.span.column,
      },
    };
  }

  private parseBreakStatement(): BreakStmt {
    const breakToken = this.consume(TokenType.Break, "Expected 'break'.");
    this.match(TokenType.Semicolon);
    return {
      kind: 'BreakStmt',
      span: breakToken.span,
    };
  }

  private parseContinueStatement(): ContinueStmt {
    const continueToken = this.consume(TokenType.Continue, "Expected 'continue'.");
    this.match(TokenType.Semicolon);
    return {
      kind: 'ContinueStmt',
      span: continueToken.span,
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
    if (this.isLambda()) {
      return this.parseLambda();
    }
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
      const value = this.parseExpression();
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
      } else if (this.isGenericCall()) {
        this.consume(TokenType.Less, "Expected '<'.");
        const typeArguments: TypeAnnotation[] = [];
        do {
          typeArguments.push(this.parseTypeAnnotation());
        } while (this.match(TokenType.Comma));
        this.consume(TokenType.Greater, "Expected '>' after generic type arguments.");
        this.consume(TokenType.OpenParen, "Expected '(' after generic type arguments.");
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
          typeArguments,
          span: {
            start: expr.span.start,
            end: closeParen.span.end,
            sourceId: expr.span.sourceId,
            line: expr.span.line,
            column: expr.span.column,
          },
        } as CallExpr;
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
      } else if (this.match(TokenType.OpenBracket)) {
        // Index access: expr[idx]
        const index = this.parseExpression();
        const closeBracket = this.consume(TokenType.CloseBracket, "Expected ']' after index expression.");
        expr = {
          kind: 'IndexExpr',
          object: expr,
          index,
          span: {
            start: expr.span.start,
            end: closeBracket.span.end,
            sourceId: expr.span.sourceId,
            line: expr.span.line,
            column: expr.span.column,
          },
        } as IndexExpr;
      } else if (this.match(TokenType.Dot)) {
        // Member access: expr.prop or tuple positional access expr.0
        let propName: string;
        let endSpan: Span;
        if (this.match(TokenType.IntLiteral)) {
          const prop = this.previous();
          propName = prop.lexeme;
          endSpan = prop.span;
        } else {
          const prop = this.consume(TokenType.Identifier, 'Expected property identifier after dot.');
          propName = prop.lexeme;
          endSpan = prop.span;
        }
        expr = {
          kind: 'MemberExpr',
          object: expr,
          property: propName,
          isOptional: false,
          span: {
            start: expr.span.start,
            end: endSpan.end,
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

  private isGenericCall(): boolean {
    if (!this.check(TokenType.Less)) return false;
    let i = 0;
    let depth = 0;
    while (this.current + i < this.tokens.length) {
      const tok = this.tokens[this.current + i];
      if (tok.type === TokenType.Less) {
        depth++;
      } else if (tok.type === TokenType.Greater) {
        depth--;
        if (depth === 0) {
          const next = this.tokens[this.current + i + 1];
          return next !== undefined && next.type === TokenType.OpenParen;
        }
      } else if (
        tok.type === TokenType.Semicolon ||
        tok.type === TokenType.OpenBrace ||
        tok.type === TokenType.CloseBrace ||
        tok.type === TokenType.Equal ||
        tok.type === TokenType.Eof
      ) {
        return false;
      }
      i++;
    }
    return false;
  }

  // Precedence 13: Primary: Literals, Identifiers, Grouping, IfExpr, BlockExpr, Match, Collections
  private parsePrimary(): Expr {
    // If expression: if cond { ... } else { ... }
    if (this.check(TokenType.If)) {
      return this.parseIfExpr();
    }

    // Match expression: match val { ... }
    if (this.check(TokenType.Match)) {
      return this.parseMatchExpr();
    }

    // Set literal: set[...]
    if (
      this.check(TokenType.Identifier) &&
      this.peek().lexeme === 'set' &&
      this.peekAhead(1)?.type === TokenType.OpenBracket
    ) {
      return this.parseSetLiteral();
    }

    // List literal: [...]
    if (this.check(TokenType.OpenBracket)) {
      return this.parseListLiteral();
    }

    // Map literal: { key: value, ... } vs Block expression: { stmt; stmt }
    if (this.isMapLiteral()) {
      return this.parseMapLiteral();
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

    // Parenthesized grouping or Tuple literal
    if (this.match(TokenType.OpenParen)) {
      const openParen = this.previous();
      if (this.match(TokenType.CloseParen)) {
        // Empty tuple: ()
        return {
          kind: 'TupleLiteral',
          elements: [],
          span: {
            start: openParen.span.start,
            end: this.previous().span.end,
            sourceId: openParen.span.sourceId,
            line: openParen.span.line,
            column: openParen.span.column,
          },
        } as TupleLiteral;
      }
      const first = this.parseExpression();
      if (this.match(TokenType.Comma)) {
        // Tuple with 1+ elements: (a, b, ...) or (a,)
        const elements: Expr[] = [first];
        while (!this.check(TokenType.CloseParen) && !this.isAtEnd()) {
          elements.push(this.parseExpression());
          if (!this.match(TokenType.Comma)) break;
        }
        const closeParen = this.consume(TokenType.CloseParen, "Expected ')' after tuple elements.");
        return {
          kind: 'TupleLiteral',
          elements,
          span: {
            start: openParen.span.start,
            end: closeParen.span.end,
            sourceId: openParen.span.sourceId,
            line: openParen.span.line,
            column: openParen.span.column,
          },
        } as TupleLiteral;
      }
      this.consume(TokenType.CloseParen, "Expected ')' after grouped expression.");
      return first;
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
  // Lambdas, Match, and Collections Parsing
  // ---------------------------------------------------------------------------

  private isLambda(): boolean {
    if (this.isAtEnd()) return false;

    // Form 1: identifier => ...
    if (this.peek().type === TokenType.Identifier && this.peekAhead(1)?.type === TokenType.FatArrow) {
      return true;
    }

    // Form 2: () => ... or (x, y) => ...
    if (this.peek().type === TokenType.OpenParen) {
      let idx = this.current + 1;
      let depth = 1;
      while (idx < this.tokens.length && depth > 0) {
        if (this.tokens[idx].type === TokenType.OpenParen) depth++;
        else if (this.tokens[idx].type === TokenType.CloseParen) depth--;
        idx++;
      }
      // idx is now immediately after the matching CloseParen
      if (depth === 0 && idx < this.tokens.length && this.tokens[idx].type === TokenType.FatArrow) {
        return true;
      }
    }

    return false;
  }

  private parseLambda(): LambdaExpr {
    const startSpan = this.peek().span;
    const params: Param[] = [];

    if (this.peek().type === TokenType.Identifier && this.peekAhead(1)?.type === TokenType.FatArrow) {
      const idTok = this.advance();
      this.advance(); // consume '=>'
      params.push({
        kind: 'Param',
        name: idTok.lexeme,
        isMut: false,
        span: idTok.span,
      });
    } else {
      this.consume(TokenType.OpenParen, "Expected '(' at start of lambda parameter list.");
      if (!this.check(TokenType.CloseParen)) {
        do {
          let isMut = false;
          if (this.match(TokenType.Mut)) {
            isMut = true;
          }
          const paramName = this.consume(TokenType.Identifier, 'Expected parameter name in lambda.');
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
      this.consume(TokenType.CloseParen, "Expected ')' after lambda parameters.");
      this.consume(TokenType.FatArrow, "Expected '=>' after lambda parameter list.");
    }

    let body: Expr | Block;
    if (this.check(TokenType.OpenBrace)) {
      body = this.parseBlock();
    } else {
      body = this.parseExpression();
    }

    return {
      kind: 'LambdaExpr',
      params,
      body,
      span: {
        start: startSpan.start,
        end: body.span.end,
        sourceId: startSpan.sourceId,
        line: startSpan.line,
        column: startSpan.column,
      },
    };
  }

  private parseMatchExpr(): MatchExpr {
    const matchToken = this.consume(TokenType.Match, "Expected 'match'.");
    const value = this.parseExpression();
    this.consume(TokenType.OpenBrace, "Expected '{' after match target.");

    const arms: MatchArm[] = [];
    while (!this.check(TokenType.CloseBrace) && !this.isAtEnd()) {
      const pattern = this.parsePattern();
      this.consume(TokenType.FatArrow, "Expected '=>' after pattern.");
      let body: Expr | Block;
      if (this.check(TokenType.OpenBrace)) {
        body = this.parseBlock();
      } else {
        body = this.parseExpression();
      }
      this.match(TokenType.Comma);
      arms.push({
        kind: 'MatchArm',
        pattern,
        body,
        span: {
          start: pattern.span.start,
          end: body.span.end,
          sourceId: pattern.span.sourceId,
          line: pattern.span.line,
          column: pattern.span.column,
        },
      });
    }

    const closeBrace = this.consume(TokenType.CloseBrace, "Expected '}' after match arms.");
    return {
      kind: 'MatchExpr',
      value,
      arms,
      span: {
        start: matchToken.span.start,
        end: closeBrace.span.end,
        sourceId: matchToken.span.sourceId,
        line: matchToken.span.line,
        column: matchToken.span.column,
      },
    };
  }

  private parsePattern(): Pattern {
    const current = this.peek();

    // Wildcard: _
    if (current.type === TokenType.Identifier && current.lexeme === '_') {
      this.advance();
      return {
        kind: 'WildcardPattern',
        span: current.span,
      };
    }

    // Negative numeric literal pattern: -1
    if (this.match(TokenType.Minus)) {
      const minusTok = this.previous();
      if (this.match(TokenType.IntLiteral, TokenType.FloatLiteral)) {
        const numTok = this.previous();
        const val = typeof numTok.value === 'number' ? -numTok.value : -Number(numTok.value);
        return {
          kind: 'LiteralPattern',
          literal: {
            kind: 'Literal',
            value: val,
            raw: `-${numTok.lexeme}`,
            literalKind: numTok.type === TokenType.IntLiteral ? 'int' : 'float',
            span: {
              start: minusTok.span.start,
              end: numTok.span.end,
              sourceId: minusTok.span.sourceId,
              line: minusTok.span.line,
              column: minusTok.span.column,
            },
          },
          span: {
            start: minusTok.span.start,
            end: numTok.span.end,
            sourceId: minusTok.span.sourceId,
            line: minusTok.span.line,
            column: minusTok.span.column,
          },
        };
      }
    }

    // Literals: int, uint, float, string, char, bool
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
        kind: 'LiteralPattern',
        literal: {
          kind: 'Literal',
          value: tok.value as string | number | boolean,
          raw: tok.lexeme,
          literalKind,
          span: tok.span,
        },
        span: tok.span,
      };
    }

    // Identifiers and Constructors: Some(x), None, Ok(v), Err(e), or variable binding x
    if (this.match(TokenType.Identifier)) {
      const idTok = this.previous();

      // Some(pattern), Ok(pattern), Err(pattern)
      if (
        (idTok.lexeme === 'Some' || idTok.lexeme === 'Ok' || idTok.lexeme === 'Err') &&
        this.check(TokenType.OpenParen)
      ) {
        this.consume(TokenType.OpenParen, "Expected '(' after constructor pattern.");
        const inner = this.parsePattern();
        const closeParen = this.consume(TokenType.CloseParen, "Expected ')' after constructor pattern argument.");
        return {
          kind: 'ConstructorPattern',
          name: idTok.lexeme,
          args: [inner],
          span: {
            start: idTok.span.start,
            end: closeParen.span.end,
            sourceId: idTok.span.sourceId,
            line: idTok.span.line,
            column: idTok.span.column,
          },
        };
      }

      // None or None()
      if (idTok.lexeme === 'None') {
        let endSpan = idTok.span;
        if (this.match(TokenType.OpenParen)) {
          const closeParen = this.consume(TokenType.CloseParen, "Expected ')' after None.");
          endSpan = closeParen.span;
        }
        return {
          kind: 'ConstructorPattern',
          name: 'None',
          args: [],
          span: {
            start: idTok.span.start,
            end: endSpan.end,
            sourceId: idTok.span.sourceId,
            line: idTok.span.line,
            column: idTok.span.column,
          },
        };
      }

      // Variable binding pattern
      return {
        kind: 'IdentifierPattern',
        name: idTok.lexeme,
        isMut: false,
        span: idTok.span,
      };
    }

    this.diagnostics.reportError(
      'E1010',
      `Unexpected token '${current.lexeme || current.type}' in match pattern.`,
      current.span,
      this.file,
      "Expected a pattern (literal, identifier, wildcard '_', or constructor like 'Some(...)', 'None', 'Ok(...)', 'Err(...)')."
    );
    throw new ParseError(`Parse error in pattern at line ${current.span.line}`);
  }

  private isMapLiteral(): boolean {
    if (!this.check(TokenType.OpenBrace)) return false;
    let idx = this.current + 1;
    if (idx >= this.tokens.length) return false;
    if (this.tokens[idx].type === TokenType.CloseBrace) return false;

    let depth = 0;
    while (idx < this.tokens.length) {
      const tok = this.tokens[idx];
      if (tok.type === TokenType.OpenParen || tok.type === TokenType.OpenBracket) {
        depth++;
      } else if (tok.type === TokenType.CloseParen || tok.type === TokenType.CloseBracket) {
        depth--;
      } else if (depth === 0) {
        if (tok.type === TokenType.Colon) {
          let checkAssign = idx + 1;
          while (
            checkAssign < this.tokens.length &&
            this.tokens[checkAssign].type !== TokenType.Comma &&
            this.tokens[checkAssign].type !== TokenType.CloseBrace &&
            this.tokens[checkAssign].type !== TokenType.Semicolon
          ) {
            if (this.tokens[checkAssign].type === TokenType.Equal) {
              return false;
            }
            checkAssign++;
          }
          return true;
        }
        if (tok.type === TokenType.Semicolon || tok.type === TokenType.CloseBrace || tok.type === TokenType.Equal) {
          return false;
        }
      }
      idx++;
    }
    return false;
  }

  private parseMapLiteral(): MapLiteral {
    const openBrace = this.consume(TokenType.OpenBrace, "Expected '{' at start of map.");
    const entries: MapEntry[] = [];
    while (!this.check(TokenType.CloseBrace) && !this.isAtEnd()) {
      const key = this.parseExpression();
      this.consume(TokenType.Colon, "Expected ':' after map key.");
      const value = this.parseExpression();
      entries.push({
        kind: 'MapEntry',
        key,
        value,
        span: {
          start: key.span.start,
          end: value.span.end,
          sourceId: key.span.sourceId,
          line: key.span.line,
          column: key.span.column,
        },
      });
      if (!this.match(TokenType.Comma)) break;
    }
    const closeBrace = this.consume(TokenType.CloseBrace, "Expected '}' at end of map.");
    return {
      kind: 'MapLiteral',
      entries,
      span: {
        start: openBrace.span.start,
        end: closeBrace.span.end,
        sourceId: openBrace.span.sourceId,
        line: openBrace.span.line,
        column: openBrace.span.column,
      },
    };
  }

  private parseListLiteral(): ListLiteral {
    const openBracket = this.consume(TokenType.OpenBracket, "Expected '[' at start of list.");
    const elements: Expr[] = [];
    if (!this.check(TokenType.CloseBracket)) {
      do {
        elements.push(this.parseExpression());
      } while (this.match(TokenType.Comma) && !this.check(TokenType.CloseBracket));
    }
    const closeBracket = this.consume(TokenType.CloseBracket, "Expected ']' at end of list.");
    return {
      kind: 'ListLiteral',
      elements,
      span: {
        start: openBracket.span.start,
        end: closeBracket.span.end,
        sourceId: openBracket.span.sourceId,
        line: openBracket.span.line,
        column: openBracket.span.column,
      },
    };
  }

  private parseSetLiteral(): SetLiteral {
    const setTok = this.consume(TokenType.Identifier, "Expected 'set'.");
    this.consume(TokenType.OpenBracket, "Expected '[' after 'set'.");
    const elements: Expr[] = [];
    if (!this.check(TokenType.CloseBracket)) {
      do {
        elements.push(this.parseExpression());
      } while (this.match(TokenType.Comma) && !this.check(TokenType.CloseBracket));
    }
    const closeBracket = this.consume(TokenType.CloseBracket, "Expected ']' at end of set.");
    return {
      kind: 'SetLiteral',
      elements,
      span: {
        start: setTok.span.start,
        end: closeBracket.span.end,
        sourceId: setTok.span.sourceId,
        line: setTok.span.line,
        column: setTok.span.column,
      },
    };
  }

  private peekAhead(offset: number): Token | undefined {
    const idx = this.current + offset;
    return idx < this.tokens.length ? this.tokens[idx] : undefined;
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
        case TokenType.Match:
        case TokenType.While:
        case TokenType.For:
        case TokenType.Loop:
          return;
      }

      this.advance();
    }
  }
}
