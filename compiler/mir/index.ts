/**
 * Seira Mid-Level Intermediate Representation (MIR).
 *
 * MIR is a typed, source-mapped control-flow graph. Values are SSA definitions;
 * block parameters are the phi-node equivalent and incoming edge arguments
 * make merges explicit. The representation deliberately stays backend-neutral.
 */

import type { HIRProgram, HIRFunction, HIRBlock, HIRStmt, HIRExpr, HIRPattern } from '../hir/index.ts';
import type { HIRType } from '../hir/types.ts';
import { HIR_BOOL_TYPE } from '../hir/types.ts';

export type BasicBlockId = number;
export type ValueId = number;

export interface MIRValue {
  readonly id: ValueId;
  readonly type: HIRType;
  /** Stable diagnostic-friendly type name retained for consumers of the early MIR API. */
  readonly typeName: string;
  readonly symbolId?: string;
  readonly name?: string;
}

export interface MIRSource {
  readonly hirNodeId: number;
  readonly file?: string;
  readonly span: HIRExpr['source']['span'];
}

export interface MIROperation {
  /** Human-readable legacy opcode. */
  readonly op: string;
  readonly opcode: string;
  readonly dest?: ValueId;
  readonly operands: ReadonlyArray<ValueId>;
  readonly type?: HIRType;
  readonly attributes?: Readonly<Record<string, string | number | boolean | null>>;
  readonly source?: MIRSource;
}

export interface MIRResourceOp {
  readonly action: 'acquire' | 'release';
  readonly resourceId: ValueId;
  readonly cleanup: string;
  /** Number of ordinary operations already emitted when this event occurs. */
  readonly position?: number;
  readonly source?: MIRSource;
}

export interface MIRBlockParameter extends MIRValue {}

export type MIRTerminator =
  | { readonly kind: 'Return'; readonly value?: ValueId }
  | { readonly kind: 'Branch'; readonly target: BasicBlockId; readonly args: ReadonlyArray<ValueId> }
  | { readonly kind: 'CondBranch'; readonly condition: ValueId; readonly trueTarget: BasicBlockId; readonly trueArgs: ReadonlyArray<ValueId>; readonly falseTarget: BasicBlockId; readonly falseArgs: ReadonlyArray<ValueId> }
  | { readonly kind: 'Panic'; readonly message: string }
  | { readonly kind: 'Unreachable' };

export interface BasicBlock {
  readonly id: BasicBlockId;
  readonly name: string;
  readonly parameters: ReadonlyArray<MIRBlockParameter>;
  readonly operations: ReadonlyArray<MIROperation>;
  readonly resourceOps: ReadonlyArray<MIRResourceOp>;
  readonly terminator: MIRTerminator;
}

export interface MIRFunction {
  readonly name: string;
  readonly functionId: string;
  readonly parameters: ReadonlyArray<MIRValue>;
  readonly returnType: HIRType;
  readonly blocks: ReadonlyArray<BasicBlock>;
  readonly entry: BasicBlockId;
}

export interface MIRModule {
  readonly name: string;
  readonly functions: ReadonlyArray<MIRFunction>;
}

interface MutableBlock {
  id: number;
  name: string;
  parameters: MIRBlockParameter[];
  operations: MIROperation[];
  resourceOps: MIRResourceOp[];
  terminator?: MIRTerminator;
}
type Locals = Map<string, MIRValue>;

class FunctionLowerer {
  private readonly fn: HIRFunction;
  private nextBlock = 0;
  private nextValue = 0;
  private blocks: MutableBlock[] = [];
  private current!: MutableBlock;
  private locals: Locals = new Map();
  private readonly mutableSymbols = new Set<string>();
  private resourceStack: Array<{ value: MIRValue; cleanup: string; source: MIRSource }> = [];
  private borrowScopes: Array<Array<{ valueId: ValueId; source?: MIRSource }>> = [];
  private loopTargets: Array<{ breakTarget: number; continueTarget: number; resourceDepth: number; mutableSymbols: ReadonlyArray<string> }> = [];

  constructor(fn: HIRFunction) {
    this.fn = fn;
  }

  lower(): MIRFunction {
    const params = this.fn.params.map((param) => {
      const value = this.value(param.type, param.symbolId, param.name);
      this.locals.set(param.symbolId, value);
      if (param.isMut) this.mutableSymbols.add(param.symbolId);
      return value;
    });
    const entry = this.newBlock('entry');
    this.current = entry;
    const result = this.lowerBlock(this.fn.body);
    if (!this.current.terminator) {
      this.releaseResources(0);
      this.terminate({ kind: 'Return', value: result?.id });
    }
    // Every created block is terminated, including unreachable continuations
    // after explicit return/break/continue statements.
    for (const block of this.blocks) {
      if (!block.terminator) block.terminator = { kind: 'Unreachable' };
    }
    return {
      name: this.fn.name,
      functionId: this.fn.functionId,
      parameters: params,
      returnType: this.fn.returnType,
      blocks: this.blocks.map((b) => ({
        id: b.id, name: b.name, parameters: b.parameters,
        operations: b.operations, resourceOps: b.resourceOps,
        terminator: b.terminator!,
      })),
      entry: entry.id,
    };
  }

  private value(type: HIRType, symbolId?: string, name?: string): MIRValue {
    return { id: ++this.nextValue, type, typeName: type.name, symbolId, name };
  }

