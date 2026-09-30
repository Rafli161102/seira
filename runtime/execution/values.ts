/**
 * Seira Runtime Value Model (0.0.5-s Execution Foundation)
 *
 * Implements explicit runtime value representations according to the Seira Value Model v0.1.
 *
 * IMPORTANT: JavaScript primitive types (number, string, boolean, null, undefined)
 * are NOT Seira semantic values. Every Seira value carries an explicit tag and type
 * identity. This eliminates JavaScript coercion from observable Seira semantics.
 *
 * Supported runtime values for 0.0.5-s:
 *   Primitive: Int, UInt, Float, Bool, Char, String, Byte, Unit
 *   Composite: Option<T>, Result<T,E>, List<T>
 *   Function: FunctionValue (with closure environment)
 *
 * «Everything is a Value.»
 */

import type { FunctionDecl, LambdaExpr } from '../../compiler/ast/ast.ts';
import type { Span } from '../../compiler/source/span.ts';

// ─── Value Tags ──────────────────────────────────────────────────────────────

export const RuntimeTag = {
  Unit: 'Unit',
  Int: 'Int',
  UInt: 'UInt',
  Float: 'Float',
  Bool: 'Bool',
  Char: 'Char',
  String: 'String',
  Byte: 'Byte',
  Option: 'Option',
  Result: 'Result',
  List: 'List',
  Tuple: 'Tuple',
  Map: 'Map',
  Set: 'Set',
  Function: 'Function',
  Builtin: 'Builtin',
} as const;

export type RuntimeTag = (typeof RuntimeTag)[keyof typeof RuntimeTag];

// ─── Runtime Value Types ─────────────────────────────────────────────────────

export interface UnitRuntimeValue {
  readonly tag: 'Unit';
}

export interface IntRuntimeValue {
  readonly tag: 'Int';
  readonly value: bigint; // Always BigInt to avoid JS number precision leakage
}

export interface UIntRuntimeValue {
  readonly tag: 'UInt';
  readonly value: bigint;
}

export interface FloatRuntimeValue {
  readonly tag: 'Float';
  readonly value: number; // IEEE 754 double matches Seira Float semantics
}

export interface BoolRuntimeValue {
  readonly tag: 'Bool';
  readonly value: boolean; // Strict: ONLY true / false — no truthiness coercion
}

export interface CharRuntimeValue {
  readonly tag: 'Char';
  readonly value: string; // Single Unicode scalar value
}

export interface StringRuntimeValue {
  readonly tag: 'String';
  readonly value: string;
}

export interface ByteRuntimeValue {
  readonly tag: 'Byte';
  readonly value: number; // 0–255
}

export interface OptionRuntimeValue {
  readonly tag: 'Option';
  readonly isSome: boolean;
  readonly inner?: RuntimeValue; // undefined iff isSome === false
}

export interface ResultRuntimeValue {
  readonly tag: 'Result';
  readonly isOk: boolean;
  readonly value: RuntimeValue; // Ok(v) or Err(e)
}

export interface ListRuntimeValue {
  readonly tag: 'List';
  readonly elements: ReadonlyArray<RuntimeValue>;
}

export interface TupleRuntimeValue {
  readonly tag: 'Tuple';
  readonly elements: ReadonlyArray<RuntimeValue>;
}

export interface MapEntryRuntime {
  readonly key: RuntimeValue;
  readonly value: RuntimeValue;
}

export interface MapRuntimeValue {
  readonly tag: 'Map';
  readonly entries: ReadonlyArray<MapEntryRuntime>;
}

export interface SetRuntimeValue {
  readonly tag: 'Set';
  readonly elements: ReadonlyArray<RuntimeValue>;
}

/** Runtime function value carrying its lexical closure environment. */
export interface FunctionRuntimeValue {
  readonly tag: 'Function';
  readonly name: string;
  readonly decl?: FunctionDecl;
  readonly lambda?: LambdaExpr;
  /** Captured lexical environment at the point of function definition. */
  readonly closure: RuntimeEnvironment;
}

/** Runtime built-in function value — represents a host-implemented function. */
export interface BuiltinRuntimeValue {
  readonly tag: 'Builtin';
  readonly name: string;
}

export type RuntimeValue =
  | UnitRuntimeValue
  | IntRuntimeValue
  | UIntRuntimeValue
  | FloatRuntimeValue
  | BoolRuntimeValue
  | CharRuntimeValue
  | StringRuntimeValue
  | ByteRuntimeValue
  | OptionRuntimeValue
  | ResultRuntimeValue
  | ListRuntimeValue
  | TupleRuntimeValue
  | MapRuntimeValue
  | SetRuntimeValue
  | FunctionRuntimeValue
  | BuiltinRuntimeValue;

// ─── Constructors ─────────────────────────────────────────────────────────────

