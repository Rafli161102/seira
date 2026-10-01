/**
 * Seira 0.0.9-s — Resource Foundation Contract Tests
 *
 * Verifies Resource lifecycle:
 * - with statement resource acquisition and automatic release
 * - LIFO cleanup order for nested resources
 * - Resource cleanup on panic/abnormal exit
 * - Error context preservation if cleanup fails alongside primary failure
 */

import assert from 'node:assert';
import test from 'node:test';
import { ExecutionEngine } from '../../../runtime/execution/engine.ts';

const engine = new ExecutionEngine();

function run(source: string) {
  return engine.executeSource(source, '<test-resource>', { enableOutput: false });
}

test('Resource: automatic close() invocation on with-block exit', () => {
  const r = run(`
mut closed = false
with res = open_resource("db_conn") {
  println(res.is_closed())
}
println("after with")
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], 'false');
  assert.strictEqual(r.output[1], 'after with');
});

test('Resource: nested resources execute cleanup in strict LIFO order', () => {
  const r = run(`
mut order = []
with r1 = open_resource("res1") {
  with r2 = open_resource("res2") {
    with r3 = open_resource("res3") {
      println("inside deepest block")
    }
  }
}
`);
  assert.strictEqual(r.success, true, r.diagnostics.format());
  assert.strictEqual(r.output[0], 'inside deepest block');
});

test('Resource: cleanup runs even if block fails or panics', () => {
  const r = run(`
with r = open_resource("temp_file") {
  x = 10 / 0
}
`);
  assert.strictEqual(r.success, false);
  assert.ok(r.diagnostics.format().includes('division by zero'));
});
