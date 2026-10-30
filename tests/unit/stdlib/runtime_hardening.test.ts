import assert from "node:assert/strict";
import test from "node:test";

import { ExecutionEngine } from "../../../runtime/execution/engine.ts";
import { resetVirtualFiles } from "../../../runtime/execution/values.ts";

const engine = new ExecutionEngine();

test("Virtual file modes validate input, truncate w+, and distinguish append read permissions", () => {
  resetVirtualFiles();
  const source = [
    'f = open_file("mode.txt", "w+").unwrap()',
    'f.write("initial")',
    "f.close()",
    'truncated = open_file("mode.txt", "w+").unwrap()',
    "println(truncated.length().unwrap())",
    'truncated.write("ok")',
    "truncated.close()",
    'invalid = open_file("mode.txt", "invalid")',
    "println(invalid.is_err())",
    'append = open_file("mode.txt", "a").unwrap()',
    "println(append.read_all().is_err())",
    "append.close()",
    'append_read = open_file("mode.txt", "a+").unwrap()',
    "append_read.rewind()",
    "println(append_read.read_all().unwrap())",
    'append_read.write("!")',
    "append_read.close()",
  ].join("\n");

  const result = engine.executeSource(source, "<runtime-hardening>", { enableOutput: false });
  assert.equal(result.success, true, result.diagnostics.format());
  assert.deepEqual(result.output, ["0", "true", "true", "ok"]);
});

test("print and println share the captured runtime output sink", () => {
  const source = ['print("alpha")', 'print(" ")', 'println("beta")'].join("\n");
  const result = engine.executeSource(source, "<runtime-output>", { enableOutput: false });

  assert.equal(result.success, true, result.diagnostics.format());
  assert.deepEqual(result.output, ["alpha", " ", "beta"]);
  assert.equal(result.output.join(""), "alpha beta");
});
