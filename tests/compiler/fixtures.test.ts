import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { compileSource } from '../../compiler/index.ts';

test('Fixtures: valid fixtures compile cleanly', () => {
  const validDir = path.resolve('tests/fixtures/valid');
  const files = fs.readdirSync(validDir).filter((f) => f.endsWith('.sra'));

  assert.ok(files.length > 0, 'Should find valid fixture files');
  for (const file of files) {
    const filePath = path.join(validDir, file);
    const source = fs.readFileSync(filePath, 'utf-8');
    const res = compileSource(source, file);
    assert.strictEqual(
      res.success,
      true,
      `Fixture ${file} should compile successfully, got diagnostics:\n${res.diagnostics.format(source)}`
    );
    assert.ok(res.ast, `Fixture ${file} should produce an AST`);
    assert.strictEqual(res.diagnostics.hasErrors(), false, `Fixture ${file} should have no errors`);
  }
});

test('Fixtures: programs compile cleanly', () => {
  const progDir = path.resolve('tests/fixtures/programs');
  const files = fs.readdirSync(progDir).filter((f) => f.endsWith('.sra'));

  assert.ok(files.length > 0, 'Should find program fixture files');
  for (const file of files) {
    const filePath = path.join(progDir, file);
    const source = fs.readFileSync(filePath, 'utf-8');
    const res = compileSource(source, file);
    assert.strictEqual(
      res.success,
      true,
      `Program fixture ${file} should compile successfully, got diagnostics:\n${res.diagnostics.format(source)}`
    );
    assert.ok(res.ast, `Program fixture ${file} should produce an AST`);
    assert.strictEqual(res.diagnostics.hasErrors(), false, `Program fixture ${file} should have no errors`);
  }
});

test('Fixtures: invalid fixtures report compilation errors', () => {
  const invalidDir = path.resolve('tests/fixtures/invalid');
  const files = fs.readdirSync(invalidDir).filter((f) => f.endsWith('.sra'));

  assert.ok(files.length > 0, 'Should find invalid fixture files');
  for (const file of files) {
    const filePath = path.join(invalidDir, file);
    const source = fs.readFileSync(filePath, 'utf-8');
    const res = compileSource(source, file);
    assert.strictEqual(
      res.success,
      false,
      `Fixture ${file} should fail compilation but succeeded`
    );
    assert.strictEqual(
      res.diagnostics.hasErrors(),
      true,
      `Fixture ${file} should report errors in diagnostics`
    );
  }
});

test('Fixtures: diagnostic fixtures report formatted errors with line pointers', () => {
  const diagDir = path.resolve('tests/fixtures/diagnostics');
  const files = fs.readdirSync(diagDir).filter((f) => f.endsWith('.sra'));

  assert.ok(files.length > 0, 'Should find diagnostic fixture files');
  for (const file of files) {
    const filePath = path.join(diagDir, file);
    const source = fs.readFileSync(filePath, 'utf-8');
    const res = compileSource(source, file);
    assert.strictEqual(res.success, false, `Fixture ${file} should report errors`);
    const formatted = res.diagnostics.format(source);
    assert.ok(formatted.includes('error['), `Formatted output should contain error code in ${file}`);
    assert.ok(formatted.includes('-->'), `Formatted output should contain file position pointer in ${file}`);
  }
});

test('Fixtures: valid fixtures compile cleanly through semantic Typecheck stage', () => {
  const validDir = path.resolve('tests/fixtures/valid');
  const files = fs.readdirSync(validDir).filter((f) => f.endsWith('.sra'));

  assert.ok(files.length > 0, 'Should find valid fixture files');
  for (const file of files) {
    const filePath = path.join(validDir, file);
    const source = fs.readFileSync(filePath, 'utf-8');
    const res = compileSource(source, file, { stopAfter: 'typecheck' });
    assert.strictEqual(
      res.success,
      true,
      `Fixture ${file} should pass semantic typecheck cleanly, got diagnostics:\n${res.diagnostics.format(source)}`
    );
    assert.strictEqual(res.diagnostics.hasErrors(), false, `Fixture ${file} should have no semantic errors`);
  }
});
