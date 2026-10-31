/**
 * Seira MIR Optimization Foundation.
 *
 * This pass pipeline is deliberately conservative. It never removes calls,
 * resource events, dereferences, loads, field/index projections, or operations
 * whose runtime behavior may panic. Optimization happens on typed MIR and the
 * driver verifies the result after every pipeline run.
 */

import type {
  BasicBlock,
  MIRFunction,
  MIRModule,
  MIROperation,
  MIRResourceOp,
  MIRTerminator,
} from './index.ts';

export type MIROptLevel = 0 | 1 | 2 | 3;

export interface MIROptimizationStats {
  readonly constantFolds: number;
  readonly branchesFolded: number;
  readonly unreachableBlocksRemoved: number;
  readonly deadOperationsRemoved: number;
}

export interface MIROptimizationResult {
  readonly module: MIRModule;
  readonly stats: MIROptimizationStats;
  readonly passesRun: ReadonlyArray<string>;
  readonly verificationFailures: ReadonlyArray<MIRPassVerificationFailure>;
}

interface ConstantValue {
  readonly typeName: string;
  readonly value: bigint | number | boolean | string | null;
}

interface MutableStats {
  constantFolds: number;
  branchesFolded: number;
  unreachableBlocksRemoved: number;
  deadOperationsRemoved: number;
}

function readConstant(operation: MIROperation): ConstantValue | undefined {
  if (operation.opcode !== 'const' || !operation.type || !operation.attributes ||
      !Object.prototype.hasOwnProperty.call(operation.attributes, 'value')) {
    return undefined;
  }

  const typeName = operation.type.name;
  const value = operation.attributes.value;
  if (value === null) return { typeName, value: null };

  switch (typeName) {
    case 'Int':
      if (typeof value !== 'string' && typeof value !== 'number') return undefined;
      try { return { typeName, value: BigInt(value) }; } catch { return undefined; }
    case 'Float': {
      const parsed = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(parsed) ? { typeName, value: parsed } : undefined;
    }
    case 'Bool':
      if (typeof value === 'boolean') return { typeName, value };
      if (value === 'true' || value === 'false') return { typeName, value: value === 'true' };
      return undefined;
    case 'String':
    case 'Char':
      return typeof value === 'string' ? { typeName, value } : undefined;
    default:
      return undefined;
  }
}

function foldBinary(
  operation: MIROperation,
  left: ConstantValue | undefined,
  right: ConstantValue | undefined,
): ConstantValue | undefined {
  if (!left || !right || !operation.type || left.typeName !== right.typeName) return undefined;
  const operator = operation.attributes?.operator;
  if (typeof operator !== 'string') return undefined;
  const resultType = operation.type.name;

  if (left.typeName === 'Int' && typeof left.value === 'bigint' && typeof right.value === 'bigint') {
    const a = left.value;
    const b = right.value;
    switch (operator) {
      case '+': return { typeName: resultType, value: a + b };
      case '-': return { typeName: resultType, value: a - b };
      case '*': return { typeName: resultType, value: a * b };
      case '/': return b === 0n ? undefined : { typeName: resultType, value: a / b };
      case '%': return b === 0n ? undefined : { typeName: resultType, value: a % b };
      case '==': return { typeName: 'Bool', value: a === b };
      case '!=': return { typeName: 'Bool', value: a !== b };
      case '<': return { typeName: 'Bool', value: a < b };
      case '<=': return { typeName: 'Bool', value: a <= b };
      case '>': return { typeName: 'Bool', value: a > b };
      case '>=': return { typeName: 'Bool', value: a >= b };
      default: return undefined;
    }
  }

  if (left.typeName === 'Float' && typeof left.value === 'number' && typeof right.value === 'number') {
    const a = left.value;
    const b = right.value;
    switch (operator) {
      case '+': return { typeName: resultType, value: a + b };
      case '-': return { typeName: resultType, value: a - b };
      case '*': return { typeName: resultType, value: a * b };
      case '/': return b === 0 ? undefined : { typeName: resultType, value: a / b };
      case '%': return b === 0 ? undefined : { typeName: resultType, value: a % b };
      case '==': return { typeName: 'Bool', value: a === b };
      case '!=': return { typeName: 'Bool', value: a !== b };
      case '<': return { typeName: 'Bool', value: a < b };
      case '<=': return { typeName: 'Bool', value: a <= b };
      case '>': return { typeName: 'Bool', value: a > b };
      case '>=': return { typeName: 'Bool', value: a >= b };
      default: return undefined;
    }
  }

  if (operator === '==' || operator === '!=') {
    if (left.typeName === 'Bool' && typeof left.value === 'boolean' && typeof right.value === 'boolean') {
      return { typeName: 'Bool', value: operator === '==' ? left.value === right.value : left.value !== right.value };
    }
    if ((left.typeName === 'String' || left.typeName === 'Char') &&
        typeof left.value === 'string' && typeof right.value === 'string') {
      return { typeName: 'Bool', value: operator === '==' ? left.value === right.value : left.value !== right.value };
    }
  }
  return undefined;
}

