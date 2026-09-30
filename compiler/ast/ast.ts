/**
 * Seira Abstract Syntax Tree (AST) Definitions
 * Strongly typed node hierarchy reflecting locked Seira syntax semantics:
 * - Functions as first-class transformations
 * - Pipelines (|>), Option/Result propagation (?), fallback (??)
 * - Explicit mutation (mut) and resource lifecycles (with)
 * - Effect tracking (!)
 */

import type { Span } from '../diagnostics/index.ts';

export type NodeKind =
  | 'Program'
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
  | 'TraitDecl';

export interface BaseNode {
  kind: NodeKind;
  span: Span;
}

export type ASTNode =
  | Program
  | FunctionDecl
  | Param
  | Block
  | Stmt
  | Expr
  | TypeAnnotation
  | StructDecl
  | TraitDecl;

export interface Program extends BaseNode {
  kind: 'Program';
  items: TopLevelItem[];
}

export type TopLevelItem = FunctionDecl | StructDecl | TraitDecl | Stmt;

export interface TypeAnnotation extends BaseNode {
  kind: 'TypeAnnotation';
  name: string;
  generics?: TypeAnnotation[];
  isEffectful?: boolean; // marked with !
}

export interface Param extends BaseNode {
  kind: 'Param';
  name: string;
  isMut: boolean;
  typeAnnotation?: TypeAnnotation;
}

export interface FunctionDecl extends BaseNode {
  kind: 'FunctionDecl';
  name: string;
  isEffectful: boolean; // marked with ! (e.g. fn write!())
  params: Param[];
  returnType?: TypeAnnotation;
  body: Block;
}

export interface Block extends BaseNode {
  kind: 'Block';
  statements: Stmt[];
}

export type Stmt = LetStmt | ReturnStmt | ExprStmt | WithStmt;

export interface LetStmt extends BaseNode {
  kind: 'LetStmt';
  isMut: boolean;
  name: string;
  typeAnnotation?: TypeAnnotation;
  initializer?: Expr;
}

export interface ReturnStmt extends BaseNode {
  kind: 'ReturnStmt';
  value?: Expr;
}

export interface ExprStmt extends BaseNode {
  kind: 'ExprStmt';
  expression: Expr;
}

export interface WithStmt extends BaseNode {
  kind: 'WithStmt';
  resource: Expr;
  alias?: string;
  body: Block;
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
  kind: 'BinaryExpr';
  operator: string; // '+', '-', '*', '/', '==', '!=', '<', '<=', '>', '>=', 'and', 'or'
  left: Expr;
  right: Expr;
}

export interface UnaryExpr extends BaseNode {
  kind: 'UnaryExpr';
  operator: string; // 'not', '-'
  operand: Expr;
}

export interface PipelineExpr extends BaseNode {
  kind: 'PipelineExpr';
  left: Expr;
  right: Expr;
}

export interface OptionFallbackExpr extends BaseNode {
  kind: 'OptionFallbackExpr'; // ??
  left: Expr;
  right: Expr;
}

export interface OptionPropagateExpr extends BaseNode {
  kind: 'OptionPropagateExpr'; // ?
  operand: Expr;
}

export interface CallExpr extends BaseNode {
  kind: 'CallExpr';
  callee: Expr;
  args: Expr[];
}

export interface MemberExpr extends BaseNode {
  kind: 'MemberExpr';
  object: Expr;
  property: string;
  isOptional: boolean; // true if ?.
}

export interface Identifier extends BaseNode {
  kind: 'Identifier';
  name: string;
}

export interface Literal extends BaseNode {
  kind: 'Literal';
  value: string | number | boolean;
  raw: string;
}

export interface StructDecl extends BaseNode {
  kind: 'StructDecl';
  name: string;
  fields: { name: string; type: TypeAnnotation }[];
}

export interface TraitDecl extends BaseNode {
  kind: 'TraitDecl';
  name: string;
  methods: FunctionDecl[];
}
