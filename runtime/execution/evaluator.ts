/**
 * Seira Tree-Walking Execution Engine (0.0.5-s Execution Foundation)
 *
 * Executes semantically validated Seira AST nodes directly.
 *
 * ARCHITECTURE NOTE:
 * Tree-walking execution is the deliberate 0.0.5-s implementation strategy.
 * It is NOT a permanent limitation of the Seira language. Future milestones
 * will introduce HIR/MIR lowering and native/WASM code generation while
 * preserving identical observable Seira semantics.
 *
 * Design Principles enforced here:
 *   - No JavaScript truthiness: Bool(true) ≠ Int(1), 0 is not false
 *   - No null semantics: Option<T> is used for absence, not JS null/undefined
 *   - No implicit coercions: Int + String is a semantic error
 *   - Deterministic left-to-right evaluation
 *   - Explicit scope entry/exit for every block
 *   - Function calls respect the closure environment captured at declaration
 *   - Pipeline: `data |> f` ≡ `f(data)`, `data |> f(x)` ≡ `f(data, x)`
 *
 * Execution pipeline:
 *   Source → Lexer → Parser → AST → Resolver → TypeChecker → Evaluator → RuntimeOutcome
 */

import type {
  AssignmentExpr,
  AssignStmt,
  BinaryExpr,
  BindingStmt,
  Block,
  BlockExpr,
  CallExpr,
  ConstStmt,
  Expr,
  ExprStmt,
  FunctionDecl,
  Identifier,
  IfExpr,
  LetStmt,
  Literal,
  MemberExpr,
  OptionFallbackExpr,
  OptionPropagateExpr,
  PipelineExpr,
  Program,
  ReturnStmt,
  Stmt,
  UnaryExpr,
  WithStmt,
} from '../../compiler/ast/ast.ts';
import type { Span } from '../../compiler/source/span.ts';
import { DiagnosticBag } from '../../compiler/diagnostics/index.ts';
import {
  divisionByZeroError,
  invalidStateError,
  isPanic,
  isReturn,
  normalOutcome,
  panicOutcome,
  returnOutcome,
  stackOverflowError,
  uintUnderflowError,
  unsupportedOperationError,
  type NormalOutcome,
  type PanicOutcome,
  type ReturnOutcome,
  type RuntimeError,
  type RuntimeOutcome,
} from './outcomes.ts';
import {
  formatRuntimeValue,
  rtBool,
  rtBuiltin,
  rtChar,
  rtErr,
  rtFloat,
  rtFunction,
  rtInt,
  rtList,
  rtNone,
  rtOk,
  rtSome,
  rtString,
  rtUInt,
  runtimeValuesEqual,
  RuntimeEnvironment,
  UNIT_VALUE,
  type BoolRuntimeValue,
  type BuiltinRuntimeValue,
  type FunctionRuntimeValue,
  type IntRuntimeValue,
  type ListRuntimeValue,
  type OptionRuntimeValue,
  type ResultRuntimeValue,
  type RuntimeValue,
  type UIntRuntimeValue,
} from './values.ts';

// ─── Execution Context ────────────────────────────────────────────────────────

export interface ExecutionConfig {
  /** Maximum call stack depth before a stack-overflow panic is triggered. */
  readonly maxStackDepth: number;
  /** Whether to emit println/print output to stdout. */
  readonly enableOutput: boolean;
  /** Source file name, used in runtime error reporting. */
  readonly fileName?: string;
}

function defaultConfig(overrides?: Partial<ExecutionConfig>): ExecutionConfig {
  return {
    maxStackDepth: 512,
    enableOutput: true,
    ...overrides,
  };
}

/** Represents a single activation record on the call stack. */
export interface CallFrame {
  readonly functionName: string;
  readonly callSite?: Span;
}

/**
 * ExecutionContext holds the state of a single Seira execution session.
 *
 * - Independent per execution — no shared global state.
 * - Owns the root environment and call stack.
 * - Provides structured runtime diagnostics.
 */
export class ExecutionContext {
  public readonly config: ExecutionConfig;
  public readonly diagnostics: DiagnosticBag;
  private readonly callStack: CallFrame[] = [];
  private outputLines: string[] = [];

  constructor(config?: Partial<ExecutionConfig>, diagnostics?: DiagnosticBag) {
    this.config = defaultConfig(config);
    this.diagnostics = diagnostics ?? new DiagnosticBag();
  }

  public pushFrame(frame: CallFrame): void {
    this.callStack.push(frame);
  }

  public popFrame(): void {
    this.callStack.pop();
  }

  public currentDepth(): number {
    return this.callStack.length;
  }

  public getCallStack(): ReadonlyArray<CallFrame> {
    return this.callStack;
  }

  public emitOutput(line: string): void {
    if (this.config.enableOutput) {
      console.log(line);
    }
    this.outputLines.push(line);
  }

  public getCapturedOutput(): ReadonlyArray<string> {
    return this.outputLines;
  }

  /** Reports a structured runtime error to the diagnostic bag. */
  public reportRuntimeError(error: RuntimeError): void {
    const span = error.span ?? { start: 0, end: 0, line: 1, column: 1 };
    this.diagnostics.reportError(
      error.code,
      error.message,
      span,
      error.file ?? this.config.fileName,
      error.help,
      undefined,
      error.notes?.[0]
    );
  }
}

// ─── Evaluator ────────────────────────────────────────────────────────────────

