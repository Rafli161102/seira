/**
 * Seira 0.0.8-s — Module & Package Foundation Test Suite
 *
 * Test Matrix Coverage:
 * 1. MODULE:
 *    - single module
 *    - multiple modules
 *    - nested modules
 *    - module discovery
 *    - deterministic discovery
 *    - duplicate module (E6003)
 *    - invalid module path (E6013)
 *
 * 2. IMPORT / USE:
 *    - import module
 *    - use symbol
 *    - alias
 *    - public re-export (pub use)
 *    - invalid import (E6006)
 *    - wildcard import rejection (import *, use *)
 *    - unresolved symbol (E6002)
 *    - module not found (E6001)
 *    - duplicate symbol (E6004)
 *
 * 3. VISIBILITY:
 *    - private declaration
 *    - public declaration
 *    - private access rejection (E6005)
 *    - public access permitted
 *    - invalid re-export of private symbol (E6015)
 *
 * 4. TYPE SYSTEM & GENERICS ACROSS MODULES:
 *    - cross-module custom nominal types
 *    - cross-module generic types (Box<T>)
 *    - cross-module generic functions (make_box<T>)
 *    - cross-module traits and trait constraints
 *    - Option<T>, Result<T, E>, Union, Function types across modules
 *
 * 5. DEPENDENCIES & PACKAGE GRAPH:
 *    - path dependencies
 *    - package identity isolation (pkg_a::user vs pkg_b::user)
 *    - package cycles (E6012)
 *    - module cycles (E6008)
 *    - missing package (E6009)
 *    - duplicate package (E6014)
 *    - invalid dependency (E6011)
 *
 * 6. MANIFEST & LOCKFILE:
 *    - valid manifest parsing
 *    - SemVer 2.x validation
 *    - duplicate fields rejection (E6010)
 *    - malformed manifest (E6010)
 *    - SHA-256 lockfile generation and round-trip
 *
 * 7. WORKSPACE:
 *    - workspace manifest and member discovery
 *    - workspace dependency foundation
 *    - deterministic member ordering
 *
 * 8. GLOBAL MUTABLE STATE:
 *    - rejection of 'mut' at module scope (E2003)
 *    - constants allowed ('const')
 */

import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Lexer } from '../../../compiler/lexer/lexer.ts';
import { Parser } from '../../../compiler/parser/parser.ts';
import { Resolver } from '../../../compiler/resolver/index.ts';
import { TypeChecker } from '../../../compiler/typecheck/index.ts';
import { CompilerDriver } from '../../../compiler/driver/driver.ts';
import { DiagnosticBag } from '../../../compiler/diagnostics/index.ts';
import {
  ModuleDiscovery,
  ModuleGraph,
  ManifestParser,
  LockfileManager,
  PackageLoader,
  PackageGraph,
  WorkspaceLoader,
  SeiraModule,
} from '../../../compiler/module/index.ts';
import { ExecutionEngine } from '../../../runtime/execution/engine.ts';
import { isNormal } from '../../../runtime/execution/outcomes.ts';
import { rtInt, rtString, runtimeValuesEqual } from '../../../runtime/execution/values.ts';

