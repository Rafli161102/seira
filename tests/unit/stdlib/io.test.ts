/**
 * Seira 0.0.9-s — Reader / Writer / Memory I/O Contract Tests
 *
 * Verifies Reader and Writer abstractions, and deterministic in-memory testing implementations:
 * - MemoryReader: in-memory reading, read, read_all, is_empty, length, position, reset
 * - MemoryWriter: in-memory writing, write, get_content, clear, length
 * - MemoryStream: dual read/write in-memory stream
 */

import assert from 'node:assert';
import test from 'node:test';
import { ExecutionEngine } from '../../../runtime/execution/engine.ts';

const engine = new ExecutionEngine();

function run(source: string) {
  return engine.executeSource(source, '<test-io>', { enableOutput: false });
}

test('IO: MemoryReader basic reading and state', () => {
  const r = run(`
reader = MemoryReader("hello world")
println(reader.length())
println(reader.is_empty())
println(reader.position())
chunk1 = reader.read(5)
println(chunk1)
println(reader.position())
all_rest = reader.read_all()
println(all_rest)
println(reader.is_empty())
reader.reset()
println(reader.position())
println(reader.read_all())
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], '11');
  assert.strictEqual(r.output[1], 'false');
  assert.strictEqual(r.output[2], '0');
  assert.strictEqual(r.output[3], 'Some(hello)');
  assert.strictEqual(r.output[4], '5');
  assert.strictEqual(r.output[5], ' world');
  assert.strictEqual(r.output[6], 'true');
  assert.strictEqual(r.output[7], '0');
  assert.strictEqual(r.output[8], 'hello world');
});

test('IO: MemoryReader read on empty returns None', () => {
  const r = run(`
reader = MemoryReader("")
println(reader.is_empty())
println(reader.read(5))
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], 'true');
  assert.strictEqual(r.output[1], 'None');
});

test('IO: MemoryWriter writing, content retrieval, and clear', () => {
  const r = run(`
writer = MemoryWriter()
println(writer.length())
res1 = writer.write("Hello, ")
res2 = writer.write("Seira!")
println(res1.is_ok())
println(res2.is_ok())
println(writer.get_content())
println(writer.length())
writer.clear()
println(writer.length())
println(writer.get_content())
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], '0');
  assert.strictEqual(r.output[1], 'true');
  assert.strictEqual(r.output[2], 'true');
  assert.strictEqual(r.output[3], 'Hello, Seira!');
  assert.strictEqual(r.output[4], '13');
  assert.strictEqual(r.output[5], '0');
  assert.strictEqual(r.output[6], '');
});

test('IO: MemoryStream combined read and write in memory', () => {
  const r = run(`
stream = MemoryStream("initial data: ")
writer_res = stream.write("appended content")
println(writer_res.is_ok())
println(stream.get_content())
chunk = stream.read(14)
println(chunk)
rest = stream.read_all()
println(rest)
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], 'true');
  assert.strictEqual(r.output[1], 'initial data: appended content');
  assert.strictEqual(r.output[2], 'Some(initial data: )');
  assert.strictEqual(r.output[3], 'appended content');
});

test('IO: Reader and Writer deterministic testing without OS/network effects', () => {
  const r = run(`
fn echo_pipe(r: MemoryReader, w: MemoryWriter) -> String {
  content = r.read_all()
  w.write(content)
  w.get_content()
}

fn main() {
  r = MemoryReader("deterministic test payload")
  w = MemoryWriter()
  result = echo_pipe(r, w)
  println(result)
}
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], 'deterministic test payload');
});
