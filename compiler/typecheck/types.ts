/**
 * Seira Type System Foundation
 *
 * Implements deterministic semantic type representation and structural type identity.
 * Conforms strictly to Seira Type System v0.1 & Value Model v0.1:
 * - Primitive types: Int, UInt, Float, Bool, Char, String, Byte, Unit
 * - Compound types: Option<T>, Result<T, E>, List<T>, Tuple, Function ((T1, T2) -> R)
 * - Extensible: GenericParam, TypeAlias, Union, Custom structs/enums
 * - No reliance on JavaScript/TypeScript object identity (===) for type equality.
 */

export type PrimitiveTypeName =
  | 'Int'
  | 'UInt'
  | 'Float'
  | 'Bool'
  | 'Char'
  | 'String'
  | 'Byte'
  | 'Unit'
  | 'Unknown';

export interface PrimitiveType {
  readonly kind: 'Primitive';
  readonly name: PrimitiveTypeName;
}

export interface OptionType {
  readonly kind: 'Option';
  readonly inner: Type;
}

export interface ResultType {
  readonly kind: 'Result';
  readonly ok: Type;
  readonly err: Type;
}

export interface ListType {
  readonly kind: 'List';
  readonly element: Type;
}

export interface TupleType {
  readonly kind: 'Tuple';
  readonly elements: ReadonlyArray<Type>;
}

export interface FunctionType {
  readonly kind: 'Function';
  readonly params: ReadonlyArray<Type>;
  readonly returnType: Type;
  readonly isEffectful: boolean;
}

export interface GenericParamType {
  readonly kind: 'GenericParam';
  readonly name: string;
}

export interface TypeAliasType {
  readonly kind: 'TypeAlias';
  readonly name: string;
  readonly target: Type;
}

export interface UnionType {
  readonly kind: 'Union';
  readonly types: ReadonlyArray<Type>;
}

export interface CustomType {
  readonly kind: 'Custom';
  readonly name: string;
  readonly typeArguments?: ReadonlyArray<Type>;
}

export interface MapType {
  readonly kind: 'Map';
  readonly key: Type;
  readonly value: Type;
}

export interface SetType {
  readonly kind: 'Set';
  readonly element: Type;
}

export type Type =
  | PrimitiveType
  | OptionType
  | ResultType
  | ListType
  | TupleType
  | MapType
  | SetType
  | FunctionType
  | GenericParamType
  | TypeAliasType
  | UnionType
  | CustomType;

// Singleton primitive constants
export const INT_TYPE: PrimitiveType = { kind: 'Primitive', name: 'Int' };
export const UINT_TYPE: PrimitiveType = { kind: 'Primitive', name: 'UInt' };
export const FLOAT_TYPE: PrimitiveType = { kind: 'Primitive', name: 'Float' };
export const BOOL_TYPE: PrimitiveType = { kind: 'Primitive', name: 'Bool' };
export const CHAR_TYPE: PrimitiveType = { kind: 'Primitive', name: 'Char' };
export const STRING_TYPE: PrimitiveType = { kind: 'Primitive', name: 'String' };
export const BYTE_TYPE: PrimitiveType = { kind: 'Primitive', name: 'Byte' };
export const UNIT_TYPE: PrimitiveType = { kind: 'Primitive', name: 'Unit' };
export const UNKNOWN_TYPE: PrimitiveType = { kind: 'Primitive', name: 'Unknown' };

/**
 * Creates an Option<T> type.
 */
export function createOptionType(inner: Type): OptionType {
  return { kind: 'Option', inner };
}

/**
 * Creates a Result<T, E> type.
 */
export function createResultType(ok: Type, err: Type): ResultType {
  return { kind: 'Result', ok, err };
}

/**
 * Creates a List<T> type.
 */
export function createListType(element: Type): ListType {
  return { kind: 'List', element };
}

/**
 * Creates a Tuple type.
 */
export function createTupleType(elements: ReadonlyArray<Type>): TupleType {
  return { kind: 'Tuple', elements };
}

/**
 * Creates a Map<K, V> type.
 */
export function createMapType(key: Type, value: Type): MapType {
  return { kind: 'Map', key, value };
}

/**
 * Creates a Set<T> type.
 */
export function createSetType(element: Type): SetType {
  return { kind: 'Set', element };
}

/**
 * Creates a Function type: (P1, P2, ...) -> R
 */
export function createFunctionType(
  params: ReadonlyArray<Type>,
  returnType: Type,
  isEffectful = false
): FunctionType {
  return {
    kind: 'Function',
    params,
    returnType,
    isEffectful,
  };
}

/**
 * Returns a human-readable representation of a Type.
 */