/**
 * Tree-Walking Evaluator for the Seira language.
 *
 * Executes programs and expressions by directly walking the verified AST.
 * All execution assumes the AST has already passed resolver and type-checker
 * validation — the evaluator trusts the front-end's correctness.
 */
export class Evaluator {
  private readonly ctx: ExecutionContext;
  /** Global-scope function declarations, hoisted before execution. */
  private readonly globalFunctions = new Map<string, FunctionDecl>();

  constructor(ctx: ExecutionContext) {
    this.ctx = ctx;
  }

  // ─── Program Entry ────────────────────────────────────────────────────────

  /**
   * Executes an entire Seira program.
   * Hoists all top-level function declarations, then executes top-level statements
   * and expression statements in order.
   */
  public executeProgram(program: Program): RuntimeOutcome {
    // Build the global execution environment
    const env = new RuntimeEnvironment(undefined, 'global');

    // Hoist all top-level function declarations into the global environment.
    // This allows forward references to functions declared after their call site.
    for (const item of program.items) {
      if (item.kind === 'FunctionDecl') {
        const fn = item as FunctionDecl;
        this.globalFunctions.set(fn.name, fn);
        const fnVal = rtFunction(fn.name, fn, env);
        env.define(fn.name, fnVal, false);
      }
    }

    // Register built-in functions in the environment
    this.registerBuiltins(env);

    // ── Program Entry Model (Locked 0.0.5-s Decision B) ──────────────────────
    // Mode 2 — Application Entry:
    // If `fn main()` exists, it is the sole application entry point.
    // Execute top-level definitions (const declarations) so main can reference them,
    // but DO NOT execute top-level executable statements/expressions (prevents dual execution).
    if (this.globalFunctions.has('main')) {
      for (const item of program.items) {
        if (item.kind === 'ConstStmt') {
          const outcome = this.executeConstStmt(item as ConstStmt, env);
          if (isPanic(outcome)) return outcome;
        }
      }
      return this.callFunctionByName('main', [], undefined, env);
    }

    // Mode 1 — Top-Level Program:
    // If no `fn main()` exists, execute top-level statements/expressions normally.
    let lastOutcome: RuntimeOutcome = normalOutcome(UNIT_VALUE);
    for (const item of program.items) {
      if (item.kind === 'FunctionDecl') continue; // already hoisted
      const outcome = this.executeStatement(item as Stmt, env);
      if (isPanic(outcome)) return outcome;
      lastOutcome = outcome;
    }

    return lastOutcome;
  }

  // ─── Built-ins ────────────────────────────────────────────────────────────

  private registerBuiltins(env: RuntimeEnvironment): void {
    const builtinNames = [
      'println', 'print', 'Some', 'None', 'Ok', 'Err',
      'open_resource',
    ];
    for (const name of builtinNames) {
      env.define(name, rtBuiltin(name), false);
    }
  }

  // ─── Statement Execution ──────────────────────────────────────────────────

  public executeStatement(stmt: Stmt, env: RuntimeEnvironment): RuntimeOutcome {
    switch (stmt.kind) {
      case 'BindingStmt':
        return this.executeBindingStmt(stmt as BindingStmt, env);
      case 'LetStmt':
        return this.executeLetStmt(stmt as LetStmt, env);
      case 'ConstStmt':
        return this.executeConstStmt(stmt as ConstStmt, env);
      case 'AssignStmt':
        return this.executeAssignStmt(stmt as AssignStmt, env);
      case 'ExprStmt':
        return this.executeExprStmt(stmt as ExprStmt, env);
      case 'ReturnStmt':
        return this.executeReturnStmt(stmt as ReturnStmt, env);
      case 'WithStmt':
        return this.executeWithStmt(stmt as WithStmt, env);
    }
  }

  private executeBindingStmt(stmt: BindingStmt, env: RuntimeEnvironment): RuntimeOutcome {
    const initOutcome = this.evaluateExpr(stmt.initializer, env);
    if (isPanic(initOutcome)) return initOutcome;

    const value = initOutcome.kind === 'Return' ? initOutcome.value : initOutcome.value;

    // Check if this is a reassignment to an existing mutable binding
    const existing = env.lookup(stmt.name);
    if (existing && !stmt.isMut) {
      // Bare reassignment to existing mutable binding
      if (existing.isMut) {
        const result = env.assign(stmt.name, value);
        if (result === 'immutable') {
          return panicOutcome(invalidStateError(
            `Cannot assign to immutable binding '${stmt.name}'.`,
            stmt.span, this.ctx.config.fileName
          ));
        }
        return normalOutcome(UNIT_VALUE);
      }
    }

    // New binding in current scope
    env.define(stmt.name, value, stmt.isMut);
    return normalOutcome(UNIT_VALUE);
  }

  private executeLetStmt(stmt: LetStmt, env: RuntimeEnvironment): RuntimeOutcome {
    let value: RuntimeValue = UNIT_VALUE;
    if (stmt.initializer) {
      const outcome = this.evaluateExpr(stmt.initializer, env);
      if (isPanic(outcome)) return outcome;
      value = outcome.kind === 'Normal' || outcome.kind === 'Return' ? outcome.value : UNIT_VALUE;
    }
    env.define(stmt.name, value, stmt.isMut);
    return normalOutcome(UNIT_VALUE);
  }

