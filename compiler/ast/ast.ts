/**
 * Seira Abstract Syntax Tree (AST) Definitions
 *
 * Source-aware strongly typed node hierarchy reflecting locked Seira syntax semantics:
 * - Functions as first-class transformations (both block body { ... } and expression body => expr)
 * - Pipelines (|>), Option/Result propagation (?), fallback (??)
 * - Explicit mutation (mut) and resource lifecycles (with)
 * - Expression-oriented constructs (if expressions, block expressions, range expressions)
 * - Bindings (immutable name = expr, mutable mut name = expr, let, const)
 * - Effect tracking (!)
 */

import type { Span } from '../source/span.ts';

export type NodeKind =
  | 'Program'
  | 'ModuleDecl'
  | 'ImportDecl'
  | 'FunctionDecl'
  | 'StructDecl'
  | 'TraitDecl'
  | 'EnumDecl'
  | 'TypeAliasDecl'
  | 'Param'
  | 'Block'
  | 'LetStmt'
  | 'ConstStmt'
  | 'BindingStmt'
  | 'AssignStmt'
  | 'ReturnStmt'
  | 'ExprStmt'
  | 'WithStmt'
  | 'BinaryExpr'
  | 'UnaryExpr'
  | 'PipelineExpr'
  | 'OptionFallbackExpr'
  | 'OptionPropagateExpr'
  | 'RangeExpr'
  | 'IfExpr'
  | 'BlockExpr'
  | 'AssignmentExpr'
  | 'CallExpr'
  | 'MemberExpr'
  | 'Identifier'
  | 'Literal'
  | 'TypeAnnotation'
  | 'Attribute'
  | 'IdentifierPattern'
  | 'LiteralPattern'
  | 'WildcardPattern'
  | 'ConstructorPattern'
  | 'WhileStmt'
  | 'ForStmt'
  | 'LoopStmt'
  | 'BreakStmt'
  | 'ContinueStmt'
  | 'MatchExpr'
  | 'MatchArm'
  | 'ListLiteral'
  | 'TupleLiteral'
  | 'MapLiteral'
  | 'MapEntry'
  | 'SetLiteral'
  | 'IndexExpr'
  | 'LambdaExpr';

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
  | Pattern
  | MatchArm
  | MapEntry;

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
  | EnumDecl
  | TypeAliasDecl
  | Stmt;

export interface ModuleDecl extends BaseNode {
  readonly kind: 'ModuleDecl';
  readonly name: string;
}

export interface ImportDecl extends BaseNode {
  readonly kind: 'ImportDecl';
  readonly path: string;
  readonly alias?: string;
  readonly importedItems?: ReadonlyArray<string>;
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
  readonly bodyExpr?: Expr;
  readonly isExpressionBody?: boolean;
  readonly attributes?: ReadonlyArray<Attribute>;
}

export interface StructDecl extends BaseNode {
  readonly kind: 'StructDecl';
  readonly name: string;
  readonly fields: { name: string; type: TypeAnnotation }[];
}

export interface EnumVariant {
  readonly name: string;
  readonly typeAnnotation?: TypeAnnotation;
  readonly span: Span;
}

export interface EnumDecl extends BaseNode {
  readonly kind: 'EnumDecl';
  readonly name: string;
  readonly variants: ReadonlyArray<EnumVariant>;
}

export interface TypeAliasDecl extends BaseNode {
  readonly kind: 'TypeAliasDecl';
  readonly name: string;
  readonly targetType: TypeAnnotation;
}

export interface TraitDecl extends BaseNode {
  readonly kind: 'TraitDecl';
  readonly name: string;
  readonly methods: FunctionDecl[];
}

export interface Block extends BaseNode {
  readonly kind: 'Block';
  readonly statements: Stmt[];
}

export type Stmt =
  | LetStmt
  | ConstStmt
  | BindingStmt
  | AssignStmt
  | ReturnStmt
  | ExprStmt
  | WithStmt
  | WhileStmt
  | ForStmt
  | LoopStmt
  | BreakStmt
  | ContinueStmt;

export interface WhileStmt extends BaseNode {
  readonly kind: 'WhileStmt';
  readonly condition: Expr;
  readonly body: Block;
}

export interface ForStmt extends BaseNode {
  readonly kind: 'ForStmt';
  readonly variable: string;
  readonly iterable: Expr;
  readonly body: Block;
}

