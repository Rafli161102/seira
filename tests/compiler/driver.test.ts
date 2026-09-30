import assert from 'node:assert';
import test from 'node:test';
import {
  CompilerDriver,
  CompilerContext,
  CompilerStage,
  createDefaultConfig,
  InternalCompilerError,
  isInternalCompilerError,
  SessionState,
} from '../../compiler/index.ts';

test('Driver: executes pipeline through Parse stage by default', () => {
  const driver = new CompilerDriver();
  const res = driver.compile('fn add(a: Int, b: Int) -> Int { return a + b; }', 'math.sra');

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.stage, CompilerStage.Parse);
  assert.ok(res.ast);
  assert.strictEqual(res.ast?.items.length, 1);
  assert.strictEqual(res.diagnostics.hasErrors(), false);
});

test('Driver: honors stopAfter = Lex stage', () => {
  const driver = new CompilerDriver();
  const res = driver.compile('let x = 10;', 'test.sra', { stopAfter: CompilerStage.Lex });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.stage, CompilerStage.Lex);
  assert.ok(res.tokens.length > 0);
  assert.strictEqual(res.ast, undefined);
});

test('Driver: runs through skeleton stages cleanly with milestone notifications', () => {
  const driver = new CompilerDriver();
  const res = driver.compile('fn main() {}', 'app.sra', { stopAfter: CompilerStage.HIR });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.stage, CompilerStage.HIR);
  assert.ok(res.hir);
  assert.ok(res.diagnostics.getDiagnostics().some((d) => d.code === 'I1001'));
});

test('Context: manages session lifecycle strictly', () => {
  const ctx = new CompilerContext({ target: 'native', profile: 'release' });
  assert.strictEqual(ctx.getState(), SessionState.Configured);
  assert.strictEqual(ctx.config.profile, 'release');

  ctx.loadSource('main.sra', 'fn main() {}');
  assert.strictEqual(ctx.getState(), SessionState.SourceLoaded);

  ctx.beginCompilation();
  assert.strictEqual(ctx.getState(), SessionState.Compiling);

  ctx.finish();
  assert.strictEqual(ctx.getState(), SessionState.Finished);

  // Loading source into a finished session throws an ICE
  assert.throws(
    () => ctx.loadSource('extra.sra', 'let y = 20;'),
    (err: unknown) => isInternalCompilerError(err)
  );
});

test('ICE: InternalCompilerError generates formatted crash report', () => {
  const ice = new InternalCompilerError('Unexpected AST node invariant failure', 'Typecheck', undefined, 'main.sra');
  assert.strictEqual(ice.name, 'InternalCompilerError');
  assert.strictEqual(ice.phase, 'Typecheck');
  assert.strictEqual(ice.file, 'main.sra');

  const report = ice.formatCrashReport();
  assert.ok(report.includes('internal compiler error'));
  assert.ok(report.includes('Typecheck'));
  assert.ok(report.includes('https://github.com/Rafli161102/seira/issues'));
});

test('Config: createDefaultConfig returns sound defaults', () => {
  const config = createDefaultConfig();
  assert.strictEqual(config.edition, '2026');
  assert.strictEqual(config.target, 'native');
  assert.strictEqual(config.profile, 'dev');
  assert.strictEqual(config.optLevel, 0);
  assert.strictEqual(config.debug, true);
});
