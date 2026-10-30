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

import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
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
          if (/^\s*\[workspace\]\s*(?:#.*)?$/m.test(content)) {
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
    const realWorkspaceRoot = realpathSync(absDir);

    for (const member of members) {
      if (isAbsolute(member)) {
        this.diagnostics.reportError(
          "E6013",
          "Workspace member must be a relative path inside the workspace: " + member,
          { start: 0, end: 0, line: 1, column: 1 },
          manifestPath
        );
        continue;
      }

      const memberDir = resolve(absDir, member);
      const relativeMember = relative(absDir, memberDir);
      if (
        relativeMember === "" ||
        relativeMember === ".." ||
        relativeMember.startsWith(".." + sep) ||
        isAbsolute(relativeMember)
      ) {
        this.diagnostics.reportError(
          "E6013",
          "Workspace member escapes the workspace root: " + member,
          { start: 0, end: 0, line: 1, column: 1 },
          manifestPath,
          undefined,
          "Use a relative member path that stays inside the workspace directory."
        );
        continue;
      }

      if (!existsSync(memberDir)) {
        this.diagnostics.reportError(
          "E6009",
          "Workspace member directory not found: " + memberDir,
          { start: 0, end: 0, line: 1, column: 1 },
          manifestPath
        );
        continue;
      }

      try {
        const memberStat = lstatSync(memberDir);
        const realMemberDir = realpathSync(memberDir);
        const realRelativeMember = relative(realWorkspaceRoot, realMemberDir);
        if (
          memberStat.isSymbolicLink() ||
          realRelativeMember === "" ||
          realRelativeMember === ".." ||
          realRelativeMember.startsWith(".." + sep) ||
          isAbsolute(realRelativeMember)
        ) {
          this.diagnostics.reportError(
            "E6013",
            "Workspace member is outside the workspace or uses a symbolic link: " + member,
            { start: 0, end: 0, line: 1, column: 1 },
            manifestPath,
            undefined,
            "Workspace members must be real directories contained by the workspace root."
          );
          continue;
        }
      } catch {
        this.diagnostics.reportError(
          "E6009",
          "Unable to access workspace member directory: " + member,
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
