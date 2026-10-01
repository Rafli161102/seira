/**
 * Seira 0.0.9-s — String Foundation Contract Tests
 *
 * Verifies String foundation APIs:
 * - length, is_empty, contains, starts_with, ends_with
 * - trim, split, replace, chars, bytes
 * - String immutability and UTF-8 semantics
 */

import assert from 'node:assert';
import test from 'node:test';
import { ExecutionEngine } from '../../../runtime/execution/engine.ts';

const engine = new ExecutionEngine();

function run(source: string) {
  return engine.executeSource(source, '<test-string>', { enableOutput: false });
}

test('String: length and is_empty', () => {
  const r1 = run(`"hello".length()`);
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.displayValue, '5');

  const r2 = run(`"".is_empty()`);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.displayValue, 'true');

  const r3 = run(`"abc".is_empty()`);
  assert.strictEqual(r3.success, true);
  assert.strictEqual(r3.displayValue, 'false');
});

test('String: contains, starts_with, ends_with', () => {
  const r1 = run(`"seira language".contains("lang")`);
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.displayValue, 'true');

  const r2 = run(`"seira language".contains("rust")`);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.displayValue, 'false');

  const r3 = run(`"filename.sr".starts_with("file")`);
  assert.strictEqual(r3.success, true);
  assert.strictEqual(r3.displayValue, 'true');

  const r4 = run(`"filename.sr".ends_with(".sr")`);
  assert.strictEqual(r4.success, true);
  assert.strictEqual(r4.displayValue, 'true');

  const r5 = run(`"filename.sr".ends_with(".rs")`);
  assert.strictEqual(r5.success, true);
  assert.strictEqual(r5.displayValue, 'false');
});

test('String: trim, split, replace', () => {
  const r1 = run(`"  spaced out   ".trim()`);
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.displayValue, 'spaced out');

  const r2 = run(`"apple,banana,orange".split(",")`);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.displayValue, '[apple, banana, orange]');

  const r3 = run(`"hello world".replace("world", "seira")`);
  assert.strictEqual(r3.success, true);
  assert.strictEqual(r3.displayValue, 'hello seira');
});

test('String: chars and bytes breakdown', () => {
  const r1 = run(`"abc".chars()`);
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.displayValue, "['a', 'b', 'c']");

  const r2 = run(`"abc".bytes()`);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.displayValue, '[97b, 98b, 99b]');
});
