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

test('Unicode: length across scalar values (ASCII, accented, CJK, emoji)', () => {
  // 1. ASCII length
  const r1 = run(`"A".length()`);
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.displayValue, '1');

  // 2. Accented character (é = U+00E9)
  const r2 = run(`"é".length()`);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.displayValue, '1');

  // 3. CJK characters (東京 = 2 Unicode scalar values)
  const r3 = run(`"東京".length()`);
  assert.strictEqual(r3.success, true);
  assert.strictEqual(r3.displayValue, '2');

  // 4. Single emoji (🦀 = U+1F980, non-BMP scalar value)
  const r4 = run(`"🦀".length()`);
  assert.strictEqual(r4.success, true);
  assert.strictEqual(r4.displayValue, '1');

  const r4b = run(`"😀".length()`);
  assert.strictEqual(r4b.success, true);
  assert.strictEqual(r4b.displayValue, '1');

  // 5. Multiple emoji (😀🔥 = 2 Unicode scalar values)
  const r5 = run(`"😀🔥".length()`);
  assert.strictEqual(r5.success, true);
  assert.strictEqual(r5.displayValue, '2');

  // Property access .length also reflects Unicode scalar count
  const r6 = run(`"🦀".length`);
  assert.strictEqual(r6.success, true);
  assert.strictEqual(r6.displayValue, '1');
});

test('Unicode: chars() breakdown and intact scalar Char integrity', () => {
  // 6. chars() with emoji
  const r1 = run(`"🦀".chars()`);
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.displayValue, "['🦀']");

  const r2 = run(`"😀🔥".chars()`);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.displayValue, "['😀', '🔥']");

  const r3 = run(`"Aé東🦀".chars()`);
  assert.strictEqual(r3.success, true);
  assert.strictEqual(r3.displayValue, "['A', 'é', '東', '🦀']");

  // 8. no isolated surrogate Char values: literal and runtime char preservation
  const r4 = run(`let c: Char = '🦀';\nc`);
  assert.strictEqual(r4.success, true);
  assert.strictEqual(r4.displayValue, "'🦀'");
  // Ensure the runtime value is the complete code point, not an isolated high surrogate
  const charVal = (r4.value as any)?.value;
  assert.strictEqual(charVal, '🦀');
  assert.strictEqual(charVal.codePointAt(0), 0x1f980);
});

test('Unicode: bytes() UTF-8 deterministic encoding', () => {
  // 7. bytes() with emoji (🦀: F0 9F A6 80 -> 240, 159, 166, 128)
  const r1 = run(`"🦀".bytes()`);
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.displayValue, '[240b, 159b, 166b, 128b]');

  // Accented character (é: C3 A9 -> 195, 169)
  const r2 = run(`"é".bytes()`);
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.displayValue, '[195b, 169b]');
});

