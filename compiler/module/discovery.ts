/**
 * Seira Deterministic Module Discovery
 *
 * Scans a package source directory (e.g. `src/`) and maps filesystem paths to Seira modules.
 * Enforces:
 * - Deterministic lexicographical ordering
 * - Valid Seira source extension (.sr primary, .sra fallback)
 * - Source root boundary constraints (rejects traversal outside root: E6013)
 * - Duplicate module identity rejection (E6003)
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, normalize, relative, resolve } from 'node:path';
import { DiagnosticBag } from '../diagnostics/index.ts';
import { createModuleId, isValidModulePath, normalizeModulePath } from './module_id.ts';
import { SeiraModule } from './module.ts';

export interface DiscoveredModuleInfo {
  readonly modulePath: string; // e.g. "http.client"
  readonly filePath: string;   // full filesystem path
  readonly isEntry: boolean;   // true for main or lib
}

export class ModuleDiscovery {
  private readonly diagnostics: DiagnosticBag;

  constructor(diagnostics?: DiagnosticBag) {
    this.diagnostics = diagnostics ?? new DiagnosticBag();
  }

  /**
   * Discovers all Seira modules inside the given source root directory.
   */
  public discoverModules(
    packageName: string,
    sourceRoot: string
  ): Map<string, SeiraModule> {
    const modules = new Map<string, SeiraModule>();
    if (!existsSync(sourceRoot)) {
      return modules;
    }

    const absRoot = resolve(sourceRoot);
    const discoveredList: DiscoveredModuleInfo[] = [];

    this.scanDirectory(absRoot, absRoot, discoveredList);

    // Sort deterministically by modulePath to ensure platform-independent ordering
    discoveredList.sort((a, b) => a.modulePath.localeCompare(b.modulePath));

    for (const info of discoveredList) {
      if (modules.has(info.modulePath)) {
        // E6003: Duplicate module
        this.diagnostics.reportError(
          'E6003',
          `Duplicate module '${info.modulePath}' discovered in package '${packageName}'.`,
          { start: 0, end: 0, line: 1, column: 1 },
          info.filePath,
          undefined,
          `Module '${info.modulePath}' is already defined at '${modules.get(info.modulePath)!.filePath}'.`
        );
        continue;
      }

      const id = createModuleId(packageName, info.modulePath);
      const mod = new SeiraModule(id, info.filePath, info.isEntry);
      modules.set(info.modulePath, mod);
    }

    return modules;
  }

  /**
   * Validates and creates a module from a relative path within or outside source root.
   * Reports E6013 if the path escapes the source root or has invalid segments.
   */
  public createModuleFromRelativePath(
    packageName: string,
    relFilePath: string,
    rootDir: string
  ): SeiraModule | null {
    const absRoot = resolve(rootDir);
    const fullPath = resolve(absRoot, relFilePath);
    const relFromRoot = relative(absRoot, fullPath);

    if (relFromRoot.startsWith('..') || isAbsolute(relFromRoot)) {
      this.diagnostics.reportError(
        'E6013',
        `Invalid module path '${relFilePath}': source file escapes package source root.`,
        { start: 0, end: 0, line: 1, column: 1 },
        fullPath
      );
      return null;
    }

    const isSr = fullPath.endsWith('.sr');
    const isSra = fullPath.endsWith('.sra');
    if (!isSr && !isSra) return null;

    const ext = isSr ? '.sr' : '.sra';
    const withoutExt = relFromRoot.slice(0, -ext.length);
    const modulePath = normalizeModulePath(withoutExt);

    if (!isValidModulePath(modulePath)) {
      this.diagnostics.reportError(
        'E6013',
        `Invalid module path '${modulePath}' derived from '${relFilePath}'.`,
        { start: 0, end: 0, line: 1, column: 1 },
        fullPath,
        undefined,
        "Module path segments must be valid identifiers without path traversal ('..')."
      );
      return null;
    }

    const isEntry = modulePath === 'main' || modulePath === 'lib';
    const id = createModuleId(packageName, modulePath);
    return new SeiraModule(id, fullPath, isEntry);
  }

  private scanDirectory(
    currentDir: string,
    rootDir: string,
    outList: DiscoveredModuleInfo[]
  ): void {
    let entries: string[];
    try {
      entries = readdirSync(currentDir);
    } catch {
      return;
    }

    // Sort entries to avoid OS-level readdir randomness
    entries.sort();

    for (const entry of entries) {
      if (entry.startsWith('.') || entry === 'node_modules') continue;

      const fullPath = resolve(currentDir, entry);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        this.scanDirectory(fullPath, rootDir, outList);
      } else if (stat.isFile()) {
        const isSr = entry.endsWith('.sr');
        const isSra = entry.endsWith('.sra');
        if (!isSr && !isSra) continue;

        // Verify that path does not escape root
        const relPath = relative(rootDir, fullPath);
        if (relPath.startsWith('..') || isAbsolute(relPath)) {
          this.diagnostics.reportError(
            'E6013',
            `Invalid module path '${fullPath}': source file escapes package source root.`,
            { start: 0, end: 0, line: 1, column: 1 },
            fullPath
          );
          continue;
        }

        // Strip extension
        const ext = isSr ? '.sr' : '.sra';
        const withoutExt = relPath.slice(0, -ext.length);
        const modulePath = normalizeModulePath(withoutExt);

        if (!isValidModulePath(modulePath)) {
          this.diagnostics.reportError(
            'E6013',
            `Invalid module path '${modulePath}' derived from '${relPath}'.`,
            { start: 0, end: 0, line: 1, column: 1 },
            fullPath,
            undefined,
            "Module path segments must be valid identifiers without path traversal ('..')."
          );
          continue;
        }

        const isEntry = modulePath === 'main' || modulePath === 'lib';
        outList.push({
          modulePath,
          filePath: fullPath,
          isEntry,
        });
      }
    }
  }
}
