/**
 * Seira Package Representation & Loader
 *
 * Represents a Seira package unit with manifest, source root, modules, and entry point.
 */

import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { DiagnosticBag } from '../diagnostics/index.ts';
import { ModuleDiscovery } from './discovery.ts';
import { ManifestParser, type DependencySpec, type PackageManifest } from './manifest.ts';
import type { SeiraModule } from './module.ts';

export class SeiraPackage {
  public readonly name: string;
  public readonly version: string;
  public readonly edition: string;
  public readonly rootDir: string;
  public readonly srcDir: string;
  public readonly manifest: PackageManifest;
  public readonly modules = new Map<string, SeiraModule>();
  public entryModule?: SeiraModule;
  public readonly dependencies = new Map<string, DependencySpec>();

  constructor(
    name: string,
    version: string,
    edition: string,
    rootDir: string,
    srcDir: string,
    manifest: PackageManifest
  ) {
    this.name = name;
    this.version = version;
    this.edition = edition;
    this.rootDir = rootDir;
    this.srcDir = srcDir;
    this.manifest = manifest;
  }
}

export class PackageLoader {
  private readonly diagnostics: DiagnosticBag;

  constructor(diagnostics?: DiagnosticBag) {
    this.diagnostics = diagnostics ?? new DiagnosticBag();
  }

  public static load(pkgDir: string, diagnostics?: DiagnosticBag): SeiraPackage | null {
    const loader = new PackageLoader(diagnostics);
    return loader.loadPackage(pkgDir);
  }

  /**
   * Loads a Seira package from its root directory containing `Seira.toml`.
   */
  public loadPackage(pkgDir: string): SeiraPackage | null {
    const absDir = resolve(pkgDir);
    const manifestPath = join(absDir, 'Seira.toml');

    if (!existsSync(manifestPath)) {
      this.diagnostics.reportError(
        'E6009',
        `Package manifest not found at '${manifestPath}'.`,
        { start: 0, end: 0, line: 1, column: 1 },
        manifestPath,
        undefined,
        "Every Seira package must contain a 'Seira.toml' in its root directory."
      );
      return null;
    }

    const manifestContent = readFileSync(manifestPath, 'utf-8');
    const parser = new ManifestParser(this.diagnostics);
    const manifest = parser.parseAndValidate(manifestContent, manifestPath);

    if (!manifest || !manifest.package) {
      return null;
    }

    const srcDir = join(absDir, 'src');
    const pkg = new SeiraPackage(
      manifest.package.name,
      manifest.package.version,
      manifest.package.edition,
      absDir,
      srcDir,
      manifest
    );

    // Copy dependencies
    for (const [depName, spec] of manifest.dependencies.entries()) {
      pkg.dependencies.set(depName, spec);
    }

    // Discover modules inside src/ (or rootDir if src/ doesn't exist)
    const discovery = new ModuleDiscovery(this.diagnostics);
    const effectiveSrc = existsSync(srcDir) ? srcDir : absDir;
    const discovered = discovery.discoverModules(pkg.name, effectiveSrc);

    for (const [path, mod] of discovered.entries()) {
      pkg.modules.set(path, mod);
    }

    // Locate entry module: convention main.sr / main.sra, fallback lib.sr / lib.sra
    pkg.entryModule = pkg.modules.get('main') ?? pkg.modules.get('lib');

    return pkg;
  }
}
