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
  Module: 'Module',
  Iterator: 'Iterator',
  Reader: 'Reader',
  Writer: 'Writer',
  Resource: 'Resource',
  NativeMethod: 'NativeMethod',
  Bytes: 'Bytes',
  Path: 'Path',
  File: 'File',
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

/** Runtime module value representing an imported module namespace. */
export interface ModuleRuntimeValue {
  readonly tag: 'Module';
  readonly name: string;
  readonly exports: Map<string, RuntimeValue>;
}

/** Runtime iterator value representing a lazy traversal computation. */
export interface IteratorRuntimeValue {
  readonly tag: 'Iterator';
  readonly name?: string;
  readonly next: () => OptionRuntimeValue;
}

/** Runtime reader value representing a readable stream/source. */
export interface ReaderRuntimeValue {
  readonly tag: 'Reader';
  readonly kind: 'memory' | 'custom';
  read(n?: number): OptionRuntimeValue;
  readAll(): string;
  isEof(): boolean;
  seek?(pos: number): void;
  length?(): number;
  position?(): number;
  reset?(): void;
  isEmpty?(): boolean;
}

/** Runtime writer value representing a writable stream/sink. */
export interface WriterRuntimeValue {
  readonly tag: 'Writer';
  readonly kind: 'memory' | 'custom';
  write(data: string): ResultRuntimeValue;
  getContent(): string;
  clear(): void;
  length(): number;
}

/** Runtime resource value with managed lifecycle. */
export interface ResourceRuntimeValue {
  readonly tag: 'Resource';
  readonly name: string;
  isClosed(): boolean;
  close(): ResultRuntimeValue;
  readonly data?: Record<string, RuntimeValue>;
}

/** Runtime native method value bound to a target instance. */
export interface NativeMethodRuntimeValue {
  readonly tag: 'NativeMethod';
  readonly target: RuntimeValue;
  readonly methodName: string;
}

/** Runtime raw byte buffer value. */
export interface BytesRuntimeValue {
  readonly tag: 'Bytes';
  readonly bytes: Uint8Array;
}

/** Runtime filesystem path abstraction. */
export interface PathRuntimeValue {
  readonly tag: 'Path';
  readonly value: string;
}