  private executeConstStmt(stmt: ConstStmt, env: RuntimeEnvironment): RuntimeOutcome {
    const outcome = this.evaluateExpr(stmt.initializer, env);
    if (isPanic(outcome)) return outcome;
    const value = outcome.kind === 'Normal' || outcome.kind === 'Return' ? outcome.value : UNIT_VALUE;
    env.define(stmt.name, value, false /* const is always immutable */);
    return normalOutcome(UNIT_VALUE);
  }

  private executeAssignStmt(stmt: AssignStmt, env: RuntimeEnvironment): RuntimeOutcome {
    const valOutcome = this.evaluateExpr(stmt.value, env);
    if (isPanic(valOutcome)) return valOutcome;
    const newValue = valOutcome.kind === 'Normal' || valOutcome.kind === 'Return'
      ? valOutcome.value
      : UNIT_VALUE;

    if (stmt.target.kind !== 'Identifier') {
      return panicOutcome(unsupportedOperationError(
        'compound assignment to non-identifier',
        stmt.span, this.ctx.config.fileName
      ));
    }

    const name = (stmt.target as Identifier).name;

    // Handle compound assignment operators
    if (stmt.operator !== '=') {
      const existing = env.lookup(name);
      if (!existing) {
        return panicOutcome(invalidStateError(
          `Undefined variable '${name}' in assignment.`,
          stmt.span, this.ctx.config.fileName
        ));
      }
      const compResult = this.applyCompoundOperator(
        stmt.operator, existing.value, newValue, stmt.span
      );
      if (isPanic(compResult)) return compResult;
      const computedValue = (compResult as NormalOutcome).value;
      const result = env.assign(name, computedValue);
      if (result === 'immutable') {
        return panicOutcome(invalidStateError(
          `Cannot assign to immutable binding '${name}'.`,
          stmt.span, this.ctx.config.fileName
        ));
      }
      return normalOutcome(UNIT_VALUE);
    }

    const result = env.assign(name, newValue);
    if (result === 'immutable') {
      return panicOutcome(invalidStateError(
        `Cannot assign to immutable binding '${name}'.`,
        stmt.span, this.ctx.config.fileName
      ));
    }
    if (result === 'not_found') {
      return panicOutcome(invalidStateError(
        `Undefined variable '${name}' in assignment.`,
        stmt.span, this.ctx.config.fileName
      ));
    }
    return normalOutcome(UNIT_VALUE);
  }

  private executeExprStmt(stmt: ExprStmt, env: RuntimeEnvironment): RuntimeOutcome {
    return this.evaluateExpr(stmt.expression, env);
  }

  private executeReturnStmt(stmt: ReturnStmt, env: RuntimeEnvironment): RuntimeOutcome {
    if (stmt.value) {
      const outcome = this.evaluateExpr(stmt.value, env);
      if (isPanic(outcome)) return outcome;
      const val = outcome.kind === 'Normal' || outcome.kind === 'Return' ? outcome.value : UNIT_VALUE;
      return returnOutcome(val);
    }
    return returnOutcome(UNIT_VALUE);
  }

  private executeWithStmt(stmt: WithStmt, env: RuntimeEnvironment): RuntimeOutcome {
    // Resolve the resource expression
    const resOutcome = this.evaluateExpr(stmt.resource, env);
    if (isPanic(resOutcome)) return resOutcome;

    const blockEnv = env.child('with');
    if (stmt.alias) {
      const resVal = resOutcome.kind === 'Normal' || resOutcome.kind === 'Return'
        ? resOutcome.value
        : UNIT_VALUE;
      blockEnv.define(stmt.alias, resVal, false);
    }

    const bodyOutcome = this.executeBlock(stmt.body, blockEnv);
    // Resource cleanup boundary — architecture placeholder for 0.0.5-s
    return bodyOutcome;
  }

  // ─── Block Execution ──────────────────────────────────────────────────────

  /**
   * Executes a block, creating a child lexical scope.
   * Returns the value of the last expression, or Unit if no trailing expression.
   */
  public executeBlock(block: Block, env: RuntimeEnvironment): RuntimeOutcome {
    const blockEnv = env.child('block');
    let lastValue: RuntimeValue = UNIT_VALUE;

    for (let i = 0; i < block.statements.length; i++) {
      const stmt = block.statements[i];
      const outcome = this.executeStatement(stmt, blockEnv);

      if (isPanic(outcome)) return outcome;
      if (isReturn(outcome)) return outcome;

      // Track the last produced value (blocks are expression-oriented)
      if (outcome.kind === 'Normal') {
        lastValue = outcome.value;
      }
    }

    return normalOutcome(lastValue);
  }

  // ─── Expression Evaluation ────────────────────────────────────────────────