  private newBlock(name: string, parameterTypes: HIRType[] = []): MutableBlock {
    const id = this.nextBlock++;
    const block: MutableBlock = {
      id, name: `${name}.${id}`,
      parameters: parameterTypes.map((type) => this.value(type)),
      operations: [], resourceOps: [],
    };
    this.blocks.push(block);
    return block;
  }

  private terminate(term: MIRTerminator): void {
    if (!this.current.terminator) this.current.terminator = term;
  }

  private emit(opcode: string, operands: number[], type: HIRType, sourceNodeId: number,
    attributes?: Record<string, string | number | boolean | null>): MIRValue {
    const dest = this.value(type);
    const origin = this.findOrigin(sourceNodeId);
    this.current.operations.push({
      op: opcode, opcode, dest: dest.id, operands, type,
      attributes, source: origin,
    });
    return dest;
  }

  private findOrigin(nodeId: number): MIRSource | undefined {
    // HIR node ids are unique within a compilation unit; source metadata is
    // attached by the caller through the currently lowered node where possible.
    const node = this.nodeOrigins.get(nodeId);
    return node;
  }
  private nodeOrigins = new Map<number, MIRSource>();

  private registerNode(node: { id: number; source: { file?: string; span: HIRExpr['source']['span'] } }): void {
    this.nodeOrigins.set(node.id, { hirNodeId: node.id, file: node.source.file, span: node.source.span });
  }

  private lowerBlock(block: HIRBlock): MIRValue | undefined {
    const outerSymbols = new Set(this.locals.keys());
    const borrowScope: Array<{ valueId: ValueId; source?: MIRSource }> = [];
    this.borrowScopes.push(borrowScope);
    for (const stmt of block.statements) {
      if (this.current.terminator) break;
      this.lowerStmt(stmt);
    }
    const result = !this.current.terminator && block.resultExpr
      ? this.lowerExpr(block.resultExpr)
      : undefined;
    if (!this.current.terminator) {
      const parentScope = this.borrowScopes.length > 1 ? this.borrowScopes[this.borrowScopes.length - 2] : undefined;
      for (const borrow of [...borrowScope].reverse()) {
        if (result?.id === borrow.valueId && parentScope) parentScope.push(borrow);
        else this.emitBorrowEnd(borrow);
      }
      borrowScope.length = 0;
    }
    this.borrowScopes.pop();
    // Keep branch-local bindings alive through the block result, but do not
    // leak them into the enclosing lexical scope.
    for (const symbolId of this.locals.keys()) {
      if (!outerSymbols.has(symbolId)) this.locals.delete(symbolId);
    }
    return result;
  }

  private lowerStmt(stmt: HIRStmt): void {
    this.registerNode(stmt);
    switch (stmt.kind) {
      case 'HIRLetStmt': {
        const init = stmt.initializer ? this.lowerExpr(stmt.initializer) :
          this.emit('undef', [], stmt.type, stmt.id, { symbol: stmt.name });
        this.locals.set(stmt.symbolId, init);
        if (stmt.isMut) this.mutableSymbols.add(stmt.symbolId);
        return;
      }
      case 'HIRAssignStmt': {
        const rhs = this.lowerExpr(stmt.value);
        if (stmt.target.kind === 'HIRUnaryExpr' && stmt.target.operator === '*') {
          const reference = this.lowerExpr(stmt.target.operand);
          const value = stmt.operator === '=' ? rhs : (() => {
            const previous = this.emit('deref.load', [reference.id], stmt.target.type, stmt.id);
            return this.emit('binary', [previous.id, rhs.id], stmt.target.type, stmt.id, { operator: stmt.operator.slice(0, -1) });
          })();
          this.emit('deref.store', [reference.id, value.id], stmt.target.type, stmt.id, { operator: stmt.operator });
        } else if (stmt.target.kind === 'HIRLocalExpr') {
          const previous = this.locals.get(stmt.target.symbolId);
          const value = stmt.operator === '=' || !previous ? rhs :
            this.emit('binary', [previous.id, rhs.id], stmt.target.type, stmt.id, { operator: stmt.operator.slice(0, -1) });
          this.locals.set(stmt.target.symbolId, value);
        } else {
          const target = this.lowerExpr(stmt.target);
          this.emit('store', [target.id, rhs.id], stmt.value.type, stmt.id, { operator: stmt.operator });
        }
        return;
      }
      case 'HIRExprStmt':
        this.lowerExpr(stmt.expr);
        return;
      case 'HIRReturnStmt': {
        const result = stmt.value ? this.lowerExpr(stmt.value) : undefined;
        this.endActiveBorrows();
        this.releaseResources(0);
        this.terminate({ kind: 'Return', value: result?.id });
        return;
      }
      case 'HIRWithStmt': {
        const resource = this.lowerExpr(stmt.resource);
        const source = this.findOrigin(stmt.id) ?? { hirNodeId: stmt.id, span: stmt.source.span, file: stmt.source.file };
        this.current.resourceOps.push({ action: 'acquire', resourceId: resource.id, cleanup: stmt.cleanupContract, position: this.current.operations.length, source });
        this.resourceStack.push({ value: resource, cleanup: stmt.cleanupContract, source });
        if (stmt.aliasSymbolId) this.locals.set(stmt.aliasSymbolId, resource);
        this.lowerBlock(stmt.body);
        if (!this.current.terminator) this.releaseResources(this.resourceStack.length - 1);
        if (stmt.aliasSymbolId) this.locals.delete(stmt.aliasSymbolId);
        return;
      }
      case 'HIRLoopStmt':
        this.lowerLoop(stmt);
        return;
      case 'HIRBreakStmt': {
        const target = this.loopTargets[this.loopTargets.length - 1];
        if (target) {
          this.endCurrentBorrowScope();
          this.releaseResources(target.resourceDepth);
          const args = target.mutableSymbols.map((symbolId) => this.locals.get(symbolId)?.id).filter((id): id is number => id !== undefined);
          this.terminate({ kind: 'Branch', target: target.breakTarget, args });
        }
        return;
      }
      case 'HIRContinueStmt': {
        const target = this.loopTargets[this.loopTargets.length - 1];
        if (target) {
          this.endCurrentBorrowScope();
          this.releaseResources(target.resourceDepth);
          const args = target.mutableSymbols.map((symbolId) => this.locals.get(symbolId)?.id).filter((id): id is number => id !== undefined);
          this.terminate({ kind: 'Branch', target: target.continueTarget, args });
        }
        return;
      }
    }
  }

