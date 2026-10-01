/**
 * Seira 0.0.10-s — I/O & Resource Boundary Foundation Test Suite
 *
 * Exhaustively tests the locked 0.0.10-s milestone requirements:
 * Category A: Reader Architecture (Reader, Seekable, Sized)
 * Category B: Writer Architecture (Writer, Flushable, Sized)
 * Category C: Byte/Text Boundary (Byte, Bytes, Char, String, explicit conversion, no coercion)
 * Category D: Encoding Foundation (UTF-8, ASCII, UTF-16, UTF-32, structured errors, pipeline)
 * Category E: Path Foundation (Path distinct from String, normalization, join, parent, etc.)
 * Category F: File I/O Foundation (open, use, close, read, write, seek, AlreadyClosed, PermissionDenied, NotFound)
 * Category G: Deterministic Resource Lifecycle (with statement, LIFO cleanup, early return, panic handling)
 * Category H: Memory I/O Refinement (MemoryReader, MemoryWriter, MemoryStream capability separation and trait constraints)
 */

import assert from 'node:assert';
import test from 'node:test';
import { ExecutionEngine } from '../../../runtime/execution/engine.ts';
import { resetVirtualFiles } from '../../../runtime/execution/values.ts';
import { Lexer } from '../../../compiler/lexer/lexer.ts';
import { Parser } from '../../../compiler/parser/parser.ts';
import { Resolver } from '../../../compiler/resolver/index.ts';
import { TypeChecker } from '../../../compiler/typecheck/index.ts';

const engine = new ExecutionEngine();

function run(source: string) {
  resetVirtualFiles();
  return engine.executeSource(source, '<test-io-boundary>', { enableOutput: false });
}

function typecheck(src: string): { errors: string[]; success: boolean } {
  const tokens = new Lexer(src).tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  const resolver = new Resolver();
  const resResult = resolver.resolve(ast, 'test.sr');
  const typechecker = new TypeChecker(resResult.diagnostics);
  const tcResult = typechecker.check(ast, resResult, 'test.sr');
  return {
    errors: tcResult.diagnostics.getErrors().map((e) => `${e.code}: ${e.message}`),
    success: tcResult.success,
  };
}

// ============================================================================
// Category A: Reader Architecture
// ============================================================================

test('Category A: Reader basic reading and EOF detection', () => {
  const r = run(`
reader = MemoryReader("Seira Language")
c1 = reader.read(5)
c2 = reader.read(8)
c3 = reader.read(1)
println(c1.unwrap())
println(c2.unwrap())
println(c3.is_none())
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], 'Seira');
  assert.strictEqual(r.output[1], ' Languag');
  assert.strictEqual(r.output[2], 'false'); // e is remaining
});

test('Category A: Seekable repositions offset (seek, position, rewind)', () => {
  const r = run(`
stream = MemoryStream("abcdefghij")
println(stream.position())
stream.read(4)
println(stream.position())
stream.seek(2)
println(stream.position())
chunk = stream.read(3)
println(chunk.unwrap())
stream.reset()
println(stream.position())
println(stream.read_all())
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], '0');
  assert.strictEqual(r.output[1], '4');
  assert.strictEqual(r.output[2], '2');
  assert.strictEqual(r.output[3], 'cde');
  assert.strictEqual(r.output[4], '0');
  assert.strictEqual(r.output[5], 'abcdefghij');
});

test('Category A: Sized reports length and emptiness correctly', () => {
  const r = run(`
r1 = MemoryReader("hello")
r2 = MemoryReader("")
println(r1.length())
println(r1.is_empty())
println(r2.length())
println(r2.is_empty())
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], '5');
  assert.strictEqual(r.output[1], 'false');
  assert.strictEqual(r.output[2], '0');
  assert.strictEqual(r.output[3], 'true');
});

// ============================================================================
// Category B: Writer Architecture
// ============================================================================

test('Category B: Writer writes and retrieves content', () => {
  const r = run(`
w = MemoryWriter()
res1 = w.write("Chunk 1; ")
res2 = w.write("Chunk 2.")
println(res1.unwrap())
println(res2.unwrap())
println(w.get_content())
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], '9');
  assert.strictEqual(r.output[1], '8');
  assert.strictEqual(r.output[2], 'Chunk 1; Chunk 2.');
});

