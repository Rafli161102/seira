import assert from 'node:assert';
import test from 'node:test';
import { join } from 'node:path';
import {
  loadManifest,
  parseToml,
  validateManifest,
} from '../../../tools/cli/manifest/manifest.ts';

test('Manifest: parses TOML content accurately', () => {
  const toml = `
    # Comment
    [package]
    name = "demo"
    version = "0.0.1-s"
    debug = true
    workers = 4

    [target]
    supported = ["native", "wasm32"]
  `;

  const parsed = parseToml(toml);
  assert.strictEqual(parsed.package.name, 'demo');
  assert.strictEqual(parsed.package.version, '0.0.1-s');
  assert.strictEqual(parsed.package.debug, true);
  assert.strictEqual(parsed.package.workers, 4);
  assert.deepStrictEqual(parsed.target.supported, ['native', 'wasm32']);
});

test('Manifest: validates root Seira.toml', () => {
  const rootManifestPath = join(process.cwd(), 'Seira.toml');
  const manifest = loadManifest(rootManifestPath);
  const result = validateManifest(manifest);

  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.errors.length, 0);
  assert.strictEqual(manifest.package.name, 'seira');
  assert.strictEqual(manifest.package.version, '0.0.9-s');
});

test('Manifest: rejects invalid manifests with missing or invalid fields', () => {
  const invalidManifest = {
    package: {
      name: 'invalid name with spaces!',
      version: '',
    },
  };

  const result = validateManifest(invalidManifest as any);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('invalid characters')));
  assert.ok(result.errors.some((e) => e.includes('package.version')));
});
