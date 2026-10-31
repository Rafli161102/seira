/**
 * Seira High-Level Intermediate Representation (HIR) — Visitor
 *
 * Provides a canonical visitor interface for traversing HIR nodes.
 */

import type {
  HIRBlock,
  HIRExpr,
  HIRFunction,
  HIRItem,
  HIRModule,
  HIRPattern,
  HIRProgram,
  HIRStmt,
} from './nodes.ts';

export interface HIRVisitor {
  visitProgram?(program: HIRProgram): void;
  visitModule?(module: HIRModule): void;
  visitFunction?(fn: HIRFunction): void;
  visitBlock?(block: HIRBlock): void;
  visitStmt?(stmt: HIRStmt): void;
  visitExpr?(expr: HIRExpr): void;
  visitPattern?(pattern: HIRPattern): void;
}

export function walkHIRProgram(program: HIRProgram, visitor: HIRVisitor): void {
  visitor.visitProgram?.(program);

  for (const mod of program.modules) {
    walkHIRModule(mod, visitor);
  }

  for (const item of program.topLevelItems) {
    walkHIRItem(item, visitor);
  }
}

export function walkHIRModule(module: HIRModule, visitor: HIRVisitor): void {
  visitor.visitModule?.(module);
  for (const item of module.items) {
    walkHIRItem(item, visitor);
  }
}

export function walkHIRItem(item: HIRItem, visitor: HIRVisitor): void {
  switch (item.kind) {
    case 'HIRFunction':
      walkHIRFunction(item, visitor);
      break;
    case 'HIRStruct':
    case 'HIRTrait':
      break;
    case 'HIRImpl':
      for (const method of item.methods) {
        walkHIRFunction(method, visitor);
      }
      break;
    default:
      walkHIRStmt(item, visitor);
      break;
  }
}

export function walkHIRFunction(fn: HIRFunction, visitor: HIRVisitor): void {
  visitor.visitFunction?.(fn);
  walkHIRBlock(fn.body, visitor);
}

export function walkHIRBlock(block: HIRBlock, visitor: HIRVisitor): void {
  visitor.visitBlock?.(block);
  for (const stmt of block.statements) {
    walkHIRStmt(stmt, visitor);
  }
  if (block.resultExpr) {
    walkHIRExpr(block.resultExpr, visitor);
  }
}

export function walkHIRStmt(stmt: HIRStmt, visitor: HIRVisitor): void {
  visitor.visitStmt?.(stmt);

  switch (stmt.kind) {
    case 'HIRLetStmt':
      if (stmt.initializer) walkHIRExpr(stmt.initializer, visitor);
      break;
    case 'HIRAssignStmt':
      walkHIRExpr(stmt.target, visitor);
      walkHIRExpr(stmt.value, visitor);
      break;
    case 'HIRExprStmt':
      walkHIRExpr(stmt.expr, visitor);
      break;
    case 'HIRWithStmt':
      walkHIRExpr(stmt.resource, visitor);
      walkHIRBlock(stmt.body, visitor);
      break;
    case 'HIRLoopStmt':
      if (stmt.condition) walkHIRExpr(stmt.condition, visitor);
      if (stmt.iterator) walkHIRExpr(stmt.iterator.iterable, visitor);
      walkHIRBlock(stmt.body, visitor);
      break;
    case 'HIRReturnStmt':
      if (stmt.value) walkHIRExpr(stmt.value, visitor);
      break;
    case 'HIRBreakStmt':
    case 'HIRContinueStmt':
      break;
  }
}

export function walkHIRExpr(expr: HIRExpr, visitor: HIRVisitor): void {
  visitor.visitExpr?.(expr);

  switch (expr.kind) {
    case 'HIRLiteralExpr':
    case 'HIRLocalExpr':
    case 'HIRGlobalExpr':
      break;
    case 'HIRBlockExpr':
      walkHIRBlock(expr.block, visitor);
      break;
    case 'HIRCallExpr':
      walkHIRExpr(expr.callee, visitor);
      for (const arg of expr.args) {
        walkHIRExpr(arg, visitor);
      }
      break;
    case 'HIRFunctionValueCallExpr':
      walkHIRExpr(expr.callee, visitor);
      for (const arg of expr.args) {
        walkHIRExpr(arg, visitor);
      }
      break;
    case 'HIRMethodCallExpr':
      walkHIRExpr(expr.receiver, visitor);
      for (const arg of expr.args) {
        walkHIRExpr(arg, visitor);
      }
      break;
    case 'HIRFieldAccessExpr':
      walkHIRExpr(expr.target, visitor);
      break;
    case 'HIRIndexExpr':
      walkHIRExpr(expr.target, visitor);
      walkHIRExpr(expr.index, visitor);
      break;
    case 'HIRUnaryExpr':
      walkHIRExpr(expr.operand, visitor);
      break;
    case 'HIRBinaryExpr':
      walkHIRExpr(expr.left, visitor);
      walkHIRExpr(expr.right, visitor);
      break;
    case 'HIRConstructExpr':
      if (expr.elements) {
        for (const el of expr.elements) walkHIRExpr(el, visitor);
      }
      if (expr.fields) {
        for (const f of expr.fields) walkHIRExpr(f.value, visitor);
      }
      if (expr.entries) {
        for (const e of expr.entries) {
          walkHIRExpr(e.key, visitor);
          walkHIRExpr(e.value, visitor);
        }
      }
      break;
    case 'HIRClosureExpr':
      walkHIRBlock(expr.body, visitor);
      break;
    case 'HIRIfExpr':
      walkHIRExpr(expr.condition, visitor);
      walkHIRBlock(expr.thenBranch, visitor);
      if (expr.elseBranch) {
        if ('statements' in expr.elseBranch) {
          walkHIRBlock(expr.elseBranch, visitor);
        } else {
          walkHIRExpr(expr.elseBranch, visitor);
        }
      }
      break;
    case 'HIRMatchExpr':
      walkHIRExpr(expr.value, visitor);
      for (const arm of expr.arms) {
        walkHIRPattern(arm.pattern, visitor);
        if ('statements' in arm.body) {
          walkHIRBlock(arm.body, visitor);
        } else {
          walkHIRExpr(arm.body, visitor);
        }
      }
      break;
    case 'HIRFallbackExpr':
      walkHIRExpr(expr.left, visitor);
      walkHIRExpr(expr.right, visitor);
      break;
    case 'HIRTryExpr':
      walkHIRExpr(expr.operand, visitor);
      break;
  }
}

export function walkHIRPattern(pattern: HIRPattern, visitor: HIRVisitor): void {
  visitor.visitPattern?.(pattern);

  switch (pattern.kind) {
    case 'HIRWildcardPattern':
    case 'HIRBindingPattern':
      break;
    case 'HIRLiteralPattern':
      walkHIRExpr(pattern.literal, visitor);
      break;
    case 'HIRConstructorPattern':
      for (const arg of pattern.args) {
        walkHIRPattern(arg, visitor);
      }
      break;
  }
}