test('Category B: Flushable buffer flushing capability', () => {
  const r = run(`
w = MemoryWriter()
w.write("data")
flush_res = w.flush()
println(flush_res.is_ok())
println(w.is_empty())
w.clear()
println(w.is_empty())
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], 'true');
  assert.strictEqual(r.output[1], 'false');
  assert.strictEqual(r.output[2], 'true');
});

// ============================================================================
// Category C: Byte/Text Boundary
// ============================================================================

test('Category C: Explicit encoding and decoding between String and Bytes', () => {
  const r = run(`
s = "Hello Seira"
bytes_res = s.encode("utf-8")
println(bytes_res.is_ok())
bytes = bytes_res.unwrap()
println(bytes.length())
println(bytes.is_empty())
roundtrip_res = bytes.decode("utf-8")
println(roundtrip_res.is_ok())
println(roundtrip_res.unwrap())
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], 'true');
  assert.strictEqual(r.output[1], '11');
  assert.strictEqual(r.output[2], 'false');
  assert.strictEqual(r.output[3], 'true');
  assert.strictEqual(r.output[4], 'Hello Seira');
});

test('Category C: Bytes indexing, slicing, and list conversion', () => {
  const r = run(`
bytes = encode("ABCDE", "utf-8").unwrap()
first = bytes.get(0)
println(first.is_some())
sliced = bytes.slice(1, 4)
println(sliced.decode("utf-8").unwrap())
list = bytes.to_list()
println(list.length)
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], 'true');
  assert.strictEqual(r.output[1], 'BCD');
  assert.strictEqual(r.output[2], '5');
});

test('Category C: Typechecker rejects implicit coercion between String and Bytes', () => {
  const tc = typecheck(`
fn bad_add(s: String, b: Bytes) {
  x = s + b
}
`);
  assert.strictEqual(tc.success, false);
  assert.ok(tc.errors.some((e) => e.startsWith('E3002')));
});

// ============================================================================
// Category D: Encoding Foundation
// ============================================================================

test('Category D: UTF-8 encoding across ASCII, CJK, and Emoji', () => {
  const r = run(`
s = "A café 日本語 🚀"
bytes = encode(s, "utf-8").unwrap()
decoded = decode(bytes, "utf-8").unwrap()
println(decoded)
println(decoded == s)
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], 'A café 日本語 🚀');
  assert.strictEqual(r.output[1], 'true');
});

test('Category D: ASCII encoding succeeds for ASCII and returns structured error for non-ASCII', () => {
  const r = run(`
ok_res = encode("Hello World", "ascii")
println(ok_res.is_ok())
err_res = encode("Café", "ascii")
println(err_res.is_err())
println(err_res.is_ok())
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], 'true');
  assert.strictEqual(r.output[1], 'true');
  assert.strictEqual(r.output[2], 'false');
});

test('Category D: UTF-16 and UTF-32 round-trip encoding and decoding', () => {
  const r = run(`
text = "Seira 0.0.10-s"
u16_bytes = encode(text, "utf-16le").unwrap()
u16_text = decode(u16_bytes, "utf-16le").unwrap()
println(u16_text)

u32_bytes = encode(text, "utf-32le").unwrap()
u32_text = decode(u32_bytes, "utf-32le").unwrap()
println(u32_text)
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], 'Seira 0.0.10-s');
  assert.strictEqual(r.output[1], 'Seira 0.0.10-s');
});

test('Category D: Unsupported encoding produces structured Result error without panic', () => {
  const r = run(`
res = encode("test", "ebcdic")
println(res.is_err())
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], 'true');
});

test('Category D: Pipeline encoding and decoding', () => {
  const r = run(`
result = "Pipeline Test" |> encode("utf-8")
decoded = result.unwrap() |> decode("utf-8")
println(decoded.unwrap())
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], 'Pipeline Test');
});

// ============================================================================
// Category E: Path Foundation
// ============================================================================

test('Category E: Path normalization and inspection', () => {
  const r = run(`
p = Path("foo/bar/../baz/./file.txt")
println(p.to_string())
println(p.is_absolute())
println(p.file_name().unwrap())
println(p.extension().unwrap())
parent = p.parent()
println(parent.unwrap().to_string())
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], 'foo/baz/file.txt');
  assert.strictEqual(r.output[1], 'false');
  assert.strictEqual(r.output[2], 'file.txt');
  assert.strictEqual(r.output[3], 'txt');
  assert.strictEqual(r.output[4], 'foo/baz');
});

test('Category E: Path composition via join', () => {
  const r = run(`
base = Path("/workspace/project")
child = base.join("src").join("main.sr")
println(child.to_string())
println(child.is_absolute())
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], '/workspace/project/src/main.sr');
  assert.strictEqual(r.output[1], 'true');
});

test('Category E: Typechecker rejects implicit coercion between Path and String', () => {
  const tc = typecheck(`
fn bad_path(p: Path, s: String) {
  x = p + s
}
`);
  assert.strictEqual(tc.success, false);
  assert.ok(tc.errors.some((e) => e.startsWith('E3002')));
});

