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
  private nextBlock = 0;
  private nextValue = 0;
  private blocks: MutableBlock[] = [];
  private current!: MutableBlock;
  private locals: Locals = new Map();
  private resourceStack: Array<{ value: MIRValue; cleanup: string; source: MIRSource }> = [];
  private loopTargets: Array<{ breakTarget: number; continueTarget: number; resourceDepth: number }> = [];

  constructor(private readonly fn: HIRFunction) {}

  lower(): MIRFunction {
    const params = this.fn.params.map((param) => {
      const value = this.value(param.type, param.symbolId, param.name);
      this.locals.set(param.symbolId, value);
      return value;
    });
    const entry = this.newBlock('entry');
    this.current = entry;
    this.lowerBlock(this.fn.body);
    if (!this.current.terminator) {
      const result = this.fn.body.resultExpr ? this.lowerExpr(this.fn.body.resultExpr) : undefined;
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
    for (const stmt of block.statements) {
      if (this.current.terminator) break;
      this.lowerStmt(stmt);
    }
    return !this.current.terminator && block.resultExpr ? this.lowerExpr(block.resultExpr) : undefined;
  }

  private lowerStmt(stmt: HIRStmt): void {
    this.registerNode(stmt);
    switch (stmt.kind) {
      case 'HIRLetStmt': {
        const init = stmt.initializer ? this.lowerExpr(stmt.initializer) :
          this.emit('undef', [], stmt.type, stmt.id, { symbol: stmt.name });
        this.locals.set(stmt.symbolId, init);
        return;
      }
      case 'HIRAssignStmt': {
        const rhs = this.lowerExpr(stmt.value);
        if (stmt.target.kind === 'HIRLocalExpr') {
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
        this.releaseResources(0);
        this.terminate({ kind: 'Return', value: result?.id });
        return;
      }
      case 'HIRWithStmt': {
        const resource = this.lowerExpr(stmt.resource);
        const source = this.findOrigin(stmt.id) ?? { hirNodeId: stmt.id, span: stmt.source.span, file: stmt.source.file };
        this.current.resourceOps.push({ action: 'acquire', resourceId: resource.id, cleanup: stmt.cleanupContract, source });
        this.resourceStack.push({ value: resource, cleanup: stmt.cleanupContract, source });
        if (stmt.aliasSymbolId) this.locals.set(stmt.aliasSymbolId, resource);
        this.lowerBlock(stmt.body);
        if (!this.current.terminator) this.releaseResources(this.resourceStack.length - 1);
        return;
      }
      case 'HIRLoopStmt':
        this.lowerLoop(stmt);
        return;
      case 'HIRBreakStmt': {
        const target = this.loopTargets[this.loopTargets.length - 1];
        if (target) {
          this.releaseResources(target.resourceDepth);
          this.terminate({ kind: 'Branch', target: target.breakTarget, args: [] });
        }
        return;
      }
      case 'HIRContinueStmt': {
        const target = this.loopTargets[this.loopTargets.length - 1];
        if (target) {
          this.releaseResources(target.resourceDepth);
          this.terminate({ kind: 'Branch', target: target.continueTarget, args: [] });
        }
        return;
      }
    }
  }

  private releaseResources(depth: number): void {
    while (this.resourceStack.length > depth) {
      const resource = this.resourceStack.pop()!;
      this.current.resourceOps.push({
        action: 'release', resourceId: resource.value.id,
        cleanup: resource.cleanup, source: resource.source,
      });
    }
  }

  private lowerLoop(stmt: Extract<HIRStmt, { kind: 'HIRLoopStmt' }>): void {
    const preheader = this.current;
    const header = this.newBlock('loop.header');
    const body = this.newBlock('loop.body');
    const exit = this.newBlock('loop.exit');
    preheader.terminator = { kind: 'Branch', target: header.id, args: [] };
    this.current = header;
    let condition: MIRValue | undefined;
    if (stmt.loopKind === 'Condition' && stmt.condition) condition = this.lowerExpr(stmt.condition);
    if (stmt.loopKind === 'Iterator' && stmt.iterator) {
      const iterable = this.lowerExpr(stmt.iterator.iterable);
      const iterator = this.emit('iterator.begin', [iterable.id], stmt.iterator.iterable.type, stmt.id);
      const hasNext = this.emit('iterator.has_next', [iterator.id], HIR_BOOL_TYPE, stmt.id);
      condition = hasNext;
      const next = this.emit('iterator.next', [iterator.id], stmt.iterator.iterable.type.typeArguments?.[0] ?? stmt.iterator.iterable.type, stmt.id);
      this.locals.set(stmt.iterator.symbolId, next);
    }
    if (condition) this.terminate({ kind: 'CondBranch', condition: condition.id, trueTarget: body.id, trueArgs: [], falseTarget: exit.id, falseArgs: [] });
    else this.terminate({ kind: 'Branch', target: body.id, args: [] });
    this.current = body;
    this.loopTargets.push({ breakTarget: exit.id, continueTarget: header.id, resourceDepth: this.resourceStack.length });
    this.lowerBlock(stmt.body);
    this.loopTargets.pop();
    if (!this.current.terminator) this.terminate({ kind: 'Branch', target: header.id, args: [] });
    this.current = exit;
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
        const operand = this.lowerExpr(expr.operand);
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
        return this.emit('call', [callee.id, ...args.map((v) => v.id)], expr.type, expr.id, { functionId: expr.functionId, argumentCount: args.length });
      }
      case 'HIRFunctionValueCallExpr': {
        const callee = this.lowerExpr(expr.callee);
        const args = expr.args.map((arg) => this.lowerExpr(arg));
        return this.emit('call.indirect', [callee.id, ...args.map((v) => v.id)], expr.type, expr.id, { argumentCount: args.length });
      }
      case 'HIRMethodCallExpr': {
        const receiver = this.lowerExpr(expr.receiver);
        const args = expr.args.map((arg) => this.lowerExpr(arg));
        return this.emit('call.method', [receiver.id, ...args.map((v) => v.id)], expr.type, expr.id, {
          method: expr.method, dispatch: expr.dispatch.kind,
          implId: expr.dispatch.implId ?? null, methodId: expr.dispatch.methodId,
        });
      }
      case 'HIRFieldAccessExpr': {
        const target = this.lowerExpr(expr.target);
        return this.emit('field.get', [target.id], expr.type, expr.id, { fieldId: expr.fieldId, fieldName: expr.fieldName });
      }
      case 'HIRIndexExpr': {
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
    const thenBlock = this.newBlock('if.then');
    const elseBlock = this.newBlock('if.else');
    const join = this.newBlock('if.join', [expr.type]);
    this.terminate({ kind: 'CondBranch', condition: condition.id, trueTarget: thenBlock.id, trueArgs: [], falseTarget: elseBlock.id, falseArgs: [] });
    this.current = thenBlock;
    const thenValue = this.lowerBlock(expr.thenBranch) ?? this.emit('unit', [], expr.type, expr.id);
    if (!this.current.terminator) this.terminate({ kind: 'Branch', target: join.id, args: [thenValue.id] });
    this.current = elseBlock;
    let elseValue: MIRValue;
    if (!expr.elseBranch) elseValue = this.emit('unit', [], expr.type, expr.id);
    else if ('kind' in expr.elseBranch && expr.elseBranch.kind === 'HIRBlock') elseValue = this.lowerBlock(expr.elseBranch as HIRBlock) ?? this.emit('unit', [], expr.type, expr.id);
    else elseValue = this.lowerExpr(expr.elseBranch as HIRExpr);
    if (!this.current.terminator) this.terminate({ kind: 'Branch', target: join.id, args: [elseValue.id] });
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
    const functions: MIRFunction[] = [];
    const collect = (items: HIRProgram['topLevelItems']): void => {
      for (const item of items) {
        if (item.kind === 'HIRFunction') functions.push(new FunctionLowerer(item).lower());
        else if (item.kind === 'HIRImpl') {
          for (const method of item.methods) functions.push(new FunctionLowerer(method).lower());
        }
      }
    };
    collect(hir.topLevelItems);
    for (const module of hir.modules) collect(module.items);
    return { name: 'root', functions };
  }
}

/** Structural verifier used at the MIR boundary before backend consumption. */
export interface MIRValidationResult {
  readonly success: boolean;
  readonly errors: ReadonlyArray<string>;
}
export function validateMIR(module: MIRModule): MIRValidationResult {
  const errors: string[] = [];
  for (const fn of module.functions) {
    const blocks = new Map(fn.blocks.map((block) => [block.id, block]));
    if (!blocks.has(fn.entry)) errors.push(`Function '${fn.name}' has missing entry block.`);
    const values = new Set<number>();
    for (const block of fn.blocks) {
      for (const parameter of block.parameters) {
        if (values.has(parameter.id)) errors.push(`Function '${fn.name}' defines value %${parameter.id} more than once.`);
        values.add(parameter.id);
      }
      for (const op of block.operations) {
        if (op.dest !== undefined) {
          if (values.has(op.dest)) errors.push(`Function '${fn.name}' defines value %${op.dest} more than once.`);
          values.add(op.dest);
        }
      }
    }
    for (const block of fn.blocks) {
      const term = block.terminator;
      const targets = term.kind === 'Branch' ? [term.target] :
        term.kind === 'CondBranch' ? [term.trueTarget, term.falseTarget] : [];
      for (const target of targets) if (!blocks.has(target)) errors.push(`Block ${block.id} branches to missing block ${target}.`);
      if (term.kind === 'Branch') {
        const target = blocks.get(term.target);
        if (target && target.parameters.length !== term.args.length) errors.push(`Branch ${block.id} passes ${term.args.length} args to block ${term.target}, expected ${target.parameters.length}.`);
      }
      if (term.kind === 'CondBranch') {
        for (const [targetId, args] of [[term.trueTarget, term.trueArgs], [term.falseTarget, term.falseArgs]] as const) {
          const target = blocks.get(targetId);
          if (target && target.parameters.length !== args.length) errors.push(`Conditional branch ${block.id} passes invalid arguments to block ${targetId}.`);
        }
      }
    }
  }
  return { success: errors.length === 0, errors };
}
