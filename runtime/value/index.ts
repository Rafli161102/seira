/**
 * Seira Runtime Value Representation (Architectural Foundation)
 *
 * Implements the core axiom:
 * «Everything is a Value.»
 *
 * Principles:
 * - Values are immutable by default.
 * - Primitive values are represented efficiently (tagged / immediate).
 * - Heap allocations use deterministic scope lifecycles.
 */

export const ValueTag = {
  Unit: 0,
  Bool: 1,
  Int: 2,
  Float: 3,
  String: 4,
  Struct: 5,
  Option: 6,
  Result: 7,
  Function: 8,
} as const;

export type ValueTag = (typeof ValueTag)[keyof typeof ValueTag];

export type SeiraValue =
  | { tag: typeof ValueTag.Unit }
  | { tag: typeof ValueTag.Bool; value: boolean }
  | { tag: typeof ValueTag.Int; value: number | bigint }
  | { tag: typeof ValueTag.Float; value: number }
  | { tag: typeof ValueTag.String; value: string }
  | { tag: typeof ValueTag.Option; isSome: boolean; value?: SeiraValue }
  | { tag: typeof ValueTag.Result; isOk: boolean; value: SeiraValue }
  | { tag: typeof ValueTag.Struct; typeName: string; fields: Record<string, SeiraValue> }
  | { tag: typeof ValueTag.Function; name: string; isEffectful: boolean };

export const UnitValue: SeiraValue = { tag: ValueTag.Unit };

export function makeInt(n: number | bigint): SeiraValue {
  return { tag: ValueTag.Int, value: n };
}

export function makeFloat(n: number): SeiraValue {
  return { tag: ValueTag.Float, value: n };
}

export function makeBool(b: boolean): SeiraValue {
  return { tag: ValueTag.Bool, value: b };
}

export function makeString(s: string): SeiraValue {
  return { tag: ValueTag.String, value: s };
}

export function makeSome(val: SeiraValue): SeiraValue {
  return { tag: ValueTag.Option, isSome: true, value: val };
}

export const NoneValue: SeiraValue = { tag: ValueTag.Option, isSome: false };

export function makeOk(val: SeiraValue): SeiraValue {
  return { tag: ValueTag.Result, isOk: true, value: val };
}

export function makeErr(err: SeiraValue): SeiraValue {
  return { tag: ValueTag.Result, isOk: false, value: err };
}
