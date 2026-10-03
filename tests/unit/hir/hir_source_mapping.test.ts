import assert from 'node:assert';
import test from 'node:test';
import { CompilerDriver, CompilerStage } from '../../../compiler/index.ts';
import type { HIRFunction } from '../../../compiler/index.ts';

test('HIR Source Mapping: preserves accurate source spans for declarations and statements', () => {
  const driver = new CompilerDriver();
  const source = `
    fn main() {
      let x = 42;
    }
  `;

  const res = driver.compile(source, 'source_map.sr', { stopAfter: CompilerStage.HIR });
  assert.strictEqual(res.success, true);
  assert.ok(res.hir);

  const mainFn = res.hir.topLevelItems[0] as HIRFunction;
  assert.strictEqual(mainFn.source.kind, 'Source');
  assert.strictEqual(mainFn.source.file, 'source_map.sr');
  assert.ok(mainFn.source.span.start > 0);
  assert.ok(mainFn.source.span.end > mainFn.source.span.start);

  const letStmt = mainFn.body.statements[0];
  assert.strictEqual(letStmt.source.kind, 'Source');
  assert.strictEqual(letStmt.source.file, 'source_map.sr');
});

test('HIR Source Mapping: synthetic nodes carry parent span and desugaring reason', () => {
  const driver = new CompilerDriver();
  const source = `
    fn double(x: Int) -> Int { x * 2 }
    fn run() {
      let res = 5 |> double;
    }
  `;

  const res = driver.compile(source, 'synth.sr', { stopAfter: CompilerStage.HIR });
  assert.strictEqual(res.success, true);
  assert.ok(res.hir);

  const runFn = res.hir.topLevelItems.find(
    (i) => i.kind === 'HIRFunction' && i.name === 'run'
  ) as HIRFunction;
  const letStmt = runFn.body.statements[0] as any;
  const callExpr = letStmt.initializer;

  assert.strictEqual(callExpr.source.kind, 'Synthetic');
  assert.strictEqual(callExpr.source.reason, 'desugared_pipeline');
  assert.ok(callExpr.source.parentSpan);
});
