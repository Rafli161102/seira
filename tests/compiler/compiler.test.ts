import assert from 'node:assert';
import test from 'node:test';
import {
  compileSource,
  CompilerBackend,
  HIRLowering,
  Resolver,
  TypeChecker,
} from '../../compiler/index.ts';

test('Compiler: compiles source end-to-end through Parser phase', () => {
  const source = `
    fn main() {
      println("Seira Compiler Seed Foundation")
    }
  `;

  const result = compileSource(source, 'main.sra');
  assert.strictEqual(result.success, true);
  assert.ok(result.ast);
  assert.strictEqual(result.ast?.items.length, 1);
  assert.strictEqual(result.diagnostics.hasErrors(), false);
});

test('Compiler: halts and reports errors on invalid syntax', () => {
  const source = 'fn main( { invalid';
  const result = compileSource(source, 'invalid.sra');
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.diagnostics.hasErrors(), true);
});

test('Compiler: architectural skeletons emit clear milestone diagnostics', () => {
  const source = 'fn main() {}';
  const { ast } = compileSource(source);
  assert.ok(ast);

  // Resolver skeleton
  const resolver = new Resolver();
  const res = resolver.resolve(ast!);
  assert.strictEqual(res.success, true);
  assert.ok(res.diagnostics.getDiagnostics().some((d) => d.code === 'E2001'));

  // Typecheck skeleton
  const typechecker = new TypeChecker();
  const tcRes = typechecker.check(ast!);
  assert.strictEqual(tcRes.success, true);
  assert.ok(tcRes.diagnostics.getDiagnostics().some((d) => d.code === 'E3001'));

  // HIR skeleton
  const hir = new HIRLowering();
  const hirRes = hir.lower(ast!);
  assert.strictEqual(hirRes.version, '0.0.2-s');

  // Backend skeleton
  const backend = new CompilerBackend();
  const backendRes = backend.emit({ target: 'native', optLevel: 2, debug: false });
  assert.strictEqual(backendRes.success, false);
  assert.strictEqual(backendRes.diagnostics.hasErrors(), true);
  assert.ok(backendRes.diagnostics.getDiagnostics().some((d) => d.code === 'E9001'));
});