  public evaluateExpr(expr: Expr, env: RuntimeEnvironment): RuntimeOutcome {
    switch (expr.kind) {
      case 'Literal':
        return this.evaluateLiteral(expr as Literal);
      case 'Identifier':
        return this.evaluateIdentifier(expr as Identifier, env);
      case 'BinaryExpr':
        return this.evaluateBinaryExpr(expr as BinaryExpr, env);
      case 'UnaryExpr':
        return this.evaluateUnaryExpr(expr as UnaryExpr, env);
      case 'PipelineExpr':
        return this.evaluatePipelineExpr(expr as PipelineExpr, env);
      case 'OptionFallbackExpr':
        return this.evaluateOptionFallbackExpr(expr as OptionFallbackExpr, env);
      case 'OptionPropagateExpr':
        return this.evaluateOptionPropagateExpr(expr as OptionPropagateExpr, env);
      case 'IfExpr':
        return this.evaluateIfExpr(expr as IfExpr, env);
      case 'BlockExpr':
        return this.evaluateBlockExpr(expr as BlockExpr, env);
      case 'CallExpr':
        return this.evaluateCallExpr(expr as CallExpr, env);
      case 'AssignmentExpr':
        return this.evaluateAssignmentExpr(expr as AssignmentExpr, env);
      case 'MemberExpr':
        return this.evaluateMemberExpr(expr as MemberExpr, env);
      case 'RangeExpr':
        return panicOutcome(unsupportedOperationError(
          'range expression execution', expr.span, this.ctx.config.fileName
        ));
    }
  }

  // ─── Literal Evaluation ───────────────────────────────────────────────────

  private evaluateLiteral(literal: Literal): RuntimeOutcome {
    switch (literal.literalKind) {
      case 'int':
        return normalOutcome(rtInt(BigInt(Math.trunc(literal.value as number))));
      case 'uint':
        return normalOutcome(rtUInt(BigInt(Math.trunc(literal.value as number))));
      case 'float':
        return normalOutcome(rtFloat(literal.value as number));
      case 'bool':
        return normalOutcome(rtBool(literal.value as boolean));
      case 'char':
        return normalOutcome(rtChar(literal.value as string));
      case 'string':
        return normalOutcome(rtString(literal.value as string));
      default:
        // Fallback: infer from JavaScript type of value
        if (typeof literal.value === 'boolean') {
          return normalOutcome(rtBool(literal.value));
        }
        if (typeof literal.value === 'number') {
          // Raw integer literal — distinguish by whether raw contains 'u' suffix
          if (literal.raw && literal.raw.endsWith('u')) {
            return normalOutcome(rtUInt(BigInt(Math.trunc(literal.value))));
          }
          if (literal.raw && (literal.raw.includes('.') || literal.raw.includes('e'))) {
            return normalOutcome(rtFloat(literal.value));
          }
          return normalOutcome(rtInt(BigInt(Math.trunc(literal.value))));
        }
        if (typeof literal.value === 'string') {
          return normalOutcome(rtString(literal.value));
        }
        return normalOutcome(UNIT_VALUE);
    }
  }

  // ─── Identifier Evaluation ────────────────────────────────────────────────

  private evaluateIdentifier(id: Identifier, env: RuntimeEnvironment): RuntimeOutcome {
    // Built-in constructor shortcuts (None is a value, not a call)
    if (id.name === 'None') return normalOutcome(rtNone);

    const binding = env.lookup(id.name);
    if (!binding) {
      return panicOutcome(invalidStateError(
        `Undefined identifier '${id.name}'. Resolver should have caught this.`,
        id.span, this.ctx.config.fileName
      ));
    }
    return normalOutcome(binding.value);
  }

  // ─── Binary Expression Evaluation ────────────────────────────────────────

  private evaluateBinaryExpr(expr: BinaryExpr, env: RuntimeEnvironment): RuntimeOutcome {
    // Left-to-right deterministic evaluation
    const leftOutcome = this.evaluateExpr(expr.left, env);
    if (isPanic(leftOutcome)) return leftOutcome;
    if (isReturn(leftOutcome)) return leftOutcome;
    const left = leftOutcome.value;

    // Short-circuit for logical operators
    if (expr.operator === 'and') {
      // Strict Bool semantics — no truthiness
      if (left.tag !== 'Bool') {
        return panicOutcome(invalidStateError(
          `'and' requires Bool operands, got ${left.tag}.`,
          expr.span, this.ctx.config.fileName
        ));
      }
      if (!(left as BoolRuntimeValue).value) return normalOutcome(rtBool(false));
      const rightOutcome = this.evaluateExpr(expr.right, env);
      if (isPanic(rightOutcome)) return rightOutcome;
      if (isReturn(rightOutcome)) return rightOutcome;
      const right = rightOutcome.value;
      if (right.tag !== 'Bool') {
        return panicOutcome(invalidStateError(
          `'and' requires Bool operands, got ${right.tag}.`,
          expr.span, this.ctx.config.fileName
        ));
      }
      return normalOutcome(rtBool((right as BoolRuntimeValue).value));
    }

    if (expr.operator === 'or') {
      if (left.tag !== 'Bool') {
        return panicOutcome(invalidStateError(
          `'or' requires Bool operands, got ${left.tag}.`,
          expr.span, this.ctx.config.fileName
        ));
      }
      if ((left as BoolRuntimeValue).value) return normalOutcome(rtBool(true));
      const rightOutcome = this.evaluateExpr(expr.right, env);
      if (isPanic(rightOutcome)) return rightOutcome;
      if (isReturn(rightOutcome)) return rightOutcome;
      const right = rightOutcome.value;
      if (right.tag !== 'Bool') {
        return panicOutcome(invalidStateError(
          `'or' requires Bool operands, got ${right.tag}.`,
          expr.span, this.ctx.config.fileName
        ));
      }
      return normalOutcome(rtBool((right as BoolRuntimeValue).value));
    }

    const rightOutcome = this.evaluateExpr(expr.right, env);
    if (isPanic(rightOutcome)) return rightOutcome;
    if (isReturn(rightOutcome)) return rightOutcome;
    const right = rightOutcome.value;

    return this.applyBinaryOp(expr.operator, left, right, expr.span);
  }