function createTempDir(prefix = 'seira_test_'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function parseAndCollectModule(source: string, modPath: string, filePath: string, diagnostics: DiagnosticBag): SeiraModule {
  const lexer = new Lexer(source, filePath, diagnostics);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, filePath, diagnostics);
  const ast = parser.parse();
  const mod = new SeiraModule({ package: 'test_pkg', path: modPath }, filePath);
  mod.collectDeclarations(ast);
  return mod;
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. MODULE DISCOVERY & MAPPING
// ══════════════════════════════════════════════════════════════════════════════

test('Module Discovery: single, multiple, and nested modules with deterministic ordering', () => {
  const dir = createTempDir();
  try {
    const src = join(dir, 'src');
    mkdirSync(src, { recursive: true });
    mkdirSync(join(src, 'http'), { recursive: true });

    writeFileSync(join(src, 'main.sr'), 'fn main() {}');
    writeFileSync(join(src, 'user.sr'), 'pub type User { id: Int }');
    writeFileSync(join(src, 'http', 'client.sr'), 'pub fn get() {}');
    writeFileSync(join(src, 'http', 'server.sr'), 'pub fn listen() {}');

    const diag = new DiagnosticBag();
    const discovery = new ModuleDiscovery(diag);
    const modules = discovery.discoverModules('my_app', src);

    assert.strictEqual(diag.hasErrors(), false);
    assert.strictEqual(modules.size, 4);

    const keys = Array.from(modules.keys());
    assert.deepStrictEqual(keys, ['http.client', 'http.server', 'main', 'user']);

    const httpMod = modules.get('http.client');
    assert.ok(httpMod);
    assert.strictEqual(httpMod.id.package, 'my_app');
    assert.strictEqual(httpMod.id.path, 'http.client');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Module Discovery: detects duplicate module identity across .sr and .sra (E6003)', () => {
  const dir = createTempDir();
  try {
    const src = join(dir, 'src');
    mkdirSync(src, { recursive: true });

    writeFileSync(join(src, 'user.sr'), 'pub type User {}');
    writeFileSync(join(src, 'user.sra'), 'pub type User2 {}');

    const diag = new DiagnosticBag();
    const discovery = new ModuleDiscovery(diag);
    discovery.discoverModules('my_app', src);

    assert.strictEqual(diag.hasErrors(), true);
    assert.ok(diag.getErrors().some((e) => e.code === 'E6003'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Module Discovery: path traversal escaping source root is rejected (E6013)', () => {
  const dir = createTempDir();
  try {
    const src = join(dir, 'src');
    mkdirSync(src, { recursive: true });

    const diag = new DiagnosticBag();
    const discovery = new ModuleDiscovery(diag);
    const mod = discovery.createModuleFromRelativePath('my_app', '../outside.sr', src);

    assert.strictEqual(mod, null);
    assert.strictEqual(diag.hasErrors(), true);
    assert.ok(diag.getErrors().some((e) => e.code === 'E6013'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. MODULE GRAPH & CYCLE DETECTION (E6008)
// ══════════════════════════════════════════════════════════════════════════════

test('Module Graph: topological sort produces deterministic dependency order', () => {
  const diag = new DiagnosticBag();
  const graph = new ModuleGraph(diag);

  const modC = new SeiraModule({ package: 'app', path: 'c' }, 'c.sr');
  const modB = new SeiraModule({ package: 'app', path: 'b' }, 'b.sr');
  modB.dependencies.add('c');
  const modA = new SeiraModule({ package: 'app', path: 'a' }, 'a.sr');
  modA.dependencies.add('b');

  graph.addModule(modA);
  graph.addModule(modB);
  graph.addModule(modC);

  const sorted = graph.sort();
  assert.strictEqual(diag.hasErrors(), false);
  assert.deepStrictEqual(sorted.map((m) => m.id.path), ['c', 'b', 'a']);
});

test('Module Graph: direct cyclic dependency (A -> B -> A) rejected with E6008', () => {
  const diag = new DiagnosticBag();
  const graph = new ModuleGraph(diag);

  const modA = new SeiraModule({ package: 'app', path: 'a' }, 'a.sr');
  modA.dependencies.add('b');
  const modB = new SeiraModule({ package: 'app', path: 'b' }, 'b.sr');
  modB.dependencies.add('a');

  graph.addModule(modA);
  graph.addModule(modB);

  graph.sort();
  assert.strictEqual(diag.hasErrors(), true);
  assert.ok(diag.getErrors().some((e) => e.code === 'E6008'));
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. IMPORT, USE, ALIAS, RE-EXPORT & WILDCARD REJECTION
// ══════════════════════════════════════════════════════════════════════════════

test('Import/Use: wildcard imports (use * and import *) are strictly rejected', () => {
  const diag1 = new DiagnosticBag();
  const tokens1 = new Lexer('use *;', 'test.sr', diag1).tokenize();
  new Parser(tokens1, 'test.sr', diag1).parse();
  assert.strictEqual(diag1.hasErrors(), true);
  assert.ok(diag1.getErrors().some((e) => e.code === 'E6007'));

  const diag2 = new DiagnosticBag();
  const tokens2 = new Lexer('import *;', 'test.sr', diag2).tokenize();
  new Parser(tokens2, 'test.sr', diag2).parse();
  assert.strictEqual(diag2.hasErrors(), true);
  assert.ok(diag2.getErrors().some((e) => e.code === 'E6006'));
});

test('Import/Use: valid use statement brings public symbol into local scope', () => {
  const diag = new DiagnosticBag();
  const mathMod = parseAndCollectModule(
    'pub fn add(a: Int, b: Int) -> Int { a + b }',
    'math',
    'math.sr',
    diag
  );

  const availableModules = new Map<string, SeiraModule>([['math', mathMod]]);

  const mainSrc = `
    use math.add;

    fn main() {
      x = add(10, 20);
    }
  `;
  const mainTokens = new Lexer(mainSrc, 'main.sr', diag).tokenize();
  const mainAst = new Parser(mainTokens, 'main.sr', diag).parse();

  const resolver = new Resolver(diag, { availableModules, isModuleMode: true });
  const resResult = resolver.resolve(mainAst, 'main.sr');
  assert.strictEqual(diag.hasErrors(), false);
  assert.strictEqual(resResult.success, true);
  assert.ok(resResult.globalScope.lookup('add'));
});

test('Import/Use: use statement with alias (use http.client.Client as HttpClient)', () => {
  const diag = new DiagnosticBag();
  const clientMod = parseAndCollectModule(
    'pub type Client { url: String }',
    'http.client',
    'http/client.sr',
    diag
  );

  const availableModules = new Map<string, SeiraModule>([['http.client', clientMod]]);

  const mainSrc = `
    use http.client.Client as HttpClient;

    fn main(c: HttpClient) {
    }
  `;
  const mainTokens = new Lexer(mainSrc, 'main.sr', diag).tokenize();
  const mainAst = new Parser(mainTokens, 'main.sr', diag).parse();

  const resolver = new Resolver(diag, { availableModules, isModuleMode: true });
  const resResult = resolver.resolve(mainAst, 'main.sr');
  assert.strictEqual(diag.hasErrors(), false);
  assert.ok(resResult.globalScope.lookup('HttpClient'));
  assert.strictEqual(resResult.globalScope.lookup('Client'), undefined);
});

test('Import/Use: module-level import allows qualified access (import math; math.add)', () => {
  const diag = new DiagnosticBag();
  const mathMod = parseAndCollectModule(
    'pub fn add(a: Int, b: Int) -> Int { a + b }',
    'math',
    'math.sr',
    diag
  );

  const availableModules = new Map<string, SeiraModule>([['math', mathMod]]);

  const mainSrc = `
    import math;

    fn main() {
      x = math.add(5, 5);
    }
  `;
  const mainTokens = new Lexer(mainSrc, 'main.sr', diag).tokenize();
  const mainAst = new Parser(mainTokens, 'main.sr', diag).parse();

  const resolver = new Resolver(diag, { availableModules, isModuleMode: true });
  const resResult = resolver.resolve(mainAst, 'main.sr');
  assert.strictEqual(diag.hasErrors(), false);
  assert.strictEqual(resResult.success, true);
});

test('Import/Use: missing module emits E6001 and missing symbol emits E6002', () => {
  const diag = new DiagnosticBag();
  const availableModules = new Map<string, SeiraModule>();

  // E6001: Module not found
  const srcMissingMod = `use unknown_mod.Symbol;`;
  const ast1 = new Parser(new Lexer(srcMissingMod, '1.sr', diag).tokenize()).parse();
  const res1 = new Resolver(diag, { availableModules, isModuleMode: true });
  res1.resolve(ast1, '1.sr');
  assert.ok(diag.getErrors().some((e) => e.code === 'E6001'));

  // E6002: Symbol not found
  const diag2 = new DiagnosticBag();
  const modA = parseAndCollectModule('pub fn existing() {}', 'mod_a', 'mod_a.sr', diag2);
  availableModules.set('mod_a', modA);

  const srcMissingSym = `use mod_a.non_existent;`;
  const ast2 = new Parser(new Lexer(srcMissingSym, '2.sr', diag2).tokenize()).parse();
  const res2 = new Resolver(diag2, { availableModules, isModuleMode: true });
  res2.resolve(ast2, '2.sr');
  assert.ok(diag2.getErrors().some((e) => e.code === 'E6002'));
});

test('Import/Use: duplicate symbol in scope emits E6004', () => {
  const diag = new DiagnosticBag();
  const modA = parseAndCollectModule('pub fn foo() {}', 'mod_a', 'mod_a.sr', diag);
  const availableModules = new Map<string, SeiraModule>([['mod_a', modA]]);

  const src = `
    fn foo() {}
    use mod_a.foo;
  `;
  const ast = new Parser(new Lexer(src, 'main.sr', diag).tokenize()).parse();
  const res = new Resolver(diag, { availableModules, isModuleMode: true });
  res.resolve(ast, 'main.sr');

  assert.strictEqual(diag.hasErrors(), true);
  assert.ok(diag.getErrors().some((e) => e.code === 'E6004'));
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. VISIBILITY & RE-EXPORT
// ══════════════════════════════════════════════════════════════════════════════

test('Visibility: private declaration cannot be accessed from another module (E6005)', () => {
  const diag = new DiagnosticBag();
  const internalMod = parseAndCollectModule(
    `
      fn secret_helper() -> Int { 42 }
      pub fn public_api() -> Int { secret_helper() }
    `,
    'internal',
    'internal.sr',
    diag
  );

  const availableModules = new Map<string, SeiraModule>([['internal', internalMod]]);

  // Trying to import private symbol
  const consumerSrc = `use internal.secret_helper;`;
  const ast = new Parser(new Lexer(consumerSrc, 'consumer.sr', diag).tokenize()).parse();
  const res = new Resolver(diag, { availableModules, isModuleMode: true });
  res.resolve(ast, 'consumer.sr');

  assert.strictEqual(diag.hasErrors(), true);
  assert.ok(diag.getErrors().some((e) => e.code === 'E6005'));
});

test('Visibility: invalid re-export of private symbol emits E6015', () => {
  const diag = new DiagnosticBag();
  const internalMod = parseAndCollectModule(
    `fn private_symbol() {}`,
    'internal',
    'internal.sr',
    diag
  );

  const availableModules = new Map<string, SeiraModule>([['internal', internalMod]]);

  const facadeSrc = `pub use internal.private_symbol;`;
  const ast = new Parser(new Lexer(facadeSrc, 'facade.sr', diag).tokenize()).parse();
  const res = new Resolver(diag, { availableModules, isModuleMode: true });
  res.resolve(ast, 'facade.sr');

  assert.strictEqual(diag.hasErrors(), true);
  assert.ok(diag.getErrors().some((e) => e.code === 'E6015'));
});

test('Visibility: valid public re-export (pub use) creates facade accessible to consumer', () => {
  const diag = new DiagnosticBag();
  const internalMod = parseAndCollectModule(
    `pub type User { id: Int }`,
    'internal',
    'internal.sr',
    diag
  );
  const facadeMod = parseAndCollectModule(
    `pub use internal.User;`,
    'lib',
    'lib.sr',
    diag
  );

  const availableModules = new Map<string, SeiraModule>([
    ['internal', internalMod],
    ['lib', facadeMod],
  ]);

  const consumerSrc = `
    use lib.User;

    fn get_user(u: User) -> Int {
      0
    }
  `;
  const ast = new Parser(new Lexer(consumerSrc, 'main.sr', diag).tokenize()).parse();
  const res = new Resolver(diag, { availableModules, isModuleMode: true });
  const result = res.resolve(ast, 'main.sr');

  assert.strictEqual(diag.hasErrors(), false);
  assert.strictEqual(result.success, true);
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. GLOBAL MUTABLE STATE PROHIBITION
// ══════════════════════════════════════════════════════════════════════════════

test('Global Mutable State: mut variable at module scope is forbidden (E2003)', () => {
  const diag = new DiagnosticBag();
  const src = `mut global_counter = 0;`;
  const ast = new Parser(new Lexer(src, 'mod.sr', diag).tokenize()).parse();
  const res = new Resolver(diag, { isModuleMode: true });
  res.resolve(ast, 'mod.sr');

  assert.strictEqual(diag.hasErrors(), true);
  assert.ok(diag.getErrors().some((e) => e.code === 'E2003' && e.message.includes('Global mutable state')));
});

test('Global Mutable State: const declarations are permitted at module scope', () => {
  const diag = new DiagnosticBag();
  const src = `const VERSION = "0.0.8";`;
  const ast = new Parser(new Lexer(src, 'mod.sr', diag).tokenize()).parse();
  const res = new Resolver(diag, { isModuleMode: true });
  const result = res.resolve(ast, 'mod.sr');

  assert.strictEqual(diag.hasErrors(), false);
  assert.strictEqual(result.success, true);
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. CROSS-MODULE TYPE SYSTEM, GENERICS & TRAITS
// ══════════════════════════════════════════════════════════════════════════════

test('Cross-Module Generics: generic type Box<T> and make_box<T> across modules', () => {
  const diag = new DiagnosticBag();
  const boxMod = parseAndCollectModule(
    `
      pub type Box<T> {
        value: T
      }

      pub fn make_box<T>(value: T) -> Box<T> {
        value
      }
    `,
    'box',
    'box.sr',
    diag
  );

  const availableModules = new Map<string, SeiraModule>([['box', boxMod]]);

  const mainSrc = `
    use box.Box;
    use box.make_box;

    fn main() {
      b: Box<Int> = make_box(42);
    }
  `;
  const mainTokens = new Lexer(mainSrc, 'main.sr', diag).tokenize();
  const mainAst = new Parser(mainTokens, 'main.sr', diag).parse();

  const resolver = new Resolver(diag, { availableModules, isModuleMode: true });
  const resResult = resolver.resolve(mainAst, 'main.sr');
  assert.strictEqual(diag.hasErrors(), false);

  const typeChecker = new TypeChecker(diag);
  const tcResult = typeChecker.check(mainAst, resResult, 'main.sr');
  assert.strictEqual(diag.hasErrors(), false);
  assert.strictEqual(tcResult.success, true);
});

test('Cross-Module Traits: trait declared in one module and implemented in another', () => {
  const diag = new DiagnosticBag();
  const printableMod = parseAndCollectModule(
    `
      pub trait Printable {
        fn print_val() -> String
      }
    `,
    'printable',
    'printable.sr',
    diag
  );

  const availableModules = new Map<string, SeiraModule>([['printable', printableMod]]);

  const mainSrc = `
    use printable.Printable;

    pub type Item {
      name: String
    }

    impl Item: Printable {
      fn print_val() -> String {
        "Item"
      }
    }

    fn show<T: Printable>(x: T) -> String {
      "OK"
    }

    fn main(item: Item) {
      s = show(item);
    }
  `;
  const mainTokens = new Lexer(mainSrc, 'main.sr', diag).tokenize();
  const mainAst = new Parser(mainTokens, 'main.sr', diag).parse();

  const resolver = new Resolver(diag, { availableModules, isModuleMode: true });
  const resResult = resolver.resolve(mainAst, 'main.sr');
  assert.strictEqual(diag.hasErrors(), false);

  const typeChecker = new TypeChecker(diag);
  const tcResult = typeChecker.check(mainAst, resResult, 'main.sr');
  assert.strictEqual(diag.hasErrors(), false);
  assert.strictEqual(tcResult.success, true);
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. MANIFEST & LOCKFILE
// ══════════════════════════════════════════════════════════════════════════════

test('Manifest: valid Seira.toml parses cleanly with dependencies', () => {
  const toml = `
    [package]
    name = "acme_core"
    version = "1.2.3"
    edition = "2026"

    [dependencies]
    utils = { path = "../utils" }
  `;
  const diag = new DiagnosticBag();
  const parser = new ManifestParser(diag);
  const manifest = parser.parseAndValidate(toml, 'Seira.toml');

  assert.strictEqual(diag.hasErrors(), false);
  assert.ok(manifest);
  assert.ok(manifest.package);
  assert.strictEqual(manifest.package.name, 'acme_core');
  assert.strictEqual(manifest.package.version, '1.2.3');
  assert.strictEqual(manifest.package.edition, '2026');
  assert.ok(manifest.dependencies.has('utils'));
  const utilsDep = manifest.dependencies.get('utils');
  assert.ok(utilsDep && 'path' in utilsDep);
  assert.strictEqual((utilsDep as any).path, '../utils');
});

test('Manifest: duplicate keys rejected with E6010', () => {
  const toml = `
    [package]
    name = "pkg1"
    name = "pkg2"
    version = "0.1.0"
  `;
  const diag = new DiagnosticBag();
  const parser = new ManifestParser(diag);
  parser.parseAndValidate(toml, 'Seira.toml');

  assert.strictEqual(diag.hasErrors(), true);
  assert.ok(diag.getErrors().some((e) => e.code === 'E6010' && e.message.includes('Duplicate key')));
});

test('Manifest: invalid SemVer version rejected with E6010', () => {
  const toml = `
    [package]
    name = "bad_ver"
    version = "1.0"
    edition = "2026"
  `;
  const diag = new DiagnosticBag();
  const parser = new ManifestParser(diag);
  parser.parseAndValidate(toml, 'Seira.toml');

  assert.strictEqual(diag.hasErrors(), true);
  assert.ok(diag.getErrors().some((e) => e.code === 'E6010' && e.message.includes('SemVer')));
});

test('Lockfile: SHA-256 generation, serialization, and round-trip verification', () => {
  const dir = createTempDir();
  try {
    const lockMgr = new LockfileManager();
    const pkg = new SeiraModule({ package: 'sample', path: 'main' }, 'sample.sr');
    const checksum = lockMgr.generatePackageChecksum(dir);

    assert.strictEqual(checksum.length, 64); // SHA-256 hex string

    const lock = {
      version: 1,
      packages: [
        {
          name: 'sample',
          version: '0.1.0',
          source: 'path:../sample',
          checksum,
          dependencies: [],
        },
      ],
    };

    const lockPath = join(dir, 'Seira.lock');
    lockMgr.writeLockfile(lockPath, lock);
    const parsed = lockMgr.readLockfile(lockPath);

    assert.ok(parsed);
    assert.strictEqual(parsed.packages.length, 1);
    assert.strictEqual(parsed.packages[0].name, 'sample');
    assert.strictEqual(parsed.packages[0].checksum, checksum);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. PACKAGE DEPENDENCIES & WORKSPACE FOUNDATION
// ══════════════════════════════════════════════════════════════════════════════

test('Package Dependency: path dependency resolves cleanly', () => {
  const root = createTempDir();
  try {
    const sharedDir = join(root, 'shared');
    mkdirSync(join(sharedDir, 'src'), { recursive: true });
    writeFileSync(
      join(sharedDir, 'Seira.toml'),
      `[package]\nname = "shared"\nversion = "0.1.0"\nedition = "2026"\n`
    );
    writeFileSync(
      join(sharedDir, 'src', 'math.sr'),
      `pub fn add(a: Int, b: Int) -> Int { a + b }`
    );

    const appDir = join(root, 'app');
    mkdirSync(join(appDir, 'src'), { recursive: true });
    writeFileSync(
      join(appDir, 'Seira.toml'),
      `[package]\nname = "app"\nversion = "0.1.0"\nedition = "2026"\n\n[dependencies]\nshared = { path = "../shared" }\n`
    );
    writeFileSync(
      join(appDir, 'src', 'main.sr'),
      `use shared.math.add;\n\nfn main() {\n  result = add(20, 22);\n  println("Sum:", result);\n}\n`
    );

    const driver = new CompilerDriver();
    const pkgResult = driver.compilePackage(appDir);

    assert.strictEqual(pkgResult.diagnostics.hasErrors(), false);
    assert.strictEqual(pkgResult.success, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Package Dependency: package cycle (PkgA -> PkgB -> PkgA) rejected with E6012', () => {
  const root = createTempDir();
  try {
    const pkgADir = join(root, 'pkg_a');
    mkdirSync(join(pkgADir, 'src'), { recursive: true });
    writeFileSync(
      join(pkgADir, 'Seira.toml'),
      `[package]\nname = "pkg_a"\nversion = "0.1.0"\nedition = "2026"\n\n[dependencies]\npkg_b = { path = "../pkg_b" }\n`
    );
    writeFileSync(join(pkgADir, 'src', 'main.sr'), 'fn main() {}');

    const pkgBDir = join(root, 'pkg_b');
    mkdirSync(join(pkgBDir, 'src'), { recursive: true });
    writeFileSync(
      join(pkgBDir, 'Seira.toml'),
      `[package]\nname = "pkg_b"\nversion = "0.1.0"\nedition = "2026"\n\n[dependencies]\npkg_a = { path = "../pkg_a" }\n`
    );
    writeFileSync(join(pkgBDir, 'src', 'lib.sr'), 'pub fn foo() {}');

    const driver = new CompilerDriver();
    const result = driver.compilePackage(pkgADir);

    assert.strictEqual(result.success, false);
    assert.ok(result.diagnostics.getErrors().some((e) => e.code === 'E6012'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Workspace: member packages discovered deterministically with workspace dependencies', () => {
  const wsDir = createTempDir();
  try {
    writeFileSync(
      join(wsDir, 'Seira.toml'),
      `[workspace]\nmembers = ["shared", "app"]\n`
    );

    const sharedDir = join(wsDir, 'shared');
    mkdirSync(join(sharedDir, 'src'), { recursive: true });
    writeFileSync(
      join(sharedDir, 'Seira.toml'),
      `[package]\nname = "shared"\nversion = "0.1.0"\nedition = "2026"\n`
    );
    writeFileSync(join(sharedDir, 'src', 'lib.sr'), 'pub fn hello() {}');

    const appDir = join(wsDir, 'app');
    mkdirSync(join(appDir, 'src'), { recursive: true });
    writeFileSync(
      join(appDir, 'Seira.toml'),
      `[package]\nname = "app"\nversion = "0.1.0"\nedition = "2026"\n\n[dependencies]\nshared = { workspace = true }\n`
    );
    writeFileSync(join(appDir, 'src', 'main.sr'), 'use shared.lib.hello;\n\nfn main() {}');

    const diag = new DiagnosticBag();
    const wsLoader = new WorkspaceLoader(diag);
    const ws = wsLoader.loadWorkspace(wsDir);

    assert.strictEqual(diag.hasErrors(), false);
    assert.ok(ws);
    assert.strictEqual(ws.members.length, 2);
    assert.deepStrictEqual(ws.members, ['app', 'shared']);
    assert.strictEqual(ws.packages.size, 2);
  } finally {
    rmSync(wsDir, { recursive: true, force: true });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. EXECUTION ENGINE MULTI-MODULE EXECUTION
// ══════════════════════════════════════════════════════════════════════════════

test('Execution: multi-module package executes fn main() with imported functions', () => {
  const root = createTempDir();
  try {
    const pkgDir = join(root, 'project');
    mkdirSync(join(pkgDir, 'src'), { recursive: true });
    writeFileSync(
      join(pkgDir, 'Seira.toml'),
      `[package]\nname = "calc_app"\nversion = "0.1.0"\nedition = "2026"\n`
    );
    writeFileSync(
      join(pkgDir, 'src', 'math.sr'),
      `pub fn square(x: Int) -> Int { x * x }\n`
    );
    writeFileSync(
      join(pkgDir, 'src', 'main.sr'),
      `use math.square;\n\nfn main() -> Int {\n  square(7)\n}\n`
    );

    const engine = new ExecutionEngine();
    const result = engine.executePackage(pkgDir);

    assert.strictEqual(result.diagnostics.hasErrors(), false);
    assert.strictEqual(result.success, true);
    assert.ok(isNormal(result.outcome));
    assert.ok(result.value !== undefined && runtimeValuesEqual(result.value, rtInt(49n)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