  private emitBorrowEnd(borrow: { valueId: ValueId; source?: MIRSource }): void {
    this.current.operations.push({ op: 'borrow.end', opcode: 'borrow.end', operands: [borrow.valueId], source: borrow.source });
  }

  private endCurrentBorrowScope(): void {
    const scope = this.borrowScopes[this.borrowScopes.length - 1];
    if (!scope) return;
    for (const borrow of [...scope].reverse()) this.emitBorrowEnd(borrow);
    scope.length = 0;
  }

  private endActiveBorrows(): void {
    for (let index = this.borrowScopes.length - 1; index >= 0; index--) {
      const scope = this.borrowScopes[index];
      for (const borrow of [...scope].reverse()) this.emitBorrowEnd(borrow);
      scope.length = 0;
    }
  }

  private releaseResources(depth: number): void {
    while (this.resourceStack.length > depth) {
      const resource = this.resourceStack.pop()!;
      this.current.resourceOps.push({
        action: 'release', resourceId: resource.value.id,
        cleanup: resource.cleanup, position: this.current.operations.length, source: resource.source,
      });
    }
  }

  private lowerLoop(stmt: Extract<HIRStmt, { kind: 'HIRLoopStmt' }>): void {
    let iterator: MIRValue | undefined;
    let iterableValue: MIRValue | undefined;
    let iteratorElementType: HIRType | undefined;
    if (stmt.loopKind === 'Iterator' && stmt.iterator) {
      iterableValue = this.lowerExpr(stmt.iterator.iterable);
      iteratorElementType = iterableValue.type.typeArguments?.[0] ?? iterableValue.type;
    }

    // The iterable expression is evaluated once before entering the loop.
    const preheader = this.current;
    const loopSymbols = [...this.mutableSymbols].filter((symbolId) => this.locals.has(symbolId));
    const incoming = loopSymbols.map((symbolId) => this.locals.get(symbolId)!);
    if (iterableValue) {
      iterator = this.emit('iterator.begin', [iterableValue.id], iterableValue.type, stmt.id);
    }

    // Header parameters are loop-carried SSA values. The preheader supplies
    // the initial versions, and the back-edge supplies each updated version.
    const header = this.newBlock('loop.header', incoming.map((value) => value.type));
    const body = this.newBlock('loop.body');
    const exit = this.newBlock('loop.exit', incoming.map((value) => value.type));
    header.parameters = incoming.map((value, index) => this.value(value.type, loopSymbols[index], value.name));
    exit.parameters = incoming.map((value, index) => this.value(value.type, loopSymbols[index], value.name));
    preheader.terminator = {
      kind: 'Branch', target: header.id,
      args: incoming.map((value) => value.id),
    };
    loopSymbols.forEach((symbolId, index) => this.locals.set(symbolId, header.parameters[index]));

    this.current = header;
    let condition: MIRValue | undefined;
    if (stmt.loopKind === 'Condition' && stmt.condition) {
      condition = this.lowerExpr(stmt.condition);
    } else if (stmt.loopKind === 'Iterator' && iterator) {
      condition = this.emit('iterator.has_next', [iterator.id], HIR_BOOL_TYPE, stmt.id);
    }

    if (condition) {
      this.terminate({
        kind: 'CondBranch', condition: condition.id,
        trueTarget: body.id, trueArgs: [],
        falseTarget: exit.id, falseArgs: header.parameters.map((parameter) => parameter.id),
      });
    } else {
      this.terminate({ kind: 'Branch', target: body.id, args: [] });
    }

    this.current = body;
    if (stmt.loopKind === 'Iterator' && stmt.iterator && iterator && iteratorElementType) {
      const next = this.emit('iterator.next', [iterator.id], iteratorElementType, stmt.id);
      this.locals.set(stmt.iterator.symbolId, next);
    }
    this.loopTargets.push({
      breakTarget: exit.id,
      continueTarget: header.id,
      resourceDepth: this.resourceStack.length,
      mutableSymbols: loopSymbols,
    });
    this.lowerBlock(stmt.body);
    this.loopTargets.pop();
    if (!this.current.terminator) {
      const backEdgeArgs = loopSymbols.map((symbolId) => this.locals.get(symbolId)?.id);
      this.terminate({
        kind: 'Branch', target: header.id,
        args: backEdgeArgs.filter((id): id is number => id !== undefined),
      });
    }

    // Both the condition-false edge and break edges carry their final state
    // into the loop exit block.
    loopSymbols.forEach((symbolId, index) => this.locals.set(symbolId, exit.parameters[index]));
    if (stmt.iterator) this.locals.delete(stmt.iterator.symbolId);
    this.current = exit;
  }