export const UNIT_VALUE: UnitRuntimeValue = { tag: 'Unit' };
export const TRUE_VALUE: BoolRuntimeValue = { tag: 'Bool', value: true };
export const FALSE_VALUE: BoolRuntimeValue = { tag: 'Bool', value: false };
export const NONE_VALUE: OptionRuntimeValue = { tag: 'Option', isSome: false };

export function rtInt(value: bigint | number): IntRuntimeValue {
  return { tag: 'Int', value: typeof value === 'bigint' ? value : BigInt(Math.trunc(value)) };
}

export function rtUInt(value: bigint | number): UIntRuntimeValue {
  const big = typeof value === 'bigint' ? value : BigInt(Math.trunc(value));
  return { tag: 'UInt', value: big >= 0n ? big : 0n };
}

export function rtFloat(value: number): FloatRuntimeValue {
  return { tag: 'Float', value };
}

export function rtBool(value: boolean): BoolRuntimeValue {
  return value ? TRUE_VALUE : FALSE_VALUE;
}

export function rtChar(value: string): CharRuntimeValue {
  return { tag: 'Char', value: value[0] ?? '\0' };
}

export function rtString(value: string): StringRuntimeValue {
  return { tag: 'String', value };
}

export function rtByte(value: number): ByteRuntimeValue {
  return { tag: 'Byte', value: value & 0xff };
}

export function rtSome(inner: RuntimeValue): OptionRuntimeValue {
  return { tag: 'Option', isSome: true, inner };
}

export const rtNone: OptionRuntimeValue = NONE_VALUE;

export function rtOk(value: RuntimeValue): ResultRuntimeValue {
  return { tag: 'Result', isOk: true, value };
}

export function rtErr(value: RuntimeValue): ResultRuntimeValue {
  return { tag: 'Result', isOk: false, value };
}

export function rtList(elements: RuntimeValue[]): ListRuntimeValue {
  return { tag: 'List', elements };
}

export function rtTuple(elements: ReadonlyArray<RuntimeValue>): TupleRuntimeValue {
  return { tag: 'Tuple', elements };
}

export function rtMap(entries: ReadonlyArray<MapEntryRuntime>): MapRuntimeValue {
  return { tag: 'Map', entries };
}

export function rtSet(elements: ReadonlyArray<RuntimeValue>): SetRuntimeValue {
  const unique: RuntimeValue[] = [];
  for (const elem of elements) {
    if (!unique.some((u) => runtimeValuesEqual(u, elem))) {
      unique.push(elem);
    }
  }
  return { tag: 'Set', elements: unique };
}

export function rtFunction(
  name: string,
  decl: FunctionDecl,
  closure: RuntimeEnvironment
): FunctionRuntimeValue {
  return { tag: 'Function', name, decl, closure };
}

export function rtLambda(
  lambda: LambdaExpr,
  closure: RuntimeEnvironment
): FunctionRuntimeValue {
  return { tag: 'Function', name: '<lambda>', lambda, closure };
}

export function rtBuiltin(name: string): BuiltinRuntimeValue {
  return { tag: 'Builtin', name };
}

// ─── Value Formatting ─────────────────────────────────────────────────────────

/** Returns the Seira-idiomatic string representation of a runtime value. */
export function formatRuntimeValue(v: RuntimeValue): string {
  switch (v.tag) {
    case 'Unit':
      return '()';
    case 'Int':
      return v.value.toString();
    case 'UInt':
      return `${v.value.toString()}u`;
    case 'Float': {
      const s = v.value.toString();
      return s.includes('.') ? s : `${s}.0`;
    }
    case 'Bool':
      return v.value ? 'true' : 'false';
    case 'Char':
      return `'${v.value}'`;
    case 'String':
      return v.value;
    case 'Byte':
      return `${v.value}b`;
    case 'Option':
      return v.isSome ? `Some(${formatRuntimeValue(v.inner!)})` : 'None';
    case 'Result':
      return v.isOk
        ? `Ok(${formatRuntimeValue(v.value)})`
        : `Err(${formatRuntimeValue(v.value)})`;
    case 'List':
      return `[${v.elements.map(formatRuntimeValue).join(', ')}]`;
    case 'Tuple':
      return `(${v.elements.map(formatRuntimeValue).join(', ')})`;
    case 'Map':
      return `{${v.entries.map((e) => `${formatRuntimeValue(e.key)}: ${formatRuntimeValue(e.value)}`).join(', ')}}`;
    case 'Set':
      return `set[${v.elements.map(formatRuntimeValue).join(', ')}]`;
    case 'Function':
      return `<fn ${v.name}>`;
    case 'Builtin':
      return `<builtin ${v.name}>`;
  }
}

// ─── Equality ─────────────────────────────────────────────────────────────────

