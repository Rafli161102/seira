/**
 * Seira Workspace Foundation
 *
 * Implements workspace discovery, member management, and workspace dependency resolution:
 * workspace/
 * ├── Seira.toml ([workspace] members = ["app", "server", "shared"])
 * ├── app/
 * ├── server/
 * └── shared/
 */

import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { DiagnosticBag } from '../diagnostics/index.ts';
import { ManifestParser, type WorkspaceSection } from './manifest.ts';
import { PackageLoader, SeiraPackage } from './package.ts';
import { PackageGraph } from './package_graph.ts';

export class SeiraWorkspace {
  public readonly rootDir: string;
  public readonly manifestPath: string;
  public readonly members: string[];
  public readonly packages = new Map<string, SeiraPackage>();

  constructor(rootDir: string, manifestPath: string, members: string[]) {
    this.rootDir = rootDir;
    this.manifestPath = manifestPath;
    this.members = members;
  }
}

export class WorkspaceLoader {
  private readonly diagnostics: DiagnosticBag;

  constructor(diagnostics?: DiagnosticBag) {
    this.diagnostics = diagnostics ?? new DiagnosticBag();
  }

  /**
   * Attempts to discover and load a workspace starting at `dir` or its ancestors.
   */
  public findWorkspaceRoot(startDir: string): string | null {
    let curr = resolve(startDir);
    while (true) {
      const manifest = join(curr, 'Seira.toml');
      if (existsSync(manifest)) {
        try {
          const content = readFileSync(manifest, 'utf-8');
          if (content.includes('[workspace]')) {
            return curr;
          }
        } catch {
          // ignore read error
        }
      }
      const parent = resolve(curr, '..');
      if (parent === curr) break;
      curr = parent;
    }
    return null;
  }

  /**
   * Loads a workspace from its root directory.
   */
  public loadWorkspace(workspaceDir: string): SeiraWorkspace | null {
    const absDir = resolve(workspaceDir);
    const manifestPath = join(absDir, 'Seira.toml');

    if (!existsSync(manifestPath)) {
      return null;
    }

    const content = readFileSync(manifestPath, 'utf-8');
    const parser = new ManifestParser(this.diagnostics);
    const manifest = parser.parseAndValidate(content, manifestPath);

    if (!manifest || !manifest.workspace) {
      return null;
    }

    const members = [...manifest.workspace.members].sort();
    const ws = new SeiraWorkspace(absDir, manifestPath, members);
    const loader = new PackageLoader(this.diagnostics);

    for (const member of members) {
      const memberDir = isAbsolute(member) ? member : resolve(absDir, member);
      if (!existsSync(memberDir)) {
        this.diagnostics.reportError(
          'E6009',
          `Workspace member directory '${member}' not found at '${memberDir}'.`,
          { start: 0, end: 0, line: 1, column: 1 },
          manifestPath
        );
        continue;
      }

      const pkg = loader.loadPackage(memberDir);
      if (pkg) {
        if (ws.packages.has(pkg.name)) {
          this.diagnostics.reportError(
            'E6014',
            `Duplicate package name '${pkg.name}' discovered in workspace at '${memberDir}'.`,
            { start: 0, end: 0, line: 1, column: 1 },
            manifestPath
          );
        }
        ws.packages.set(pkg.name, pkg);
      }
    }

    return ws;
  }
}