  private endImmediateArgumentBorrows(expressions: ReadonlyArray<HIRExpr>, values: ReadonlyArray<MIRValue>): void {
    for (let index = 0; index < expressions.length; index++) {
      const expression = expressions[index];
      if (expression.kind !== 'HIRUnaryExpr' || (expression.operator !== 'borrow.shared' && expression.operator !== 'borrow.mutable')) continue;
      const valueId = values[index]?.id;
      if (valueId === undefined) continue;
      for (let scopeIndex = this.borrowScopes.length - 1; scopeIndex >= 0; scopeIndex--) {
        const scope = this.borrowScopes[scopeIndex];
        const borrowIndex = scope.findIndex((borrow) => borrow.valueId === valueId);
        if (borrowIndex >= 0) {
          const [borrow] = scope.splice(borrowIndex, 1);
          this.emitBorrowEnd(borrow);
          break;
        }
      }
    }
  }

  private lowerPlace(expr: HIRExpr): { root: MIRValue; path: string[]; indexes: HIRExpr[] } | undefined {
    if (expr.kind === 'HIRLocalExpr' || expr.kind === 'HIRGlobalExpr') {
      return { root: this.lowerExpr(expr), path: [], indexes: [] };
    }
    if (expr.kind === 'HIRFieldAccessExpr') {
      const parent = this.lowerPlace(expr.target);
      if (!parent) return undefined;
      return { root: parent.root, path: [...parent.path, expr.fieldName], indexes: parent.indexes };
    }
    if (expr.kind === 'HIRIndexExpr' && (expr.target.type.kind === 'List' || expr.target.type.kind === 'Map')) {
      const parent = this.lowerPlace(expr.target);
      if (!parent) return undefined;

      let indexSegment = expr.target.type.kind === 'List' ? '@*' : '#*';
      if (
        expr.target.type.kind === 'List' &&
        expr.index.kind === 'HIRLiteralExpr' &&
        (expr.index.literalKind === 'int' || expr.index.literalKind === 'uint')
      ) {
        const raw = expr.index.value;
        if (typeof raw === 'bigint' || typeof raw === 'number' || typeof raw === 'string') {
          try {
            const index = BigInt(raw);
            if (index >= 0n && index <= BigInt(Number.MAX_SAFE_INTEGER)) {
              indexSegment = `@${index.toString()}`;
            }
          } catch {
            // Non-integral or malformed literal projections remain conservative.
          }
        }
      } else if (
        expr.target.type.kind === 'Map' &&
        expr.index.kind === 'HIRLiteralExpr' &&
        ['int', 'uint', 'float', 'bool', 'char', 'string', 'unit'].includes(expr.index.literalKind)
      ) {
        const raw = expr.index.value;
        const rawText = String(raw).replaceAll('%', '%25').replaceAll('.', '%2E');
        indexSegment = `#${expr.index.literalKind}:${rawText}`;
      }
      return {
        root: parent.root,
        path: [...parent.path, indexSegment],
        // Keep key/index expressions in MIR so dynamic projections retain their evaluation.
        indexes: [...parent.indexes, expr.index],
      };
    }
    return undefined;
  }