/**
 * Structural equality between Seira runtime values.
 * Does NOT use JavaScript === on value internals for semantic equality.
 */
export function runtimeValuesEqual(a: RuntimeValue, b: RuntimeValue): boolean {
  if (a.tag !== b.tag) return false;
  switch (a.tag) {
    case 'Unit':
      return true;
    case 'Int':
      return a.value === (b as IntRuntimeValue).value;
    case 'UInt':
      return a.value === (b as UIntRuntimeValue).value;
    case 'Float':
      return a.value === (b as FloatRuntimeValue).value;
    case 'Bool':
      return a.value === (b as BoolRuntimeValue).value;
    case 'Char':
      return a.value === (b as CharRuntimeValue).value;
    case 'String':
      return a.value === (b as StringRuntimeValue).value;
    case 'Byte':
      return a.value === (b as ByteRuntimeValue).value;
    case 'Option': {
      const bOpt = b as OptionRuntimeValue;
      if (a.isSome !== bOpt.isSome) return false;
      if (!a.isSome) return true;
      return runtimeValuesEqual(a.inner!, bOpt.inner!);
    }
    case 'Result': {
      const bRes = b as ResultRuntimeValue;
      if (a.isOk !== bRes.isOk) return false;
      return runtimeValuesEqual(a.value, bRes.value);
    }
    case 'List': {
      const bList = b as ListRuntimeValue;
      if (a.elements.length !== bList.elements.length) return false;
      return a.elements.every((el, idx) => runtimeValuesEqual(el, bList.elements[idx]));
    }
    case 'Tuple': {
      const bTup = b as TupleRuntimeValue;
      if (a.elements.length !== bTup.elements.length) return false;
      return a.elements.every((el, idx) => runtimeValuesEqual(el, bTup.elements[idx]));
    }
    case 'Map': {
      const bMap = b as MapRuntimeValue;
      if (a.entries.length !== bMap.entries.length) return false;
      return a.entries.every((aEntry) => {
        const bEntry = bMap.entries.find((e) => runtimeValuesEqual(e.key, aEntry.key));
        return bEntry !== undefined && runtimeValuesEqual(aEntry.value, bEntry.value);
      });
    }
    case 'Set': {
      const bSet = b as SetRuntimeValue;
      if (a.elements.length !== bSet.elements.length) return false;
      return a.elements.every((aElem) => bSet.elements.some((bElem) => runtimeValuesEqual(aElem, bElem)));
    }
    case 'Function':
      return a.name === (b as FunctionRuntimeValue).name;
    case 'Builtin':
      return a.name === (b as BuiltinRuntimeValue).name;
  }
}

// ─── Binding ──────────────────────────────────────────────────────────────────

/** A mutable binding cell. isMut controls whether assignment is permitted. */
export interface RuntimeBinding {
  value: RuntimeValue;
  readonly isMut: boolean;
  readonly name: string;
}

// ─── Runtime Environment ──────────────────────────────────────────────────────

/**
 * Explicit lexical execution environment for Seira programs.
 *
 * - Bindings follow lexical scope (parent lookup chain).
 * - Shadowing creates a new binding in the innermost scope.
 * - Immutable bindings reject reassignment.
 * - Multiple RuntimeEnvironment instances are conceptually independent.
 */
export class RuntimeEnvironment {
  private readonly bindings = new Map<string, RuntimeBinding>();
  public readonly parent?: RuntimeEnvironment;
  private readonly label?: string;

  constructor(parent?: RuntimeEnvironment, label?: string) {
    this.parent = parent;
    this.label = label;
  }

  /**
   * Defines a new binding in THIS scope.
   * Never mutates the parent scope, even if a name already exists there.
   */
  public define(name: string, value: RuntimeValue, isMut: boolean): void {
    this.bindings.set(name, { name, value, isMut });
  }

  /**
   * Looks up a binding by walking up the lexical scope chain.
   */
  public lookup(name: string): RuntimeBinding | undefined {
    const local = this.bindings.get(name);
    if (local !== undefined) return local;
    return this.parent?.lookup(name);
  }

  /**
   * Assigns a new value to an existing mutable binding.
   * Walks the scope chain to find the binding.
   * Returns false if the binding is not found or is immutable.
   */
  public assign(name: string, newValue: RuntimeValue): 'ok' | 'not_found' | 'immutable' {
    const local = this.bindings.get(name);
    if (local !== undefined) {
      if (!local.isMut) return 'immutable';
      this.bindings.set(name, { ...local, value: newValue });
      return 'ok';
    }
    if (this.parent !== undefined) {
      return this.parent.assign(name, newValue);
    }
    return 'not_found';
  }

  /**
   * Creates a child scope that lexically inherits from this scope.
   */
  public child(label?: string): RuntimeEnvironment {
    return new RuntimeEnvironment(this, label);
  }
}
