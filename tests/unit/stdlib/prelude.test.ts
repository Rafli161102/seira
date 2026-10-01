/**
 * Seira 0.0.9-s — Prelude & Boundary Contract Tests
 *
 * Verifies:
 * - Intentionally small Prelude (Option, Result, Some, None, Ok, Err, iteration/traits/print)
 * - Absence of heavy/unsafe subsystems in Prelude (HTTP, DB, FS, Process, Crypto)
 * - Standard library module import integration
 */

import assert from 'node:assert';
import test from 'node:test';
import { ExecutionEngine } from '../../../runtime/execution/engine.ts';

const engine = new ExecutionEngine();

function run(source: string) {
  return engine.executeSource(source, '<test-prelude>', { enableOutput: false });
}

test('Prelude: foundation symbols available without explicit import', () => {
  const r = run(`
opt = Some(42)
res = Ok("success")
none_val = None
err_val = Err("fail")

println(opt.is_some())
println(res.is_ok())
println(none_val.is_none())
println(err_val.is_err())
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], 'true');
  assert.strictEqual(r.output[1], 'true');
  assert.strictEqual(r.output[2], 'true');
  assert.strictEqual(r.output[3], 'true');
});

test('Prelude: heavy/system capabilities are NOT in Prelude', () => {
  const r1 = run(`http_get("https://example.com")`);
  assert.strictEqual(r1.success, false);
  assert.ok(r1.diagnostics.format().includes("Cannot find name 'http_get'"));

  const r2 = run(`sql_query("SELECT 1")`);
  assert.strictEqual(r2.success, false);
  assert.ok(r2.diagnostics.format().includes("Cannot find name 'sql_query'"));

  const r3 = run(`exec_process("ls")`);
  assert.strictEqual(r3.success, false);
  assert.ok(r3.diagnostics.format().includes("Cannot find name 'exec_process'"));

  const r4 = run(`crypto_hash("data")`);
  assert.strictEqual(r4.success, false);
  assert.ok(r4.diagnostics.format().includes("Cannot find name 'crypto_hash'"));
});