  private lowerExpr(expr: HIRExpr): MIRValue {
    this.registerNode(expr);
    switch (expr.kind) {
      case 'HIRLiteralExpr':
        return this.emit('const', [], expr.type, expr.id, {
          literalKind: expr.literalKind,
          value: typeof expr.value === 'bigint' ? String(expr.value) : expr.value as string | number | boolean | null,
          raw: expr.raw,
        });
      case 'HIRLocalExpr':
        return this.locals.get(expr.symbolId) ??
          this.emit('local.read', [], expr.type, expr.id, { symbolId: expr.symbolId, name: expr.name });
      case 'HIRGlobalExpr':
        return this.emit('global.read', [], expr.type, expr.id, { symbolId: expr.symbolId, name: expr.name });
      case 'HIRBlockExpr':
        return this.lowerBlock(expr.block) ?? this.emit('unit', [], expr.type, expr.id);
      case 'HIRUnaryExpr': {
        if (expr.operator === 'borrow.shared' || expr.operator === 'borrow.mutable') {
          const isReborrow = expr.operand.kind === 'HIRUnaryExpr' && expr.operand.operator === '*';
          const borrowPlace = isReborrow ? undefined : this.lowerPlace(expr.operand);
          const borrowSource = isReborrow ? expr.operand.operand : expr.operand;
          const operand = borrowPlace?.root ?? this.lowerExpr(borrowSource);
          const projectionIndexes = borrowPlace?.indexes.map((index) => this.lowerExpr(index)) ?? [];
          const attributes: Record<string, string | number | boolean | null> | undefined = isReborrow
            ? { reborrow: true }
            : borrowPlace && borrowPlace.path.length > 0
              ? {
                  placePath: borrowPlace.path.join('.'),
                  projectionIndexCount: projectionIndexes.length,
                }
              : undefined;
          const borrow = this.emit(
            expr.operator,
            [operand.id, ...projectionIndexes.map((index) => index.id)],
            expr.type,
            expr.id,
            attributes,
          );
          this.borrowScopes[this.borrowScopes.length - 1]?.push({ valueId: borrow.id, source: this.findOrigin(expr.id) });
          return borrow;
        }
        const operand = this.lowerExpr(expr.operand);
        if (expr.operator === '*') return this.emit('deref.load', [operand.id], expr.type, expr.id);
        return this.emit('unary', [operand.id], expr.type, expr.id, { operator: expr.operator });
      }
      case 'HIRBinaryExpr': {
        const left = this.lowerExpr(expr.left);
        // Preserve short-circuit semantics with control flow instead of eager evaluation.
        if (expr.operator === 'and' || expr.operator === 'or') {
          const rhsBlock = this.newBlock('logic.rhs');
          const shortBlock = this.newBlock('logic.short');
          const join = this.newBlock('logic.join', [expr.type]);
          const shortValue = this.emit('const', [], expr.type, expr.id, { value: expr.operator === 'or' });
          if (expr.operator === 'and') this.terminate({ kind: 'CondBranch', condition: left.id, trueTarget: rhsBlock.id, trueArgs: [], falseTarget: shortBlock.id, falseArgs: [] });
          else this.terminate({ kind: 'CondBranch', condition: left.id, trueTarget: shortBlock.id, trueArgs: [], falseTarget: rhsBlock.id, falseArgs: [] });
          this.current = shortBlock;
          this.terminate({ kind: 'Branch', target: join.id, args: [shortValue.id] });
          this.current = rhsBlock;
          const right = this.lowerExpr(expr.right);
          this.terminate({ kind: 'Branch', target: join.id, args: [right.id] });
          this.current = join;
          return join.parameters[0];
        }
        const right = this.lowerExpr(expr.right);
        return this.emit('binary', [left.id, right.id], expr.type, expr.id, { operator: expr.operator });
      }
      case 'HIRCallExpr': {
        const args = expr.args.map((arg) => this.lowerExpr(arg));
        const callee = this.lowerExpr(expr.callee);
        const result = this.emit('call', [callee.id, ...args.map((v) => v.id)], expr.type, expr.id, { functionId: expr.functionId, argumentCount: args.length });
        this.endImmediateArgumentBorrows(expr.args, args);
        return result;
      }
      case 'HIRFunctionValueCallExpr': {
        const callee = this.lowerExpr(expr.callee);
        const args = expr.args.map((arg) => this.lowerExpr(arg));
        const result = this.emit('call.indirect', [callee.id, ...args.map((v) => v.id)], expr.type, expr.id, { argumentCount: args.length });
        this.endImmediateArgumentBorrows(expr.args, args);
        return result;
      }
      case 'HIRMethodCallExpr': {
        const receiver = this.lowerExpr(expr.receiver);
        const args = expr.args.map((arg) => this.lowerExpr(arg));
        const result = this.emit('call.method', [receiver.id, ...args.map((v) => v.id)], expr.type, expr.id, {
          method: expr.method, dispatch: expr.dispatch.kind,
          implId: expr.dispatch.implId ?? null, methodId: expr.dispatch.methodId,
        });
        this.endImmediateArgumentBorrows(expr.args, args);
        return result;
      }
      case 'HIRFieldAccessExpr': {
        const place = this.lowerPlace(expr);
        if (place) {
          const projectionIndexes = place.indexes.map((index) => this.lowerExpr(index));
          return this.emit('field.get', [place.root.id, ...projectionIndexes.map((index) => index.id)], expr.type, expr.id, {
            fieldId: expr.fieldId,
            fieldName: expr.fieldName,
            rootId: place.root.id,
            placePath: place.path.join('.'),
            projectionIndexCount: projectionIndexes.length,
          });
        }
        const target = this.lowerExpr(expr.target);
        return this.emit('field.get', [target.id], expr.type, expr.id, { fieldId: expr.fieldId, fieldName: expr.fieldName });
      }
      case 'HIRIndexExpr': {
        const place = this.lowerPlace(expr);
        if (place) {
          const projectionIndexes = place.indexes.map((index) => this.lowerExpr(index));
          return this.emit('index.get', [place.root.id, ...projectionIndexes.map((index) => index.id)], expr.type, expr.id, {
            rootId: place.root.id,
            placePath: place.path.join('.'),
            projectionIndexCount: projectionIndexes.length,
          });
        }
        const target = this.lowerExpr(expr.target);
        const index = this.lowerExpr(expr.index);
        return this.emit('index.get', [target.id, index.id], expr.type, expr.id);
      }
      case 'HIRConstructExpr': {
        const operands: number[] = [];
        for (const item of expr.elements ?? []) operands.push(this.lowerExpr(item).id);
        for (const field of expr.fields ?? []) operands.push(this.lowerExpr(field.value).id);
        for (const entry of expr.entries ?? []) operands.push(this.lowerExpr(entry.key).id, this.lowerExpr(entry.value).id);
        return this.emit('construct', operands, expr.type, expr.id, {
          constructKind: expr.constructKind, name: expr.name ?? null,
          elementCount: expr.elements?.length ?? 0, fieldCount: expr.fields?.length ?? 0, entryCount: expr.entries?.length ?? 0,
        });
      }
      case 'HIRClosureExpr': {
        const captures = expr.capturedSymbols.map((id) => this.locals.get(id)?.id).filter((id): id is number => id !== undefined);
        return this.emit('closure', captures, expr.type, expr.id, { captureCount: captures.length, parameterCount: expr.params.length });
      }
      case 'HIRIfExpr':
        return this.lowerIf(expr);
      case 'HIRMatchExpr': {
        const scrutinee = this.lowerExpr(expr.value);
        const join = this.newBlock('match.join', [expr.type]);
        let testBlock = this.current;
        for (let index = 0; index < expr.arms.length; index++) {
          const arm = expr.arms[index];
          this.current = testBlock;
          const armBlock = this.newBlock(`match.arm.${index}`);
          const nextTest = this.newBlock(`match.test.${index + 1}`);
          const test = this.emit('pattern.test', [scrutinee.id], HIR_BOOL_TYPE, arm.id, {
            pattern: this.patternDescription(arm.pattern),
            patternKind: arm.pattern.kind,
          });
          this.terminate({
            kind: 'CondBranch', condition: test.id,
            trueTarget: armBlock.id, trueArgs: [],
            falseTarget: nextTest.id, falseArgs: [],
          });
          this.current = armBlock;
          this.bindPattern(arm.pattern, scrutinee, arm.id);
          const armValue = this.lowerArm(arm.body, expr.type);
          if (!this.current.terminator) this.terminate({ kind: 'Branch', target: join.id, args: [armValue.id] });
          testBlock = nextTest;
        }
        this.current = testBlock;
        this.terminate(expr.isExhaustive
          ? { kind: 'Unreachable' }
          : { kind: 'Panic', message: 'non-exhaustive match reached' });
        this.current = join;
        return join.parameters[0];
      }
      case 'HIRFallbackExpr': {
        const left = this.lowerExpr(expr.left);
        const fallback = this.newBlock('fallback.rhs');
        const present = this.newBlock('fallback.present');
        const join = this.newBlock('fallback.join', [expr.type]);
        const test = this.emit('option.is_none', [left.id], HIR_BOOL_TYPE, expr.id);
        this.terminate({ kind: 'CondBranch', condition: test.id, trueTarget: fallback.id, trueArgs: [], falseTarget: present.id, falseArgs: [] });
        this.current = present;
        const unwrapped = this.emit('option.unwrap', [left.id], expr.type, expr.id);
        this.terminate({ kind: 'Branch', target: join.id, args: [unwrapped.id] });
        this.current = fallback;
        const right = this.lowerExpr(expr.right);
        this.terminate({ kind: 'Branch', target: join.id, args: [right.id] });
        this.current = join;
        return join.parameters[0];
      }
      case 'HIRTryExpr': {
        const operand = this.lowerExpr(expr.operand);
        return this.emit('try.propagate', [operand.id], expr.type, expr.id, { tryKind: expr.tryKind, earlyReturn: true });
      }
    }
  }

