import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { DiagnosticBag } from "../../../compiler/diagnostics/index.ts";
import {
  LockfileManager,
  ModuleDiscovery,
  WorkspaceLoader,
} from "../../../compiler/module/index.ts";
import { ExecutionEngine } from "../../../runtime/execution/engine.ts";
import { isNormal } from "../../../runtime/execution/outcomes.ts";
import { rtInt, runtimeValuesEqual } from "../../../runtime/execution/values.ts";

function createTempDir(prefix = "seira_hardening_"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function createPackage(root: string, name: string, sourceFiles: Record<string, string>): void {
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(
    join(root, "Seira.toml"),
    '[package]\nname = "' + name + '"\nversion = "0.1.0"\nedition = "2026"\n'
  );
  for (const [relativePath, source] of Object.entries(sourceFiles)) {
    const filePath = join(root, "src", relativePath);
    mkdirSync(join(filePath, ".."), { recursive: true });
    writeFileSync(filePath, source);
  }
}

test("Module discovery rejects symbolic links and does not follow directory cycles", (t) => {
  const root = createTempDir();
  const outside = createTempDir();
  try {
    const sourceRoot = join(root, "src");
    mkdirSync(sourceRoot, { recursive: true });
    writeFileSync(join(outside, "external.sr"), "pub fn external() {}");
    writeFileSync(join(sourceRoot, "main.sr"), "fn main() {}");

    try {
      symlinkSync(join(outside, "external.sr"), join(sourceRoot, "external.sr"), "file");
      symlinkSync(sourceRoot, join(sourceRoot, "loop"), "dir");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EPERM" || code === "EACCES" || code === "ENOTSUP" || code === "EINVAL") {
        t.skip("Symbolic links are not permitted by this operating system/user.");
        return;
      }
      throw error;
    }

    const diagnostics = new DiagnosticBag();
    const modules = new ModuleDiscovery(diagnostics).discoverModules("sample", sourceRoot);

    assert.equal(modules.has("main"), true);
    assert.equal(modules.has("external"), false);
    assert.ok(diagnostics.getErrors().some((diagnostic) => diagnostic.code === "E6013"));
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("Workspace loader rejects members that traverse outside the workspace root", () => {
  const root = createTempDir();
  const outside = createTempDir();
  try {
    writeFileSync(join(root, "Seira.toml"), '[workspace]\nmembers = ["../outside"]\n');
    createPackage(outside, "outside", { "lib.sr": "pub fn value() -> Int { 1 }" });

    const diagnostics = new DiagnosticBag();
    const workspace = new WorkspaceLoader(diagnostics).loadWorkspace(root);

    assert.ok(workspace);
    assert.equal(workspace.packages.size, 0);
    assert.ok(diagnostics.getErrors().some((diagnostic) => diagnostic.code === "E6013"));
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("Compiler driver resolves workspace dependencies when compiling a member package", () => {
  const root = createTempDir();
  const engine = new ExecutionEngine();
  try {
    writeFileSync(join(root, "Seira.toml"), '[workspace]\nmembers = ["shared", "app"]\n');

    const sharedDir = join(root, "shared");
    createPackage(sharedDir, "shared", {
      "lib.sr": "pub fn add_one(value: Int) -> Int { value + 1 }",
    });

    const appDir = join(root, "app");
    createPackage(appDir, "app", {
      "main.sr": "use shared.lib.add_one;\nfn main() -> Int { add_one(41) }",
    });
    writeFileSync(
      join(appDir, "Seira.toml"),
      '[package]\nname = "app"\nversion = "0.1.0"\nedition = "2026"\n\n[dependencies]\nshared = { workspace = true }\n'
    );

    const result = engine.executePackage(appDir);
    assert.equal(result.success, true, result.diagnostics.format());
    assert.ok(isNormal(result.outcome));
    assert.ok(result.value && runtimeValuesEqual(result.value, rtInt(42n)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Package-scoped module graphs preserve equal module paths from different dependencies", () => {
  const root = createTempDir();
  const engine = new ExecutionEngine();
  try {
    const firstDir = join(root, "first");
    createPackage(firstDir, "first", {
      "utils.sr": "pub fn first_value() -> Int { 1 }",
    });

    const secondDir = join(root, "second");
    createPackage(secondDir, "second", {
      "utils.sr": "pub fn second_value() -> Int { 2 }",
    });

    const appDir = join(root, "app");
    createPackage(appDir, "app", {
      "main.sr": "use first.utils.first_value;\nuse second.utils.second_value;\nfn main() -> Int { first_value() + second_value() }",
    });
    writeFileSync(
      join(appDir, "Seira.toml"),
      '[package]\nname = "app"\nversion = "0.1.0"\nedition = "2026"\n\n[dependencies]\nfirst = { path = "../first" }\nsecond = { path = "../second" }\n'
    );

    const result = engine.executePackage(appDir);
    assert.equal(result.success, true, result.diagnostics.format());
    assert.ok(isNormal(result.outcome));
    assert.ok(result.value && runtimeValuesEqual(result.value, rtInt(3n)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Lockfile checksum is independent of absolute checkout path and detects content changes", () => {
  const firstRoot = createTempDir();
  const secondRoot = createTempDir();
  try {
    for (const root of [firstRoot, secondRoot]) {
      writeFileSync(join(root, "Seira.toml"), '[package]\nname = "stable"\nversion = "0.1.0"\nedition = "2026"\n');
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(join(root, "src", "main.sr"), "fn main() -> Int { 42 }");
    }

    const lockfile = new LockfileManager();
    const checksum = lockfile.computePackageChecksum(firstRoot);
    assert.equal(checksum, lockfile.computePackageChecksum(secondRoot));
    assert.equal(lockfile.verifyPackageChecksum(firstRoot, checksum), true);

    writeFileSync(join(firstRoot, "src", "main.sr"), "fn main() -> Int { 43 }");
    assert.equal(lockfile.verifyPackageChecksum(firstRoot, checksum), false);
  } finally {
    rmSync(firstRoot, { recursive: true, force: true });
    rmSync(secondRoot, { recursive: true, force: true });
  }
});

test("Lockfile parser preserves format version and dependency arrays and rejects incomplete entries", () => {
  const lockfile = new LockfileManager();
  const lock = {
    version: 2,
    packages: [{
      name: "shared package",
      version: "0.1.0",
      source: 'path:../shared "quoted"',
      checksum: "a".repeat(64),
      dependencies: ["alpha", "beta"],
    }],
  };

  const parsed = lockfile.parse(lockfile.serialize(lock));
  assert.deepEqual(parsed, lock);
  assert.throws(
    () => lockfile.parse('version = 1\n\n[[package]]\nname = "broken"\nversion = "0.1.0"\n'),
    /incomplete/i
  );
  assert.throws(() => lockfile.parse("version = nope"), /version/i);
});