  private applyBinaryOp(
    op: string,
    left: RuntimeValue,
    right: RuntimeValue,
    span?: Span
  ): RuntimeOutcome {
    // ── Arithmetic ────────────────────────────────────────────────────────
    if (op === '+' || op === '-' || op === '*' || op === '/' || op === '%') {
      // Int arithmetic
      if (left.tag === 'Int' && right.tag === 'Int') {
        const l = (left as IntRuntimeValue).value;
        const r = (right as IntRuntimeValue).value;
        if ((op === '/' || op === '%') && r === 0n) {
          return panicOutcome(divisionByZeroError(span, this.ctx.config.fileName));
        }
        switch (op) {
          case '+': return normalOutcome(rtInt(l + r));
          case '-': return normalOutcome(rtInt(l - r));
          case '*': return normalOutcome(rtInt(l * r));
          case '/': return normalOutcome(rtInt(l / r));
          case '%': return normalOutcome(rtInt(l % r));
        }
      }

      // UInt arithmetic
      if (left.tag === 'UInt' && right.tag === 'UInt') {
        const l = (left as UIntRuntimeValue).value;
        const r = (right as UIntRuntimeValue).value;
        if ((op === '/' || op === '%') && r === 0n) {
          return panicOutcome(divisionByZeroError(span, this.ctx.config.fileName));
        }
        switch (op) {
          case '+': return normalOutcome(rtUInt(l + r));
          case '-': {
            if (l < r) {
              return panicOutcome(uintUnderflowError(l, r, span, this.ctx.config.fileName));
            }
            return normalOutcome(rtUInt(l - r));
          }
          case '*': return normalOutcome(rtUInt(l * r));
          case '/': return normalOutcome(rtUInt(l / r));
          case '%': return normalOutcome(rtUInt(l % r));
        }
      }

      // Float arithmetic
      if (left.tag === 'Float' && right.tag === 'Float') {
        const l = left.value;
        const r = right.value;
        switch (op) {
          case '+': return normalOutcome(rtFloat(l + r));
          case '-': return normalOutcome(rtFloat(l - r));
          case '*': return normalOutcome(rtFloat(l * r));
          case '/': return normalOutcome(rtFloat(l / r)); // Float div produces Inf per IEEE 754
          case '%': return normalOutcome(rtFloat(l % r));
        }
      }

      // String concatenation with +
      if (op === '+' && left.tag === 'String' && right.tag === 'String') {
        return normalOutcome(rtString(left.value + right.value));
      }

      return panicOutcome(invalidStateError(
        `Operator '${op}' applied to incompatible types ${left.tag} and ${right.tag}.`,
        span, this.ctx.config.fileName
      ));
    }

    // ── Comparison ────────────────────────────────────────────────────────
    if (op === '<' || op === '<=' || op === '>' || op === '>=') {
      if (left.tag === 'Int' && right.tag === 'Int') {
        const l = (left as IntRuntimeValue).value;
        const r = (right as IntRuntimeValue).value;
        switch (op) {
          case '<':  return normalOutcome(rtBool(l < r));
          case '<=': return normalOutcome(rtBool(l <= r));
          case '>':  return normalOutcome(rtBool(l > r));
          case '>=': return normalOutcome(rtBool(l >= r));
        }
      }
      if (left.tag === 'UInt' && right.tag === 'UInt') {
        const l = (left as UIntRuntimeValue).value;
        const r = (right as UIntRuntimeValue).value;
        switch (op) {
          case '<':  return normalOutcome(rtBool(l < r));
          case '<=': return normalOutcome(rtBool(l <= r));
          case '>':  return normalOutcome(rtBool(l > r));
          case '>=': return normalOutcome(rtBool(l >= r));
        }
      }
      if (left.tag === 'Float' && right.tag === 'Float') {
        const l = left.value;
        const r = right.value;
        switch (op) {
          case '<':  return normalOutcome(rtBool(l < r));
          case '<=': return normalOutcome(rtBool(l <= r));
          case '>':  return normalOutcome(rtBool(l > r));
          case '>=': return normalOutcome(rtBool(l >= r));
        }
      }
      if (left.tag === 'String' && right.tag === 'String') {
        const l = left.value;
        const r = right.value;
        switch (op) {
          case '<':  return normalOutcome(rtBool(l < r));
          case '<=': return normalOutcome(rtBool(l <= r));
          case '>':  return normalOutcome(rtBool(l > r));
          case '>=': return normalOutcome(rtBool(l >= r));
        }
      }
      return panicOutcome(invalidStateError(
        `Operator '${op}' cannot compare ${left.tag} and ${right.tag}.`,
        span, this.ctx.config.fileName
      ));
    }

    // ── Equality ──────────────────────────────────────────────────────────
    if (op === '==' || op === '!=') {
      const eq = runtimeValuesEqual(left, right);
      return normalOutcome(rtBool(op === '==' ? eq : !eq));
    }

    return panicOutcome(invalidStateError(
      `Unknown binary operator '${op}'.`,
      span, this.ctx.config.fileName
    ));
  }

  private applyCompoundOperator(
    op: string,
    existing: RuntimeValue,
    rhs: RuntimeValue,
    span?: Span
  ): RuntimeOutcome {
    const baseOp = op.slice(0, -1); // '+=' → '+'
    return this.applyBinaryOp(baseOp, existing, rhs, span);
  }

