import assert from 'node:assert';
import test from 'node:test';
import { compileSource } from '../../compiler/index.ts';

/**
 * Conformance Test Suite Foundation
 * Designed to ensure behavioral uniformity across front-ends and future backends (Native LLVM vs Wasm).
 */

interface ConformanceCase {
  id: string;
  name: string;
  source: string;
  shouldSucceed: boolean;
  expectedItemCount?: number;
}

const SEED_CONFORMANCE_CASES: ConformanceCase[] = [
  {
    id: 'CONF-001',
    name: 'Canonical Hello World Function',
    source: 'fn main() { println("Hello, Seira!") }',
    shouldSucceed: true,
    expectedItemCount: 1,
  },
  {
    id: 'CONF-002',
    name: 'Pipeline Operator Precedence and Chaining',
    source: `
      fn process(input: Int) {
        input |> step1 |> step2
      }
    `,
    shouldSucceed: true,
    expectedItemCount: 1,
  },
  {
    id: 'CONF-003',
    name: 'Option Fallback with Default Operator (??)',
    source: `
      fn get_val(opt: Option<Int>) -> Int {
        return opt ?? 0;
      }
    `,
    shouldSucceed: true,
    expectedItemCount: 1,
  },
  {
    id: 'CONF-004',
    name: 'Option Propagation Operator (?)',
    source: `
      fn load() {
        let res = fetch()?;
      }
    `,
    shouldSucceed: true,
    expectedItemCount: 1,
  },
  {
    id: 'CONF-005',
    name: 'Deterministic Resource Scope (with)',
    source: `
      fn scoped() {
        with get_handle() as h {
          h.flush()
        }
      }
    `,
    shouldSucceed: true,
    expectedItemCount: 1,
  },
  {
    id: 'CONF-006',
    name: 'Rejection of C-Style Increment (++)',
    source: 'fn bad() { counter++ }',
    shouldSucceed: false,
  },
  {
    id: 'CONF-007',
    name: 'Rejection of Null Keyword',
    source: 'fn bad() { let x = null }',
    shouldSucceed: false,
  },
];

test('Conformance: Seed language syntax test cases', () => {
  for (const tc of SEED_CONFORMANCE_CASES) {
    const res = compileSource(tc.source, `${tc.id}.sra`);
    if (tc.shouldSucceed) {
      assert.strictEqual(
        res.success,
        true,
        `Conformance test ${tc.id} (${tc.name}) failed to parse:\n${res.diagnostics.format(tc.source)}`
      );
      if (tc.expectedItemCount !== undefined) {
        assert.strictEqual(res.ast?.items.length, tc.expectedItemCount);
      }
    } else {
      assert.strictEqual(
        res.success,
        false,
        `Conformance test ${tc.id} (${tc.name}) was expected to fail, but succeeded.`
      );
    }
  }
});
