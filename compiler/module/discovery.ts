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

import { existsSync, lstatSync, readdirSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { DiagnosticBag } from '../diagnostics/index.ts';
import { createModuleId, isValidModulePath, normalizeModulePath } from './module_id.ts';
import { SeiraModule } from './module.ts';

export interface DiscoveredModuleInfo {
  readonly modulePath: string; // e.g. "http.client"
  readonly filePath: string;   // full filesystem path
  readonly isEntry: boolean;   // true for main or lib
}

function isWithinRoot(rootDir: string, targetPath: string): boolean {
  const relPath = relative(rootDir, targetPath);
  return relPath === "" || (!isAbsolute(relPath) && relPath !== ".." && !relPath.startsWith(".." + sep));
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

    const requestedRoot = resolve(sourceRoot);
    let rootStat;
    try {
      rootStat = lstatSync(requestedRoot);
    } catch {
      return modules;
    }

    if (rootStat.isSymbolicLink()) {
      this.diagnostics.reportError(
        "E6013",
        "Source root is a symbolic link: " + requestedRoot,
        { start: 0, end: 0, line: 1, column: 1 },
        requestedRoot,
        undefined,
        "Use a real source directory inside the package instead of a symbolic link."
      );
      return modules;
    }
    if (!rootStat.isDirectory()) return modules;

    const absRoot = realpathSync(requestedRoot);
    const discoveredList: DiscoveredModuleInfo[] = [];

    this.scanDirectory(absRoot, absRoot, discoveredList, new Set<string>());

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

    if (!isWithinRoot(absRoot, fullPath)) {
      this.diagnostics.reportError(
        'E6013',
        `Invalid module path '${relFilePath}': source file escapes package source root.`,
        { start: 0, end: 0, line: 1, column: 1 },
        fullPath
      );
      return null;
    }

    if (existsSync(fullPath)) {
      try {
        const fileStat = lstatSync(fullPath);
        if (fileStat.isSymbolicLink() || !isWithinRoot(realpathSync(absRoot), realpathSync(fullPath))) {
          this.diagnostics.reportError(
            "E6013",
            "Invalid module path: symbolic links and paths outside the source root are not allowed: " + relFilePath,
            { start: 0, end: 0, line: 1, column: 1 },
            fullPath,
            undefined,
            "Keep module files inside the package source root and avoid symbolic links."
          );
          return null;
        }
      } catch {
        this.diagnostics.reportError(
          "E6013",
          "Unable to validate module path: " + relFilePath,
          { start: 0, end: 0, line: 1, column: 1 },
          fullPath
        );
        return null;
      }
    }

    const isSr = fullPath.endsWith(".sr");
    const isSra = fullPath.endsWith(".sra");
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
    outList: DiscoveredModuleInfo[],
    visitedDirectories: Set<string>
  ): void {
    let canonicalDir: string;
    try {
      canonicalDir = realpathSync(currentDir);
    } catch {
      return;
    }

    if (!isWithinRoot(rootDir, canonicalDir)) {
      this.diagnostics.reportError(
        "E6013",
        "Directory resolves outside the source root: " + currentDir,
        { start: 0, end: 0, line: 1, column: 1 },
        currentDir
      );
      return;
    }

    if (visitedDirectories.has(canonicalDir)) return;
    visitedDirectories.add(canonicalDir);

    let entries: string[];
    try {
      entries = readdirSync(canonicalDir);
    } catch {
      return;
    }
    entries.sort();

    for (const entry of entries) {
      if (entry.startsWith(".") || entry === "node_modules") continue;

      const fullPath = resolve(canonicalDir, entry);
      let stat;
      try {
        // lstatSync is intentional: statSync follows links outside the source root.
        stat = lstatSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isSymbolicLink()) {
        this.diagnostics.reportError(
          "E6013",
          "Symbolic link is not allowed during module discovery: " + fullPath,
          { start: 0, end: 0, line: 1, column: 1 },
          fullPath,
          undefined,
          "Replace the symbolic link with a regular file or directory inside the source root."
        );
        continue;
      }

      if (stat.isDirectory()) {
        this.scanDirectory(fullPath, rootDir, outList, visitedDirectories);
      } else if (stat.isFile()) {
        const isSr = entry.endsWith(".sr");
        const isSra = entry.endsWith(".sra");
        if (!isSr && !isSra) continue;

        let canonicalFile: string;
        try {
          canonicalFile = realpathSync(fullPath);
        } catch {
          continue;
        }
        if (!isWithinRoot(rootDir, canonicalFile)) {
          this.diagnostics.reportError(
            "E6013",
            "Source file escapes package source root: " + fullPath,
            { start: 0, end: 0, line: 1, column: 1 },
            fullPath
          );
          continue;
        }

        const relPath = relative(rootDir, canonicalFile);
        const ext = isSr ? ".sr" : ".sra";
        const withoutExt = relPath.slice(0, -ext.length);
        const modulePath = normalizeModulePath(withoutExt);

        if (!isValidModulePath(modulePath)) {
          this.diagnostics.reportError(
            "E6013",
            "Invalid module path '" + modulePath + "' derived from '" + relPath + "'.",
            { start: 0, end: 0, line: 1, column: 1 },
            fullPath,
            undefined,
            "Module path segments must be valid identifiers without path traversal ('..')."
          );
          continue;
        }

        const isEntry = modulePath === "main" || modulePath === "lib";
        outList.push({ modulePath, filePath: canonicalFile, isEntry });
      }
    }
  }
}
