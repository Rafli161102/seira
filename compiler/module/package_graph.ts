/**
 * Seira Package Dependency Graph & Cycle Detection
 *
 * Resolves package dependencies, detects cycles, and yields a deterministic
 * topological package compilation order.
 *
 * Emits:
 * - E6009: Package not found
 * - E6012: Cyclic package dependency detected
 * - E6014: Duplicate package
 */

import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { DiagnosticBag, type Span } from '../diagnostics/index.ts';
import { PackageLoader, SeiraPackage } from './package.ts';

export class PackageGraph {
  private readonly loader: PackageLoader;
  private readonly diagnostics: DiagnosticBag;
  public readonly packages = new Map<string, SeiraPackage>();
  public readonly workspacePackages = new Map<string, SeiraPackage>();

  constructor(diagnostics?: DiagnosticBag, workspacePackages?: Map<string, SeiraPackage>) {
    this.diagnostics = diagnostics ?? new DiagnosticBag();
    this.loader = new PackageLoader(this.diagnostics);
    if (workspacePackages) {
      for (const [k, v] of workspacePackages.entries()) {
        this.workspacePackages.set(k, v);
      }
    }
  }

  /**
   * Resolves a package and all of its transitive dependencies.
   * Returns packages in topological order (dependencies first).
   */
  public resolvePackage(rootPkgDir: string): SeiraPackage[] {
    const rootPkg = this.loader.loadPackage(rootPkgDir);
    if (!rootPkg) {
      return [];
    }

    this.packages.set(rootPkg.name, rootPkg);

    // Recursively discover dependencies
    this.discoverDependencies(rootPkg);

    // Check for package cycles and topological sort
    return this.resolveOrder(rootPkg.name);
  }

  private discoverDependencies(pkg: SeiraPackage): void {
    for (const [depName, spec] of pkg.dependencies.entries()) {
      if (this.packages.has(depName)) {
        continue;
      }

      let depDir: string | undefined;

      if (spec.kind === 'path') {
        depDir = isAbsolute(spec.path) ? spec.path : resolve(pkg.rootDir, spec.path);
      } else if (spec.kind === 'workspace') {
        const wsPkg = this.workspacePackages.get(depName);
        if (wsPkg) {
          this.packages.set(depName, wsPkg);
          this.discoverDependencies(wsPkg);
          continue;
        } else {
          this.diagnostics.reportError(
            'E6009',
            `Workspace dependency '${depName}' requested by package '${pkg.name}' not found in workspace members.`,
            { start: 0, end: 0, line: 1, column: 1 },
            join(pkg.rootDir, 'Seira.toml')
          );
          continue;
        }
      } else {
        // Version string without path/workspace - standard library or external registry
        if (depName === 'std') {
          const stdCandidates = [
            resolve(pkg.rootDir, 'std'),
            resolve(pkg.rootDir, '../std'),
            resolve(pkg.rootDir, '../../std'),
            resolve(process.cwd(), 'std'),
          ];
          for (const cand of stdCandidates) {
            if (existsSync(join(cand, 'Seira.toml'))) {
              depDir = cand;
              break;
            }
          }
        }
        if (!depDir) {
          continue;
        }
      }

      if (!depDir || !existsSync(depDir)) {
        this.diagnostics.reportError(
          'E6009',
          `Package dependency '${depName}' not found at path '${depDir}'.`,
          { start: 0, end: 0, line: 1, column: 1 },
          join(pkg.rootDir, 'Seira.toml'),
          undefined,
          `Check that the path for dependency '${depName}' exists and contains a valid 'Seira.toml'.`
        );
        continue;
      }

      const depPkg = this.loader.loadPackage(depDir);
      if (depPkg) {
        if (this.packages.has(depPkg.name) && depPkg.name !== depName) {
          this.diagnostics.reportError(
            'E6014',
            `Duplicate package name '${depPkg.name}' discovered at '${depDir}'.`,
            { start: 0, end: 0, line: 1, column: 1 },
            join(pkg.rootDir, 'Seira.toml')
          );
        }
        this.packages.set(depName, depPkg);
        this.discoverDependencies(depPkg);
      }
    }
  }

  public resolveOrder(rootName: string): SeiraPackage[] {
    const sorted: SeiraPackage[] = [];
    const visited = new Map<string, 'unvisited' | 'visiting' | 'visited'>();

    for (const name of this.packages.keys()) {
      visited.set(name, 'unvisited');
    }

    const packageNames = Array.from(this.packages.keys()).sort();
    for (const name of packageNames) {
      if (visited.get(name) === 'unvisited') {
        const stack: string[] = [];
        this.dfs(name, visited, stack, sorted);
      }
    }

    return sorted;
  }

  private dfs(
    current: string,
    visited: Map<string, 'unvisited' | 'visiting' | 'visited'>,
    stack: string[],
    sorted: SeiraPackage[]
  ): void {
    visited.set(current, 'visiting');
    stack.push(current);

    const pkg = this.packages.get(current);
    if (!pkg) {
      visited.set(current, 'visited');
      stack.pop();
      return;
    }

    const depNames = Array.from(pkg.dependencies.keys()).sort();

    for (const dep of depNames) {
      if (!this.packages.has(dep)) continue;

      const state = visited.get(dep);
      if (state === 'visiting') {
        const cycleStartIndex = stack.indexOf(dep);
        const cyclePath = stack.slice(cycleStartIndex).concat(dep);
        const cycleStr = cyclePath.join(' -> ');

        this.diagnostics.reportError(
          'E6012',
          `Cyclic package dependency detected: ${cycleStr}`,
          { start: 0, end: 0, line: 1, column: 1 },
          join(pkg.rootDir, 'Seira.toml'),
          undefined,
          `Package '${current}' depends on '${dep}', which leads back to '${current}'. Seira forbids circular package dependencies.`
        );
      } else if (state === 'unvisited') {
        this.dfs(dep, visited, stack, sorted);
      }
    }

    visited.set(current, 'visited');
    stack.pop();
    sorted.push(pkg);
  }
}