  private lowerIf(expr: Extract<HIRExpr, { kind: 'HIRIfExpr' }>): MIRValue {
    const condition = this.lowerExpr(expr.condition);
    const baseLocals = new Map(this.locals);
    const thenBlock = this.newBlock('if.then');
    const elseBlock = this.newBlock('if.else');
    const join = this.newBlock('if.join', [expr.type]);
    this.terminate({
      kind: 'CondBranch', condition: condition.id,
      trueTarget: thenBlock.id, trueArgs: [],
      falseTarget: elseBlock.id, falseArgs: [],
    });

    this.current = thenBlock;
    let thenValue = this.lowerBlock(expr.thenBranch);
    const thenEnd = this.current;
    const thenFallsThrough = !thenEnd.terminator;
    if (thenFallsThrough) {
      thenValue ??= this.emit('unit', [], expr.type, expr.id);
      this.terminate({ kind: 'Branch', target: join.id, args: [thenValue.id] });
    }
    const thenLocals = new Map(this.locals);

    this.locals = new Map(baseLocals);
    this.current = elseBlock;
    let elseValue: MIRValue | undefined;
    if (!expr.elseBranch) {
      elseValue = this.emit('unit', [], expr.type, expr.id);
    } else if ('kind' in expr.elseBranch && expr.elseBranch.kind === 'HIRBlock') {
      elseValue = this.lowerBlock(expr.elseBranch as HIRBlock);
    } else {
      elseValue = this.lowerExpr(expr.elseBranch as HIRExpr);
    }
    const elseEnd = this.current;
    const elseFallsThrough = !elseEnd.terminator;
    if (elseFallsThrough) {
      elseValue ??= this.emit('unit', [], expr.type, expr.id);
      this.terminate({ kind: 'Branch', target: join.id, args: [elseValue.id] });
    }
    const elseLocals = new Map(this.locals);

    // Merge only pre-existing mutable bindings. New lexical bindings from a
    // branch are deliberately not visible outside that branch.
    if (thenFallsThrough && elseFallsThrough) {
      const thenArgs = [thenValue!.id];
      const elseArgs = [elseValue!.id];
      const merged = new Map(baseLocals);
      for (const symbolId of this.mutableSymbols) {
        const before = baseLocals.get(symbolId);
        const thenValueForSymbol = thenLocals.get(symbolId);
        const elseValueForSymbol = elseLocals.get(symbolId);
        if (!before || !thenValueForSymbol || !elseValueForSymbol) continue;
        if (thenValueForSymbol.id === elseValueForSymbol.id) {
          merged.set(symbolId, thenValueForSymbol);
          continue;
        }
        const parameter = this.value(
          thenValueForSymbol.type,
          symbolId,
          thenValueForSymbol.name ?? elseValueForSymbol.name
        );
        join.parameters.push(parameter);
        thenArgs.push(thenValueForSymbol.id);
        elseArgs.push(elseValueForSymbol.id);
        merged.set(symbolId, parameter);
      }
      // The first block parameter carries the if-expression value. Remaining
      // parameters are SSA merges for mutable locals.
      thenEnd.terminator = { kind: 'Branch', target: join.id, args: thenArgs };
      elseEnd.terminator = { kind: 'Branch', target: join.id, args: elseArgs };
      this.locals = merged;
    } else if (thenFallsThrough) {
      this.locals = thenLocals;
    } else if (elseFallsThrough) {
      this.locals = elseLocals;
    } else {
      this.locals = baseLocals;
    }

    this.current = join;
    return join.parameters[0];
  }


