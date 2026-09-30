/**
 * Seira Module Dependency Graph & Cycle Detection
 *
 * Constructs the dependency graph between modules in a package, detects cycles,
 * and yields a deterministic topological execution / analysis order.
 *
 * Emits:
 * - E6001: Module not found
 * - E6008: Cyclic module dependency detected
 */

import { DiagnosticBag, type Span } from '../diagnostics/index.ts';
import type { SeiraModule } from './module.ts';

export interface ModuleCycle {
  readonly path: string[]; // e.g. ["a", "b", "a"]
}

export class ModuleGraph {
  private readonly modules: Map<string, SeiraModule>;
  private readonly diagnostics: DiagnosticBag;

  constructor(
    modulesOrDiag?: Map<string, SeiraModule> | DiagnosticBag,
    diagnostics?: DiagnosticBag
  ) {
    if (modulesOrDiag instanceof Map) {
      this.modules = new Map(modulesOrDiag);
      this.diagnostics = diagnostics ?? new DiagnosticBag();
    } else {
      this.modules = new Map();
      this.diagnostics = modulesOrDiag ?? diagnostics ?? new DiagnosticBag();
    }
  }

  public addModule(mod: SeiraModule): void {
    this.modules.set(mod.id.path, mod);
  }

  public sort(): SeiraModule[] {
    return this.resolveOrder();
  }

  /**
   * Validates internal module dependencies, detects cycles, and returns
   * modules sorted in topological order (dependencies first).
   */
  public resolveOrder(): SeiraModule[] {
    const sorted: SeiraModule[] = [];
    const visited = new Map<string, 'unvisited' | 'visiting' | 'visited'>();

    for (const name of this.modules.keys()) {
      visited.set(name, 'unvisited');
    }

    // Sort module names deterministically
    const moduleNames = Array.from(this.modules.keys()).sort();

    for (const name of moduleNames) {
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
    sorted: SeiraModule[]
  ): void {
    visited.set(current, 'visiting');
    stack.push(current);

    const mod = this.modules.get(current);
    if (!mod) {
      visited.set(current, 'visited');
      stack.pop();
      return;
    }

    // Sort dependencies deterministically
    const deps = Array.from(mod.dependencies).sort();

    for (const dep of deps) {
      // Check if dependency is an internal module
      if (!this.modules.has(dep)) {
        // Dependency may be an external package or submodule.
        // If it starts with an existing module prefix or is an intra-package path, check
        continue;
      }

      const depState = visited.get(dep);
      if (depState === 'visiting') {
        // Cycle detected!
        const cycleStartIndex = stack.indexOf(dep);
        const cyclePath = stack.slice(cycleStartIndex).concat(dep);
        const cycleStr = cyclePath.join(' -> ');

        // Find span of the offending import or use
        let errorSpan: Span = { start: 0, end: 0, line: 1, column: 1 };
        for (const imp of mod.imports) {
          if (imp.path === dep) {
            errorSpan = imp.span;
            break;
          }
        }
        if (errorSpan.start === 0) {
          for (const use of mod.uses) {
            if (use.path.startsWith(dep)) {
              errorSpan = use.span;
              break;
            }
          }
        }

        this.diagnostics.reportError(
          'E6008',
          `Cyclic module dependency detected: ${cycleStr}`,
          errorSpan,
          mod.filePath,
          undefined,
          `Module '${current}' depends on '${dep}', which leads back to '${current}'. Seira forbids circular module dependencies.`
        );
      } else if (depState === 'unvisited') {
        this.dfs(dep, visited, stack, sorted);
      }
    }

    visited.set(current, 'visited');
    stack.pop();
    sorted.push(mod);
  }
}
