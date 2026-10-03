/**
 * Seira High-Level Intermediate Representation (HIR) — Node Hierarchy
 *
 * Canonical, resolved, typed, and source-aware semantic representation of Seira programs.
 * Represents the official boundary between surface AST and downstream compiler stages.
 */

import type {
  FieldId,
  FunctionId,
  GenericParamId,
  ImplId,
  ModuleId,
  NodeId,
  SymbolId,
  TraitId,
  TypeId,
} from './ids.ts';
import type { SourceOrigin } from './origin.ts';
import type { HIRType } from './types.ts';

// ─── Base HIR Node ──────────────────────────────────────────────────────────

export interface HIRBaseNode {
  readonly id: NodeId;
  readonly source: SourceOrigin;
}

// ─── Program & Modules ──────────────────────────────────────────────────────

export interface HIRProgram extends HIRBaseNode {
  readonly kind: 'HIRProgram';
  readonly version: string;
  readonly modules: ReadonlyArray<HIRModule>;
  readonly topLevelItems: ReadonlyArray<HIRItem>;
}

export interface HIRModule extends HIRBaseNode {
  readonly kind: 'HIRModule';
  readonly moduleId: ModuleId;
  readonly name: string;
  readonly items: ReadonlyArray<HIRItem>;
}

export type HIRItem =
  | HIRFunction
  | HIRStruct
  | HIRTrait
  | HIRImpl
  | HIRStmt;

// ─── Declarations ───────────────────────────────────────────────────────────

export interface HIRGenericParam {
  readonly id: GenericParamId;
  readonly name: string;
  readonly constraint?: TraitId;
}

export interface HIRParameter extends HIRBaseNode {
  readonly kind: 'HIRParameter';
  readonly symbolId: SymbolId;
  readonly name: string;
  readonly type: HIRType;
  readonly isMut: boolean;
}

export interface HIRFunction extends HIRBaseNode {
  readonly kind: 'HIRFunction';
  readonly functionId: FunctionId;
  readonly symbolId: SymbolId;
  readonly name: string;
  readonly params: ReadonlyArray<HIRParameter>;
  readonly returnType: HIRType;
  readonly isEffectful: boolean;
  readonly effects: ReadonlyArray<string>;
  readonly genericParams: ReadonlyArray<HIRGenericParam>;
  readonly body: HIRBlock;
  readonly isPublic: boolean;
}

export interface HIRField {
  readonly id: FieldId;
  readonly name: string;
  readonly type: HIRType;
  readonly source: SourceOrigin;
}

export interface HIRStruct extends HIRBaseNode {
  readonly kind: 'HIRStruct';
  readonly typeId: TypeId;
  readonly name: string;
  readonly fields: ReadonlyArray<HIRField>;
  readonly genericParams: ReadonlyArray<HIRGenericParam>;
  readonly isPublic: boolean;
}

export interface HIRFunctionSignature {
  readonly name: string;
  readonly params: ReadonlyArray<{ name: string; type: HIRType }>;
  readonly returnType: HIRType;
  readonly isEffectful: boolean;
}

export interface HIRTrait extends HIRBaseNode {
  readonly kind: 'HIRTrait';
  readonly traitId: TraitId;
  readonly name: string;
  readonly genericParams: ReadonlyArray<HIRGenericParam>;
  readonly methods: ReadonlyArray<HIRFunctionSignature>;
  readonly isPublic: boolean;
}

export interface HIRImpl extends HIRBaseNode {
  readonly kind: 'HIRImpl';
  readonly implId: ImplId;
  readonly targetType: HIRType;
  readonly traitId?: TraitId;
  readonly methods: ReadonlyArray<HIRFunction>;
}

// ─── Statements & Blocks ────────────────────────────────────────────────────

export interface HIRBlock extends HIRBaseNode {
  readonly kind: 'HIRBlock';
  readonly statements: ReadonlyArray<HIRStmt>;
  readonly resultExpr?: HIRExpr;
}

export type HIRStmt =
  | HIRLetStmt
  | HIRAssignStmt
  | HIRExprStmt
  | HIRWithStmt
  | HIRLoopStmt
  | HIRReturnStmt
  | HIRBreakStmt
  | HIRContinueStmt;