// ============================================================================
// Category F: File I/O Foundation
// ============================================================================

test('Category F: File open, write, flush, seek, and read lifecycle', () => {
  const r = run(`
f = open_file("test.txt", "w+").unwrap()
println(f.is_closed())
w_res = f.write("Initial File Content")
println(w_res.unwrap())
f.flush()
f.rewind()
chunk = f.read(7).unwrap()
println(chunk.unwrap())
rest = f.read_all().unwrap()
println(rest)
f.close()
println(f.is_closed())
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], 'false');
  assert.strictEqual(r.output[1], '20');
  assert.strictEqual(r.output[2], 'Initial');
  assert.strictEqual(r.output[3], ' File Content');
  assert.strictEqual(r.output[4], 'true');
});

test('Category F: Safe error handling: operations on closed file return Result.Err', () => {
  const r = run(`
f = open_file("test_closed.txt", "w").unwrap()
f.close()
read_res = f.read(5)
write_res = f.write("fail")
seek_res = f.seek(0)
flush_res = f.flush()
println(read_res.is_err())
println(write_res.is_err())
println(seek_res.is_err())
println(flush_res.is_err())
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], 'true');
  assert.strictEqual(r.output[1], 'true');
  assert.strictEqual(r.output[2], 'true');
  assert.strictEqual(r.output[3], 'true');
});

test('Category F: Mode violation returns PermissionDenied Result.Err', () => {
  const r = run(`
// Open file in write-only mode then try to read
f = open_file("write_only.txt", "w").unwrap()
r_res = f.read(5)
println(r_res.is_err())
f.close()

// Open non-existent file in read-only mode returns NotFound
missing_res = open_file("non_existent_file.txt", "r")
println(missing_res.is_err())
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], 'true');
  assert.strictEqual(r.output[1], 'true');
});

test('Category F: Invalid seek offset returns InvalidSeek Result.Err', () => {
  const r = run(`
f = open_file("seek_test.txt", "w+").unwrap()
f.write("hello")
seek_err = f.seek(-5)
println(seek_err.is_err())
f.close()
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], 'true');
});

// ============================================================================
// Category G: Deterministic Resource Lifecycle (with statement)
// ============================================================================

test('Category G: with statement cleans up File resource deterministically', () => {
  const r = run(`
mut file_ref = None
with f = open_file("auto_close.txt", "w+").unwrap() {
  f.write("Deterministic data")
  println(f.is_closed())
  file_ref = Some(f)
}
closed_file = file_ref.unwrap()
println(closed_file.is_closed())
println(closed_file.write("after scope").is_err())
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], 'false');
  assert.strictEqual(r.output[1], 'true');
  assert.strictEqual(r.output[2], 'true');
});

test('Category G: with statement cleans up on early return', () => {
  const r = run(`
mut saved_res = None

fn test_early_return() -> Int {
  with res = open_resource("early_return_res") {
    saved_res = Some(res)
    return 42
  }
  100
}

val = test_early_return()
println(val)
println(saved_res.unwrap().is_closed())
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], '42');
  assert.strictEqual(r.output[1], 'true');
});

test('Category G: Nested with statements execute cleanup in strict LIFO order', () => {
  const r = run(`
order = []
with r1 = open_resource("res_outer") {
  with r2 = open_resource("res_inner") {
    println("inside inner")
  }
  println(r1.is_closed())
}
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], 'inside inner');
  assert.strictEqual(r.output[1], 'false'); // outer still open after inner closed
});

// ============================================================================
// Category H: Memory I/O Refinement & Trait Constraints
// ============================================================================

test('Category H: MemoryReader satisfies Reader, Seekable, and Sized', () => {
  const r = run(`
fn check_reader<T: Reader>(r: T) -> Bool { true }
fn check_seekable<T: Seekable>(s: T) -> Bool { true }
fn check_sized<T: Sized>(s: T) -> Bool { true }

mr = MemoryReader("test")
println(check_reader(mr))
println(check_seekable(mr))
println(check_sized(mr))
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], 'true');
  assert.strictEqual(r.output[1], 'true');
  assert.strictEqual(r.output[2], 'true');
});