export interface LoopStmt extends BaseNode {
  readonly kind: 'LoopStmt';
  readonly body: Block;
}

export interface BreakStmt extends BaseNode {
  readonly kind: 'BreakStmt';
}

export interface ContinueStmt extends BaseNode {
  readonly kind: 'ContinueStmt';
}

export interface LetStmt extends BaseNode {
  readonly kind: 'LetStmt';
  readonly isMut: boolean;
  readonly name: string;
  readonly typeAnnotation?: TypeAnnotation;
  readonly initializer?: Expr;
}

export interface ConstStmt extends BaseNode {
  readonly kind: 'ConstStmt';
  readonly name: string;
  readonly typeAnnotation?: TypeAnnotation;
  readonly initializer: Expr;
}

export interface BindingStmt extends BaseNode {
  readonly kind: 'BindingStmt';
  readonly isMut: boolean;
  readonly name: string;
  readonly typeAnnotation?: TypeAnnotation;
  readonly initializer: Expr;
}

export interface AssignStmt extends BaseNode {
  readonly kind: 'AssignStmt';
  readonly operator: string; // '=', '+=', '-=', '*=', '/=', '%='
  readonly target: Expr;
  readonly value: Expr;
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

export type Pattern = IdentifierPattern | LiteralPattern | WildcardPattern | ConstructorPattern;

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

export interface ConstructorPattern extends BaseNode {
  readonly kind: 'ConstructorPattern';
  readonly name: string;
  readonly args: Pattern[];
}

export type Expr =
  | BinaryExpr
  | UnaryExpr
  | PipelineExpr
  | OptionFallbackExpr
  | OptionPropagateExpr
  | RangeExpr
  | IfExpr
  | BlockExpr
  | AssignmentExpr
  | CallExpr
  | MemberExpr
  | Identifier
  | Literal
  | MatchExpr
  | ListLiteral
  | TupleLiteral
  | MapLiteral
  | SetLiteral
  | IndexExpr
  | LambdaExpr;

export interface BinaryExpr extends BaseNode {
  readonly kind: 'BinaryExpr';
  readonly operator: string; // '+', '-', '*', '/', '%', '==', '!=', '<', '<=', '>', '>=', 'and', 'or'
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

export interface RangeExpr extends BaseNode {
  readonly kind: 'RangeExpr';
  readonly start?: Expr;
  readonly end?: Expr;
  readonly isHalfOpen: boolean; // true for ..<, false for ..
}

export interface IfExpr extends BaseNode {
  readonly kind: 'IfExpr';
  readonly condition: Expr;
  readonly thenBranch: Block;
  readonly elseBranch?: Block | IfExpr;
}

export interface BlockExpr extends BaseNode {
  readonly kind: 'BlockExpr';
  readonly block: Block;
}

export interface AssignmentExpr extends BaseNode {
  readonly kind: 'AssignmentExpr';
  readonly operator: string; // '=', '+=', '-=', '*=', '/=', '%='
  readonly target: Expr;
  readonly value: Expr;
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
  readonly literalKind?: 'int' | 'uint' | 'float' | 'string' | 'char' | 'bool';
}

export interface MatchArm extends BaseNode {
  readonly kind: 'MatchArm';
  readonly pattern: Pattern;
  readonly body: Expr | Block;
}

export interface MatchExpr extends BaseNode {
  readonly kind: 'MatchExpr';
  readonly value: Expr;
  readonly arms: MatchArm[];
}

export interface ListLiteral extends BaseNode {
  readonly kind: 'ListLiteral';
  readonly elements: Expr[];
}

export interface TupleLiteral extends BaseNode {
  readonly kind: 'TupleLiteral';
  readonly elements: Expr[];
}

export interface MapEntry extends BaseNode {
  readonly kind: 'MapEntry';
  readonly key: Expr;
  readonly value: Expr;
}

export interface MapLiteral extends BaseNode {
  readonly kind: 'MapLiteral';
  readonly entries: MapEntry[];
}

export interface SetLiteral extends BaseNode {
  readonly kind: 'SetLiteral';
  readonly elements: Expr[];
}

export interface IndexExpr extends BaseNode {
  readonly kind: 'IndexExpr';
  readonly object: Expr;
  readonly index: Expr;
}

export interface LambdaExpr extends BaseNode {
  readonly kind: 'LambdaExpr';
  readonly params: Param[];
  readonly body: Expr | Block;
}
