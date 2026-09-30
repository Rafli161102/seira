/**
 * Seira Module Representation
 *
 * Represents an individual Seira module corresponding to a source file in the filesystem.
 * Preserves export symbols, re-exports, visibility, and dependencies.
 */

import type {
  ConstStmt,
  EnumDecl,
  FunctionDecl,
  ImportDecl,
  Program,
  StructDecl,
  TopLevelItem,
  TraitDecl,
  TypeAliasDecl,
  UseDecl,
} from '../ast/ast.ts';
import type { Span } from '../source/span.ts';
import type { ModuleId } from './module_id.ts';

export type ExportKind = 'function' | 'struct' | 'enum' | 'type' | 'trait' | 'const';

export interface ExportedSymbol {
  readonly name: string;
  readonly kind: ExportKind;
  readonly isPublic: boolean;
  readonly span: Span;
  readonly declNode: TopLevelItem;
}

export interface ReexportSymbol {
  readonly exportedName: string;
  readonly sourceModule: string; // e.g. "internal" or "http.client"
  readonly sourceSymbol: string; // e.g. "User"
  readonly isPublic: boolean;
  readonly span: Span;
}

export class SeiraModule {
  public readonly id: ModuleId;
  public readonly filePath: string;
  public readonly isEntry: boolean;
  public ast?: Program;
  public readonly exports = new Map<string, ExportedSymbol>();
  public readonly reexports = new Map<string, ReexportSymbol>();
  public readonly imports: ImportDecl[] = [];
  public readonly uses: UseDecl[] = [];
  public readonly dependencies = new Set<string>();

  constructor(
    id: ModuleId | { package?: string; packageName?: string; path: string },
    filePath: string,
    isEntry = false
  ) {
    const pkgName = id.packageName ?? id.package ?? '';
    this.id = {
      packageName: pkgName,
      package: pkgName,
      path: id.path,
    };
    this.filePath = filePath;
    this.isEntry = isEntry;
  }

  /**
   * Collects top-level declarations into module exports and imports.
   */
  public collectDeclarations(ast: Program): void {
    this.ast = ast;

    for (const item of ast.items) {
      switch (item.kind) {
        case 'FunctionDecl': {
          const fn = item as FunctionDecl;
          this.exports.set(fn.name, {
            name: fn.name,
            kind: 'function',
            isPublic: fn.isPublic ?? false,
            span: fn.span,
            declNode: fn,
          });
          break;
        }

        case 'StructDecl': {
          const st = item as StructDecl;
          this.exports.set(st.name, {
            name: st.name,
            kind: 'struct',
            isPublic: st.isPublic ?? false,
            span: st.span,
            declNode: st,
          });
          break;
        }

        case 'EnumDecl': {
          const en = item as EnumDecl;
          this.exports.set(en.name, {
            name: en.name,
            kind: 'enum',
            isPublic: en.isPublic ?? false,
            span: en.span,
            declNode: en,
          });
          break;
        }

        case 'TypeAliasDecl': {
          const ta = item as TypeAliasDecl;
          this.exports.set(ta.name, {
            name: ta.name,
            kind: 'type',
            isPublic: ta.isPublic ?? false,
            span: ta.span,
            declNode: ta,
          });
          break;
        }

        case 'TraitDecl': {
          const tr = item as TraitDecl;
          this.exports.set(tr.name, {
            name: tr.name,
            kind: 'trait',
            isPublic: tr.isPublic ?? false,
            span: tr.span,
            declNode: tr,
          });
          break;
        }

        case 'ConstStmt': {
          const cs = item as ConstStmt;
          this.exports.set(cs.name, {
            name: cs.name,
            kind: 'const',
            isPublic: cs.isPublic ?? false,
            span: cs.span,
            declNode: cs,
          });
          break;
        }

        case 'ImportDecl': {
          const imp = item as ImportDecl;
          this.imports.push(imp);
          if (imp.path !== '*') {
            this.dependencies.add(imp.path);
          }
          break;
        }

        case 'UseDecl': {
          const use = item as UseDecl;
          this.uses.push(use);
          if (use.path !== '*') {
            const parts = use.path.split('.');
            if (parts.length > 1) {
              const modulePath = parts.slice(0, -1).join('.');
              const symbolName = parts[parts.length - 1];
              this.dependencies.add(modulePath);

              if (use.isPublic) {
                const exportedName = use.alias ?? symbolName;
                this.reexports.set(exportedName, {
                  exportedName,
                  sourceModule: modulePath,
                  sourceSymbol: symbolName,
                  isPublic: true,
                  span: use.span,
                });
              }
            } else if (parts.length === 1) {
              // Direct symbol/module use
              this.dependencies.add(parts[0]);
            }
          }
          break;
        }

        default:
          break;
      }
    }
  }

  public getExport(name: string): ExportedSymbol | undefined {
    return this.exports.get(name);
  }

  public getPublicExport(name: string): ExportedSymbol | undefined {
    const symbol = this.exports.get(name);
    return symbol && symbol.isPublic ? symbol : undefined;
  }
}