function foldUnary(operation: MIROperation, operand: ConstantValue | undefined): ConstantValue | undefined {
  if (!operand || !operation.type) return undefined;
  const operator = operation.attributes?.operator;
  if (typeof operator !== 'string') return undefined;

  if (operator === '-' && operand.typeName === 'Int' && typeof operand.value === 'bigint') {
    return { typeName: operation.type.name, value: -operand.value };
  }
  if (operator === '+' && operand.typeName === 'Int' && typeof operand.value === 'bigint') {
    return { typeName: operation.type.name, value: operand.value };
  }
  if (operator === '-' && operand.typeName === 'Float' && typeof operand.value === 'number') {
    return { typeName: operation.type.name, value: -operand.value };
  }
  if (operator === '+' && operand.typeName === 'Float' && typeof operand.value === 'number') {
    return { typeName: operation.type.name, value: operand.value };
  }
  if (operator === 'not' && operand.typeName === 'Bool' && typeof operand.value === 'boolean') {
    return { typeName: 'Bool', value: !operand.value };
  }
  return undefined;
}

function constantOperation(operation: MIROperation, constant: ConstantValue): MIROperation {
  const value = typeof constant.value === 'bigint' ? constant.value.toString() : constant.value;
  return {
    ...operation,
    op: 'const',
    opcode: 'const',
    operands: [],
    attributes: {
      literalKind: constant.typeName,
      value,
      raw: value === null ? 'unit' : String(value),
    },
  };
}

function foldBlock(block: BasicBlock, stats: MutableStats): { block: BasicBlock; constants: Map<number, ConstantValue> } {
  const constants = new Map<number, ConstantValue>();
  const operations = block.operations.map((operation) => {
    if (operation.opcode === 'const' && operation.dest !== undefined) {
      const value = readConstant(operation);
      if (value) constants.set(operation.dest, value);
      return operation;
    }

    let folded: ConstantValue | undefined;
    if (operation.opcode === 'binary' && operation.operands.length === 2) {
      folded = foldBinary(operation, constants.get(operation.operands[0]), constants.get(operation.operands[1]));
    } else if (operation.opcode === 'unary' && operation.operands.length === 1) {
      folded = foldUnary(operation, constants.get(operation.operands[0]));
    }

    if (folded && operation.dest !== undefined) {
      const replacement = constantOperation(operation, folded);
      constants.set(operation.dest, folded);
      stats.constantFolds++;
      return replacement;
    }
    if (operation.dest !== undefined) constants.delete(operation.dest);
    return operation;
  });

  let terminator = block.terminator;
  if (terminator.kind === 'CondBranch') {
    const condition = constants.get(terminator.condition);
    if (condition?.typeName === 'Bool' && typeof condition.value === 'boolean') {
      terminator = condition.value
        ? { kind: 'Branch', target: terminator.trueTarget, args: terminator.trueArgs }
        : { kind: 'Branch', target: terminator.falseTarget, args: terminator.falseArgs };
      stats.branchesFolded++;
    }
  }

  return { block: { ...block, operations, terminator }, constants };
}