export function formatType(type: Type): string {
  switch (type.kind) {
    case 'Primitive':
      return type.name;
    case 'Option':
      return `Option<${formatType(type.inner)}>`;
    case 'Result':
      return `Result<${formatType(type.ok)}, ${formatType(type.err)}>`;
    case 'List':
      return `List<${formatType(type.element)}>`;
    case 'Tuple':
      return `(${type.elements.map(formatType).join(', ')})`;
    case 'Map':
      return `Map<${formatType(type.key)}, ${formatType(type.value)}>`;
    case 'Set':
      return `Set<${formatType(type.element)}>`;
    case 'Function': {
      const effectMarker = type.isEffectful ? '!' : '';
      return `(${type.params.map(formatType).join(', ')})${effectMarker} -> ${formatType(type.returnType)}`;
    }
    case 'GenericParam':
      return type.name;
    case 'TypeAlias':
      return type.name;
    case 'Union':
      return type.types.map(formatType).join(' | ');
    case 'Custom': {
      if (type.typeArguments && type.typeArguments.length > 0) {
        return `${type.name}<${type.typeArguments.map(formatType).join(', ')}>`;
      }
      return type.name;
    }
  }
}

/**
 * Determines whether two types are structurally identical.
 * Does NOT use JavaScript/TypeScript object reference equality.
 */
export function areTypesEqual(a: Type, b: Type): boolean {
  if (a.kind === 'Primitive' && a.name === 'Unknown') return true;
  if (b.kind === 'Primitive' && b.name === 'Unknown') return true;

  if (a.kind === 'TypeAlias') return areTypesEqual(a.target, b);
  if (b.kind === 'TypeAlias') return areTypesEqual(a, b.target);

  if (a.kind !== b.kind) return false;

  switch (a.kind) {
    case 'Primitive':
      return a.name === (b as PrimitiveType).name;
    case 'Option':
      return areTypesEqual(a.inner, (b as OptionType).inner);
    case 'Result': {
      const bRes = b as ResultType;
      return areTypesEqual(a.ok, bRes.ok) && areTypesEqual(a.err, bRes.err);
    }
    case 'List':
      return areTypesEqual(a.element, (b as ListType).element);
    case 'Tuple': {
      const bTup = b as TupleType;
      if (a.elements.length !== bTup.elements.length) return false;
      return a.elements.every((elem, idx) => areTypesEqual(elem, bTup.elements[idx]));
    }
    case 'Map': {
      const bMap = b as MapType;
      return areTypesEqual(a.key, bMap.key) && areTypesEqual(a.value, bMap.value);
    }
    case 'Set':
      return areTypesEqual(a.element, (b as SetType).element);
    case 'Function': {
      const bFn = b as FunctionType;
      if (a.params.length !== bFn.params.length) return false;
      if (a.isEffectful !== bFn.isEffectful) return false;
      if (!areTypesEqual(a.returnType, bFn.returnType)) return false;
      return a.params.every((p, idx) => areTypesEqual(p, bFn.params[idx]));
    }
    case 'GenericParam':
      return a.name === (b as GenericParamType).name;
    case 'Custom': {
      const bCust = b as CustomType;
      if (a.name !== bCust.name) return false;
      const aArgs = a.typeArguments ?? [];
      const bArgs = bCust.typeArguments ?? [];
      if (aArgs.length !== bArgs.length) return false;
      return aArgs.every((arg, idx) => areTypesEqual(arg, bArgs[idx]));
    }
    case 'Union': {
      const bUnion = b as UnionType;
      if (a.types.length !== bUnion.types.length) return false;
      return a.types.every((t, idx) => areTypesEqual(t, bUnion.types[idx]));
    }
  }
}

/**
 * Validates whether a source type is assignable to a target type.
 * Seira enforces strict static typing with ZERO implicit coercions.
 */
export function isTypeAssignable(target: Type, source: Type): boolean {
  if (target.kind === 'Primitive' && target.name === 'Unknown') return true;
  if (source.kind === 'Primitive' && source.name === 'Unknown') return true;

  if (target.kind === 'TypeAlias') return isTypeAssignable(target.target, source);
  if (source.kind === 'TypeAlias') return isTypeAssignable(target, source.target);

  // Union targets accept any of their constituent variant types
  if (target.kind === 'Union') {
    return target.types.some((variant) => isTypeAssignable(variant, source));
  }

  // Union sources require every variant to be assignable to the target
  if (source.kind === 'Union') {
    return source.types.every((variant) => isTypeAssignable(target, variant));
  }

  return areTypesEqual(target, source);
}

export function isPrimitive(t: Type, name?: PrimitiveTypeName): boolean {
  if (t.kind !== 'Primitive') return false;
  return name === undefined || t.name === name;
}

export function isInt(t: Type): boolean {
  return t.kind === 'Primitive' && t.name === 'Int';
}

export function isUInt(t: Type): boolean {
  return t.kind === 'Primitive' && t.name === 'UInt';
}

export function isFloat(t: Type): boolean {
  return t.kind === 'Primitive' && t.name === 'Float';
}

export function isBool(t: Type): boolean {
  return t.kind === 'Primitive' && t.name === 'Bool';
}

export function isString(t: Type): boolean {
  return t.kind === 'Primitive' && t.name === 'String';
}

export function isNumeric(t: Type): boolean {
  if (t.kind !== 'Primitive') return false;
  return t.name === 'Int' || t.name === 'UInt' || t.name === 'Float';
}

export function isUnknown(t: Type): boolean {
  return t.kind === 'Primitive' && t.name === 'Unknown';
}

