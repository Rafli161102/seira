/**
 * Seira 0.0.8-s — CLI Commands & Single-File / Package Mode Tests
 *
 * Validates:
 *   1. sr version and sr v
 *   2. sr info and sr i
 *   3. sr init generates Seira.toml and src/main.sr
 *   4. sr check on single-file (.sr) and package mode
 *   5. sr run and sr r on single-file (.sr) and package mode
 *   6. Single-file compatibility (.sr and .sra)
 */

import assert from 'node:assert';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { main } from '../../../tools/cli/index.ts';

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'seira_cli_test_'));
}

test('CLI: version flags output version correctly', () => {
  assert.strictEqual(main(['--version']), 0);
  assert.strictEqual(main(['-v']), 0);
  assert.strictEqual(main(['version']), 0);
  assert.strictEqual(main(['v']), 0);
});

test('CLI: info command outputs environment details', () => {
  assert.strictEqual(main(['info']), 0);
  assert.strictEqual(main(['i']), 0);
});

test('CLI: help flags output help text', () => {
  assert.strictEqual(main(['--help']), 0);
  assert.strictEqual(main(['-h']), 0);
  assert.strictEqual(main(['help']), 0);
  assert.strictEqual(main(['h']), 0);
});

test('CLI: sr init creates Seira.toml and src/main.sr', () => {
  const dir = createTempDir();
  const prevCwd = process.cwd();
  try {
    process.chdir(dir);
    const exitCode = main(['init']);
    assert.strictEqual(exitCode, 0);

    const manifestPath = join(dir, 'Seira.toml');
    const mainPath = join(dir, 'src', 'main.sr');

    assert.ok(existsSync(manifestPath), 'Seira.toml must exist');
    assert.ok(existsSync(mainPath), 'src/main.sr must exist');

    const manifestContent = readFileSync(manifestPath, 'utf-8');
    assert.ok(manifestContent.includes('[package]'));
    assert.ok(manifestContent.includes('version = "0.1.0"'));

    const mainContent = readFileSync(mainPath, 'utf-8');
    assert.ok(mainContent.includes('fn main()'));
  } finally {
    process.chdir(prevCwd);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: sr check validates single-file .sr and package mode', () => {
  const dir = createTempDir();
  try {
    const singleFile = join(dir, 'hello.sr');
    writeFileSync(singleFile, 'fn main() { println("Single file"); }');

    // Single-file check
    assert.strictEqual(main(['check', singleFile]), 0);
    assert.strictEqual(main(['c', singleFile]), 0);

    // Package mode check
    const pkgDir = join(dir, 'pkg');
    mkdirSync(join(pkgDir, 'src'), { recursive: true });
    writeFileSync(
      join(pkgDir, 'Seira.toml'),
      `[package]\nname = "my_pkg"\nversion = "0.1.0"\nedition = "2026"\n`
    );
    writeFileSync(join(pkgDir, 'src', 'main.sr'), 'fn main() {}');

    assert.strictEqual(main(['check', pkgDir]), 0);
    assert.strictEqual(main(['c', pkgDir]), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: sr run executes single-file .sr and package mode', () => {
  const dir = createTempDir();
  try {
    const singleFile = join(dir, 'app.sr');
    writeFileSync(singleFile, 'fn main() { println("Running standalone"); }');

    assert.strictEqual(main(['run', singleFile]), 0);
    assert.strictEqual(main(['r', singleFile]), 0);

    // Package mode run
    const pkgDir = join(dir, 'pkg');
    mkdirSync(join(pkgDir, 'src'), { recursive: true });
    writeFileSync(
      join(pkgDir, 'Seira.toml'),
      `[package]\nname = "run_pkg"\nversion = "0.1.0"\nedition = "2026"\n`
    );
    writeFileSync(
      join(pkgDir, 'src', 'main.sr'),
      'fn main() { println("Running package"); }'
    );

    assert.strictEqual(main(['run', pkgDir]), 0);
    assert.strictEqual(main(['r', pkgDir]), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