export interface HIRLetStmt extends HIRBaseNode {
  readonly kind: 'HIRLetStmt';
  readonly symbolId: SymbolId;
  readonly name: string;
  readonly isMut: boolean;
  readonly type: HIRType;
  readonly initializer?: HIRExpr;
}

export interface HIRAssignStmt extends HIRBaseNode {
  readonly kind: 'HIRAssignStmt';
  readonly operator: string;
  readonly target: HIRExpr;
  readonly value: HIRExpr;
}

export interface HIRExprStmt extends HIRBaseNode {
  readonly kind: 'HIRExprStmt';
  readonly expr: HIRExpr;
}

export interface HIRWithStmt extends HIRBaseNode {
  readonly kind: 'HIRWithStmt';
  readonly resource: HIRExpr;
  readonly resourceType: HIRType;
  readonly aliasSymbolId?: SymbolId;
  readonly aliasName?: string;
  readonly body: HIRBlock;
  readonly cleanupContract: string; // e.g. 'close'
}

export type HIRLoopKind = 'Infinite' | 'Condition' | 'Iterator';

export interface HIRLoopStmt extends HIRBaseNode {
  readonly kind: 'HIRLoopStmt';
  readonly loopKind: HIRLoopKind;
  readonly condition?: HIRExpr;
  readonly iterator?: {
    readonly symbolId: SymbolId;
    readonly variableName: string;
    readonly iterable: HIRExpr;
  };
  readonly body: HIRBlock;
}

export interface HIRReturnStmt extends HIRBaseNode {
  readonly kind: 'HIRReturnStmt';
  readonly value?: HIRExpr;
}

export interface HIRBreakStmt extends HIRBaseNode {
  readonly kind: 'HIRBreakStmt';
}

export interface HIRContinueStmt extends HIRBaseNode {
  readonly kind: 'HIRContinueStmt';
}

// ─── Method Dispatch ────────────────────────────────────────────────────────

export type HIRMethodDispatch =
  | { readonly kind: 'Concrete'; readonly implId?: ImplId; readonly methodId?: FunctionId }
  | { readonly kind: 'Trait'; readonly traitId: TraitId; readonly implId?: ImplId; readonly methodId?: FunctionId }
  | { readonly kind: 'Builtin'; readonly operation: string };

// ─── Expressions ────────────────────────────────────────────────────────────

export interface HIRExprBase extends HIRBaseNode {
  readonly type: HIRType;
}

export type HIRExpr =
  | HIRLiteralExpr
  | HIRLocalExpr
  | HIRGlobalExpr
  | HIRBlockExpr
  | HIRCallExpr
  | HIRFunctionValueCallExpr
  | HIRMethodCallExpr
  | HIRFieldAccessExpr
  | HIRIndexExpr
  | HIRUnaryExpr
  | HIRBinaryExpr
  | HIRConstructExpr
  | HIRClosureExpr
  | HIRIfExpr
  | HIRMatchExpr
  | HIRFallbackExpr
  | HIRTryExpr;

export interface HIRLiteralExpr extends HIRExprBase {
  readonly kind: 'HIRLiteralExpr';
  readonly literalKind: 'int' | 'uint' | 'float' | 'bool' | 'char' | 'string' | 'unit';
  readonly value: string | number | bigint | boolean | null;
  readonly raw: string;
}

export interface HIRLocalExpr extends HIRExprBase {
  readonly kind: 'HIRLocalExpr';
  readonly symbolId: SymbolId;
  readonly name: string;
}

export interface HIRGlobalExpr extends HIRExprBase {
  readonly kind: 'HIRGlobalExpr';
  readonly symbolId: SymbolId;
  readonly name: string;
}

export interface HIRBlockExpr extends HIRExprBase {
  readonly kind: 'HIRBlockExpr';
  readonly block: HIRBlock;
}

export interface HIRCallExpr extends HIRExprBase {
  readonly kind: 'HIRCallExpr';
  readonly functionId: FunctionId;
  readonly callee: HIRExpr;
  readonly args: ReadonlyArray<HIRExpr>;
  readonly genericArgs?: ReadonlyArray<HIRType>;
}

export interface HIRFunctionValueCallExpr extends HIRExprBase {
  readonly kind: 'HIRFunctionValueCallExpr';
  readonly callee: HIRExpr;
  readonly args: ReadonlyArray<HIRExpr>;
}