/** Runtime file resource supporting Reader, Writer, Seekable, Flushable capabilities. */
export interface FileRuntimeValue {
  readonly tag: 'File';
  readonly path: string;
  readonly mode: string;
  isClosed(): boolean;
  close(): ResultRuntimeValue;
  read(n?: number): ResultRuntimeValue;
  readAll(): ResultRuntimeValue;
  readBytes(n?: number): ResultRuntimeValue;
  write(data: string | Uint8Array): ResultRuntimeValue;
  seek(offset: number, whence?: number): ResultRuntimeValue;
  flush(): ResultRuntimeValue;
  position(): ResultRuntimeValue;
  rewind(): ResultRuntimeValue;
  length(): ResultRuntimeValue;
  isEmpty(): ResultRuntimeValue;
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
  | BuiltinRuntimeValue
  | ModuleRuntimeValue
  | IteratorRuntimeValue
  | ReaderRuntimeValue
  | WriterRuntimeValue
  | ResourceRuntimeValue
  | NativeMethodRuntimeValue
  | BytesRuntimeValue
  | PathRuntimeValue
  | FileRuntimeValue;

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
  const cp = value.codePointAt(0);
  return { tag: 'Char', value: cp !== undefined ? String.fromCodePoint(cp) : '\0' };
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

export function rtModule(name: string, exports: Map<string, RuntimeValue>): ModuleRuntimeValue {
  return { tag: 'Module', name, exports };
}

export function rtIterator(next: () => OptionRuntimeValue, name?: string): IteratorRuntimeValue {
  return { tag: 'Iterator', next, name };
}

export function rtNativeMethod(target: RuntimeValue, methodName: string): NativeMethodRuntimeValue {
  return { tag: 'NativeMethod', target, methodName };
}

export function createListIterator(list: ListRuntimeValue): IteratorRuntimeValue {
  let index = 0;
  return rtIterator(() => {
    if (index < list.elements.length) {
      return rtSome(list.elements[index++]);
    }
    return rtNone;
  }, 'ListIterator');
}

export function createMapIterator(map: MapRuntimeValue): IteratorRuntimeValue {
  let index = 0;
  return rtIterator(() => {
    if (index < map.entries.length) {
      const entry = map.entries[index++];
      return rtSome(rtTuple([entry.key, entry.value]));
    }
    return rtNone;
  }, 'MapIterator');
}

export function createSetIterator(set: SetRuntimeValue): IteratorRuntimeValue {
  let index = 0;
  return rtIterator(() => {
    if (index < set.elements.length) {
      return rtSome(set.elements[index++]);
    }
    return rtNone;
  }, 'SetIterator');
}

export function createTakeIterator(source: IteratorRuntimeValue, count: number): IteratorRuntimeValue {
  let taken = 0;
  return rtIterator(() => {
    if (taken >= count) return rtNone;
    const item = source.next();
    if (!item.isSome) return rtNone;
    taken++;
    return item;
  }, 'TakeIterator');
}

export function createSkipIterator(source: IteratorRuntimeValue, count: number): IteratorRuntimeValue {
  let skipped = false;
  return rtIterator(() => {
    if (!skipped) {
      for (let i = 0; i < count; i++) {
        const discard = source.next();
        if (!discard.isSome) {
          skipped = true;
          return rtNone;
        }
      }
      skipped = true;
    }
    return source.next();
  }, 'SkipIterator');
}

export function createFilterIterator(
  source: IteratorRuntimeValue,
  predicate: (val: RuntimeValue) => boolean
): IteratorRuntimeValue {
  return rtIterator(() => {
    while (true) {
      const item = source.next();
      if (!item.isSome) return rtNone;
      if (predicate(item.inner!)) {
        return item;
      }
    }
  }, 'FilterIterator');
}

export function createMapIteratorCombinator(
  source: IteratorRuntimeValue,
  transform: (val: RuntimeValue) => RuntimeValue
): IteratorRuntimeValue {
  return rtIterator(() => {
    const item = source.next();
    if (!item.isSome) return rtNone;
    return rtSome(transform(item.inner!));
  }, 'MapIterator');
}

export function createEnumerateIterator(source: IteratorRuntimeValue): IteratorRuntimeValue {
  let index = 0n;
  return rtIterator(() => {
    const item = source.next();
    if (!item.isSome) return rtNone;
    const tuple = rtTuple([rtInt(index++), item.inner!]);
    return rtSome(tuple);
  }, 'EnumerateIterator');
}

export function createZipIterator(
  a: IteratorRuntimeValue,
  b: IteratorRuntimeValue
): IteratorRuntimeValue {
  return rtIterator(() => {
    const itemA = a.next();
    if (!itemA.isSome) return rtNone;
    const itemB = b.next();
    if (!itemB.isSome) return rtNone;
    return rtSome(rtTuple([itemA.inner!, itemB.inner!]));
  }, 'ZipIterator');
}

export function collectIterator(iter: IteratorRuntimeValue): ListRuntimeValue {
  const elements: RuntimeValue[] = [];
  while (true) {
    const item = iter.next();
    if (!item.isSome) break;
    elements.push(item.inner!);
  }
  return rtList(elements);
}

export function foldIterator(
  iter: IteratorRuntimeValue,
  initial: RuntimeValue,
  accumulator: (acc: RuntimeValue, item: RuntimeValue) => RuntimeValue
): RuntimeValue {
  let current = initial;
  while (true) {
    const item = iter.next();
    if (!item.isSome) break;
    current = accumulator(current, item.inner!);
  }
  return current;
}

export function reduceIterator(
  iter: IteratorRuntimeValue,
  accumulator: (acc: RuntimeValue, item: RuntimeValue) => RuntimeValue
): OptionRuntimeValue {
  const first = iter.next();
  if (!first.isSome) return rtNone;
  let current = first.inner!;
  while (true) {
    const item = iter.next();
    if (!item.isSome) break;
    current = accumulator(current, item.inner!);
  }
  return rtSome(current);
}

// ─── Memory I/O Constructors ──────────────────────────────────────────────────

export function createMemoryReader(content: string): ReaderRuntimeValue {
  // Convert to Unicode scalar array so that positional operations (read, seek, length)
  // operate on code points rather than UTF-16 code units. This ensures multi-byte characters
  // (e.g. emoji, CJK supplementary) are never split across reads.
  const scalars = [...content];
  let pos = 0;
  return {
    tag: 'Reader',
    kind: 'memory',
    read(n?: number): OptionRuntimeValue {
      if (pos >= scalars.length) return rtNone;
      const count = n !== undefined && n >= 0 ? n : 1;
      const slice = scalars.slice(pos, pos + count).join('');
      pos += count;
      return rtSome(rtString(slice));
    },
    readAll(): string {
      if (pos >= scalars.length) return '';
      const result = scalars.slice(pos).join('');
      pos = scalars.length;
      return result;
    },
    isEof(): boolean {
      return pos >= scalars.length;
    },
    seek(newPos: number): void {
      pos = Math.max(0, Math.min(newPos, scalars.length));
    },
    length(): number {
      return scalars.length;
    },
    position(): number {
      return pos;
    },
    reset(): void {
      pos = 0;
    },
    isEmpty(): boolean {
      return pos >= scalars.length;
    },
  };
}

export function createMemoryWriter(): WriterRuntimeValue {
  let buffer = '';
  return {
    tag: 'Writer',
    kind: 'memory',
    write(data: string): ResultRuntimeValue {
      buffer += data;
      return rtOk(rtInt(BigInt(data.length)));
    },
    getContent(): string {
      return buffer;
    },
    clear(): void {
      buffer = '';
    },
    length(): number {
      return buffer.length;
    },
  };
}

export interface MemoryStreamRuntimeValue {
  readonly tag: 'Reader';
  readonly kind: 'memory';
  read(n?: number): OptionRuntimeValue;
  readAll(): string;
  isEof(): boolean;
  seek(newPos: number): void;
  write(data: string): ResultRuntimeValue;
  getContent(): string;
  clear(): void;
  length(): number;
  position(): number;
  reset(): void;
  isEmpty(): boolean;
}

export function createMemoryStream(initial: string = ''): MemoryStreamRuntimeValue {
  // Convert to Unicode scalar array so positional reads operate on code points.
  let scalars: string[] = [...initial];
  let readPos = 0;
  return {
    tag: 'Reader',
    kind: 'memory',
    read(n?: number): OptionRuntimeValue {
      if (readPos >= scalars.length) return rtNone;
      const count = n !== undefined && n >= 0 ? n : 1;
      const slice = scalars.slice(readPos, readPos + count).join('');
      readPos += count;
      return rtSome(rtString(slice));
    },
    readAll(): string {
      if (readPos >= scalars.length) return '';
      const result = scalars.slice(readPos).join('');
      readPos = scalars.length;
      return result;
    },
    isEof(): boolean {
      return readPos >= scalars.length;
    },
    seek(newPos: number): void {
      readPos = Math.max(0, Math.min(newPos, scalars.length));
    },
    write(data: string): ResultRuntimeValue {
      const dataScalars = [...data];
      scalars.push(...dataScalars);
      return rtOk(rtInt(BigInt(dataScalars.length)));
    },
    getContent(): string {
      return scalars.join('');
    },
    clear(): void {
      scalars = [];
      readPos = 0;
    },
    length(): number {
      return scalars.length;
    },
    position(): number {
      return readPos;
    },
    reset(): void {
      readPos = 0;
    },
    isEmpty(): boolean {
      return readPos >= scalars.length;
    },
  };
}

// ─── Resource Constructor ─────────────────────────────────────────────────────

export function createResource(
  name: string,
  onRelease?: () => ResultRuntimeValue,
  data?: Record<string, RuntimeValue>
): ResourceRuntimeValue {
  let closed = false;
  return {
    tag: 'Resource',
    name,
    data,
    isClosed: () => closed,
    close: () => {
      if (closed) return rtOk(UNIT_VALUE);
      closed = true;
      if (onRelease) return onRelease();
      return rtOk(UNIT_VALUE);
    },
  };
}

// ─── Path & File Constructors ──────────────────────────────────────────────────

export function normalizePath(p: string): string {
  let s = p.replace(/\\/g, '/');
  const isAbs = s.startsWith('/');
  const rawParts = s.split('/');
  const stack: string[] = [];
  for (const part of rawParts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (stack.length > 0 && stack[stack.length - 1] !== '..') {
        stack.pop();
      } else if (!isAbs) {
        stack.push('..');
      }
    } else {
      stack.push(part);
    }
  }
  let res = stack.join('/');
  if (isAbs) res = '/' + res;
  if (res.length === 0) return isAbs ? '/' : '.';
  return res;
}