function reachableBlocks(fn: MIRFunction): Set<number> {
  const byId = new Map(fn.blocks.map((block) => [block.id, block]));
  const reachable = new Set<number>();
  const pending = [fn.entry];
  while (pending.length > 0) {
    const id = pending.pop()!;
    if (reachable.has(id)) continue;
    const block = byId.get(id);
    if (!block) continue;
    reachable.add(id);
    const term = block.terminator;
    if (term.kind === 'Branch') pending.push(term.target);
    else if (term.kind === 'CondBranch') pending.push(term.trueTarget, term.falseTarget);
  }
  return reachable;
}

function valueTypes(fn: MIRFunction): Map<number, string> {
  const types = new Map<number, string>();
  for (const parameter of fn.parameters) types.set(parameter.id, parameter.type.name);
  for (const block of fn.blocks) {
    for (const parameter of block.parameters) types.set(parameter.id, parameter.type.name);
    for (const operation of block.operations) {
      if (operation.dest !== undefined && operation.type) types.set(operation.dest, operation.type.name);
    }
  }
  return types;
}

function isSafeToRemove(operation: MIROperation, types: Map<number, string>): boolean {
  if (operation.opcode === 'const' || operation.opcode === 'unit') return true;

  if (operation.opcode === 'unary' && operation.operands.length === 1) {
    const operator = operation.attributes?.operator;
    const operandType = types.get(operation.operands[0]);
    return (
      (operator === '+' || operator === '-') && (operandType === 'Int' || operandType === 'Float') ||
      operator === 'not' && operandType === 'Bool'
    );
  }

  if (operation.opcode === 'binary' && operation.operands.length === 2) {
    const operator = operation.attributes?.operator;
    const leftType = types.get(operation.operands[0]);
    const rightType = types.get(operation.operands[1]);
    if (!leftType || leftType !== rightType) return false;
    if (['+', '-', '*'].includes(String(operator))) return leftType === 'Int' || leftType === 'Float';
    if (['==', '!='].includes(String(operator))) return ['Int', 'Float', 'Bool', 'String', 'Char'].includes(leftType);
    if (['<', '<=', '>', '>='].includes(String(operator))) return ['Int', 'Float'].includes(leftType);
  }
  return false;
}

function deadCodeEliminate(fn: MIRFunction, stats: MutableStats): MIRFunction {
  let blocks = fn.blocks.map((block) => ({ ...block, operations: [...block.operations] }));
  let changed = true;

  while (changed) {
    changed = false;
    const uses = new Map<number, number>();
    for (const block of blocks) {
      for (const operation of block.operations) {
        for (const operand of operation.operands) uses.set(operand, (uses.get(operand) ?? 0) + 1);
      }
      const terminator = block.terminator;
      if (terminator.kind === 'Return' && terminator.value !== undefined) {
        uses.set(terminator.value, (uses.get(terminator.value) ?? 0) + 1);
      } else if (terminator.kind === 'Branch') {
        for (const arg of terminator.args) uses.set(arg, (uses.get(arg) ?? 0) + 1);
      } else if (terminator.kind === 'CondBranch') {
        uses.set(terminator.condition, (uses.get(terminator.condition) ?? 0) + 1);
        for (const arg of [...terminator.trueArgs, ...terminator.falseArgs]) uses.set(arg, (uses.get(arg) ?? 0) + 1);
      }
      for (const resource of block.resourceOps) {
        uses.set(resource.resourceId, (uses.get(resource.resourceId) ?? 0) + 1);
      }
    }

    const types = valueTypes({ ...fn, blocks });
    const nextBlocks: BasicBlock[] = [];
    for (const block of blocks) {
      const retained: MIROperation[] = [];
      const removedIndexes = new Set<number>();
      for (let index = 0; index < block.operations.length; index++) {
        const operation = block.operations[index];
        const dead = operation.dest !== undefined && (uses.get(operation.dest) ?? 0) === 0 &&
          isSafeToRemove(operation, types);
        if (dead) {
          changed = true;
          stats.deadOperationsRemoved++;
          removedIndexes.add(index);
        } else {
          retained.push(operation);
        }
      }

      const resourceOps: MIRResourceOp[] = block.resourceOps.map((resource) => {
        if (resource.position === undefined) return resource;
        let removedBefore = 0;
        for (const index of removedIndexes) if (index < resource.position) removedBefore++;
        return { ...resource, position: Math.max(0, resource.position - removedBefore) };
      });
      nextBlocks.push({ ...block, operations: retained, resourceOps });
    }
    blocks = nextBlocks;
  }

  return { ...fn, blocks };
}