  // ─── Unary Expression ─────────────────────────────────────────────────────

  private evaluateUnaryExpr(expr: UnaryExpr, env: RuntimeEnvironment): RuntimeOutcome {
    const operandOutcome = this.evaluateExpr(expr.operand, env);
    if (isPanic(operandOutcome)) return operandOutcome;
    if (isReturn(operandOutcome)) return operandOutcome;
    const operand = operandOutcome.value;

    switch (expr.operator) {
      case 'not':
        // Strict Bool semantics — 'not' requires a Bool, never an integer/other
        if (operand.tag !== 'Bool') {
          return panicOutcome(invalidStateError(
            `'not' requires a Bool operand, got ${operand.tag}.`,
            expr.span, this.ctx.config.fileName
          ));
        }
        return normalOutcome(rtBool(!(operand as BoolRuntimeValue).value));

      case '-':
        if (operand.tag === 'Int') {
          return normalOutcome(rtInt(-(operand as IntRuntimeValue).value));
        }
        if (operand.tag === 'Float') {
          return normalOutcome(rtFloat(-operand.value));
        }
        return panicOutcome(invalidStateError(
          `Unary '-' requires a numeric operand, got ${operand.tag}.`,
          expr.span, this.ctx.config.fileName
        ));

      default:
        return panicOutcome(unsupportedOperationError(
          `unary '${expr.operator}'`, expr.span, this.ctx.config.fileName
        ));
    }
  }

  // ─── If Expression ────────────────────────────────────────────────────────

  private evaluateIfExpr(expr: IfExpr, env: RuntimeEnvironment): RuntimeOutcome {
    const condOutcome = this.evaluateExpr(expr.condition, env);
    if (isPanic(condOutcome)) return condOutcome;
    if (isReturn(condOutcome)) return condOutcome;
    const cond = condOutcome.value;

    // Strict Bool requirement — no JavaScript truthiness
    if (cond.tag !== 'Bool') {
      return panicOutcome(invalidStateError(
        `'if' condition must be a Bool value, got ${cond.tag}. Seira has no truthy/falsy semantics.`,
        expr.condition.span, this.ctx.config.fileName
      ));
    }

    // Only evaluate the selected branch (not both)
    if ((cond as BoolRuntimeValue).value) {
      return this.executeBlock(expr.thenBranch, env);
    } else if (expr.elseBranch) {
      if (expr.elseBranch.kind === 'Block') {
        return this.executeBlock(expr.elseBranch as Block, env);
      } else {
        // else if chain
        return this.evaluateIfExpr(expr.elseBranch as IfExpr, env);
      }
    }
    return normalOutcome(UNIT_VALUE);
  }

  // ─── Block Expression ─────────────────────────────────────────────────────

  private evaluateBlockExpr(expr: BlockExpr, env: RuntimeEnvironment): RuntimeOutcome {
    return this.executeBlock(expr.block, env);
  }

  // ─── Pipeline Expression ──────────────────────────────────────────────────

  /**
   * Executes: data |> f       ≡  f(data)
   *           data |> f(x)   ≡  f(data, x)
   *           data |> f(x,y) ≡  f(data, x, y)
   *
   * The piped value is prepended as the first argument.
   */
  private evaluatePipelineExpr(expr: PipelineExpr, env: RuntimeEnvironment): RuntimeOutcome {
    // Evaluate left side (the piped value)
    const leftOutcome = this.evaluateExpr(expr.left, env);
    if (isPanic(leftOutcome)) return leftOutcome;
    if (isReturn(leftOutcome)) return leftOutcome;
    const pipedValue = leftOutcome.value;

    // The right side is either an Identifier (bare function) or a CallExpr
    const right = expr.right;

    if (right.kind === 'Identifier') {
      // data |> f  →  f(data)
      return this.callFunctionByName(
        (right as Identifier).name,
        [pipedValue],
        right.span,
        env
      );
    }

    if (right.kind === 'CallExpr') {
      const call = right as CallExpr;
      // Evaluate existing call arguments, then prepend piped value
      const evaluatedArgs: RuntimeValue[] = [pipedValue];
      for (const argExpr of call.args) {
        const argOutcome = this.evaluateExpr(argExpr, env);
        if (isPanic(argOutcome)) return argOutcome;
        if (isReturn(argOutcome)) return argOutcome;
        evaluatedArgs.push(argOutcome.value);
      }

      if (call.callee.kind === 'Identifier') {
        return this.callFunctionByName(
          (call.callee as Identifier).name,
          evaluatedArgs,
          call.span,
          env
        );
      }

      // Evaluate the callee and call it
      const calleeOutcome = this.evaluateExpr(call.callee, env);
      if (isPanic(calleeOutcome)) return calleeOutcome;
      if (isReturn(calleeOutcome)) return calleeOutcome;
      return this.callFunctionValue(calleeOutcome.value, evaluatedArgs, call.span);
    }

    return panicOutcome(invalidStateError(
      'Pipeline right-hand side must be a function identifier or call expression.',
      expr.span, this.ctx.config.fileName
    ));
  }

  // ─── Option Fallback (??) ─────────────────────────────────────────────────

