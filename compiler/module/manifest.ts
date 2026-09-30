/**
 * Seira Package Manifest (Seira.toml) Parser & Validator
 *
 * Implements strict manifest parsing adhering to 0.0.8-s requirements:
 * - [package] section (name, version, edition)
 * - [dependencies] section (path, workspace, version string)
 * - [workspace] section (members)
 * - Duplicate field detection (E6010)
 * - SemVer 2.x version validation (E6010)
 * - Structured diagnostics (E6010, E6011) with source spans
 */

import { existsSync, readFileSync } from 'node:fs';
import { DiagnosticBag, type Span } from '../diagnostics/index.ts';

export interface PathDependency {
  readonly kind: 'path';
  readonly path: string;
}

export interface WorkspaceDependency {
  readonly kind: 'workspace';
  readonly workspace: true;
}

export interface VersionDependency {
  readonly kind: 'version';
  readonly version: string;
}

export type DependencySpec = PathDependency | WorkspaceDependency | VersionDependency;

export interface PackageSection {
  readonly name: string;
  readonly version: string;
  readonly edition: string;
  readonly authors?: string[];
  readonly license?: string;
  readonly description?: string;
}

export interface WorkspaceSection {
  readonly members: string[];
}

export interface PackageManifest {
  readonly package?: PackageSection;
  readonly dependencies: Map<string, DependencySpec>;
  readonly workspace?: WorkspaceSection;
  readonly rawData: Record<string, any>;
}

const SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
const PACKAGE_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

export class ManifestParser {
  private readonly diagnostics: DiagnosticBag;

  constructor(diagnostics?: DiagnosticBag) {
    this.diagnostics = diagnostics ?? new DiagnosticBag();
  }

  public parseAndValidate(content: string, filePath: string): PackageManifest | null {
    const lines = content.split(/\r?\n/);
    const sections = new Map<string, Map<string, { value: any; line: number; col: number }>>();
    const seenSections = new Set<string>();

    let currentSectionName = 'root';
    sections.set('root', new Map());

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const lineNum = lineIdx + 1;
      const rawLine = lines[lineIdx];
      const trimmed = rawLine.trim();

      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Section header: [section] or [[array_section]]
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        const isArraySection = trimmed.startsWith('[[') && trimmed.endsWith(']]');
        const header = isArraySection ? trimmed.slice(2, -2).trim() : trimmed.slice(1, -1).trim();

        if (!isArraySection) {
          if (seenSections.has(header)) {
            const col = rawLine.indexOf('[');
            this.diagnostics.reportError(
              'E6010',
              `Duplicate section '[${header}]' in manifest.`,
              { start: 0, end: 0, line: lineNum, column: col + 1 },
              filePath,
              undefined,
              `The section '[${header}]' was defined more than once in this manifest.`
            );
          }
          seenSections.add(header);
        }

        currentSectionName = header;
        if (!sections.has(currentSectionName)) {
          sections.set(currentSectionName, new Map());
        }
        continue;
      }

      // Key = Value
      const eqIdx = rawLine.indexOf('=');
      if (eqIdx === -1) {
        this.diagnostics.reportError(
          'E6010',
          `Malformed manifest syntax: expected 'key = value', but found '${trimmed}'.`,
          { start: 0, end: 0, line: lineNum, column: 1 },
          filePath
        );
        continue;
      }

      const rawKey = rawLine.slice(0, eqIdx).trim();
      const rawVal = rawLine.slice(eqIdx + 1).trim();
      const keyCol = rawLine.indexOf(rawKey) + 1;

      const currentSecMap = sections.get(currentSectionName)!;
      if (currentSecMap.has(rawKey)) {
        this.diagnostics.reportError(
          'E6010',
          `Duplicate key '${rawKey}' in section '[${currentSectionName}]'.`,
          { start: 0, end: 0, line: lineNum, column: keyCol },
          filePath,
          undefined,
          `The key '${rawKey}' was defined more than once in section '[${currentSectionName}]'.`
        );
        continue;
      }

