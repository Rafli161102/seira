/**
 * Seira Abstract Syntax Tree (AST) Definitions
 *
 * Strongly typed node hierarchy reflecting locked Seira syntax semantics:
 * - Functions as first-class transformations
 * - Pipelines (|>), Option/Result propagation (?), fallback (??)
 * - Explicit mutation (mut) and resource lifecycles (with)
 * - Effect tracking (!)
 * - Prepared architecture for modules, imports, attributes, and patterns
 */

import type { Span } from '../source/span.ts';

export type NodeKind =
  | 'Program'
  | 'ModuleDecl'
  | 'ImportDecl'
  | 'FunctionDecl'
  | 'Param'
  | 'Block'
  | 'LetStmt'
  | 'ReturnStmt'
  | 'ExprStmt'
  | 'WithStmt'
  | 'BinaryExpr'
  | 'UnaryExpr'
  | 'PipelineExpr'
  | 'OptionFallbackExpr'
  | 'OptionPropagateExpr'
  | 'CallExpr'
  | 'MemberExpr'
  | 'Identifier'
  | 'Literal'
  | 'TypeAnnotation'
  | 'StructDecl'
  | 'TraitDecl'
  | 'Attribute'
  | 'IdentifierPattern'
  | 'LiteralPattern'
  | 'WildcardPattern';

export interface BaseNode {
  readonly kind: NodeKind;
  readonly span: Span;
}

export type ASTNode =
  | Program
  | TopLevelItem
  | Param
  | Block
  | Stmt
  | Expr
  | TypeAnnotation
  | Attribute
  | Pattern;

export interface Program extends BaseNode {
  readonly kind: 'Program';
  readonly items: TopLevelItem[];
}

export type TopLevelItem =
  | ModuleDecl
  | ImportDecl
  | FunctionDecl
  | StructDecl
  | TraitDecl
  | Stmt;

export interface ModuleDecl extends BaseNode {
  readonly kind: 'ModuleDecl';
  readonly name: string;
}

export interface ImportDecl extends BaseNode {
  readonly kind: 'ImportDecl';
  readonly path: string;
  readonly alias?: string;
}

export interface Attribute extends BaseNode {
  readonly kind: 'Attribute';
  readonly name: string;
  readonly args?: ReadonlyArray<string>;
}

export interface TypeAnnotation extends BaseNode {
  readonly kind: 'TypeAnnotation';
  readonly name: string;
  readonly generics?: TypeAnnotation[];
  readonly isEffectful?: boolean; // marked with !
}

export interface Param extends BaseNode {
  readonly kind: 'Param';
  readonly name: string;
  readonly isMut: boolean;
  readonly typeAnnotation?: TypeAnnotation;
}

export interface FunctionDecl extends BaseNode {
  readonly kind: 'FunctionDecl';
  readonly name: string;
  readonly isEffectful: boolean; // marked with ! (e.g. fn write!())
  readonly params: Param[];
  readonly returnType?: TypeAnnotation;
  readonly body: Block;
  readonly attributes?: ReadonlyArray<Attribute>;
}

export interface Block extends BaseNode {
  readonly kind: 'Block';
  readonly statements: Stmt[];
}

export type Stmt = LetStmt | ReturnStmt | ExprStmt | WithStmt;

export interface LetStmt extends BaseNode {
  readonly kind: 'LetStmt';
  readonly isMut: boolean;
  readonly name: string;
  readonly typeAnnotation?: TypeAnnotation;
  readonly initializer?: Expr;
}

export interface ReturnStmt extends BaseNode {
  readonly kind: 'ReturnStmt';
  readonly value?: Expr;
}

export interface ExprStmt extends BaseNode {
  readonly kind: 'ExprStmt';
  readonly expression: Expr;
}

export interface WithStmt extends BaseNode {
  readonly kind: 'WithStmt';
  readonly resource: Expr;
  readonly alias?: string;
  readonly body: Block;
}

export type Pattern = IdentifierPattern | LiteralPattern | WildcardPattern;

export interface IdentifierPattern extends BaseNode {
  readonly kind: 'IdentifierPattern';
  readonly name: string;
  readonly isMut: boolean;
}

export interface LiteralPattern extends BaseNode {
  readonly kind: 'LiteralPattern';
  readonly literal: Literal;
}

export interface WildcardPattern extends BaseNode {
  readonly kind: 'WildcardPattern';
}

export type Expr =
  | BinaryExpr
  | UnaryExpr
  | PipelineExpr
  | OptionFallbackExpr
  | OptionPropagateExpr
  | CallExpr
  | MemberExpr
  | Identifier
  | Literal;

export interface BinaryExpr extends BaseNode {
  readonly kind: 'BinaryExpr';
  readonly operator: string; // '+', '-', '*', '/', '==', '!=', '<', '<=', '>', '>=', 'and', 'or'
  readonly left: Expr;
  readonly right: Expr;
}

export interface UnaryExpr extends BaseNode {
  readonly kind: 'UnaryExpr';
  readonly operator: string; // 'not', '-'
  readonly operand: Expr;
}

export interface PipelineExpr extends BaseNode {
  readonly kind: 'PipelineExpr';
  readonly left: Expr;
  readonly right: Expr;
}

export interface OptionFallbackExpr extends BaseNode {
  readonly kind: 'OptionFallbackExpr'; // ??
  readonly left: Expr;
  readonly right: Expr;
}

export interface OptionPropagateExpr extends BaseNode {
  readonly kind: 'OptionPropagateExpr'; // ?
  readonly operand: Expr;
}

export interface CallExpr extends BaseNode {
  readonly kind: 'CallExpr';
  readonly callee: Expr;
  readonly args: Expr[];
}

export interface MemberExpr extends BaseNode {
  readonly kind: 'MemberExpr';
  readonly object: Expr;
  readonly property: string;
  readonly isOptional: boolean; // true if ?.
}

export interface Identifier extends BaseNode {
  readonly kind: 'Identifier';
  readonly name: string;
}

export interface Literal extends BaseNode {
  readonly kind: 'Literal';
  readonly value: string | number | boolean;
  readonly raw: string;
}

export interface StructDecl extends BaseNode {
  readonly kind: 'StructDecl';
  readonly name: string;
  readonly fields: { name: string; type: TypeAnnotation }[];
}

export interface TraitDecl extends BaseNode {
  readonly kind: 'TraitDecl';
  readonly name: string;
  readonly methods: FunctionDecl[];
}
