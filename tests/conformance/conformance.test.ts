import assert from 'node:assert';
import test from 'node:test';
import { compileSource, CompilerDriver, CompilerStage } from '../../compiler/index.ts';

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
    const res = compileSource(tc.source, `${tc.id}.sr`);
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


interface DevelopmentConformanceCase {
  readonly id: string;
  readonly source: string;
  readonly stage: CompilerStage;
  readonly succeeds: boolean;
  readonly expectedCode?: string;
}

const DEVELOPMENT_CONFORMANCE_CASES: ReadonlyArray<DevelopmentConformanceCase> = [
  {
    id: 'DEV-CONF-001',
    source: 'fn identity<T>(value: T) -> T { return value; } fn answer() -> Int { return identity(42); }',
    stage: CompilerStage.Typecheck,
    succeeds: true,
  },
  {
    id: 'DEV-CONF-002',
    source: 'fn increment(value: &mut Int) { *value += 1; } fn main() { mut count = 0; increment(&mut count); }',
    stage: CompilerStage.Typecheck,
    succeeds: true,
  },
  {
    id: 'DEV-CONF-003',
    source: 'fn write!() {} fn caller!() { write!(); }',
    stage: CompilerStage.EffectCheck,
    succeeds: true,
  },
  {
    id: 'DEV-CONF-004',
    source: 'fn write!() {} fn pure_caller() { write!(); }',
    stage: CompilerStage.EffectCheck,
    succeeds: false,
    expectedCode: 'E8001',
  },
  {
    id: 'DEV-CONF-005',
    source: 'fn invalid() -> Int { return "not an integer"; }',
    stage: CompilerStage.Typecheck,
    succeeds: false,
    expectedCode: 'E3004',
  },
  {
    id: 'DEV-CONF-006',
    source: 'fn invalid() { counter++ }',
    stage: CompilerStage.Parse,
    succeeds: false,
  },
];

test('Conformance: Development semantic matrix across type, ownership syntax, and effects', () => {
  for (const tc of DEVELOPMENT_CONFORMANCE_CASES) {
    const result = new CompilerDriver().compile(tc.source, `${tc.id}.sr`, { stopAfter: tc.stage });
    assert.equal(
      result.success,
      tc.succeeds,
      `${tc.id} expected success=${tc.succeeds}; diagnostics:\n${result.diagnostics.format(tc.source)}`,
    );
    if (tc.expectedCode) {
      assert.ok(
        result.diagnostics.getErrors().some((diagnostic) => diagnostic.code === tc.expectedCode),
        `${tc.id} expected diagnostic ${tc.expectedCode}`,
      );
    }
  }
});

test('Conformance: diagnostics remain deterministic across repeated compilation', () => {
  const source = 'fn invalid() -> Int { return "wrong"; }';
  const compile = () => new CompilerDriver().compile(source, 'stable-diagnostic.sr', { stopAfter: CompilerStage.Typecheck });
  const first = compile();
  const second = compile();
  const fingerprint = (result: ReturnType<CompilerDriver['compile']>) =>
    result.diagnostics.getErrors().map((diagnostic) => [
      diagnostic.code,
      diagnostic.primarySpan.start,
      diagnostic.primarySpan.end,
    ]);
  assert.deepEqual(fingerprint(first), fingerprint(second));
});