      // Parse value
      const parsedVal = this.parseValue(rawVal, lineNum, eqIdx + 1, filePath);
      currentSecMap.set(rawKey, {
        value: parsedVal,
        line: lineNum,
        col: keyCol,
      });
    }

    // Now validate semantic sections
    return this.validateSemantics(sections, filePath);
  }

  private parseValue(raw: string, line: number, col: number, filePath: string): any {
    // String
    if (raw.startsWith('"') && raw.endsWith('"')) {
      return raw.slice(1, -1);
    }
    if (raw.startsWith("'") && raw.endsWith("'")) {
      return raw.slice(1, -1);
    }

    // Boolean
    if (raw === 'true') return true;
    if (raw === 'false') return false;

    // Number
    if (/^-?\d+$/.test(raw)) {
      return parseInt(raw, 10);
    }

    // Inline Array: ["a", "b"]
    if (raw.startsWith('[') && raw.endsWith(']')) {
      const inner = raw.slice(1, -1).trim();
      if (!inner) return [];
      return inner.split(',').map((item) => {
        const s = item.trim();
        return s.replace(/^["']|["']$/g, '');
      });
    }

    // Inline Table: { path = "../foo", workspace = true }
    if (raw.startsWith('{') && raw.endsWith('}')) {
      const inner = raw.slice(1, -1).trim();
      const obj: Record<string, any> = {};
      if (!inner) return obj;

      const pairs = inner.split(',');
      for (const pair of pairs) {
        const pEq = pair.indexOf('=');
        if (pEq !== -1) {
          const k = pair.slice(0, pEq).trim();
          const v = pair.slice(pEq + 1).trim();
          if (v.startsWith('"') && v.endsWith('"')) {
            obj[k] = v.slice(1, -1);
          } else if (v === 'true') {
            obj[k] = true;
          } else if (v === 'false') {
            obj[k] = false;
          } else {
            obj[k] = v;
          }
        }
      }
      return obj;
    }

    return raw;
  }

  private validateSemantics(
    sections: Map<string, Map<string, { value: any; line: number; col: number }>>,
    filePath: string
  ): PackageManifest | null {
    let hasError = false;

    // Check [package]
    const pkgSec = sections.get('package');
    const wsSec = sections.get('workspace');

    if (!pkgSec && !wsSec) {
      this.diagnostics.reportError(
        'E6010',
        "Invalid package manifest: missing '[package]' section (or '[workspace]').",
        { start: 0, end: 0, line: 1, column: 1 },
        filePath,
        undefined,
        "Every Seira package manifest must define a '[package]' section with name, version, and edition."
      );
      return null;
    }

    let parsedPackage: PackageSection | undefined;
    if (pkgSec) {
      // 1. Name
      const nameEntry = pkgSec.get('name');
      if (!nameEntry || typeof nameEntry.value !== 'string' || !nameEntry.value.trim()) {
        this.diagnostics.reportError(
          'E6010',
          "Missing required field 'name' in '[package]'.",
          { start: 0, end: 0, line: nameEntry?.line ?? 1, column: nameEntry?.col ?? 1 },
          filePath
        );
        hasError = true;
      } else if (!PACKAGE_NAME_REGEX.test(nameEntry.value)) {
        this.diagnostics.reportError(
          'E6010',
          `Invalid package name '${nameEntry.value}'. Package names must contain only alphanumeric characters, dashes, and underscores.`,
          { start: 0, end: 0, line: nameEntry.line, column: nameEntry.col },
          filePath
        );
        hasError = true;
      }

      // 2. Version (SemVer 2.x)
      const versionEntry = pkgSec.get('version');
      if (!versionEntry || typeof versionEntry.value !== 'string' || !versionEntry.value.trim()) {
        this.diagnostics.reportError(
          'E6010',
          "Missing required field 'version' in '[package]'.",
          { start: 0, end: 0, line: versionEntry?.line ?? 1, column: versionEntry?.col ?? 1 },
          filePath
        );
        hasError = true;
      } else if (!SEMVER_REGEX.test(versionEntry.value)) {
        this.diagnostics.reportError(
          'E6010',
          `Invalid package version '${versionEntry.value}'. Must be a valid SemVer 2.x string (e.g. '0.1.0' or '0.0.8-s').`,
          { start: 0, end: 0, line: versionEntry.line, column: versionEntry.col },
          filePath
        );
        hasError = true;
      }

      // 3. Edition
      const editionEntry = pkgSec.get('edition');
      if (!editionEntry || typeof editionEntry.value !== 'string' || !editionEntry.value.trim()) {
        this.diagnostics.reportError(
          'E6010',
          "Missing required field 'edition' in '[package]'.",
          { start: 0, end: 0, line: editionEntry?.line ?? 1, column: editionEntry?.col ?? 1 },
          filePath,
          undefined,
          "Use edition = '2026'."
        );
        hasError = true;
      }

      parsedPackage = {
        name: nameEntry?.value ?? '',
        version: versionEntry?.value ?? '',
        edition: editionEntry?.value ?? '2026',
        authors: pkgSec.get('authors')?.value,
        license: pkgSec.get('license')?.value,
        description: pkgSec.get('description')?.value,
      };
    }

    // Check [workspace]
    let parsedWorkspace: WorkspaceSection | undefined;
    if (wsSec) {
      const membersEntry = wsSec.get('members');
      if (!membersEntry || !Array.isArray(membersEntry.value)) {
        this.diagnostics.reportError(
          'E6010',
          "Missing required field 'members' in '[workspace]'.",
          { start: 0, end: 0, line: membersEntry?.line ?? 1, column: membersEntry?.col ?? 1 },
          filePath,
          undefined,
          "Workspace manifests must define members = ['pkg1', 'pkg2']."
        );
        hasError = true;
      } else {
        parsedWorkspace = {
          members: membersEntry.value,
        };
      }
    }

    // Check [dependencies]
    const depsMap = new Map<string, DependencySpec>();
    const depsSec = sections.get('dependencies');
    if (depsSec) {
      for (const [depName, entry] of depsSec.entries()) {
        const val = entry.value;
        if (typeof val === 'string') {
          // Version dependency e.g. shared = "0.1.0"
          depsMap.set(depName, { kind: 'version', version: val });
        } else if (typeof val === 'object' && val !== null) {
          if (typeof val.path === 'string') {
            depsMap.set(depName, { kind: 'path', path: val.path });
          } else if (val.workspace === true) {
            depsMap.set(depName, { kind: 'workspace', workspace: true });
          } else {
            this.diagnostics.reportError(
              'E6011',
              `Invalid dependency specification for '${depName}': expected 'path' or 'workspace = true'.`,
              { start: 0, end: 0, line: entry.line, column: entry.col },
              filePath
            );
            hasError = true;
          }
        } else {
          this.diagnostics.reportError(
            'E6011',
            `Invalid dependency format for '${depName}'.`,
            { start: 0, end: 0, line: entry.line, column: entry.col },
            filePath
          );
          hasError = true;
        }
      }
    }

    if (hasError) {
      return null;
    }

    return {
      package: parsedPackage,
      dependencies: depsMap,
      workspace: parsedWorkspace,
      rawData: Object.fromEntries(
        Array.from(sections.entries()).map(([secName, secMap]) => [
          secName,
          Object.fromEntries(Array.from(secMap.entries()).map(([k, v]) => [k, v.value])),
        ])
      ),
    };
  }
}