  private lowerArm(body: HIRExpr | HIRBlock, type: HIRType): MIRValue {
    const value = body.kind === 'HIRBlock' ? this.lowerBlock(body as HIRBlock) : this.lowerExpr(body as HIRExpr);
    return value ?? this.emit('unit', [], type, body.id);
  }

  private bindPattern(pattern: HIRPattern, value: MIRValue, nodeId: number): void {
    if (pattern.kind === 'HIRBindingPattern') {
      const bound = this.emit('pattern.bind', [value.id], pattern.type, nodeId, {
        symbolId: pattern.symbolId, name: pattern.name,
      });
      this.locals.set(pattern.symbolId, bound);
    } else if (pattern.kind === 'HIRConstructorPattern') {
      pattern.args.forEach((child, index) => {
        const field = this.emit('pattern.project', [value.id], value.type, nodeId, {
          constructor: pattern.name, index,
        });
        this.bindPattern(child, field, nodeId);
      });
    }
  }

  private patternDescription(pattern: HIRPattern): string {
    switch (pattern.kind) {
      case 'HIRWildcardPattern': return '_';
      case 'HIRLiteralPattern': return pattern.literal.raw;
      case 'HIRBindingPattern': return pattern.name;
      case 'HIRConstructorPattern': return `${pattern.name}(${pattern.args.map((arg) => this.patternDescription(arg)).join(', ')})`;
    }
  }
}

export class MIRBuilder {
  public build(hir: HIRProgram): MIRModule {
    const functions = new Map<string, MIRFunction>();
    const collect = (items: HIRProgram['topLevelItems']): void => {
      for (const item of items) {
        if (item.kind === 'HIRFunction') {
          if (!functions.has(item.functionId)) functions.set(item.functionId, new FunctionLowerer(item).lower());
        } else if (item.kind === 'HIRImpl') {
          for (const method of item.methods) {
            if (!functions.has(method.functionId)) functions.set(method.functionId, new FunctionLowerer(method).lower());
          }
        }
      }
    };
    // Some HIR producers expose the same declaration through both the
    // top-level convenience list and its owning module. Deduplicate by
    // semantic FunctionId rather than emitting duplicate MIR bodies.
    collect(hir.topLevelItems);
    for (const module of hir.modules) collect(module.items);
    return { name: 'root', functions: [...functions.values()] };
  }
}

/** Structural and SSA verifier used before backend consumption. */
export interface MIRValidationResult {
  readonly success: boolean;
  readonly errors: ReadonlyArray<string>;
}

interface MIRDefinition {
  readonly block: BasicBlockId;
  /** Function parameters and block parameters are available before operation 0. */
  readonly position: number;
  readonly type: HIRType;
}