export function rtPath(value: string): PathRuntimeValue {
  return {
    tag: 'Path',
    value: normalizePath(value),
  };
}

export function rtBytes(bytes: Uint8Array | number[]): BytesRuntimeValue {
  return {
    tag: 'Bytes',
    bytes: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
  };
}

export const VIRTUAL_FILES: Map<string, Uint8Array> = new Map();

export function resetVirtualFiles(): void {
  VIRTUAL_FILES.clear();
}

export function createFile(
  pathStr: string,
  mode: string = 'r',
  initialContent?: string | Uint8Array
): FileRuntimeValue {
  const normPath = normalizePath(pathStr);
  const normMode = mode.toLowerCase();

  if (initialContent !== undefined) {
    const b = typeof initialContent === 'string'
      ? new TextEncoder().encode(initialContent)
      : initialContent;
    VIRTUAL_FILES.set(normPath, b);
  }

  let closed = false;
  let pos = 0;

  if (normMode === 'w') {
    VIRTUAL_FILES.set(normPath, new Uint8Array(0));
    pos = 0;
  } else if (normMode === 'a') {
    const existing = VIRTUAL_FILES.get(normPath) ?? new Uint8Array(0);
    pos = existing.length;
  } else if (normMode === 'r' || normMode === 'r+') {
    pos = 0;
  }

  return {
    tag: 'File',
    path: normPath,
    mode: normMode,
    isClosed(): boolean {
      return closed;
    },
    close(): ResultRuntimeValue {
      closed = true;
      return rtOk(UNIT_VALUE);
    },
    read(n?: number): ResultRuntimeValue {
      if (closed) return rtErr(rtString("AlreadyClosed: File is already closed"));
      if (normMode === 'w') return rtErr(rtString("PermissionDenied: File is opened in write-only mode"));
      const data = VIRTUAL_FILES.get(normPath);
      if (!data || pos >= data.length) {
        return rtOk(rtNone);
      }
      const count = n !== undefined && n >= 0 ? n : (data.length - pos);
      const slice = data.slice(pos, pos + count);
      pos += slice.length;
      const dec = new TextDecoder('utf-8', { fatal: false }).decode(slice);
      return rtOk(rtSome(rtString(dec)));
    },
    readAll(): ResultRuntimeValue {
      if (closed) return rtErr(rtString("AlreadyClosed: File is already closed"));
      if (normMode === 'w') return rtErr(rtString("PermissionDenied: File is opened in write-only mode"));
      const data = VIRTUAL_FILES.get(normPath);
      if (!data || pos >= data.length) {
        return rtOk(rtString(''));
      }
      const slice = data.slice(pos);
      pos = data.length;
      const dec = new TextDecoder('utf-8', { fatal: false }).decode(slice);
      return rtOk(rtString(dec));
    },
    readBytes(n?: number): ResultRuntimeValue {
      if (closed) return rtErr(rtString("AlreadyClosed: File is already closed"));
      if (normMode === 'w') return rtErr(rtString("PermissionDenied: File is opened in write-only mode"));
      const data = VIRTUAL_FILES.get(normPath);
      if (!data || pos >= data.length) {
        return rtOk(rtNone);
      }
      const count = n !== undefined && n >= 0 ? n : (data.length - pos);
      const slice = data.slice(pos, pos + count);
      pos += slice.length;
      return rtOk(rtSome(rtBytes(slice)));
    },
    write(data: string | Uint8Array): ResultRuntimeValue {
      if (closed) return rtErr(rtString("AlreadyClosed: File is already closed"));
      if (normMode === 'r') return rtErr(rtString("PermissionDenied: File is opened in read-only mode"));
      const bytesToWrite = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      const current = VIRTUAL_FILES.get(normPath) ?? new Uint8Array(0);

      let updated: Uint8Array;
      if (normMode === 'a') {
        updated = new Uint8Array(current.length + bytesToWrite.length);
        updated.set(current, 0);
        updated.set(bytesToWrite, current.length);
        pos = updated.length;
      } else {
        const requiredLen = Math.max(current.length, pos + bytesToWrite.length);
        updated = new Uint8Array(requiredLen);
        updated.set(current, 0);
        updated.set(bytesToWrite, pos);
        pos += bytesToWrite.length;
      }
      VIRTUAL_FILES.set(normPath, updated);
      return rtOk(rtInt(BigInt(bytesToWrite.length)));
    },
    seek(offset: number, whence: number = 0): ResultRuntimeValue {
      if (closed) return rtErr(rtString("AlreadyClosed: File is already closed"));
      const current = VIRTUAL_FILES.get(normPath) ?? new Uint8Array(0);
      let targetPos: number;
      if (whence === 0) { // SEEK_SET
        targetPos = offset;
      } else if (whence === 1) { // SEEK_CUR
        targetPos = pos + offset;
      } else if (whence === 2) { // SEEK_END
        targetPos = current.length + offset;
      } else {
        return rtErr(rtString(`InvalidSeek: Invalid whence parameter '${whence}'`));
      }
      if (targetPos < 0) {
        return rtErr(rtString("InvalidSeek: Negative seek position"));
      }
      pos = targetPos;
      return rtOk(rtInt(BigInt(pos)));
    },
    position(): ResultRuntimeValue {
      if (closed) return rtErr(rtString("AlreadyClosed: File is already closed"));
      return rtOk(rtInt(BigInt(pos)));
    },
    rewind(): ResultRuntimeValue {
      if (closed) return rtErr(rtString("AlreadyClosed: File is already closed"));
      pos = 0;
      return rtOk(UNIT_VALUE);
    },
    flush(): ResultRuntimeValue {
      if (closed) return rtErr(rtString("AlreadyClosed: File is already closed"));
      return rtOk(UNIT_VALUE);
    },
    length(): ResultRuntimeValue {
      if (closed) return rtErr(rtString("AlreadyClosed: File is already closed"));
      const current = VIRTUAL_FILES.get(normPath);
      return rtOk(rtInt(BigInt(current ? current.length : 0)));
    },
    isEmpty(): ResultRuntimeValue {
      if (closed) return rtErr(rtString("AlreadyClosed: File is already closed"));
      const current = VIRTUAL_FILES.get(normPath);
      return rtOk(rtBool(!current || current.length === 0));
    },
  };
}

