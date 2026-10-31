/**
 * Experimental MIR interpreter for Seira's verified scalar/CFG subset.
 * It is a development oracle, not a replacement for the AST runtime or a native/WASM backend.
 * Unsupported operations fail closed with E9101.
 */
import { validateMIR, type BasicBlock, type MIRFunction, type MIRModule, type MIROperation, type ValueId } from './index.ts';

interface MIRCallable { readonly kind: 'function'; readonly name: string; }
export type MIRRuntimeValue = bigint | number | boolean | string | null | MIRCallable;
export interface MIRInterpreterOptions { readonly maxSteps?: number; readonly maxCallDepth?: number; }
export interface MIRExecutionError { readonly code: string; readonly message: string; }
export interface MIRExecutionResult {
  readonly success: boolean;
  readonly value?: MIRRuntimeValue;
  readonly displayValue?: string;
  readonly error?: MIRExecutionError;
  readonly steps: number;
}
class MIRExecutionFault extends Error {
  public readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'MIRExecutionFault';
  }
}

/**
 * Supports scalar const/unit/copy, in-module function references and direct calls,
 * binary/unary scalar operations, borrow.end, and Return/Branch/CondBranch/Panic.
 * Resource events, aggregates, references, iterators, host and indirect calls are
 * deliberately rejected until their runtime semantics are implemented.
 */
export class MIRInterpreter {
  private readonly functionsById = new Map<string, MIRFunction>();
  private readonly functionsByName = new Map<string, MIRFunction>();
  private readonly maxSteps: number;
  private readonly maxCallDepth: number;
  private steps = 0;

  private readonly module: MIRModule;

  constructor(module: MIRModule, options: MIRInterpreterOptions = {}) {
    this.module = module;
    this.maxSteps = this.limit(options.maxSteps, 100_000);
    this.maxCallDepth = this.limit(options.maxCallDepth, 256);
    for (const fn of module.functions) {
      this.functionsById.set(fn.functionId, fn);
      if (!this.functionsByName.has(fn.name)) this.functionsByName.set(fn.name, fn);
    }
  }

  public execute(entry = 'main', args: ReadonlyArray<MIRRuntimeValue> = []): MIRExecutionResult {
    this.steps = 0;
    const validation = validateMIR(this.module);
    if (!validation.success) return {
      success: false, error: { code: 'E9003', message: validation.errors.join('\n') }, steps: 0,
    };
    const fn = this.functionsById.get(entry) ?? this.functionsByName.get(entry);
    if (!fn) return {
      success: false, error: { code: 'E9100', message: 'MIR entry function ' + entry + ' was not found.' }, steps: 0,
    };
    try {
      const value = this.executeFunction(fn, args, 1);
      return { success: true, value, displayValue: this.formatValue(value), steps: this.steps };
    } catch (error) {
      const fault = error instanceof MIRExecutionFault
        ? error
        : new MIRExecutionFault('E9102', error instanceof Error ? error.message : String(error));
      return { success: false, error: { code: fault.code, message: fault.message }, steps: this.steps };
    }
  }