export interface HIRMethodCallExpr extends HIRExprBase {
  readonly kind: 'HIRMethodCallExpr';
  readonly receiver: HIRExpr;
  readonly method: string;
  readonly dispatch: HIRMethodDispatch;
  readonly args: ReadonlyArray<HIRExpr>;
  readonly genericArgs?: ReadonlyArray<HIRType>;
}

export interface HIRFieldAccessExpr extends HIRExprBase {
  readonly kind: 'HIRFieldAccessExpr';
  readonly target: HIRExpr;
  readonly fieldId: FieldId;
  readonly fieldName: string;
}

export interface HIRIndexExpr extends HIRExprBase {
  readonly kind: 'HIRIndexExpr';
  readonly target: HIRExpr;
  readonly index: HIRExpr;
}

export interface HIRUnaryExpr extends HIRExprBase {
  readonly kind: 'HIRUnaryExpr';
  readonly operator: string;
  readonly operand: HIRExpr;
}

export interface HIRBinaryExpr extends HIRExprBase {
  readonly kind: 'HIRBinaryExpr';
  readonly operator: string;
  readonly left: HIRExpr;
  readonly right: HIRExpr;
}

export type HIRConstructKind = 'Struct' | 'List' | 'Tuple' | 'Map' | 'Set';

export interface HIRConstructExpr extends HIRExprBase {
  readonly kind: 'HIRConstructExpr';
  readonly constructKind: HIRConstructKind;
  readonly name?: string;
  readonly elements?: ReadonlyArray<HIRExpr>;
  readonly fields?: ReadonlyArray<{ readonly fieldId: FieldId; readonly fieldName: string; readonly value: HIRExpr }>;
  readonly entries?: ReadonlyArray<{ readonly key: HIRExpr; readonly value: HIRExpr }>;
}

export interface HIRClosureExpr extends HIRExprBase {
  readonly kind: 'HIRClosureExpr';
  readonly params: ReadonlyArray<HIRParameter>;
  readonly body: HIRBlock;
  readonly capturedSymbols: ReadonlyArray<SymbolId>;
}

export interface HIRIfExpr extends HIRExprBase {
  readonly kind: 'HIRIfExpr';
  readonly condition: HIRExpr;
  readonly thenBranch: HIRBlock;
  readonly elseBranch?: HIRBlock | HIRExpr;
}

export interface HIRMatchArm extends HIRBaseNode {
  readonly kind: 'HIRMatchArm';
  readonly pattern: HIRPattern;
  readonly body: HIRExpr | HIRBlock;
}

export interface HIRMatchExpr extends HIRExprBase {
  readonly kind: 'HIRMatchExpr';
  readonly value: HIRExpr;
  readonly arms: ReadonlyArray<HIRMatchArm>;
  readonly isExhaustive: boolean;
}

export interface HIRFallbackExpr extends HIRExprBase {
  readonly kind: 'HIRFallbackExpr';
  readonly left: HIRExpr;
  readonly right: HIRExpr;
}

export interface HIRTryExpr extends HIRExprBase {
  readonly kind: 'HIRTryExpr';
  readonly operand: HIRExpr;
  readonly tryKind: 'Result' | 'Option';
}

// ─── Patterns ───────────────────────────────────────────────────────────────

export type HIRPattern =
  | HIRWildcardPattern
  | HIRLiteralPattern
  | HIRBindingPattern
  | HIRConstructorPattern;

export interface HIRWildcardPattern extends HIRBaseNode {
  readonly kind: 'HIRWildcardPattern';
}

export interface HIRLiteralPattern extends HIRBaseNode {
  readonly kind: 'HIRLiteralPattern';
  readonly literal: HIRLiteralExpr;
}

export interface HIRBindingPattern extends HIRBaseNode {
  readonly kind: 'HIRBindingPattern';
  readonly symbolId: SymbolId;
  readonly name: string;
  readonly isMut: boolean;
  readonly type: HIRType;
}

export interface HIRConstructorPattern extends HIRBaseNode {
  readonly kind: 'HIRConstructorPattern';
  readonly name: string;
  readonly args: ReadonlyArray<HIRPattern>;
}