  private evaluateOptionFallbackExpr(expr: OptionFallbackExpr, env: RuntimeEnvironment): RuntimeOutcome {
    const leftOutcome = this.evaluateExpr(expr.left, env);
    if (isPanic(leftOutcome)) return leftOutcome;
    if (isReturn(leftOutcome)) return leftOutcome;
    const left = leftOutcome.value;

    if (left.tag === 'Option') {
      const optVal = left as OptionRuntimeValue;
      if (optVal.isSome) {
        return normalOutcome(optVal.inner!);
      }
      // None → evaluate fallback
      return this.evaluateExpr(expr.right, env);
    }

    // Non-option value — pass through (may occur on desugared patterns)
    return normalOutcome(left);
  }

  // ─── Option Propagate (?) ─────────────────────────────────────────────────

  private evaluateOptionPropagateExpr(expr: OptionPropagateExpr, env: RuntimeEnvironment): RuntimeOutcome {
    const operandOutcome = this.evaluateExpr(expr.operand, env);
    if (isPanic(operandOutcome)) return operandOutcome;
    if (isReturn(operandOutcome)) return operandOutcome;
    const operand = operandOutcome.value;

    if (operand.tag === 'Option') {
      const optVal = operand as OptionRuntimeValue;
      if (optVal.isSome) {
        return normalOutcome(optVal.inner!);
      }
      // Propagate None as early return
      return returnOutcome(rtNone);
    }

    if (operand.tag === 'Result') {
      const resVal = operand as ResultRuntimeValue;
      if (resVal.isOk) {
        return normalOutcome(resVal.value);
      }
      // Propagate Err as early return
      return returnOutcome(rtErr(resVal.value));
    }

    return normalOutcome(operand);
  }

  // ─── Call Expression ──────────────────────────────────────────────────────

  private evaluateCallExpr(expr: CallExpr, env: RuntimeEnvironment): RuntimeOutcome {
    // If callee is an Identifier, resolve by name (handles built-ins and hoisted functions directly)
    if (expr.callee.kind === 'Identifier') {
      const name = (expr.callee as Identifier).name;
      const args: RuntimeValue[] = [];
      for (const argExpr of expr.args) {
        const argOutcome = this.evaluateExpr(argExpr, env);
        if (isPanic(argOutcome)) return argOutcome;
        if (isReturn(argOutcome)) return argOutcome;
        args.push(argOutcome.value);
      }
      return this.callFunctionByName(name, args, expr.span, env);
    }

    // Evaluate callee
    const calleeOutcome = this.evaluateExpr(expr.callee, env);
    if (isPanic(calleeOutcome)) return calleeOutcome;
    if (isReturn(calleeOutcome)) return calleeOutcome;
    const callee = calleeOutcome.value;

    // Evaluate arguments left-to-right (deterministic evaluation order)
    const args: RuntimeValue[] = [];
    for (const argExpr of expr.args) {
      const argOutcome = this.evaluateExpr(argExpr, env);
      if (isPanic(argOutcome)) return argOutcome;
      if (isReturn(argOutcome)) return argOutcome;
      args.push(argOutcome.value);
    }

    return this.callFunctionValue(callee, args, expr.span);
  }

  private callFunctionByName(
    name: string,
    args: RuntimeValue[],
    span?: Span,
    env?: RuntimeEnvironment
  ): RuntimeOutcome {
    // Check built-ins first
    const builtinResult = this.tryCallBuiltin(name, args, span);
    if (builtinResult !== null) return builtinResult;

    // Look up in global functions
    const fnDecl = this.globalFunctions.get(name);
    if (!fnDecl) {
      // Try to find it in the environment
      if (env) {
        const binding = env.lookup(name);
        if (binding && binding.value.tag === 'Function') {
          return this.callFunctionValue(binding.value, args, span);
        }
      }
      return panicOutcome(invalidStateError(
        `Undefined function '${name}'.`,
        span, this.ctx.config.fileName
      ));
    }

    // Use global environment as closure (top-level functions)
    const closureEnv = env ?? new RuntimeEnvironment(undefined, 'global');
    const fnVal = rtFunction(name, fnDecl, closureEnv);
    return this.callFunctionValue(fnVal, args, span);
  }

  private callFunctionValue(
    callee: RuntimeValue,
    args: RuntimeValue[],
    span?: Span
  ): RuntimeOutcome {
    if (callee.tag === 'Builtin') {
      const builtin = callee as BuiltinRuntimeValue;
      const builtinResult = this.tryCallBuiltin(builtin.name, args, span);
      if (builtinResult !== null) return builtinResult;
      return panicOutcome(invalidStateError(
        `Unknown built-in '${builtin.name}'.`,
        span, this.ctx.config.fileName
      ));
    }

    if (callee.tag === 'Unit') {
      return normalOutcome(UNIT_VALUE);
    }

    if (callee.tag !== 'Function') {
      return panicOutcome(invalidStateError(
        `Cannot call a non-function value of type ${callee.tag}.`,
        span, this.ctx.config.fileName
      ));
    }

    const fn = callee as FunctionRuntimeValue;

    // Stack depth guard
    if (this.ctx.currentDepth() >= this.ctx.config.maxStackDepth) {
      return panicOutcome(stackOverflowError(this.ctx.currentDepth(), span, this.ctx.config.fileName));
    }

    // Try built-in by function name
    const builtinResult = this.tryCallBuiltin(fn.name, args, span);
    if (builtinResult !== null) return builtinResult;

    return this.executeUserFunction(fn, args, span);
  }

