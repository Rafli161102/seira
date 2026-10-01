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
  BreakStmt,
  CallExpr,
  ConstStmt,
  ConstructorPattern,
  ContinueStmt,
  Expr,
  ExprStmt,
  ForStmt,
  FunctionDecl,
  Identifier,
  IdentifierPattern,
  IfExpr,
  ImplDecl,
  ImportDecl,
  IndexExpr,
  LambdaExpr,
  LetStmt,
  ListLiteral,
  Literal,
  LiteralPattern,
  LoopStmt,
  MapLiteral,
  MatchArm,
  MatchExpr,
  MemberExpr,
  OptionFallbackExpr,
  OptionPropagateExpr,
  Pattern,
  PipelineExpr,
  Program,
  ReturnStmt,
  SetLiteral,
  Stmt,
  TupleLiteral,
  UnaryExpr,
  UseDecl,
  WhileStmt,
  WildcardPattern,
  WithStmt,
} from '../../compiler/ast/ast.ts';
import type { Span } from '../../compiler/source/span.ts';
import { DiagnosticBag } from '../../compiler/diagnostics/index.ts';
import type { SeiraModule } from '../../compiler/module/module.ts';
import {
  breakOutcome,
  continueOutcome,
  divisionByZeroError,
  invalidStateError,
  isBreak,
  isContinue,
  isPanic,
  isReturn,
  normalOutcome,
  panicOutcome,
  returnOutcome,
  stackOverflowError,
  uintUnderflowError,
  unsupportedOperationError,
  type BreakOutcome,
  type ContinueOutcome,
  type NormalOutcome,
  type PanicOutcome,
  type ReturnOutcome,
  type RuntimeError,
  type RuntimeOutcome,
} from './outcomes.ts';
import {
  collectIterator,
  createEnumerateIterator,
  createFilterIterator,
  createListIterator,
  createMapIterator,
  createMapIteratorCombinator,
  createMemoryReader,
  createMemoryStream,
  createMemoryWriter,
  createResource,
  createSetIterator,
  createSkipIterator,
  createTakeIterator,
  createZipIterator,
  foldIterator,
  formatRuntimeValue,
  reduceIterator,
  rtBool,
  rtBuiltin,
  rtByte,
  rtChar,
  rtErr,
  rtFloat,
  rtFunction,
  rtInt,
  rtIterator,
  rtLambda,
  rtList,
  rtMap,
  rtModule,
  rtNativeMethod,
  rtNone,
  rtOk,
  rtSet,
  rtSome,
  rtString,
  rtTuple,
  rtUInt,
  runtimeValuesEqual,
  RuntimeEnvironment,
  UNIT_VALUE,
  type BoolRuntimeValue,
  type BuiltinRuntimeValue,
  type FunctionRuntimeValue,
  type IntRuntimeValue,
  type IteratorRuntimeValue,
  type ListRuntimeValue,
  type MapRuntimeValue,
  type ModuleRuntimeValue,
  type NativeMethodRuntimeValue,
  type OptionRuntimeValue,
  type ReaderRuntimeValue,
  type ResourceRuntimeValue,
  type ResultRuntimeValue,
  type RuntimeValue,
  type SetRuntimeValue,
  type StringRuntimeValue,
  type TupleRuntimeValue,
  type UIntRuntimeValue,
  type WriterRuntimeValue,
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
  public executeProgram(program: Program, dependencyModules?: SeiraModule[]): RuntimeOutcome {
    // Build the global execution environment
    const env = new RuntimeEnvironment(undefined, 'global');

    // Register built-in functions in the environment
    this.registerBuiltins(env);

    // If dependency modules are provided, hoist their declarations and register modules
    if (dependencyModules && dependencyModules.length > 0) {
      for (const mod of dependencyModules) {
        if (!mod.ast) continue;
        const modExports = new Map<string, RuntimeValue>();

        for (const item of mod.ast.items) {
          if (item.kind === 'FunctionDecl') {
            const fn = item as FunctionDecl;
            this.globalFunctions.set(fn.name, fn);
            const fnVal = rtFunction(fn.name, fn, env);
            env.define(fn.name, fnVal, false);
            modExports.set(fn.name, fnVal);
          } else if (item.kind === 'ImplDecl') {
            const impl = item as ImplDecl;
            for (const method of impl.methods) {
              this.globalFunctions.set(method.name, method);
              const fnVal = rtFunction(method.name, method, env);
              env.define(method.name, fnVal, false);
              modExports.set(method.name, fnVal);
            }
          } else if (item.kind === 'ConstStmt') {
            const cs = item as ConstStmt;
            const outcome = this.executeConstStmt(cs, env);
            if (isPanic(outcome)) return outcome;
            const binding = env.lookup(cs.name);
            if (binding) {
              modExports.set(cs.name, binding.value);
            }
          }
        }

        const modVal = rtModule(mod.id.path, modExports);
        env.define(mod.id.path, modVal, false);
        if (mod.id.path.includes('.')) {
          const leaf = mod.id.path.split('.').pop()!;
          if (!env.lookup(leaf)) {
            env.define(leaf, modVal, false);
          }
          const root = mod.id.path.split('.')[0];
          if (!env.lookup(root)) {
            env.define(root, modVal, false);
          }
        }
      }
    }

    // Process use and import declarations in program
    for (const item of program.items) {
      if (item.kind === 'UseDecl') {
        const use = item as UseDecl;
        if (use.path !== '*') {
          const parts = use.path.split('.');
          if (parts.length >= 2) {
            const modPath = parts.slice(0, -1).join('.');
            const symName = parts[parts.length - 1];
            const localName = use.alias ?? symName;
            const modBinding = env.lookup(modPath);
            if (modBinding && modBinding.value.tag === 'Module') {
              const modVal = modBinding.value as ModuleRuntimeValue;
              const val = modVal.exports.get(symName);
              if (val) {
                env.define(localName, val, false);
              }
            }
          }
        }
      } else if (item.kind === 'ImportDecl') {
        const imp = item as ImportDecl;
        if (imp.path !== '*') {
          const modBinding = env.lookup(imp.path);
          if (modBinding && modBinding.value.tag === 'Module') {
            const leafName = imp.alias ?? (imp.path.includes('.') ? imp.path.split('.').pop()! : imp.path);
            env.define(leafName, modBinding.value, false);
          }
        }
      }
    }

    // Hoist all top-level function declarations and impl methods into the global environment.
    // This allows forward references to functions declared after their call site.
    for (const item of program.items) {
      if (item.kind === 'FunctionDecl') {
        const fn = item as FunctionDecl;
        this.globalFunctions.set(fn.name, fn);
        const fnVal = rtFunction(fn.name, fn, env);
        env.define(fn.name, fnVal, false);
      } else if (item.kind === 'ImplDecl') {
        const impl = item as ImplDecl;
        for (const method of impl.methods) {
          this.globalFunctions.set(method.name, method);
          const fnVal = rtFunction(method.name, method, env);
          env.define(method.name, fnVal, false);
        }
      }
    }

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
      if (
        item.kind === 'FunctionDecl' ||
        item.kind === 'StructDecl' ||
        item.kind === 'TraitDecl' ||
        item.kind === 'ImplDecl' ||
        item.kind === 'TypeAliasDecl' ||
        item.kind === 'EnumDecl' ||
        item.kind === 'ImportDecl' ||
        item.kind === 'UseDecl'
      ) {
        continue; // already hoisted or compile-time declarations
      }
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
      case 'WhileStmt':
        return this.executeWhileStmt(stmt as WhileStmt, env);
      case 'ForStmt':
        return this.executeForStmt(stmt as ForStmt, env);
      case 'LoopStmt':
        return this.executeLoopStmt(stmt as LoopStmt, env);
      case 'BreakStmt':
        return breakOutcome();
      case 'ContinueStmt':
        return continueOutcome();
    }
  }

  private executeWhileStmt(stmt: WhileStmt, env: RuntimeEnvironment): RuntimeOutcome {
    while (true) {
      const condOutcome = this.evaluateExpr(stmt.condition, env);
      if (isPanic(condOutcome)) return condOutcome;
      if (isReturn(condOutcome)) return condOutcome;
      if (isBreak(condOutcome) || isContinue(condOutcome)) return condOutcome;

      if (condOutcome.value.tag !== 'Bool') {
        return panicOutcome(invalidStateError(
          `'while' condition must be a Bool value, got ${condOutcome.value.tag}. Seira has no truthy/falsy semantics.`,
          stmt.condition.span, this.ctx.config.fileName
        ));
      }

      if (!(condOutcome.value as BoolRuntimeValue).value) {
        break;
      }

      const bodyOutcome = this.executeBlock(stmt.body, env);
      if (isPanic(bodyOutcome)) return bodyOutcome;
      if (isReturn(bodyOutcome)) return bodyOutcome;
      if (isBreak(bodyOutcome)) break;
      if (isContinue(bodyOutcome)) continue;
    }
    return normalOutcome(UNIT_VALUE);
  }

  private executeLoopStmt(stmt: LoopStmt, env: RuntimeEnvironment): RuntimeOutcome {
    while (true) {
      const bodyOutcome = this.executeBlock(stmt.body, env);
      if (isPanic(bodyOutcome)) return bodyOutcome;
      if (isReturn(bodyOutcome)) return bodyOutcome;
      if (isBreak(bodyOutcome)) break;
      if (isContinue(bodyOutcome)) continue;
    }
    return normalOutcome(UNIT_VALUE);
  }

  private executeForStmt(stmt: ForStmt, env: RuntimeEnvironment): RuntimeOutcome {
    const iterOutcome = this.evaluateExpr(stmt.iterable, env);
    if (isPanic(iterOutcome)) return iterOutcome;
    if (isReturn(iterOutcome)) return iterOutcome;
    if (isBreak(iterOutcome) || isContinue(iterOutcome)) return iterOutcome;

    const iterableVal = iterOutcome.value;
    let items: ReadonlyArray<RuntimeValue>;

    if (iterableVal.tag === 'List') {
      items = (iterableVal as ListRuntimeValue).elements;
    } else if (iterableVal.tag === 'Set') {
      items = (iterableVal as SetRuntimeValue).elements;
    } else {
      return panicOutcome(invalidStateError(
        `Cannot iterate over value of type ${iterableVal.tag}.`,
        stmt.iterable.span, this.ctx.config.fileName
      ));
    }

    for (const item of items) {
      const iterEnv = env.child('for');
      iterEnv.define(stmt.variable, item, false);

      const bodyOutcome = this.executeBlock(stmt.body, iterEnv);
      if (isPanic(bodyOutcome)) return bodyOutcome;
      if (isReturn(bodyOutcome)) return bodyOutcome;
      if (isBreak(bodyOutcome)) break;
      if (isContinue(bodyOutcome)) continue;
    }

    return normalOutcome(UNIT_VALUE);
  }

  private executeBindingStmt(stmt: BindingStmt, env: RuntimeEnvironment): RuntimeOutcome {
    const initOutcome = this.evaluateExpr(stmt.initializer, env);
    if (initOutcome.kind !== 'Normal') return initOutcome;

    const value = initOutcome.value;

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
      if (outcome.kind !== 'Normal') return outcome;
      value = outcome.value;
    }
    env.define(stmt.name, value, stmt.isMut);
    return normalOutcome(UNIT_VALUE);
  }

  private executeConstStmt(stmt: ConstStmt, env: RuntimeEnvironment): RuntimeOutcome {
    const outcome = this.evaluateExpr(stmt.initializer, env);
    if (outcome.kind !== 'Normal') return outcome;
    const value = outcome.value;
    env.define(stmt.name, value, false /* const is always immutable */);
    return normalOutcome(UNIT_VALUE);
  }

  private executeAssignStmt(stmt: AssignStmt, env: RuntimeEnvironment): RuntimeOutcome {
    const valOutcome = this.evaluateExpr(stmt.value, env);
    if (valOutcome.kind !== 'Normal') return valOutcome;
    const newValue = valOutcome.value;

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

    const resVal = resOutcome.kind === 'Normal' || resOutcome.kind === 'Return'
      ? resOutcome.value
      : UNIT_VALUE;

    const blockEnv = env.child('with');
    if (stmt.alias) {
      blockEnv.define(stmt.alias, resVal, false);
    }

    const bodyOutcome = this.executeBlock(stmt.body, blockEnv);

    // Resource cleanup boundary (LIFO): release resource
    let cleanupError: string | undefined;
    if (resVal.tag === 'Resource') {
      const res = resVal as ResourceRuntimeValue;
      const closeResult = res.close();
      if (!closeResult.isOk) {
        cleanupError = formatRuntimeValue(closeResult.value);
      }
    }

    if (isPanic(bodyOutcome)) {
      if (cleanupError) {
        return panicOutcome({
          ...bodyOutcome.error,
          message: `${bodyOutcome.error.message} (Also failed during resource cleanup: ${cleanupError})`,
        });
      }
      return bodyOutcome;
    }

    if (cleanupError) {
      return panicOutcome(invalidStateError(
        `Resource cleanup error: ${cleanupError}`,
        stmt.span,
        this.ctx.config.fileName
      ));
    }

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
      if (isBreak(outcome)) return outcome;
      if (isContinue(outcome)) return outcome;

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
      case 'MatchExpr':
        return this.evaluateMatchExpr(expr as MatchExpr, env);
      case 'ListLiteral':
        return this.evaluateListLiteral(expr as ListLiteral, env);
      case 'TupleLiteral':
        return this.evaluateTupleLiteral(expr as TupleLiteral, env);
      case 'MapLiteral':
        return this.evaluateMapLiteral(expr as MapLiteral, env);
      case 'SetLiteral':
        return this.evaluateSetLiteral(expr as SetLiteral, env);
      case 'IndexExpr':
        return this.evaluateIndexExpr(expr as IndexExpr, env);
      case 'LambdaExpr':
        return this.evaluateLambdaExpr(expr as LambdaExpr, env);
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
    if (leftOutcome.kind !== 'Normal') return leftOutcome;
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
      if (rightOutcome.kind !== 'Normal') return rightOutcome;
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
      if (rightOutcome.kind !== 'Normal') return rightOutcome;
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
    if (rightOutcome.kind !== 'Normal') return rightOutcome;
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
    if (operandOutcome.kind !== 'Normal') return operandOutcome;
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
    if (condOutcome.kind !== 'Normal') return condOutcome;
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
    if (leftOutcome.kind !== 'Normal') return leftOutcome;
    const pipedValue = leftOutcome.value;

    const right = expr.right;

    if (right.kind === 'CallExpr') {
      const call = right as CallExpr;
      // Evaluate existing call arguments, then prepend piped value
      const evaluatedArgs: RuntimeValue[] = [pipedValue];
      for (const argExpr of call.args) {
        const argOutcome = this.evaluateExpr(argExpr, env);
        if (argOutcome.kind !== 'Normal') return argOutcome;
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
      if (calleeOutcome.kind !== 'Normal') return calleeOutcome;
      return this.callFunctionValue(calleeOutcome.value, evaluatedArgs, call.span);
    }

    if (right.kind === 'Identifier') {
      // data |> f  →  f(data)
      return this.callFunctionByName(
        (right as Identifier).name,
        [pipedValue],
        right.span,
        env
      );
    }

    if (right.kind === 'LambdaExpr') {
      const lambdaOutcome = this.evaluateLambdaExpr(right as LambdaExpr, env);
      if (lambdaOutcome.kind !== 'Normal') return lambdaOutcome;
      return this.callFunctionValue(lambdaOutcome.value, [pipedValue], right.span);
    }

    // Fallback: evaluate right and if it's a function value or builtin, call it
    const rightOutcome = this.evaluateExpr(right, env);
    if (rightOutcome.kind !== 'Normal') return rightOutcome;
    if (rightOutcome.value.tag === 'Function' || rightOutcome.value.tag === 'Builtin') {
      return this.callFunctionValue(rightOutcome.value, [pipedValue], right.span);
    }

    return panicOutcome(invalidStateError(
      'Pipeline right-hand side must be a function identifier, call expression, or callable value.',
      expr.span, this.ctx.config.fileName
    ));
  }

  // ─── Option Fallback (??) ─────────────────────────────────────────────────

  private evaluateOptionFallbackExpr(expr: OptionFallbackExpr, env: RuntimeEnvironment): RuntimeOutcome {
    const leftOutcome = this.evaluateExpr(expr.left, env);
    if (leftOutcome.kind !== 'Normal') return leftOutcome;
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
    if (operandOutcome.kind !== 'Normal') return operandOutcome;
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
    // If callee is a MemberExpr, check for method calls or module exports
    if (expr.callee.kind === 'MemberExpr') {
      const member = expr.callee as MemberExpr;
      const targetOutcome = this.evaluateExpr(member.object, env);
      if (targetOutcome.kind !== 'Normal') return targetOutcome;
      const target = targetOutcome.value;

      // Evaluate arguments
      const args: RuntimeValue[] = [];
      for (const argExpr of expr.args) {
        const argOutcome = this.evaluateExpr(argExpr, env);
        if (argOutcome.kind !== 'Normal') return argOutcome;
        args.push(argOutcome.value);
      }

      if (target.tag === 'Module') {
        const mod = target as ModuleRuntimeValue;
        const val = mod.exports.get(member.property);
        if (val) {
          return this.callFunctionValue(val, args, expr.span);
        }
        return panicOutcome(invalidStateError(
          `Module '${mod.name}' has no exported symbol '${member.property}'.`,
          expr.span, this.ctx.config.fileName
        ));
      }

      const methodResult = this.callMethod(target, member.property, args, expr.span, env);
      if (methodResult !== null) return methodResult;
    }

    // If callee is an Identifier, resolve by name (handles built-ins and hoisted functions directly)
    if (expr.callee.kind === 'Identifier') {
      const name = (expr.callee as Identifier).name;
      const args: RuntimeValue[] = [];
      for (const argExpr of expr.args) {
        const argOutcome = this.evaluateExpr(argExpr, env);
        if (argOutcome.kind !== 'Normal') return argOutcome;
        args.push(argOutcome.value);
      }
      return this.callFunctionByName(name, args, expr.span, env);
    }

    // Evaluate callee
    const calleeOutcome = this.evaluateExpr(expr.callee, env);
    if (calleeOutcome.kind !== 'Normal') return calleeOutcome;
    const callee = calleeOutcome.value;

    // Evaluate arguments left-to-right (deterministic evaluation order)
    const args: RuntimeValue[] = [];
    for (const argExpr of expr.args) {
      const argOutcome = this.evaluateExpr(argExpr, env);
      if (argOutcome.kind !== 'Normal') return argOutcome;
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

    if (callee.tag === 'NativeMethod') {
      const nm = callee as NativeMethodRuntimeValue;
      const res = this.callMethod(nm.target, nm.methodName, args, span);
      if (res !== null) return res;
      return panicOutcome(unsupportedOperationError(
        `Method '${nm.methodName}' on ${nm.target.tag}`,
        span, this.ctx.config.fileName
      ));
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
    if (fn.lambda) {
      const lambda = fn.lambda;
      this.ctx.pushFrame({ functionName: '<lambda>', callSite });
      const lambdaEnv = fn.closure.child('lambda');

      for (let i = 0; i < lambda.params.length; i++) {
        const param = lambda.params[i];
        const argValue = args[i] ?? UNIT_VALUE;
        lambdaEnv.define(param.name, argValue, false);
      }

      let outcome: RuntimeOutcome;
      if (lambda.body.kind === 'Block') {
        outcome = this.executeBlock(lambda.body as Block, lambdaEnv);
      } else {
        outcome = this.evaluateExpr(lambda.body as Expr, lambdaEnv);
      }

      this.ctx.popFrame();
      if (isPanic(outcome)) return outcome;
      if (isReturn(outcome)) return normalOutcome(outcome.value);
      return outcome;
    }

    const decl = fn.decl!;
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

  // ─── Standard Method Dispatch ─────────────────────────────────────────────

  private isKnownMethod(tag: string, property: string): boolean {
    switch (tag) {
      case 'Option':
        return [
          'is_some',
          'is_none',
          'unwrap',
          'expect',
          'unwrap_or',
          'unwrap_or_else',
          'map',
          'and_then',
          'or_else',
        ].includes(property);
      case 'Result':
        return [
          'is_ok',
          'is_err',
          'unwrap',
          'expect',
          'unwrap_or',
          'unwrap_or_else',
          'map',
          'map_err',
          'and_then',
          'or_else',
        ].includes(property);
      case 'List':
        return [
          'length',
          'is_empty',
          'first',
          'last',
          'get',
          'push',
          'contains',
          'iter',
          'map',
          'filter',
          'reverse',
        ].includes(property);
      case 'Map':
        return [
          'length',
          'is_empty',
          'get',
          'contains',
          'insert',
          'remove',
          'keys',
          'values',
          'iter',
        ].includes(property);
      case 'Set':
        return ['length', 'is_empty', 'contains', 'insert', 'remove', 'iter'].includes(property);
      case 'String':
        return [
          'length',
          'is_empty',
          'contains',
          'starts_with',
          'ends_with',
          'trim',
          'split',
          'replace',
          'chars',
          'bytes',
        ].includes(property);
      case 'Iterator':
        return [
          'next',
          'map',
          'filter',
          'take',
          'skip',
          'enumerate',
          'zip',
          'fold',
          'reduce',
          'collect',
        ].includes(property);
      case 'Reader':
        return ['read', 'read_all', 'is_eof', 'seek', 'write', 'get_content', 'clear', 'length', 'is_empty', 'position', 'reset'].includes(property);
      case 'Writer':
        return ['write', 'get_content', 'clear', 'length'].includes(property);
      case 'Resource':
        return ['close', 'is_closed'].includes(property);
      default:
        return false;
    }
  }

  private callMethod(
    target: RuntimeValue,
    methodName: string,
    args: RuntimeValue[],
    span?: Span,
    _env?: RuntimeEnvironment
  ): RuntimeOutcome | null {
    switch (target.tag) {
      case 'Option': {
        const opt = target as OptionRuntimeValue;
        switch (methodName) {
          case 'is_some':
            return normalOutcome(rtBool(opt.isSome));
          case 'is_none':
            return normalOutcome(rtBool(!opt.isSome));
          case 'unwrap': {
            if (opt.isSome && opt.inner !== undefined) {
              return normalOutcome(opt.inner);
            }
            return panicOutcome(unsupportedOperationError(
              'Called unwrap on a None value.',
              span,
              this.ctx.config.fileName
            ));
          }
          case 'expect': {
            if (opt.isSome && opt.inner !== undefined) {
              return normalOutcome(opt.inner);
            }
            const msg = args.length > 0 ? formatRuntimeValue(args[0]) : 'called expect on a None value';
            return panicOutcome(unsupportedOperationError(
              `${msg}: called expect on a None value`,
              span,
              this.ctx.config.fileName
            ));
          }
          case 'unwrap_or': {
            if (opt.isSome && opt.inner !== undefined) {
              return normalOutcome(opt.inner);
            }
            return normalOutcome(args[0] ?? UNIT_VALUE);
          }
          case 'unwrap_or_else': {
            if (opt.isSome && opt.inner !== undefined) {
              return normalOutcome(opt.inner);
            }
            if (args.length > 0) {
              return this.callFunctionValue(args[0], [], span);
            }
            return normalOutcome(UNIT_VALUE);
          }
          case 'map': {
            if (!opt.isSome || opt.inner === undefined) {
              return normalOutcome(rtNone);
            }
            if (args.length > 0) {
              const res = this.callFunctionValue(args[0], [opt.inner], span);
              if (res.kind !== 'Normal') return res;
              return normalOutcome(rtSome(res.value));
            }
            return normalOutcome(rtNone);
          }
          case 'and_then': {
            if (!opt.isSome || opt.inner === undefined) {
              return normalOutcome(rtNone);
            }
            if (args.length > 0) {
              return this.callFunctionValue(args[0], [opt.inner], span);
            }
            return normalOutcome(rtNone);
          }
          case 'or_else': {
            if (opt.isSome) {
              return normalOutcome(opt);
            }
            if (args.length > 0) {
              return this.callFunctionValue(args[0], [], span);
            }
            return normalOutcome(opt);
          }
          default:
            return null;
        }
      }

      case 'Result': {
        const res = target as ResultRuntimeValue;
        switch (methodName) {
          case 'is_ok':
            return normalOutcome(rtBool(res.isOk));
          case 'is_err':
            return normalOutcome(rtBool(!res.isOk));
          case 'unwrap': {
            if (res.isOk) {
              return normalOutcome(res.value);
            }
            return panicOutcome(unsupportedOperationError(
              `Called unwrap on an Err value: ${formatRuntimeValue(res.value)}`,
              span,
              this.ctx.config.fileName
            ));
          }
          case 'expect': {
            if (res.isOk) {
              return normalOutcome(res.value);
            }
            const msg = args.length > 0 ? formatRuntimeValue(args[0]) : 'called expect on an Err';
            return panicOutcome(unsupportedOperationError(
              `${msg}: ${formatRuntimeValue(res.value)}`,
              span,
              this.ctx.config.fileName
            ));
          }
          case 'unwrap_or': {
            if (res.isOk) {
              return normalOutcome(res.value);
            }
            return normalOutcome(args[0] ?? UNIT_VALUE);
          }
          case 'unwrap_or_else': {
            if (res.isOk) {
              return normalOutcome(res.value);
            }
            if (args.length > 0) {
              return this.callFunctionValue(args[0], [res.value], span);
            }
            return normalOutcome(UNIT_VALUE);
          }
          case 'map': {
            if (!res.isOk) {
              return normalOutcome(res);
            }
            if (args.length > 0) {
              const mapped = this.callFunctionValue(args[0], [res.value], span);
              if (mapped.kind !== 'Normal') return mapped;
              return normalOutcome(rtOk(mapped.value));
            }
            return normalOutcome(res);
          }
          case 'map_err': {
            if (res.isOk) {
              return normalOutcome(res);
            }
            if (args.length > 0) {
              const mapped = this.callFunctionValue(args[0], [res.value], span);
              if (mapped.kind !== 'Normal') return mapped;
              return normalOutcome(rtErr(mapped.value));
            }
            return normalOutcome(res);
          }
          case 'and_then': {
            if (!res.isOk) {
              return normalOutcome(res);
            }
            if (args.length > 0) {
              return this.callFunctionValue(args[0], [res.value], span);
            }
            return normalOutcome(res);
          }
          case 'or_else': {
            if (res.isOk) {
              return normalOutcome(res);
            }
            if (args.length > 0) {
              return this.callFunctionValue(args[0], [res.value], span);
            }
            return normalOutcome(res);
          }
          default:
            return null;
        }
      }

      case 'List': {
        const list = target as ListRuntimeValue;
        switch (methodName) {
          case 'length':
            return normalOutcome(rtInt(BigInt(list.elements.length)));
          case 'is_empty':
            return normalOutcome(rtBool(list.elements.length === 0));
          case 'first':
            return normalOutcome(list.elements.length > 0 ? rtSome(list.elements[0]) : rtNone);
          case 'last':
            return normalOutcome(list.elements.length > 0 ? rtSome(list.elements[list.elements.length - 1]) : rtNone);
          case 'get': {
            if (args.length > 0 && (args[0].tag === 'Int' || args[0].tag === 'UInt')) {
              const idx = Number((args[0] as IntRuntimeValue | UIntRuntimeValue).value);
              if (idx >= 0 && idx < list.elements.length) {
                return normalOutcome(rtSome(list.elements[idx]));
              }
            }
            return normalOutcome(rtNone);
          }
          case 'push': {
            const item = args[0] ?? UNIT_VALUE;
            return normalOutcome(rtList([...list.elements, item]));
          }
          case 'contains': {
            const item = args[0] ?? UNIT_VALUE;
            const found = list.elements.some((e) => runtimeValuesEqual(e, item));
            return normalOutcome(rtBool(found));
          }
          case 'iter':
            return normalOutcome(createListIterator(list));
          case 'map': {
            if (args.length > 0) {
              const mapped: RuntimeValue[] = [];
              for (const elem of list.elements) {
                const res = this.callFunctionValue(args[0], [elem], span);
                if (res.kind !== 'Normal') return res;
                mapped.push(res.value);
              }
              return normalOutcome(rtList(mapped));
            }
            return normalOutcome(list);
          }
          case 'filter': {
            if (args.length > 0) {
              const filtered: RuntimeValue[] = [];
              for (const elem of list.elements) {
                const res = this.callFunctionValue(args[0], [elem], span);
                if (res.kind !== 'Normal') return res;
                if (res.value.tag === 'Bool' && (res.value as BoolRuntimeValue).value) {
                  filtered.push(elem);
                }
              }
              return normalOutcome(rtList(filtered));
            }
            return normalOutcome(list);
          }
          case 'reverse':
            return normalOutcome(rtList([...list.elements].reverse()));
          default:
            return null;
        }
      }

      case 'Map': {
        const map = target as MapRuntimeValue;
        switch (methodName) {
          case 'length':
            return normalOutcome(rtInt(BigInt(map.entries.length)));
          case 'is_empty':
            return normalOutcome(rtBool(map.entries.length === 0));
          case 'get': {
            const key = args[0] ?? UNIT_VALUE;
            const entry = map.entries.find((e) => runtimeValuesEqual(e.key, key));
            return normalOutcome(entry ? rtSome(entry.value) : rtNone);
          }
          case 'contains': {
            const key = args[0] ?? UNIT_VALUE;
            const found = map.entries.some((e) => runtimeValuesEqual(e.key, key));
            return normalOutcome(rtBool(found));
          }
          case 'insert': {
            const key = args[0] ?? UNIT_VALUE;
            const value = args[1] ?? UNIT_VALUE;
            const filtered = map.entries.filter((e) => !runtimeValuesEqual(e.key, key));
            return normalOutcome(rtMap([...filtered, { key, value }]));
          }
          case 'remove': {
            const key = args[0] ?? UNIT_VALUE;
            const filtered = map.entries.filter((e) => !runtimeValuesEqual(e.key, key));
            return normalOutcome(rtMap(filtered));
          }
          case 'keys':
            return normalOutcome(rtList(map.entries.map((e) => e.key)));
          case 'values':
            return normalOutcome(rtList(map.entries.map((e) => e.value)));
          case 'iter':
            return normalOutcome(createMapIterator(map));
          default:
            return null;
        }
      }

      case 'Set': {
        const setVal = target as SetRuntimeValue;
        switch (methodName) {
          case 'length':
            return normalOutcome(rtInt(BigInt(setVal.elements.length)));
          case 'is_empty':
            return normalOutcome(rtBool(setVal.elements.length === 0));
          case 'contains': {
            const item = args[0] ?? UNIT_VALUE;
            const found = setVal.elements.some((elem) => runtimeValuesEqual(elem, item));
            return normalOutcome(rtBool(found));
          }
          case 'insert': {
            const item = args[0] ?? UNIT_VALUE;
            return normalOutcome(rtSet([...setVal.elements, item]));
          }
          case 'remove': {
            const item = args[0] ?? UNIT_VALUE;
            const newElems = setVal.elements.filter((elem) => !runtimeValuesEqual(elem, item));
            return normalOutcome(rtSet(newElems));
          }
          case 'iter':
            return normalOutcome(createSetIterator(setVal));
          default:
            return null;
        }
      }

      case 'String': {
        const str = (target as StringRuntimeValue).value;
        switch (methodName) {
          case 'length':
            return normalOutcome(rtInt(BigInt(Array.from(str).length)));
          case 'is_empty':
            return normalOutcome(rtBool(str.length === 0));
          case 'contains': {
            const sub = args[0] && args[0].tag === 'String' ? (args[0] as StringRuntimeValue).value : '';
            return normalOutcome(rtBool(str.includes(sub)));
          }
          case 'starts_with': {
            const prefix = args[0] && args[0].tag === 'String' ? (args[0] as StringRuntimeValue).value : '';
            return normalOutcome(rtBool(str.startsWith(prefix)));
          }
          case 'ends_with': {
            const suffix = args[0] && args[0].tag === 'String' ? (args[0] as StringRuntimeValue).value : '';
            return normalOutcome(rtBool(str.endsWith(suffix)));
          }
          case 'trim':
            return normalOutcome(rtString(str.trim()));
          case 'split': {
            const sep = args[0] && args[0].tag === 'String' ? (args[0] as StringRuntimeValue).value : '';
            return normalOutcome(rtList(str.split(sep).map((s) => rtString(s))));
          }
          case 'replace': {
            const from = args[0] && args[0].tag === 'String' ? (args[0] as StringRuntimeValue).value : '';
            const to = args[1] && args[1].tag === 'String' ? (args[1] as StringRuntimeValue).value : '';
            return normalOutcome(rtString(str.split(from).join(to)));
          }
          case 'chars':
            return normalOutcome(rtList(Array.from(str).map((c) => rtChar(c))));
          case 'bytes': {
            const buf = Buffer.from(str, 'utf-8');
            return normalOutcome(rtList(Array.from(buf).map((b) => rtByte(b))));
          }
          default:
            return null;
        }
      }

      case 'Iterator': {
        const iter = target as IteratorRuntimeValue;
        switch (methodName) {
          case 'next':
            return normalOutcome(iter.next());
          case 'map': {
            if (args.length === 0) return normalOutcome(iter);
            const fn = args[0];
            return normalOutcome(
              createMapIteratorCombinator(iter, (item) => {
                const res = this.callFunctionValue(fn, [item], span);
                return res.kind === 'Normal' ? res.value : UNIT_VALUE;
              })
            );
          }
          case 'filter': {
            if (args.length === 0) return normalOutcome(iter);
            const fn = args[0];
            return normalOutcome(
              createFilterIterator(iter, (item) => {
                const res = this.callFunctionValue(fn, [item], span);
                return res.kind === 'Normal' && res.value.tag === 'Bool' && (res.value as BoolRuntimeValue).value;
              })
            );
          }
          case 'take': {
            const count = args.length > 0 && (args[0].tag === 'Int' || args[0].tag === 'UInt')
              ? Number((args[0] as IntRuntimeValue | UIntRuntimeValue).value)
              : 0;
            return normalOutcome(createTakeIterator(iter, count));
          }
          case 'skip': {
            const count = args.length > 0 && (args[0].tag === 'Int' || args[0].tag === 'UInt')
              ? Number((args[0] as IntRuntimeValue | UIntRuntimeValue).value)
              : 0;
            return normalOutcome(createSkipIterator(iter, count));
          }
          case 'enumerate':
            return normalOutcome(createEnumerateIterator(iter));
          case 'zip': {
            const otherVal = args[0];
            const other: IteratorRuntimeValue = otherVal && otherVal.tag === 'Iterator'
              ? (otherVal as IteratorRuntimeValue)
              : (otherVal && otherVal.tag === 'List'
                  ? createListIterator(otherVal as ListRuntimeValue)
                  : (otherVal && otherVal.tag === 'Set'
                      ? createSetIterator(otherVal as SetRuntimeValue)
                      : (otherVal && otherVal.tag === 'Map'
                          ? createMapIterator(otherVal as MapRuntimeValue)
                          : otherVal as unknown as IteratorRuntimeValue)));
            return normalOutcome(createZipIterator(iter, other));
          }
          case 'fold': {
            let current = args[0] ?? UNIT_VALUE;
            const fn = args[1];
            while (true) {
              const item = iter.next();
              if (!item.isSome) break;
              const step = this.callFunctionValue(fn, [current, item.inner!], span);
              if (step.kind !== 'Normal') return step;
              current = step.value;
            }
            return normalOutcome(current);
          }
          case 'reduce': {
            const first = iter.next();
            if (!first.isSome) return normalOutcome(rtNone);
            let current = first.inner!;
            const fn = args[0];
            while (true) {
              const item = iter.next();
              if (!item.isSome) break;
              const step = this.callFunctionValue(fn, [current, item.inner!], span);
              if (step.kind !== 'Normal') return step;
              current = step.value;
            }
            return normalOutcome(rtSome(current));
          }
          case 'collect':
            return normalOutcome(collectIterator(iter));
          default:
            return null;
        }
      }

      case 'Reader': {
        const reader = target as ReaderRuntimeValue;
        switch (methodName) {
          case 'read': {
            const n = args.length > 0 && (args[0].tag === 'Int' || args[0].tag === 'UInt')
              ? Number((args[0] as IntRuntimeValue | UIntRuntimeValue).value)
              : undefined;
            return normalOutcome(reader.read(n));
          }
          case 'read_all':
            return normalOutcome(rtString(reader.readAll()));
          case 'is_eof':
            return normalOutcome(rtBool(reader.isEof()));
          case 'seek': {
            if (reader.seek && args.length > 0 && (args[0].tag === 'Int' || args[0].tag === 'UInt')) {
              reader.seek(Number((args[0] as IntRuntimeValue | UIntRuntimeValue).value));
            }
            return normalOutcome(UNIT_VALUE);
          }
          case 'write': {
            if ('write' in reader && typeof (reader as any).write === 'function') {
              const str = args.length > 0 && args[0].tag === 'String' ? (args[0] as StringRuntimeValue).value : '';
              return normalOutcome((reader as any).write(str));
            }
            return null;
          }
          case 'get_content': {
            if ('getContent' in reader && typeof (reader as any).getContent === 'function') {
              return normalOutcome(rtString((reader as any).getContent()));
            }
            return null;
          }
          case 'clear': {
            if ('clear' in reader && typeof (reader as any).clear === 'function') {
              (reader as any).clear();
              return normalOutcome(UNIT_VALUE);
            }
            return null;
          }
          case 'length': {
            if ('length' in reader && typeof (reader as any).length === 'function') {
              return normalOutcome(rtInt(BigInt((reader as any).length())));
            }
            return null;
          }
          case 'is_empty': {
            if (reader.isEmpty) {
              return normalOutcome(rtBool(reader.isEmpty()));
            }
            return normalOutcome(rtBool(reader.isEof()));
          }
          case 'position': {
            if (reader.position) {
              return normalOutcome(rtInt(BigInt(reader.position())));
            }
            return normalOutcome(rtInt(0n));
          }
          case 'reset': {
            if (reader.reset) {
              reader.reset();
            }
            return normalOutcome(UNIT_VALUE);
          }
          default:
            return null;
        }
      }

      case 'Writer': {
        const writer = target as WriterRuntimeValue;
        switch (methodName) {
          case 'write': {
            const str = args.length > 0 && args[0].tag === 'String' ? (args[0] as StringRuntimeValue).value : '';
            return normalOutcome(writer.write(str));
          }
          case 'get_content':
            return normalOutcome(rtString(writer.getContent()));
          case 'clear':
            writer.clear();
            return normalOutcome(UNIT_VALUE);
          case 'length':
            return normalOutcome(rtInt(BigInt(writer.length())));
          default:
            return null;
        }
      }

      case 'Resource': {
        const res = target as ResourceRuntimeValue;
        switch (methodName) {
          case 'close':
            return normalOutcome(res.close());
          case 'is_closed':
            return normalOutcome(rtBool(res.isClosed()));
          default:
            return null;
        }
      }

      default:
        return null;
    }
  }

  // ─── Assignment Expression ────────────────────────────────────────────────

  private evaluateAssignmentExpr(expr: AssignmentExpr, env: RuntimeEnvironment): RuntimeOutcome {
    const valOutcome = this.evaluateExpr(expr.value, env);
    if (valOutcome.kind !== 'Normal') return valOutcome;
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
    const targetOutcome = this.evaluateExpr(expr.object, env);
    if (targetOutcome.kind !== 'Normal') return targetOutcome;
    const target = targetOutcome.value;

    // Tuple positional index: e.g. user.0, user.1
    if (target.tag === 'Tuple') {
      const tuple = target as TupleRuntimeValue;
      const index = parseInt(expr.property, 10);
      if (!isNaN(index) && index >= 0 && index < tuple.elements.length) {
        return normalOutcome(tuple.elements[index]);
      }
      return panicOutcome(invalidStateError(
        `Tuple index .${expr.property} out of bounds for tuple of arity ${tuple.elements.length}.`,
        expr.span, this.ctx.config.fileName
      ));
    }

    // .length property
    if (expr.property === 'length') {
      if (target.tag === 'List') {
        return normalOutcome(rtInt(BigInt((target as ListRuntimeValue).elements.length)));
      }
      if (target.tag === 'Set') {
        return normalOutcome(rtInt(BigInt((target as SetRuntimeValue).elements.length)));
      }
      if (target.tag === 'Map') {
        return normalOutcome(rtInt(BigInt((target as MapRuntimeValue).entries.length)));
      }
      if (target.tag === 'String') {
        return normalOutcome(rtInt(BigInt(Array.from((target as StringRuntimeValue).value).length)));
      }
      if (target.tag === 'Writer') {
        return normalOutcome(rtInt(BigInt((target as WriterRuntimeValue).length())));
      }
      if (target.tag === 'Reader' && 'length' in target && typeof (target as any).length === 'function') {
        return normalOutcome(rtInt(BigInt((target as any).length())));
      }
    }

    // Module exported symbol access: e.g. client.send, math.add
    if (target.tag === 'Module') {
      const mod = target as ModuleRuntimeValue;
      const val = mod.exports.get(expr.property);
      if (val !== undefined) {
        return normalOutcome(val);
      }
      return panicOutcome(invalidStateError(
        `Module '${mod.name}' has no exported symbol '${expr.property}'.`,
        expr.span, this.ctx.config.fileName
      ));
    }

    if (this.isKnownMethod(target.tag, expr.property)) {
      return normalOutcome(rtNativeMethod(target, expr.property));
    }

    return panicOutcome(unsupportedOperationError(
      `member access .${expr.property} on ${target.tag}`,
      expr.span, this.ctx.config.fileName
    ));
  }

  // ─── Match Expression ─────────────────────────────────────────────────────

  private evaluateMatchExpr(expr: MatchExpr, env: RuntimeEnvironment): RuntimeOutcome {
    const targetOutcome = this.evaluateExpr(expr.value, env);
    if (targetOutcome.kind !== 'Normal') return targetOutcome;
    const targetVal = targetOutcome.value;

    for (const arm of expr.arms) {
      const matchResult = this.matchPattern(arm.pattern, targetVal);
      if (matchResult.matched) {
        const armEnv = env.child('match_arm');
        if (matchResult.bindings) {
          for (const [name, val] of matchResult.bindings) {
            armEnv.define(name, val, false);
          }
        }

        if (arm.body.kind === 'Block') {
          return this.executeBlock(arm.body as Block, armEnv);
        } else {
          return this.evaluateExpr(arm.body as Expr, armEnv);
        }
      }
    }

    return panicOutcome(invalidStateError(
      'Non-exhaustive pattern match at runtime.',
      expr.span, this.ctx.config.fileName
    ));
  }

  private matchPattern(
    pattern: Pattern,
    value: RuntimeValue
  ): { matched: boolean; bindings?: Map<string, RuntimeValue> } {
    switch (pattern.kind) {
      case 'WildcardPattern':
        return { matched: true };

      case 'IdentifierPattern': {
        const id = pattern as IdentifierPattern;
        if (id.name === 'None') {
          if (value.tag === 'Option' && !(value as OptionRuntimeValue).isSome) {
            return { matched: true };
          }
          return { matched: false };
        }
        const bindings = new Map<string, RuntimeValue>();
        bindings.set(id.name, value);
        return { matched: true, bindings };
      }

      case 'LiteralPattern': {
        const lit = (pattern as LiteralPattern).literal;
        const litOutcome = this.evaluateLiteral(lit);
        if (litOutcome.kind === 'Normal') {
          if (runtimeValuesEqual(litOutcome.value, value)) {
            return { matched: true };
          }
        }
        return { matched: false };
      }

      case 'ConstructorPattern': {
        const ctor = pattern as ConstructorPattern;
        if (ctor.name === 'Some') {
          if (value.tag === 'Option' && (value as OptionRuntimeValue).isSome) {
            const innerVal = (value as OptionRuntimeValue).inner!;
            if (ctor.args.length > 0) {
              return this.matchPattern(ctor.args[0], innerVal);
            }
            return { matched: true };
          }
          return { matched: false };
        }

        if (ctor.name === 'None') {
          if (value.tag === 'Option' && !(value as OptionRuntimeValue).isSome) {
            return { matched: true };
          }
          return { matched: false };
        }

        if (ctor.name === 'Ok') {
          if (value.tag === 'Result' && (value as ResultRuntimeValue).isOk) {
            const innerVal = (value as ResultRuntimeValue).value;
            if (ctor.args.length > 0) {
              return this.matchPattern(ctor.args[0], innerVal);
            }
            return { matched: true };
          }
          return { matched: false };
        }

        if (ctor.name === 'Err') {
          if (value.tag === 'Result' && !(value as ResultRuntimeValue).isOk) {
            const innerVal = (value as ResultRuntimeValue).value;
            if (ctor.args.length > 0) {
              return this.matchPattern(ctor.args[0], innerVal);
            }
            return { matched: true };
          }
          return { matched: false };
        }

        return { matched: false };
      }

      default:
        return { matched: false };
    }
  }

  // ─── Collections & Lambdas ────────────────────────────────────────────────

  private evaluateListLiteral(expr: ListLiteral, env: RuntimeEnvironment): RuntimeOutcome {
    const elements: RuntimeValue[] = [];
    for (const elem of expr.elements) {
      const outcome = this.evaluateExpr(elem, env);
      if (outcome.kind !== 'Normal') return outcome;
      elements.push(outcome.value);
    }
    return normalOutcome(rtList(elements));
  }

  private evaluateTupleLiteral(expr: TupleLiteral, env: RuntimeEnvironment): RuntimeOutcome {
    const elements: RuntimeValue[] = [];
    for (const elem of expr.elements) {
      const outcome = this.evaluateExpr(elem, env);
      if (outcome.kind !== 'Normal') return outcome;
      elements.push(outcome.value);
    }
    return normalOutcome(rtTuple(elements));
  }

  private evaluateMapLiteral(expr: MapLiteral, env: RuntimeEnvironment): RuntimeOutcome {
    const entries: { key: RuntimeValue; value: RuntimeValue }[] = [];
    for (const entry of expr.entries) {
      const keyOutcome = this.evaluateExpr(entry.key, env);
      if (keyOutcome.kind !== 'Normal') return keyOutcome;

      const valOutcome = this.evaluateExpr(entry.value, env);
      if (valOutcome.kind !== 'Normal') return valOutcome;

      entries.push({ key: keyOutcome.value, value: valOutcome.value });
    }
    return normalOutcome(rtMap(entries));
  }

  private evaluateSetLiteral(expr: SetLiteral, env: RuntimeEnvironment): RuntimeOutcome {
    const elements: RuntimeValue[] = [];
    for (const elem of expr.elements) {
      const outcome = this.evaluateExpr(elem, env);
      if (outcome.kind !== 'Normal') return outcome;
      elements.push(outcome.value);
    }
    return normalOutcome(rtSet(elements));
  }

  private evaluateIndexExpr(expr: IndexExpr, env: RuntimeEnvironment): RuntimeOutcome {
    const targetOutcome = this.evaluateExpr(expr.object, env);
    if (targetOutcome.kind !== 'Normal') return targetOutcome;
    const targetVal = targetOutcome.value;

    const indexOutcome = this.evaluateExpr(expr.index, env);
    if (indexOutcome.kind !== 'Normal') return indexOutcome;
    const indexVal = indexOutcome.value;

    if (targetVal.tag === 'List') {
      const list = targetVal as ListRuntimeValue;
      if (indexVal.tag === 'Int' || indexVal.tag === 'UInt') {
        const idx = Number((indexVal as IntRuntimeValue | UIntRuntimeValue).value);
        if (idx >= 0 && idx < list.elements.length) {
          return normalOutcome(rtSome(list.elements[idx]));
        }
        return normalOutcome(rtNone);
      }
      return panicOutcome(invalidStateError(
        `List index must be an integer, got ${indexVal.tag}.`,
        expr.index.span, this.ctx.config.fileName
      ));
    }

    if (targetVal.tag === 'Tuple') {
      const tuple = targetVal as TupleRuntimeValue;
      if (indexVal.tag === 'Int' || indexVal.tag === 'UInt') {
        const idx = Number((indexVal as IntRuntimeValue | UIntRuntimeValue).value);
        if (idx >= 0 && idx < tuple.elements.length) {
          return normalOutcome(rtSome(tuple.elements[idx]));
        }
        return normalOutcome(rtNone);
      }
      return panicOutcome(invalidStateError(
        `Tuple index must be an integer, got ${indexVal.tag}.`,
        expr.index.span, this.ctx.config.fileName
      ));
    }

    if (targetVal.tag === 'Map') {
      const map = targetVal as MapRuntimeValue;
      const entry = map.entries.find((e) => runtimeValuesEqual(e.key, indexVal));
      if (entry) {
        return normalOutcome(rtSome(entry.value));
      }
      return normalOutcome(rtNone);
    }

    if (targetVal.tag === 'String') {
      const str = (targetVal as StringRuntimeValue).value;
      if (indexVal.tag === 'Int' || indexVal.tag === 'UInt') {
        const idx = Number((indexVal as IntRuntimeValue | UIntRuntimeValue).value);
        const chars = Array.from(str);
        if (idx >= 0 && idx < chars.length) {
          return normalOutcome(rtSome(rtChar(chars[idx])));
        }
        return normalOutcome(rtNone);
      }
      return panicOutcome(invalidStateError(
        `String index must be an integer, got ${indexVal.tag}.`,
        expr.index.span, this.ctx.config.fileName
      ));
    }

    return panicOutcome(invalidStateError(
      `Cannot index value of type ${targetVal.tag}.`,
      expr.span, this.ctx.config.fileName
    ));
  }

  private evaluateLambdaExpr(expr: LambdaExpr, env: RuntimeEnvironment): RuntimeOutcome {
    return normalOutcome(rtLambda(expr, env));
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
        const resName = args.length > 0 && args[0].tag === 'String' ? (args[0] as StringRuntimeValue).value : 'resource';
        return normalOutcome(createResource(resName));
      }

      case 'MemoryReader': {
        const content = args.length > 0 && args[0].tag === 'String' ? (args[0] as StringRuntimeValue).value : '';
        return normalOutcome(createMemoryReader(content));
      }

      case 'MemoryWriter': {
        return normalOutcome(createMemoryWriter());
      }

      case 'MemoryStream': {
        const initial = args.length > 0 && args[0].tag === 'String' ? (args[0] as StringRuntimeValue).value : '';
        return normalOutcome(createMemoryStream(initial));
      }

      case 'Set': {
        if (args.length === 0) return normalOutcome(rtSet([]));
        const first = args[0];
        if (first.tag === 'List') {
          return normalOutcome(rtSet((first as ListRuntimeValue).elements));
        }
        if (first.tag === 'Set') {
          return normalOutcome(first);
        }
        return normalOutcome(rtSet(args));
      }

      case 'iter': {
        const target = args[0];
        if (!target) return normalOutcome(rtNone);
        if (target.tag === 'Iterator') return normalOutcome(target);
        if (target.tag === 'List') return normalOutcome(createListIterator(target as ListRuntimeValue));
        if (target.tag === 'Map') return normalOutcome(createMapIterator(target as MapRuntimeValue));
        if (target.tag === 'Set') return normalOutcome(createSetIterator(target as SetRuntimeValue));
        return normalOutcome(target);
      }

      case 'collect': {
        const target = args[0];
        if (!target) return panicOutcome(invalidStateError('collect requires an argument', span, this.ctx.config.fileName));
        if (target.tag === 'Iterator') return normalOutcome(collectIterator(target as IteratorRuntimeValue));
        if (target.tag === 'List') return normalOutcome(target);
        return panicOutcome(unsupportedOperationError(`collect on ${target.tag}`, span, this.ctx.config.fileName));
      }

      case 'filter': {
        const target = args[0];
        if (!target) return panicOutcome(invalidStateError('filter requires an argument', span, this.ctx.config.fileName));
        const methodRes = this.callMethod(target, 'filter', args.slice(1), span);
        if (methodRes !== null) return methodRes;
        return panicOutcome(unsupportedOperationError(`filter on ${target.tag}`, span, this.ctx.config.fileName));
      }

      case 'map': {
        const target = args[0];
        if (!target) return panicOutcome(invalidStateError('map requires an argument', span, this.ctx.config.fileName));
        const methodRes = this.callMethod(target, 'map', args.slice(1), span);
        if (methodRes !== null) return methodRes;
        return panicOutcome(unsupportedOperationError(`map on ${target.tag}`, span, this.ctx.config.fileName));
      }

      case 'take': {
        const target = args[0];
        if (!target) return panicOutcome(invalidStateError('take requires an argument', span, this.ctx.config.fileName));
        const it = target.tag === 'Iterator' ? target : (target.tag === 'List' ? createListIterator(target as ListRuntimeValue) : target);
        const methodRes = this.callMethod(it, 'take', args.slice(1), span);
        if (methodRes !== null) return methodRes;
        return panicOutcome(unsupportedOperationError(`take on ${target.tag}`, span, this.ctx.config.fileName));
      }

      case 'skip': {
        const target = args[0];
        if (!target) return panicOutcome(invalidStateError('skip requires an argument', span, this.ctx.config.fileName));
        const it = target.tag === 'Iterator' ? target : (target.tag === 'List' ? createListIterator(target as ListRuntimeValue) : target);
        const methodRes = this.callMethod(it, 'skip', args.slice(1), span);
        if (methodRes !== null) return methodRes;
        return panicOutcome(unsupportedOperationError(`skip on ${target.tag}`, span, this.ctx.config.fileName));
      }

      case 'enumerate': {
        const target = args[0];
        if (!target) return panicOutcome(invalidStateError('enumerate requires an argument', span, this.ctx.config.fileName));
        const it = target.tag === 'Iterator' ? target : (target.tag === 'List' ? createListIterator(target as ListRuntimeValue) : target);
        const methodRes = this.callMethod(it, 'enumerate', args.slice(1), span);
        if (methodRes !== null) return methodRes;
        return panicOutcome(unsupportedOperationError(`enumerate on ${target.tag}`, span, this.ctx.config.fileName));
      }

      case 'zip': {
        const a = args[0];
        const b = args[1];
        if (!a || !b) return panicOutcome(invalidStateError('zip requires two arguments', span, this.ctx.config.fileName));
        const itA = a.tag === 'Iterator' ? a : (a.tag === 'List' ? createListIterator(a as ListRuntimeValue) : a);
        const itB = b.tag === 'Iterator' ? b : (b.tag === 'List' ? createListIterator(b as ListRuntimeValue) : b);
        const methodRes = this.callMethod(itA, 'zip', [itB], span);
        if (methodRes !== null) return methodRes;
        return panicOutcome(unsupportedOperationError(`zip on ${a.tag}`, span, this.ctx.config.fileName));
      }

      case 'fold': {
        const target = args[0];
        if (!target) return panicOutcome(invalidStateError('fold requires an argument', span, this.ctx.config.fileName));
        const it = target.tag === 'Iterator' ? target : (target.tag === 'List' ? createListIterator(target as ListRuntimeValue) : target);
        const methodRes = this.callMethod(it, 'fold', args.slice(1), span);
        if (methodRes !== null) return methodRes;
        return panicOutcome(unsupportedOperationError(`fold on ${target.tag}`, span, this.ctx.config.fileName));
      }

      case 'reduce': {
        const target = args[0];
        if (!target) return panicOutcome(invalidStateError('reduce requires an argument', span, this.ctx.config.fileName));
        const it = target.tag === 'Iterator' ? target : (target.tag === 'List' ? createListIterator(target as ListRuntimeValue) : target);
        const methodRes = this.callMethod(it, 'reduce', args.slice(1), span);
        if (methodRes !== null) return methodRes;
        return panicOutcome(unsupportedOperationError(`reduce on ${target.tag}`, span, this.ctx.config.fileName));
      }

      case 'is_some': {
        const target = args[0];
        if (!target) return panicOutcome(invalidStateError('is_some requires an argument', span, this.ctx.config.fileName));
        return this.callMethod(target, 'is_some', [], span) ?? panicOutcome(unsupportedOperationError(`is_some on ${target.tag}`, span, this.ctx.config.fileName));
      }

      case 'is_none': {
        const target = args[0];
        if (!target) return panicOutcome(invalidStateError('is_none requires an argument', span, this.ctx.config.fileName));
        return this.callMethod(target, 'is_none', [], span) ?? panicOutcome(unsupportedOperationError(`is_none on ${target.tag}`, span, this.ctx.config.fileName));
      }

      case 'is_ok': {
        const target = args[0];
        if (!target) return panicOutcome(invalidStateError('is_ok requires an argument', span, this.ctx.config.fileName));
        return this.callMethod(target, 'is_ok', [], span) ?? panicOutcome(unsupportedOperationError(`is_ok on ${target.tag}`, span, this.ctx.config.fileName));
      }

      case 'is_err': {
        const target = args[0];
        if (!target) return panicOutcome(invalidStateError('is_err requires an argument', span, this.ctx.config.fileName));
        return this.callMethod(target, 'is_err', [], span) ?? panicOutcome(unsupportedOperationError(`is_err on ${target.tag}`, span, this.ctx.config.fileName));
      }

      case 'unwrap': {
        const target = args[0];
        if (!target) return panicOutcome(invalidStateError('unwrap requires an argument', span, this.ctx.config.fileName));
        return this.callMethod(target, 'unwrap', [], span) ?? panicOutcome(unsupportedOperationError(`unwrap on ${target.tag}`, span, this.ctx.config.fileName));
      }

      case 'expect': {
        const target = args[0];
        if (!target) return panicOutcome(invalidStateError('expect requires an argument', span, this.ctx.config.fileName));
        return this.callMethod(target, 'expect', args.slice(1), span) ?? panicOutcome(unsupportedOperationError(`expect on ${target.tag}`, span, this.ctx.config.fileName));
      }

      case 'unwrap_or':
      case 'unwrap_or_else':
      case 'map_err':
      case 'and_then':
      case 'or_else':
      case 'trim':
      case 'replace':
      case 'split':
      case 'contains':
      case 'chars':
      case 'bytes': {
        const target = args[0];
        if (!target) return panicOutcome(invalidStateError(`'${name}' requires an argument`, span, this.ctx.config.fileName));
        const methodRes = this.callMethod(target, name, args.slice(1), span);
        if (methodRes !== null) return methodRes;
        return panicOutcome(unsupportedOperationError(`${name} on ${target.tag}`, span, this.ctx.config.fileName));
      }

      default:
        return null;
    }
  }
}