  private limit(value: number | undefined, fallback: number): number {
    return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value! : fallback;
  }
  private tick(context: string): void {
    if (++this.steps > this.maxSteps) {
      throw new MIRExecutionFault('E9103', 'MIR execution exceeded the step limit at ' + context + '.');
    }
  }
  private executeFunction(fn: MIRFunction, args: ReadonlyArray<MIRRuntimeValue>, depth: number): MIRRuntimeValue {
    if (depth > this.maxCallDepth) throw new MIRExecutionFault('E9104', 'MIR call depth exceeded ' + this.maxCallDepth + '.');
    if (args.length !== fn.parameters.length) throw new MIRExecutionFault(
      'E9102', 'Function ' + fn.name + ' expected ' + fn.parameters.length + ' arguments, received ' + args.length + '.',
    );
    const values = new Map<ValueId, MIRRuntimeValue>();
    fn.parameters.forEach((parameter, index) => values.set(parameter.id, args[index]));
    const blocks = new Map<number, BasicBlock>();
    for (const candidate of fn.blocks) blocks.set(candidate.id, candidate);
    let block = blocks.get(fn.entry);
    if (!block) throw new MIRExecutionFault('E9003', 'Function ' + fn.name + ' has no entry block.');
    if (block.parameters.length) throw new MIRExecutionFault('E9003', 'Entry block parameters are unsupported.');
    while (true) {
      if (block.resourceOps.length) throw new MIRExecutionFault(
        'E9101', 'Resource acquire/release events are not executable yet (function ' + fn.name + ', block ' + block.id + ').',
      );
      for (const operation of block.operations) {
        this.tick(fn.name + ':' + block.name + ':' + operation.opcode);
        const value = this.executeOperation(operation, values, depth, fn.name);
        if (operation.dest !== undefined) {
          if (value === undefined) throw new MIRExecutionFault('E9102', 'Operation ' + operation.opcode + ' produced no value.');
          values.set(operation.dest, value);
        }
      }
      this.tick(fn.name + ':' + block.name + ':terminator);
      const term: BasicBlock['terminator'] = block.terminator;
      if (term.kind === 'Return') return term.value === undefined ? null : this.read(values, term.value, 'return');
      if (term.kind === 'Panic') throw new MIRExecutionFault('E9102', term.message);
      if (term.kind === 'Unreachable') throw new MIRExecutionFault('E9102', 'Reached unreachable block ' + block.id + '.');
      if (term.kind === 'Branch') {
        block = this.enterBlock(blocks, term.target, term.args, values);
        continue;
      }
      if (term.kind === 'CondBranch') {
        const condition = this.read(values, term.condition, 'conditional branch');
        if (typeof condition !== 'boolean') throw new MIRExecutionFault('E9102', 'MIR conditional branch requires Bool.');
        block = condition
          ? this.enterBlock(blocks, term.trueTarget, term.trueArgs, values)
          : this.enterBlock(blocks, term.falseTarget, term.falseArgs, values);
        continue;
      }
      throw new MIRExecutionFault('E9003', 'Unknown MIR terminator encountered.');
    }
  }

  private enterBlock(
    blocks: ReadonlyMap<number, BasicBlock>, targetId: number, ids: ReadonlyArray<ValueId>,
    values: Map<ValueId, MIRRuntimeValue>,
  ): BasicBlock {
    const target = blocks.get(targetId);
    if (!target || target.parameters.length !== ids.length) {
      throw new MIRExecutionFault('E9003', 'Invalid MIR branch target or block-parameter arity at block ' + targetId + '.');
    }
    const incoming = ids.map((id) => this.read(values, id, 'branch argument'));
    target.parameters.forEach((parameter, index) => values.set(parameter.id, incoming[index]));
    return target;
  }

  private executeOperation(
    operation: MIROperation, values: Map<ValueId, MIRRuntimeValue>, depth: number, functionName: string,
  ): MIRRuntimeValue | undefined {
    const attrs = operation.attributes ?? {};
    const operand = (index: number): MIRRuntimeValue => {
      const id = operation.operands[index];
      if (id === undefined) throw new MIRExecutionFault('E9003', 'Missing operand ' + index + ' for ' + operation.opcode + '.');
      return this.read(values, id, operation.opcode);
    };
    switch (operation.opcode) {
      case 'const': return this.constant(attrs, operation.type?.name ?? '');
      case 'unit': return null;
      case 'copy': return operand(0);
      case 'borrow.end': return undefined;
      case 'local.read':
      case 'global.read': {
        const name = String(attrs.name ?? attrs.symbolId ?? '<unknown>');
        if (!this.functionsByName.has(name)) throw new MIRExecutionFault(
          'E9101', 'MIR symbol ' + name + ' is not an in-module function reference; local/global data access is unsupported.',
        );
        return { kind: 'function', name };
      }
      case 'binary': return this.binary(String(attrs.operator ?? ''), operand(0), operand(1), operation.type?.name ?? '');
      case 'unary': return this.unary(String(attrs.operator ?? ''), operand(0));
      case 'call': {
        const id = typeof attrs.functionId === 'string' ? attrs.functionId : undefined;
        const callee = operand(0);
        const target = (id ? this.functionsById.get(id) : undefined)
          ?? (callee && typeof callee === 'object' && callee.kind === 'function' ? this.functionsByName.get(callee.name) : undefined);
        if (!target) throw new MIRExecutionFault(
          'E9101', 'Direct call target is not present in this MIR module; host/external calls are unsupported.',
        );
        const count = typeof attrs.argumentCount === 'number' ? attrs.argumentCount : operation.operands.length - 1;
        if (count !== operation.operands.length - 1) throw new MIRExecutionFault('E9003', 'MIR call argument count mismatch.');
        const callArgs = operation.operands.slice(1).map((id) => this.read(values, id, 'call argument'));
        return this.executeFunction(target, callArgs, depth + 1);
      }
      default: throw new MIRExecutionFault(
        'E9101', 'MIR opcode ' + operation.opcode + ' is not implemented (function ' + functionName + ').',
      );
    }
  }

  private constant(attrs: Readonly<Record<string, string | number | boolean | null>>, typeName: string): MIRRuntimeValue {
    const kind = String(attrs.literalKind ?? typeName).toLowerCase();
    const value = attrs.value;
    if (kind === 'int' || kind === 'uint') {
      if (typeof value === 'number') return BigInt(Math.trunc(value));
      if (typeof value === 'string' && value.length) return BigInt(value.replaceAll('_', '').replace(/u$/, ''));
      throw new MIRExecutionFault('E9102', 'Invalid integer constant in MIR.');
    }
    if (kind === 'float') {
      const number = typeof value === 'number' ? value : Number(value);
      if (Number.isNaN(number)) throw new MIRExecutionFault('E9102', 'Invalid Float constant in MIR.');
      return number;
    }
    if (kind === 'bool') {
      if (typeof value !== 'boolean') throw new MIRExecutionFault('E9102', 'Invalid Bool constant in MIR.');
      return value;
    }
    if (kind === 'string' || kind === 'char') {
      if (typeof value !== 'string') throw new MIRExecutionFault('E9102', 'Invalid String/Char constant in MIR.');
      return value;
    }
    if (kind === 'unit' || value === null) return null;
    throw new MIRExecutionFault('E9101', 'MIR constant kind ' + kind + ' is unsupported.');
  }

  private unary(operator: string, value: MIRRuntimeValue): MIRRuntimeValue {
    if (operator === 'not' && typeof value === 'boolean') return !value;
    if (operator === '-' && typeof value === 'bigint') return -value;
    if (operator === '-' && typeof value === 'number') return -value;
    if (operator === 'not') throw new MIRExecutionFault('E9102', 'Unary not requires Bool.');
    throw new MIRExecutionFault('E9101', 'Unary operator ' + operator + ' is unsupported.');
  }

  private binary(operator: string, left: MIRRuntimeValue, right: MIRRuntimeValue, resultType: string): MIRRuntimeValue {
    if (operator === '==' || operator === '!=') {
      if (left === null && right === null) return operator === '==';
      if (typeof left === 'object' || typeof right === 'object') {
        throw new MIRExecutionFault('E9101', 'Equality for aggregate/function values is unsupported.');
      }
      const equal = typeof left === typeof right && left === right;
      return operator === '==' ? equal : !equal;
    }
    if (typeof left === 'bigint' && typeof right === 'bigint') {
      switch (operator) {
        case '+': return left + right;
        case '-':
          if (resultType === 'UInt' && left < right) throw new MIRExecutionFault('E9102', 'Unsigned integer subtraction underflow.');
          return left - right;
        case '*': return left * right;
        case '/': if (right === 0n) throw new MIRExecutionFault('E9102', 'Integer division by zero.'); return left / right;
        case '%': if (right === 0n) throw new MIRExecutionFault('E9102', 'Integer remainder by zero.'); return left % right;
        case '<': return left < right;
        case '<=': return left <= right;
        case '>': return left > right;
        case '>=': return left >= right;
      }
    }
    if (typeof left === 'number' && typeof right === 'number') {
      switch (operator) {
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/': return left / right;
        case '%': return left % right;
        case '<': return left < right;
        case '<=': return left <= right;
        case '>': return left > right;
        case '>=': return left >= right;
      }
    }
    if (typeof left === 'string' && typeof right === 'string') {
      if (operator === '+') return left + right;
      switch (operator) {
        case '<': return left < right;
        case '<=': return left <= right;
        case '>': return left > right;
        case '>=': return left >= right;
      }
    }
    throw new MIRExecutionFault('E9102', 'Operator ' + operator + ' cannot be applied to these MIR values.');
  }

  private read(values: ReadonlyMap<ValueId, MIRRuntimeValue>, id: ValueId, context: string): MIRRuntimeValue {
    if (!values.has(id)) throw new MIRExecutionFault('E9003', 'MIR value %' + id + ' is unavailable during ' + context + '.');
    return values.get(id)!;
  }
  private formatValue(value: MIRRuntimeValue): string {
    if (value === null) return '()';
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'string') return value;
    return '<function ' + value.name + '>';
  }
}
