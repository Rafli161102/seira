/**
 * Seira Compiler Lexical Scoping & Symbol Table
 *
 * Implements lexical scope hierarchy:
 * Global -> Module -> Function -> Block
 * Supports predictable lexical shadowing and duplicate declaration detection.
 */

import type { ASTNode } from '../ast/ast.ts';
import type { Span } from '../source/span.ts';

export type ScopeKind = 'global' | 'module' | 'function' | 'block';

export type SymbolKind =
  | 'variable'
  | 'function'
  | 'struct'
  | 'enum'
  | 'type'
  | 'trait'
  | 'param'
  | 'builtin';

export interface SymbolInfo<TType = any> {
  readonly name: string;
  readonly kind: SymbolKind;
  readonly span: Span;
  readonly isMut: boolean;
  readonly declNode?: ASTNode;
  type?: TType;
}

export class Scope {
  public readonly kind: ScopeKind;
  public readonly parent?: Scope;
  private readonly symbols = new Map<string, SymbolInfo>();

  constructor(kind: ScopeKind, parent?: Scope) {
    this.kind = kind;
    this.parent = parent;
  }

  /**
   * Defines a symbol in the current scope.
   * Returns false if a symbol with the same name already exists in this scope.
   */
  public define(symbol: SymbolInfo): boolean {
    if (this.symbols.has(symbol.name)) {
      return false;
    }
    this.symbols.set(symbol.name, symbol);
    return true;
  }

  /**
   * Looks up a symbol by name in this scope, or in parent scopes if not found locally.
   */
  public lookup(name: string): SymbolInfo | undefined {
    const local = this.symbols.get(name);
    if (local !== undefined) {
      return local;
    }
    if (this.parent !== undefined) {
      return this.parent.lookup(name);
    }
    return undefined;
  }

  /**
   * Looks up a symbol strictly within the current lexical scope (no parent traversal).
   */
  public lookupLocal(name: string): SymbolInfo | undefined {
    return this.symbols.get(name);
  }

  /**
   * Returns all symbols defined in this immediate scope.
   */
  public getLocalSymbols(): ReadonlyMap<string, SymbolInfo> {
    return this.symbols;
  }
}