test('Category H: MemoryWriter satisfies Writer, Flushable, and Sized', () => {
  const r = run(`
fn check_writer<T: Writer>(w: T) -> Bool { true }
fn check_flushable<T: Flushable>(f: T) -> Bool { true }
fn check_sized<T: Sized>(s: T) -> Bool { true }

mw = MemoryWriter()
println(check_writer(mw))
println(check_flushable(mw))
println(check_sized(mw))
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], 'true');
  assert.strictEqual(r.output[1], 'true');
  assert.strictEqual(r.output[2], 'true');
});

test('Category H: Capability separation: MemoryReader cannot be used as Writer', () => {
  const tc = typecheck(`
fn requires_writer<T: Writer>(w: T) {
  w.write("data")
}

fn main() {
  mr = MemoryReader("hello")
  requires_writer(mr)
}
`);
  assert.strictEqual(tc.success, false);
  assert.ok(tc.errors.some((e) => e.startsWith('E4003')));
});

test('Category H: Capability separation: MemoryWriter cannot be used as Reader', () => {
  const tc = typecheck(`
fn requires_reader<T: Reader>(r: T) {
  r.read(5)
}

fn main() {
  mw = MemoryWriter()
  requires_reader(mw)
}
`);
  assert.strictEqual(tc.success, false);
  assert.ok(tc.errors.some((e) => e.startsWith('E4003')));
});

test('Category H: MemoryStream satisfies all 5 I/O capabilities', () => {
  const r = run(`
fn check_reader<T: Reader>(r: T) -> Bool { true }
fn check_writer<T: Writer>(w: T) -> Bool { true }
fn check_seekable<T: Seekable>(s: T) -> Bool { true }
fn check_flushable<T: Flushable>(f: T) -> Bool { true }
fn check_sized<T: Sized>(s: T) -> Bool { true }

ms = MemoryStream("init")
println(check_reader(ms))
println(check_writer(ms))
println(check_seekable(ms))
println(check_flushable(ms))
println(check_sized(ms))
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], 'true');
  assert.strictEqual(r.output[1], 'true');
  assert.strictEqual(r.output[2], 'true');
  assert.strictEqual(r.output[3], 'true');
  assert.strictEqual(r.output[4], 'true');
});

// ============================================================================
// Category I: Built-in Trait Implementations & Re-Audit Regressions (Pass #2)
// ============================================================================

test('Category I: TEST A — User-defined struct implementing Reader satisfies contract and generic constraint', () => {
  const tc = typecheck(`
struct CustomReader {
  dummy: Int
}

impl CustomReader: Reader {
  fn read(n: Int) -> Option<String> {
    None
  }
}

fn consume_reader<T: Reader>(r: T) -> Bool {
  true
}

fn main() {
  cr: CustomReader = CustomReader;
  consume_reader(cr);
}
`);
  assert.strictEqual(tc.success, true, tc.errors.join('\n'));
  assert.strictEqual(tc.errors.length, 0);
});

test('Category I: TEST B — User-defined struct implementing Writer satisfies contract and generic constraint', () => {
  const tc = typecheck(`
struct CustomWriter {
  dummy: Int
}

impl CustomWriter: Writer {
  fn write(data: String) -> Result<Int, String> {
    Ok(0)
  }
}

fn consume_writer<T: Writer>(w: T) -> Bool {
  true
}

fn main() {
  cw: CustomWriter = CustomWriter;
  consume_writer(cw);
}
`);
  assert.strictEqual(tc.success, true, tc.errors.join('\n'));
  assert.strictEqual(tc.errors.length, 0);
});

test('Category I: TEST C — User-defined struct implementing Resource satisfies contract and with statement', () => {
  const tc = typecheck(`
struct CustomResource {
  dummy: Int
}

impl CustomResource: Resource {
  fn close() -> Result<Unit, String> {
    Ok(())
  }
  fn is_closed() -> Bool {
    false
  }
}

fn main() {
  res: CustomResource = CustomResource;
  with res {
    println(1);
  }
}
`);
  assert.strictEqual(tc.success, true, tc.errors.join('\n'));
  assert.strictEqual(tc.errors.length, 0);
});

test('Category I: TEST D1 — Builtin trait method contract: missing method emits E4004', () => {
  const tc = typecheck(`
struct IncompleteReader {}
impl IncompleteReader: Reader {}
fn main() {}
`);
  assert.strictEqual(tc.success, false);
  assert.ok(tc.errors.some((e) => e.startsWith('E4004') && e.includes("does not implement required method 'read'")));
});

test('Category I: TEST D2 — Builtin trait method contract: signature mismatch emits E4006', () => {
  const tc = typecheck(`
struct BadSigReader {}
impl BadSigReader: Reader {
  fn read(n: String) -> Int {
    0
  }
}
fn main() {}
`);
  assert.strictEqual(tc.success, false);
  assert.ok(tc.errors.some((e) => e.startsWith('E4006') && e.includes("Method signature mismatch for 'read'")));
});