export function validateMIR(module: MIRModule): MIRValidationResult {
  const errors: string[] = [];
  const report = (message: string): void => { errors.push(message); };

  for (const fn of module.functions) {
    const prefix = `Function '${fn.name}'`;
    const blocks = new Map<BasicBlockId, BasicBlock>();
    for (const block of fn.blocks) {
      if (blocks.has(block.id)) report(`${prefix} has duplicate block id ${block.id}.`);
      blocks.set(block.id, block);
    }
    if (!blocks.has(fn.entry)) {
      report(`${prefix} has missing entry block.`);
      continue;
    }

    const predecessors = new Map<BasicBlockId, BasicBlockId[]>();
    const successors = new Map<BasicBlockId, BasicBlockId[]>();
    for (const block of fn.blocks) {
      predecessors.set(block.id, []);
      successors.set(block.id, []);
    }
    for (const block of fn.blocks) {
      const term = block.terminator;
      const targets = term.kind === 'Branch' ? [term.target] :
        term.kind === 'CondBranch' ? [term.trueTarget, term.falseTarget] : [];
      for (const target of targets) {
        if (!blocks.has(target)) {
          report(`Block ${block.id} branches to missing block ${target}.`);
          continue;
        }
        successors.get(block.id)!.push(target);
        predecessors.get(target)!.push(block.id);
      }
    }

    // Reachability and iterative dominator sets.
    const reachable = new Set<BasicBlockId>();
    const worklist: BasicBlockId[] = [fn.entry];
    while (worklist.length > 0) {
      const id = worklist.pop()!;
      if (reachable.has(id)) continue;
      reachable.add(id);
      for (const next of successors.get(id) ?? []) worklist.push(next);
    }
    const dominators = new Map<BasicBlockId, Set<BasicBlockId>>();
    for (const id of reachable) {
      dominators.set(id, id === fn.entry ? new Set([id]) : new Set(reachable));
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const id of reachable) {
        if (id === fn.entry) continue;
        const preds = (predecessors.get(id) ?? []).filter((pred) => reachable.has(pred));
        let next = preds.length > 0 ? new Set(dominators.get(preds[0])!) : new Set<BasicBlockId>();
        for (const pred of preds.slice(1)) {
          const predDom = dominators.get(pred)!;
          next = new Set([...next].filter((candidate) => predDom.has(candidate)));
        }
        next.add(id);
        const current = dominators.get(id)!;
        if (current.size !== next.size || [...current].some((value) => !next.has(value))) {
          dominators.set(id, next);
          changed = true;
        }
      }
    }

    const definitions = new Map<ValueId, MIRDefinition>();
    const define = (value: MIRValue, block: BasicBlockId, position: number, label: string): void => {
      if (definitions.has(value.id)) {
        report(`${prefix} defines value %${value.id} more than once (${label}).`);
        return;
      }
      definitions.set(value.id, { block, position, type: value.type });
    };
    const entry = blocks.get(fn.entry)!;
    for (const parameter of fn.parameters) define(parameter, fn.entry, -2, 'function parameter');
    for (const block of fn.blocks) {
      for (const parameter of block.parameters) define(parameter, block.id, -1, 'block parameter');
      for (let index = 0; index < block.operations.length; index++) {
        const operation = block.operations[index];
        if (operation.dest !== undefined) {
          const type = operation.type ?? { id: 'type:Unknown', kind: 'Unknown', name: 'Unknown' } as HIRType;
          define({ id: operation.dest, type, typeName: type.name }, block.id, index, operation.opcode);
        }
      }
    }

    const checkUse = (valueId: ValueId, useBlock: BasicBlockId, usePosition: number, context: string): MIRDefinition | undefined => {
      const definition = definitions.get(valueId);
      if (!definition) {
        report(`${prefix} uses undefined value %${valueId} in block ${useBlock} (${context}).`);
        return undefined;
      }
      if (definition.block === useBlock) {
        if (definition.position >= usePosition) {
          report(`${prefix} uses value %${valueId} before its definition in block ${useBlock} (${context}).`);
        }
      } else if (reachable.has(useBlock) && !dominators.get(useBlock)?.has(definition.block)) {
        report(`${prefix} uses value %${valueId} from block ${definition.block}, which does not dominate block ${useBlock} (${context}).`);
      }
      return definition;
    };

    for (const block of fn.blocks) {
      for (let index = 0; index < block.operations.length; index++) {
        const operation = block.operations[index];
        for (const operand of operation.operands) checkUse(operand, block.id, index, operation.opcode);
      }
      // Resource operations are ordered at block-scope cleanup points; validate
      // references after all ordinary operations in that block.
      for (const resourceOp of block.resourceOps) {
        const position = resourceOp.position ?? block.operations.length;
        if (!Number.isInteger(position) || position < 0 || position > block.operations.length) {
          report(`Resource ${resourceOp.action} in block ${block.id} has invalid operation position ${position}.`);
        }
        checkUse(resourceOp.resourceId, block.id, position, `resource ${resourceOp.action}`);
      }

      const term = block.terminator;
      if (term.kind === 'Return' && term.value !== undefined) {
        checkUse(term.value, block.id, block.operations.length, 'return');
      } else if (term.kind === 'Branch') {
        const target = blocks.get(term.target);
        term.args.forEach((arg, index) => {
          const definition = checkUse(arg, block.id, block.operations.length, `branch to ${term.target}`);
          const parameter = target?.parameters[index];
          if (parameter && definition && parameter.type.id !== definition.type.id) {
            report(`${prefix} passes ${definition.type.name} to block ${term.target}, expected ${parameter.type.name}.`);
          }
        });
        if (target && target.parameters.length !== term.args.length) {
          report(`Branch ${block.id} passes ${term.args.length} args to block ${term.target}, expected ${target.parameters.length}.`);
        }
      } else if (term.kind === 'CondBranch') {
        const condition = checkUse(term.condition, block.id, block.operations.length, 'conditional branch');
        if (condition && condition.type.id !== 'type:Bool') {
          report(`Conditional branch in block ${block.id} requires Bool, found ${condition.type.name}.`);
        }
        for (const [targetId, args] of [[term.trueTarget, term.trueArgs], [term.falseTarget, term.falseArgs]] as const) {
          const target = blocks.get(targetId);
          args.forEach((arg, index) => {
            const definition = checkUse(arg, block.id, block.operations.length, `conditional branch to ${targetId}`);
            const parameter = target?.parameters[index];
            if (parameter && definition && parameter.type.id !== definition.type.id) {
              report(`${prefix} passes ${definition.type.name} to block ${targetId}, expected ${parameter.type.name}.`);
            }
          });
          if (target && target.parameters.length !== args.length) {
            report(`Conditional branch ${block.id} passes invalid arguments to block ${targetId}.`);
          }
        }
      }
    }
  }
  return { success: errors.length === 0, errors };
}