function foldConstants(module: MIRModule, stats: MutableStats): MIRModule {
  return {
    ...module,
    functions: module.functions.map((fn) => ({
      ...fn,
      blocks: fn.blocks.map((block) => foldBlock(block, stats).block),
    })),
  };
}

function removeUnreachableBlocks(module: MIRModule, stats: MutableStats): MIRModule {
  return {
    ...module,
    functions: module.functions.map((fn) => {
      const reachable = reachableBlocks(fn);
      stats.unreachableBlocksRemoved += fn.blocks.length - reachable.size;
      return { ...fn, blocks: fn.blocks.filter((block) => reachable.has(block.id)) };
    }),
  };
}

function eliminateDeadPureOperations(module: MIRModule, stats: MutableStats): MIRModule {
  return {
    ...module,
    functions: module.functions.map((fn) => deadCodeEliminate(fn, stats)),
  };
}

export interface MIRPass {
  /** Stable, diagnostic-friendly pass identifier. */
  readonly name: string;
  run(module: MIRModule): MIRModule;
}

export interface MIRPassVerificationFailure {
  readonly passName: string;
  readonly errors: ReadonlyArray<string>;
}

export type MIRPassVerifier = (module: MIRModule, passName: string) => ReadonlyArray<string>;

export interface MIRPassManagerResult {
  readonly module: MIRModule;
  readonly passesRun: ReadonlyArray<string>;
  readonly verificationFailures: ReadonlyArray<MIRPassVerificationFailure>;
}

/**
 * Executes passes in declared order. A candidate is committed only after the
 * optional verifier accepts it, so an invalid pass result never feeds a later
 * pass. The caller owns the MIR verifier to keep this module independent from
 * compiler-driver diagnostics.
 */
export function runMIRPasses(
  input: MIRModule,
  passes: ReadonlyArray<MIRPass>,
  verify?: MIRPassVerifier,
): MIRPassManagerResult {
  let module = input;
  const passesRun: string[] = [];
  const verificationFailures: MIRPassVerificationFailure[] = [];

  for (const pass of passes) {
    const candidate = pass.run(module);
    const errors = verify?.(candidate, pass.name) ?? [];
    if (errors.length > 0) {
      verificationFailures.push({ passName: pass.name, errors });
      break;
    }
    module = candidate;
    passesRun.push(pass.name);
  }

  return { module, passesRun, verificationFailures };
}

/**
 * Runs the conservative MIR optimization pipeline. Levels 2/3 intentionally
 * reuse the same proven-safe pass set until additional families are specified.
 */
export function optimizeMIR(
  module: MIRModule,
  level: MIROptLevel = 1,
  verify?: MIRPassVerifier,
): MIROptimizationResult {
  const stats: MutableStats = {
    constantFolds: 0,
    branchesFolded: 0,
    unreachableBlocksRemoved: 0,
    deadOperationsRemoved: 0,
  };

  if (level === 0) {
    return {
      module,
      stats,
      passesRun: [],
      verificationFailures: [],
    };
  }

  const passes: ReadonlyArray<MIRPass> = [
    { name: 'constant-fold-and-branch-simplification', run: (input) => foldConstants(input, stats) },
    { name: 'unreachable-block-elimination', run: (input) => removeUnreachableBlocks(input, stats) },
    { name: 'dead-pure-operation-elimination', run: (input) => eliminateDeadPureOperations(input, stats) },
  ];
  const result = runMIRPasses(module, passes, verify);

  return {
    module: result.module,
    stats,
    passesRun: result.passesRun,
    verificationFailures: result.verificationFailures,
  };
}