export function openFile(pathStr: string, mode: string = 'r'): ResultRuntimeValue {
  const normPath = normalizePath(pathStr);
  const normMode = mode.toLowerCase();
  if (normMode === 'r' || normMode === 'r+') {
    if (!VIRTUAL_FILES.has(normPath)) {
      return rtErr(rtString(`NotFound: File '${pathStr}' does not exist`));
    }
  }
  return rtOk(createFile(normPath, normMode));
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
    case 'Module':
      return `<module ${v.name}>`;
    case 'Iterator':
      return v.name ? `<iterator ${v.name}>` : '<iterator>';
    case 'Reader':
      return `<reader ${v.kind}>`;
    case 'Writer':
      return `<writer ${v.kind}>`;
    case 'Resource':
      return `<resource ${v.name}>`;
    case 'NativeMethod':
      return `<method ${v.methodName}>`;
    case 'Bytes':
      return `Bytes([${Array.from(v.bytes).map((b) => `${b}b`).join(', ')}])`;
    case 'Path':
      return `Path("${v.value}")`;
    case 'File':
      return `<file ${v.path}>`;
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
    case 'Module':
      return a.name === (b as ModuleRuntimeValue).name;
    case 'Bytes': {
      const bBytes = b as BytesRuntimeValue;
      if (a.bytes.length !== bBytes.bytes.length) return false;
      for (let i = 0; i < a.bytes.length; i++) {
        if (a.bytes[i] !== bBytes.bytes[i]) return false;
      }
      return true;
    }
    case 'Path':
      return a.value === (b as PathRuntimeValue).value;
    case 'File':
      return a === b;
    case 'Iterator':
    case 'Reader':
    case 'Writer':
    case 'Resource':
    case 'NativeMethod':
      return a === b;
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