  private executeUserFunction(
    fn: FunctionRuntimeValue,
    args: RuntimeValue[],
    callSite?: Span
  ): RuntimeOutcome {
    const decl = fn.decl;
    this.ctx.pushFrame({ functionName: fn.name, callSite });

    // Create a function execution scope, parented to the closure environment
    const fnEnv = fn.closure.child(`fn:${fn.name}`);

    // Re-register global functions in the function scope so recursive calls work
    for (const [name, fnDecl] of this.globalFunctions) {
      const existing = fnEnv.lookup(name);
      if (!existing) {
        fnEnv.define(name, rtFunction(name, fnDecl, fnEnv), false);
      }
    }

    // Bind parameters
    for (let i = 0; i < decl.params.length; i++) {
      const param = decl.params[i];
      const argValue = args[i] ?? UNIT_VALUE;
      fnEnv.define(param.name, argValue, param.isMut);
    }

    let outcome: RuntimeOutcome;

    if (decl.isExpressionBody && decl.bodyExpr) {
      // Expression body: fn add(a, b) => a + b
      outcome = this.evaluateExpr(decl.bodyExpr, fnEnv);
    } else {
      // Block body
      const blockOutcome = this.executeBlock(decl.body, fnEnv);
      if (isPanic(blockOutcome)) {
        this.ctx.popFrame();
        return blockOutcome;
      }
      // Convert Return outcome to Normal
      if (isReturn(blockOutcome)) {
        outcome = normalOutcome(blockOutcome.value);
      } else {
        outcome = blockOutcome;
      }
    }

    this.ctx.popFrame();

    if (isPanic(outcome)) return outcome;
    if (isReturn(outcome)) return normalOutcome(outcome.value);
    return outcome;
  }

  // ─── Assignment Expression ────────────────────────────────────────────────

  private evaluateAssignmentExpr(expr: AssignmentExpr, env: RuntimeEnvironment): RuntimeOutcome {
    const valOutcome = this.evaluateExpr(expr.value, env);
    if (isPanic(valOutcome)) return valOutcome;
    if (isReturn(valOutcome)) return valOutcome;
    const newValue = valOutcome.value;

    if (expr.target.kind !== 'Identifier') {
      return panicOutcome(unsupportedOperationError(
        'assignment to non-identifier target', expr.span, this.ctx.config.fileName
      ));
    }

    const name = (expr.target as Identifier).name;

    if (expr.operator !== '=') {
      const existing = env.lookup(name);
      if (!existing) {
        return panicOutcome(invalidStateError(
          `Undefined variable '${name}'.`, expr.span, this.ctx.config.fileName
        ));
      }
      const compResult = this.applyCompoundOperator(expr.operator, existing.value, newValue, expr.span);
      if (isPanic(compResult)) return compResult;
      const computedValue = (compResult as NormalOutcome).value;
      env.assign(name, computedValue);
      return normalOutcome(computedValue);
    }

    const result = env.assign(name, newValue);
    if (result === 'immutable') {
      return panicOutcome(invalidStateError(
        `Cannot assign to immutable binding '${name}'.`,
        expr.span, this.ctx.config.fileName
      ));
    }
    if (result === 'not_found') {
      return panicOutcome(invalidStateError(
        `Undefined variable '${name}'.`, expr.span, this.ctx.config.fileName
      ));
    }
    return normalOutcome(newValue);
  }

  // ─── Member Expression ────────────────────────────────────────────────────

  private evaluateMemberExpr(expr: MemberExpr, env: RuntimeEnvironment): RuntimeOutcome {
    return panicOutcome(unsupportedOperationError(
      'member access', expr.span, this.ctx.config.fileName
    ));
  }

  // ─── Built-in Functions ───────────────────────────────────────────────────

  /**
   * Attempts to execute a built-in function.
   * Returns null if the name is not a built-in (caller handles it).
   */
  private tryCallBuiltin(
    name: string,
    args: RuntimeValue[],
    span?: Span
  ): RuntimeOutcome | null {
    switch (name) {
      case 'println': {
        const parts = args.map(formatRuntimeValue);
        this.ctx.emitOutput(parts.join(' '));
        return normalOutcome(UNIT_VALUE);
      }

      case 'print': {
        const parts = args.map(formatRuntimeValue);
        if (this.ctx.config.enableOutput) {
          process.stdout.write(parts.join(' '));
        }
        return normalOutcome(UNIT_VALUE);
      }

      case 'Some': {
        if (args.length !== 1) {
          return panicOutcome(invalidStateError(
            `'Some' requires exactly 1 argument, got ${args.length}.`,
            span, this.ctx.config.fileName
          ));
        }
        return normalOutcome(rtSome(args[0]));
      }

      case 'None':
        return normalOutcome(rtNone);

      case 'Ok': {
        if (args.length !== 1) {
          return panicOutcome(invalidStateError(
            `'Ok' requires exactly 1 argument, got ${args.length}.`,
            span, this.ctx.config.fileName
          ));
        }
        return normalOutcome(rtOk(args[0]));
      }

      case 'Err': {
        if (args.length !== 1) {
          return panicOutcome(invalidStateError(
            `'Err' requires exactly 1 argument, got ${args.length}.`,
            span, this.ctx.config.fileName
          ));
        }
        return normalOutcome(rtErr(args[0]));
      }

      case 'open_resource': {
        return normalOutcome(rtInt(1n));
      }

      default:
        return null;
    }
  }
}