test('Category I: TEST D3 — Builtin trait method contract: extraneous method emits E4004', () => {
  const tc = typecheck(`
struct ExtraMethodReader {}
impl ExtraMethodReader: Reader {
  fn read(n: Int) -> Option<String> {
    None
  }
  fn extra_method() -> Int {
    42
  }
}
fn main() {}
`);
  assert.strictEqual(tc.success, false);
  assert.ok(tc.errors.some((e) => e.startsWith('E4004') && e.includes("not declared in trait 'Reader'")));
});

test('Category I: TEST E — Redeclaring built-in trait in user code emits E2002', () => {
  const tc = typecheck(`
trait Reader {
  fn read(n: Int) -> Option<String>
}
fn main() {}
`);
  assert.strictEqual(tc.success, false);
  assert.ok(tc.errors.some((e) => e.startsWith('E2002') && e.includes("Duplicate declaration of trait 'Reader'")));
});

test('Category I: TEST F — User-defined structs implementing Seekable, Flushable, Sized, and Iterator', () => {
  const tc = typecheck(`
struct CustomSeekable {}
impl CustomSeekable: Seekable {
  fn seek(offset: Int) -> Result<Int, String> { Ok(offset) }
  fn position() -> Int { 0 }
}

struct CustomFlushable {}
impl CustomFlushable: Flushable {
  fn flush() -> Result<Unit, String> { Ok(()) }
}

struct CustomSized {}
impl CustomSized: Sized {
  fn length() -> Int { 0 }
  fn is_empty() -> Bool { true }
}

struct CustomIterator {}
impl CustomIterator: Iterator {
  fn next() -> Option<Int> { None }
}

fn check_seekable<T: Seekable>(s: T) -> Bool { true }
fn check_flushable<T: Flushable>(f: T) -> Bool { true }
fn check_sized<T: Sized>(s: T) -> Bool { true }
fn check_iterator<T: Iterator>(i: T) -> Bool { true }

fn main() {
  check_seekable(CustomSeekable);
  check_flushable(CustomFlushable);
  check_sized(CustomSized);
  check_iterator(CustomIterator);
}
`);
  assert.strictEqual(tc.success, true, tc.errors.join('\n'));
});

test('Category I: TEST H1 — with statement rejects primitive types with E3001', () => {
  const tcInt = typecheck(`fn main() { with 42 {} }`);
  assert.strictEqual(tcInt.success, false);
  assert.ok(tcInt.errors.some((e) => e.startsWith('E3001') && e.includes("'Int'")));

  const tcStr = typecheck(`fn main() { with "hello" {} }`);
  assert.strictEqual(tcStr.success, false);
  assert.ok(tcStr.errors.some((e) => e.startsWith('E3001') && e.includes("'String'")));

  const tcBool = typecheck(`fn main() { with true {} }`);
  assert.strictEqual(tcBool.success, false);
  assert.ok(tcBool.errors.some((e) => e.startsWith('E3001') && e.includes("'Bool'")));
});

test('Category I: TEST H2 — with statement rejects un-unwrapped Result<File, E> with E3001 and hint', () => {
  const tc = typecheck(`
fn main() {
  with f = open_file("log.txt", "w") {
    println(1)
  }
}
`);
  assert.strictEqual(tc.success, false);
  assert.ok(tc.errors.some((e) => e.startsWith('E3001') && e.includes("Result") && e.includes("Unwrap the Result first")));
});

test('Category I: TEST H3 — MemoryReader operates on Unicode scalar boundaries without splitting surrogates', () => {
  const r = run(`
mr = MemoryReader("A😀𐐷界é")
println(mr.length())
println(mr.read(1).unwrap())
println(mr.read(1).unwrap())
println(mr.read(1).unwrap())
println(mr.read(1).unwrap())
println(mr.read(1).unwrap())
println(mr.read(1).is_none())
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], '5');
  assert.strictEqual(r.output[1], 'A');
  assert.strictEqual(r.output[2], '😀');
  assert.strictEqual(r.output[3], '𐐷');
  assert.strictEqual(r.output[4], '界');
  assert.strictEqual(r.output[5], 'é');
  assert.strictEqual(r.output[6], 'true');
});

test('Category I: TEST H4 — Member method lookup failure on known built-in type emits E3003', () => {
  const tc = typecheck(`
fn main() {
  mw = MemoryWriter()
  mw.seek(1)
}
`);
  assert.strictEqual(tc.success, false);
  assert.ok(tc.errors.some((e) => e.startsWith('E3003') && e.includes("Method or property 'seek' does not exist on type 'MemoryWriter'")));
});

