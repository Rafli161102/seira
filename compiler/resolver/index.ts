/**
 * Seira Compiler Name Resolver
 *
 * Implements lexical scope management, symbol declaration, and name resolution.
 * Detects:
 * - E2001: Unresolved identifier reference
 * - E2002: Duplicate binding / declaration in the same lexical scope
 * - E2003: Invalid assignment target (assigning to immutable variable)
 *
 * Preserves predictable lexical shadowing across nested scopes.
 */

import type {
  ASTNode,
  AssignmentExpr,
  AssignStmt,
  BinaryExpr,
  BindingStmt,
  Block,
  BlockExpr,
  BreakStmt,
  CallExpr,
  ConstStmt,
  ConstructorPattern,
  ContinueStmt,
  EnumDecl,
  Expr,
  ExprStmt,
  ForStmt,
  FunctionDecl,
  GenericParamNode,
  Identifier,
  IdentifierPattern,
  IfExpr,
  ImplDecl,
  ImportDecl,
  IndexExpr,
  LambdaExpr,
  LetStmt,
  ListLiteral,
  LoopStmt,
  MapLiteral,
  MatchExpr,
  MemberExpr,
  OptionFallbackExpr,
  OptionPropagateExpr,
  Pattern,
  PipelineExpr,
  Program,
  RangeExpr,
  ReturnStmt,
  SetLiteral,
  Stmt,
  StructDecl,
  TraitDecl,
  TupleLiteral,
  TypeAliasDecl,
  TypeAnnotation,
  UnaryExpr,
  UseDecl,
  WhileStmt,
  WithStmt,
} from '../ast/ast.ts';
import { DiagnosticBag, type Span } from '../diagnostics/index.ts';
import type { SeiraModule } from '../module/module.ts';
import { Scope, type ScopeKind, type SymbolInfo } from './scope.ts';
import { getBuiltinTraitDecls } from './builtin_traits.ts';

export * from './scope.ts';
export * from './builtin_traits.ts';

export interface ResolverOptions {
  readonly availableModules?: Map<string, SeiraModule>;
  readonly currentModule?: SeiraModule;
  readonly isModuleMode?: boolean;
}

export interface ResolverResult {
  readonly success: boolean;
  readonly globalScope: Scope;
  readonly diagnostics: DiagnosticBag;
  readonly resolvedSymbols: Map<ASTNode, SymbolInfo>;
  readonly declaredSymbols: Map<ASTNode, SymbolInfo>;
}

export class Resolver {
  private readonly diagnostics: DiagnosticBag;
  private readonly globalScope: Scope;
  private currentScope: Scope;
  private readonly resolvedSymbols = new Map<ASTNode, SymbolInfo>();
  private readonly declaredSymbols = new Map<ASTNode, SymbolInfo>();
  private readonly implementedTraits = new Set<string>();
  private readonly availableModules?: Map<string, SeiraModule>;
  private readonly currentModule?: SeiraModule;
  private readonly isModuleMode: boolean;
  private currentFile?: string;
  private loopDepth: number = 0;

  constructor(diagnostics?: DiagnosticBag, options?: ResolverOptions) {
    this.diagnostics = diagnostics ?? new DiagnosticBag();
    this.globalScope = new Scope('global');
    this.currentScope = this.globalScope;
    this.availableModules = options?.availableModules;
    this.currentModule = options?.currentModule;
    this.isModuleMode = options?.isModuleMode ?? (options?.availableModules !== undefined);
    this.registerBuiltins();
  }

  private registerBuiltins(): void {
    const dummySpan: Span = { start: 0, end: 0, line: 1, column: 1 };

    // Standard built-in types (concrete, non-trait names only).
    // Traits (Iterator, Reader, Writer, Resource, Seekable, Flushable, Sized) are registered
    // separately below as kind:'trait' so that `impl Trait for Type` blocks resolve correctly.
    // Callable constructors (MemoryReader, MemoryWriter, MemoryStream) are registered as
    // kind:'builtin' below so they are usable as both type annotations and call expressions.
    const builtinTypes = [
      'Int',
      'UInt',
      'Float',
      'Bool',
      'Char',
      'String',
      'Byte',
      'Unit',
      'Option',
      'Result',
      'List',
      'Tuple',
      'Map',
      'Set',
      'Path',
      'Bytes',
      'File',
    ];
    for (const typeName of builtinTypes) {
      this.globalScope.define({
        name: typeName,
        kind: 'type',
        span: dummySpan,
        isMut: false,
      });
    }

    // Standard built-in traits (authoritative definitions with declNode)
    for (const [traitName, traitDecl] of getBuiltinTraitDecls()) {
      this.globalScope.define({
        name: traitName,
        kind: 'trait',
        span: dummySpan,
        isMut: false,
        declNode: traitDecl,
      });
    }

    // Built-in functions & utilities
    const builtinFunctions = [
      'println',
      'print',
      'Some',
      'None',
      'Ok',
      'Err',
      'open_resource',
      'open_file',
      'Path',
      'Bytes',
      'encode',
      'decode',
      'MemoryReader',
      'MemoryWriter',
      'MemoryStream',
      'Set',
      'iter',
      'collect',
      'filter',
      'map',
      'take',
      'skip',
      'enumerate',
      'zip',
      'fold',
      'reduce',
      'is_some',
      'is_none',
      'is_ok',
      'is_err',
      'unwrap',
      'unwrap_or',
      'unwrap_or_else',
      'expect',
      'map_err',
      'and_then',
      'or_else',
      'trim',
      'replace',
      'split',
      'contains',
    ];
    for (const fnName of builtinFunctions) {
      this.globalScope.define({
        name: fnName,
        kind: 'builtin',
        span: dummySpan,
        isMut: false,
      });
    }
  }

  public resolve(program: Program, file?: string): ResolverResult {
    this.currentFile = file;

    // Pass 1: Top-level declaration hoisting
    this.hoistTopLevelDeclarations(program);

    // Pass 2: Traverse declarations, statements, and expressions
    for (const item of program.items) {
      this.resolveDeclaration(item);
    }

    return {
      success: !this.diagnostics.hasErrors(),
      globalScope: this.globalScope,
      diagnostics: this.diagnostics,
      resolvedSymbols: this.resolvedSymbols,
      declaredSymbols: this.declaredSymbols,
    };
  }

  private hoistTopLevelDeclarations(program: Program): void {
    for (const item of program.items) {
      switch (item.kind) {
        case 'ImportDecl': {
          this.resolveImportDecl(item as ImportDecl);
          break;
        }
        case 'UseDecl': {
          this.resolveUseDecl(item as UseDecl);
          break;
        }
        case 'FunctionDecl': {
          const ok = this.globalScope.define({
            name: item.name,
            kind: 'function',
            span: item.span,
            isMut: false,
            declNode: item,
            isPublic: item.isPublic ?? false,
          });
          if (!ok) {
            this.diagnostics.reportError(
              'E2002',
              `Duplicate declaration of '${item.name}' in the same scope.`,
              item.span,
              this.currentFile,
              `A symbol with name '${item.name}' is already declared in this lexical scope.`
            );
          } else {
            const sym = this.globalScope.lookupLocal(item.name);
            if (sym) this.declaredSymbols.set(item, sym);
          }
          break;
        }
        case 'StructDecl': {
          const ok = this.globalScope.define({
            name: item.name,
            kind: 'struct',
            span: item.span,
            isMut: false,
            declNode: item,
            isPublic: item.isPublic ?? false,
          });
          if (!ok) {
            this.diagnostics.reportError(
              'E2002',
              `Duplicate declaration of struct '${item.name}' in the same scope.`,
              item.span,
              this.currentFile
            );
          } else {
            const sym = this.globalScope.lookupLocal(item.name);
            if (sym) this.declaredSymbols.set(item, sym);
          }
          break;
        }
        case 'EnumDecl': {
          const ok = this.globalScope.define({
            name: item.name,
            kind: 'enum',
            span: item.span,
            isMut: false,
            declNode: item,
            isPublic: item.isPublic ?? false,
          });
          if (!ok) {
            this.diagnostics.reportError(
              'E2002',
              `Duplicate declaration of enum '${item.name}' in the same scope.`,
              item.span,
              this.currentFile
            );
          } else {
            const sym = this.globalScope.lookupLocal(item.name);
            if (sym) this.declaredSymbols.set(item, sym);
          }
          break;
        }
        case 'TypeAliasDecl': {
          const ok = this.globalScope.define({
            name: item.name,
            kind: 'type',
            span: item.span,
            isMut: false,
            declNode: item,
            isPublic: item.isPublic ?? false,
          });
          if (!ok) {
            this.diagnostics.reportError(
              'E2002',
              `Duplicate declaration of type alias '${item.name}' in the same scope.`,
              item.span,
              this.currentFile
            );
          } else {
            const sym = this.globalScope.lookupLocal(item.name);
            if (sym) this.declaredSymbols.set(item, sym);
          }
          break;
        }
        case 'TraitDecl': {
          const ok = this.globalScope.define({
            name: item.name,
            kind: 'trait',
            span: item.span,
            isMut: false,
            declNode: item,
            isPublic: item.isPublic ?? false,
          });
          if (!ok) {
            this.diagnostics.reportError(
              'E2002',
              `Duplicate declaration of trait '${item.name}' in the same scope.`,
              item.span,
              this.currentFile
            );
          } else {
            const sym = this.globalScope.lookupLocal(item.name);
            if (sym) this.declaredSymbols.set(item, sym);
          }
          break;
        }
        case 'ImplDecl': {
          const key = `${item.targetType.name}::${item.traitName}`;
          if (this.implementedTraits.has(key)) {
            this.diagnostics.reportError(
              'E4005',
              `Duplicate implementation of trait '${item.traitName}' for type '${item.targetType.name}'.`,
              item.span,
              this.currentFile
            );
          } else {
            this.implementedTraits.add(key);
          }
          break;
        }
      }
    }
  }

  private resolveDeclaration(item: ASTNode): void {
    switch (item.kind) {
      case 'ImportDecl':
      case 'UseDecl':
        // Already processed during declaration hoisting
        break;
      case 'FunctionDecl':
        this.resolveFunctionDecl(item as FunctionDecl);
        break;
      case 'StructDecl':
        this.resolveStructDecl(item as StructDecl);
        break;
      case 'EnumDecl':
        this.resolveEnumDecl(item as EnumDecl);
        break;
      case 'TypeAliasDecl':
        this.resolveTypeAliasDecl(item as TypeAliasDecl);
        break;
      case 'TraitDecl':
        this.resolveTraitDecl(item as TraitDecl);
        break;
      case 'ImplDecl':
        this.resolveImplDecl(item as ImplDecl);
        break;
      default:
        this.resolveStatement(item as Stmt);
        break;
    }
  }

  private resolveFunctionDecl(fn: FunctionDecl): void {
    const parentScope = this.currentScope;
    this.currentScope = new Scope('function', parentScope);

    // Define generic parameters in function scope
    if (fn.genericParams) {
      const seenGenerics = new Set<string>();
      for (const gp of fn.genericParams) {
        if (seenGenerics.has(gp.name)) {
          this.diagnostics.reportError(
            'E4001',
            `Duplicate generic parameter '${gp.name}' in function '${fn.name}'.`,
            gp.span,
            this.currentFile
          );
        }
        seenGenerics.add(gp.name);
        this.currentScope.define({
          name: gp.name,
          kind: 'type',
          span: gp.span,
          isMut: false,
          declNode: gp,
        });
        if (gp.constraint) {
          this.resolveTypeAnnotation(gp.constraint);
        }
      }
    }

    // Resolve parameter types and define parameter symbols in function scope
    for (const param of fn.params) {
      if (param.typeAnnotation) {
        this.resolveTypeAnnotation(param.typeAnnotation);
      }
      const ok = this.currentScope.define({
        name: param.name,
        kind: 'param',
        span: param.span,
        isMut: param.isMut ?? false,
        declNode: param,
      });
      if (!ok) {
        this.diagnostics.reportError(
          'E2002',
          `Duplicate parameter '${param.name}' in function '${fn.name}'.`,
          param.span,
          this.currentFile
        );
      } else {
        const sym = this.currentScope.lookupLocal(param.name);
        if (sym) this.declaredSymbols.set(param, sym);
      }
    }

    if (fn.returnType) {
      this.resolveTypeAnnotation(fn.returnType);
    }

    if (fn.isExpressionBody && fn.bodyExpr) {
      this.resolveExpression(fn.bodyExpr);
    } else {
      this.resolveBlock(fn.body, false);
    }

    this.currentScope = parentScope;
  }

  private resolveStructDecl(struct: StructDecl): void {
    const parentScope = this.currentScope;
    if (struct.genericParams && struct.genericParams.length > 0) {
      this.currentScope = new Scope('block', parentScope);
      const seenGenerics = new Set<string>();
      for (const gp of struct.genericParams) {
        if (seenGenerics.has(gp.name)) {
          this.diagnostics.reportError(
            'E4001',
            `Duplicate generic parameter '${gp.name}' in struct '${struct.name}'.`,
            gp.span,
            this.currentFile
          );
        }
        seenGenerics.add(gp.name);
        this.currentScope.define({
          name: gp.name,
          kind: 'type',
          span: gp.span,
          isMut: false,
          declNode: gp,
        });
        if (gp.constraint) {
          this.resolveTypeAnnotation(gp.constraint);
        }
      }
    }

    const fieldNames = new Set<string>();
    for (const field of struct.fields) {
      if (fieldNames.has(field.name)) {
        this.diagnostics.reportError(
          'E2002',
          `Duplicate field '${field.name}' in struct '${struct.name}'.`,
          field.type.span,
          this.currentFile
        );
      }
      fieldNames.add(field.name);
      this.resolveTypeAnnotation(field.type);
    }

    this.currentScope = parentScope;
  }

  private resolveEnumDecl(enumDecl: EnumDecl): void {
    const variantNames = new Set<string>();
    for (const variant of enumDecl.variants) {
      if (variantNames.has(variant.name)) {
        this.diagnostics.reportError(
          'E2002',
          `Duplicate variant '${variant.name}' in enum '${enumDecl.name}'.`,
          variant.span,
          this.currentFile
        );
      }
      variantNames.add(variant.name);
      if (variant.typeAnnotation) {
        this.resolveTypeAnnotation(variant.typeAnnotation);
      }
    }
  }

  private resolveTypeAliasDecl(alias: TypeAliasDecl): void {
    const parentScope = this.currentScope;
    if (alias.genericParams && alias.genericParams.length > 0) {
      this.currentScope = new Scope('block', parentScope);
      const seenGenerics = new Set<string>();
      for (const gp of alias.genericParams) {
        if (seenGenerics.has(gp.name)) {
          this.diagnostics.reportError(
            'E4001',
            `Duplicate generic parameter '${gp.name}' in type alias '${alias.name}'.`,
            gp.span,
            this.currentFile
          );
        }
        seenGenerics.add(gp.name);
        this.currentScope.define({
          name: gp.name,
          kind: 'type',
          span: gp.span,
          isMut: false,
          declNode: gp,
        });
        if (gp.constraint) {
          this.resolveTypeAnnotation(gp.constraint);
        }
      }
    }

    this.resolveTypeAnnotation(alias.targetType);
    this.currentScope = parentScope;
  }

  private resolveTraitDecl(trait: TraitDecl): void {
    const parentScope = this.currentScope;
    if (trait.genericParams && trait.genericParams.length > 0) {
      this.currentScope = new Scope('block', parentScope);
      const seenGenerics = new Set<string>();
      for (const gp of trait.genericParams) {
        if (seenGenerics.has(gp.name)) {
          this.diagnostics.reportError(
            'E4001',
            `Duplicate generic parameter '${gp.name}' in trait '${trait.name}'.`,
            gp.span,
            this.currentFile
          );
        }
        seenGenerics.add(gp.name);
        this.currentScope.define({
          name: gp.name,
          kind: 'type',
          span: gp.span,
          isMut: false,
          declNode: gp,
        });
        if (gp.constraint) {
          this.resolveTypeAnnotation(gp.constraint);
        }
      }
    }

    for (const method of trait.methods) {
      this.resolveFunctionDecl(method);
    }

    this.currentScope = parentScope;
  }

  private resolveImplDecl(implDecl: ImplDecl): void {
    const traitSym = this.globalScope.lookup(implDecl.traitName);
    if (!traitSym || traitSym.kind !== 'trait') {
      this.diagnostics.reportError(
        'E4004',
        `Cannot find trait '${implDecl.traitName}' in this scope.`,
        implDecl.span,
        this.currentFile
      );
    }

    this.resolveTypeAnnotation(implDecl.targetType);

    for (const method of implDecl.methods) {
      this.resolveFunctionDecl(method);
    }
  }

  private resolveUseDecl(item: UseDecl): void {
    if (item.path === '*') {
      return;
    }

    const parts = item.path.split('.');
    if (parts.length < 2) {
      this.diagnostics.reportError(
        'E6007',
        `Invalid use path '${item.path}'. Expected 'module.Symbol'.`,
        item.span,
        this.currentFile,
        undefined,
        "Use 'use module.Symbol' or 'import module'."
      );
      return;
    }

    const symbolName = parts[parts.length - 1];
    const modulePath = parts.slice(0, -1).join('.');
    const localName = item.alias ?? symbolName;

    const targetMod = this.availableModules?.get(modulePath);
    if (!targetMod) {
      this.diagnostics.reportError(
        'E6001',
        `Module '${modulePath}' not found.`,
        item.span,
        this.currentFile,
        undefined,
        `Ensure module '${modulePath}' exists in the source root.`
      );
      return;
    }

    const exp = targetMod.exports.get(symbolName);
    const reexp = !exp ? targetMod.reexports.get(symbolName) : undefined;

    if (!exp && !reexp) {
      this.diagnostics.reportError(
        'E6002',
        `Symbol '${symbolName}' not found in module '${modulePath}'.`,
        item.span,
        this.currentFile,
        undefined,
        `Check if '${symbolName}' is declared in module '${modulePath}'.`
      );
      return;
    }

    if (exp && !exp.isPublic) {
      if (item.isPublic) {
        this.diagnostics.reportError(
          'E6015',
          `Cannot re-export private symbol '${symbolName}' from module '${modulePath}'.`,
          item.span,
          this.currentFile,
          undefined,
          `Declare '${symbolName}' as 'pub' in '${modulePath}' before re-exporting it.`
        );
      } else {
        this.diagnostics.reportError(
          'E6005',
          `Cannot access private symbol '${symbolName}' in module '${modulePath}'.`,
          item.span,
          this.currentFile,
          undefined,
          `Declare '${symbolName}' as 'pub' in '${modulePath}' to make it accessible.`
        );
      }
      return;
    }

    const existing = this.globalScope.lookupLocal(localName);
    if (existing) {
      this.diagnostics.reportError(
        'E6004',
        `Duplicate declaration of '${localName}' in the same scope.`,
        item.span,
        this.currentFile,
        undefined,
        `A symbol with name '${localName}' already exists in this scope.`
      );
      return;
    }

    const kind = exp ? (
      exp.kind === 'function' ? 'function' :
      exp.kind === 'struct' ? 'struct' :
      exp.kind === 'enum' ? 'enum' :
      exp.kind === 'trait' ? 'trait' :
      exp.kind === 'const' ? 'variable' : 'type'
    ) : 'type';

    this.globalScope.define({
      name: localName,
      kind,
      span: item.span,
      isMut: false,
      declNode: exp?.declNode,
      isPublic: item.isPublic ?? false,
    });

    const sym = this.globalScope.lookupLocal(localName);
    if (sym) {
      this.declaredSymbols.set(item, sym);
    }
  }

  private resolveImportDecl(item: ImportDecl): void {
    if (item.path === '*') {
      return;
    }

    const targetMod = this.availableModules?.get(item.path);
    if (!targetMod) {
      this.diagnostics.reportError(
        'E6001',
        `Module '${item.path}' not found.`,
        item.span,
        this.currentFile,
        undefined,
        `Ensure module '${item.path}' exists in the source root.`
      );
      return;
    }

    const leafName = item.alias ?? (item.path.includes('.') ? item.path.split('.').pop()! : item.path);
    const existing = this.globalScope.lookupLocal(leafName);
    if (existing) {
      this.diagnostics.reportError(
        'E6004',
        `Duplicate declaration of '${leafName}' in the same scope.`,
        item.span,
        this.currentFile,
        undefined,
        `A symbol with name '${leafName}' already exists in this scope.`
      );
      return;
    }

    this.globalScope.define({
      name: leafName,
      kind: 'module',
      span: item.span,
      isMut: false,
      moduleRef: targetMod,
      isPublic: item.isPublic ?? false,
    });

    const sym = this.globalScope.lookupLocal(leafName);
    if (sym) {
      this.declaredSymbols.set(item, sym);
    }

    if (!item.alias && item.path.includes('.')) {
      const rootName = item.path.split('.')[0];
      if (!this.globalScope.lookupLocal(rootName)) {
        this.globalScope.define({
          name: rootName,
          kind: 'module',
          span: item.span,
          isMut: false,
          moduleRef: targetMod,
          isPublic: item.isPublic ?? false,
        });
      }
    }
  }

  private resolveTypeAnnotation(annotation: TypeAnnotation): void {
    if (annotation.name === 'Union') {
      if (annotation.unionTypes) {
        for (const t of annotation.unionTypes) {
          this.resolveTypeAnnotation(t);
        }
      }
      return;
    }

    if (annotation.name === 'Function') {
      if (annotation.functionParams) {
        for (const p of annotation.functionParams) {
          this.resolveTypeAnnotation(p);
        }
      }
      if (annotation.returnType) {
        this.resolveTypeAnnotation(annotation.returnType);
      }
      return;
    }

    if (annotation.name.includes('.')) {
      const lastDot = annotation.name.lastIndexOf('.');
      const modPath = annotation.name.slice(0, lastDot);
      const typeName = annotation.name.slice(lastDot + 1);

      let targetMod: SeiraModule | undefined;
      const modSym = this.currentScope.lookup(modPath);
      if (modSym && modSym.kind === 'module' && modSym.moduleRef) {
        targetMod = modSym.moduleRef as SeiraModule;
      } else if (this.availableModules?.has(modPath)) {
        targetMod = this.availableModules.get(modPath);
      }

      if (!targetMod) {
        this.diagnostics.reportError(
          'E6001',
          `Module '${modPath}' not found.`,
          annotation.span,
          this.currentFile
        );
        return;
      }

      const exp = targetMod.exports.get(typeName);
      if (!exp) {
        const reexp = targetMod.reexports.get(typeName);
        if (!reexp) {
          this.diagnostics.reportError(
            'E6002',
            `Symbol '${typeName}' not found in module '${modPath}'.`,
            annotation.span,
            this.currentFile
          );
          return;
        }
      } else if (!exp.isPublic) {
        this.diagnostics.reportError(
          'E6005',
          `Cannot access private symbol '${typeName}' in module '${modPath}'.`,
          annotation.span,
          this.currentFile,
          undefined,
          `Declare '${typeName}' as 'pub' in '${modPath}' to make it accessible.`
        );
        return;
      }

      if (annotation.generics) {
        for (const gen of annotation.generics) {
          this.resolveTypeAnnotation(gen);
        }
      }
      return;
    }

    const sym = this.currentScope.lookup(annotation.name);
    if (
      !sym ||
      (sym.kind !== 'type' &&
        sym.kind !== 'struct' &&
        sym.kind !== 'enum' &&
        sym.kind !== 'trait' &&
        sym.kind !== 'builtin')
    ) {
      this.diagnostics.reportError(
        'E2001',
        `Cannot find type '${annotation.name}' in this scope.`,
        annotation.span,
        this.currentFile
      );
    }
    if (annotation.generics) {
      for (const gen of annotation.generics) {
        this.resolveTypeAnnotation(gen);
      }
    }
  }

  private resolveBindingStmt(stmt: BindingStmt): void {
    if (this.isModuleMode && this.currentScope === this.globalScope && stmt.isMut) {
      this.diagnostics.reportError(
        'E2003',
        `Global mutable state is forbidden at module scope.`,
        stmt.span,
        this.currentFile,
        `Mutable variable '${stmt.name}' cannot be declared at module scope. Use 'const' for module-level constants.`
      );
    }

    if (stmt.initializer) {
      this.resolveExpression(stmt.initializer);
    }
    if (stmt.typeAnnotation) {
      this.resolveTypeAnnotation(stmt.typeAnnotation);
    }

    const localExisting = this.currentScope.lookupLocal(stmt.name);
    if (localExisting && !stmt.isMut && !stmt.typeAnnotation) {
      if (!localExisting.isMut) {
        this.diagnostics.reportError(
          'E2003',
          `Cannot assign to immutable variable '${stmt.name}'.`,
          stmt.span,
          this.currentFile,
          `Declare '${stmt.name}' as mutable using 'mut ${stmt.name}' to permit reassignment.`
        );
      }
      this.resolvedSymbols.set(stmt, localExisting);
      return;
    }

    const ok = this.currentScope.define({
      name: stmt.name,
      kind: 'variable',
      span: stmt.span,
      isMut: stmt.isMut,
      declNode: stmt,
    });
    if (!ok) {
      this.diagnostics.reportError(
        'E2002',
        `Duplicate binding '${stmt.name}' in the same scope.`,
        stmt.span,
        this.currentFile,
        `Variable '${stmt.name}' is already declared in this lexical scope.`
      );
    } else {
      const sym = this.currentScope.lookupLocal(stmt.name);
      if (sym) this.declaredSymbols.set(stmt, sym);
    }
  }

  private resolveLetStmt(stmt: LetStmt): void {
    if (this.isModuleMode && this.currentScope === this.globalScope && stmt.isMut) {
      this.diagnostics.reportError(
        'E2003',
        `Global mutable state is forbidden at module scope.`,
        stmt.span,
        this.currentFile,
        `Mutable variable '${stmt.name}' cannot be declared at module scope. Use 'const' for module-level constants.`
      );
    }

    if (stmt.initializer) {
      this.resolveExpression(stmt.initializer);
    }
    if (stmt.typeAnnotation) {
      this.resolveTypeAnnotation(stmt.typeAnnotation);
    }

    const ok = this.currentScope.define({
      name: stmt.name,
      kind: 'variable',
      span: stmt.span,
      isMut: stmt.isMut,
      declNode: stmt,
    });
    if (!ok) {
      this.diagnostics.reportError(
        'E2002',
        `Duplicate binding '${stmt.name}' in the same scope.`,
        stmt.span,
        this.currentFile,
        `Variable '${stmt.name}' is already declared in this lexical scope.`
      );
    } else {
      const sym = this.currentScope.lookupLocal(stmt.name);
      if (sym) this.declaredSymbols.set(stmt, sym);
    }
  }

  private resolveConstStmt(stmt: ConstStmt): void {
    if (stmt.initializer) {
      this.resolveExpression(stmt.initializer);
    }
    if (stmt.typeAnnotation) {
      this.resolveTypeAnnotation(stmt.typeAnnotation);
    }

    const ok = this.currentScope.define({
      name: stmt.name,
      kind: 'variable',
      span: stmt.span,
      isMut: false,
      declNode: stmt,
    });
    if (!ok) {
      this.diagnostics.reportError(
        'E2002',
        `Duplicate binding '${stmt.name}' in the same scope.`,
        stmt.span,
        this.currentFile
      );
    } else {
      const sym = this.currentScope.lookupLocal(stmt.name);
      if (sym) this.declaredSymbols.set(stmt, sym);
    }
  }

  private resolveAssignStmt(stmt: AssignStmt): void {
    if (stmt.target.kind === 'Identifier') {
      const id = stmt.target as Identifier;
      const sym = this.currentScope.lookup(id.name);
      if (!sym) {
        this.diagnostics.reportError(
          'E2001',
          `Cannot find name '${id.name}' in this scope.`,
          id.span,
          this.currentFile
        );
      } else {
        if (!sym.isMut) {
          this.diagnostics.reportError(
            'E2003',
            `Cannot assign to immutable variable '${id.name}'.`,
            id.span,
            this.currentFile,
            `Declare '${id.name}' as mutable using 'mut ${id.name}' to permit reassignment.`
          );
        }
        this.resolvedSymbols.set(id, sym);
      }
    } else {
      this.resolveExpression(stmt.target);
    }

    this.resolveExpression(stmt.value);
  }

  private resolveReturnStmt(stmt: ReturnStmt): void {
    if (stmt.value) {
      this.resolveExpression(stmt.value);
    }
  }

  private resolveWithStmt(stmt: WithStmt): void {
    this.resolveExpression(stmt.resource);
    const parentScope = this.currentScope;
    this.currentScope = new Scope('block', parentScope);

    if (stmt.alias) {
      this.currentScope.define({
        name: stmt.alias,
        kind: 'variable',
        span: stmt.span,
        isMut: false,
        declNode: stmt,
      });
      const sym = this.currentScope.lookupLocal(stmt.alias);
      if (sym) this.declaredSymbols.set(stmt, sym);
    }

    this.resolveBlock(stmt.body, false);
    this.currentScope = parentScope;
  }

  private resolveBlock(block: Block, createScope = true): void {
    const parentScope = this.currentScope;
    if (createScope) {
      this.currentScope = new Scope('block', parentScope);
    }

    for (const stmt of block.statements) {
      this.resolveStatement(stmt);
    }

    if (createScope) {
      this.currentScope = parentScope;
    }
  }

  private resolveStatement(stmt: Stmt): void {
    switch (stmt.kind) {
      case 'BindingStmt':
        this.resolveBindingStmt(stmt as BindingStmt);
        break;
      case 'LetStmt':
        this.resolveLetStmt(stmt as LetStmt);
        break;
      case 'ConstStmt':
        this.resolveConstStmt(stmt as ConstStmt);
        break;
      case 'AssignStmt':
        this.resolveAssignStmt(stmt as AssignStmt);
        break;
      case 'ExprStmt':
        this.resolveExpression((stmt as ExprStmt).expression);
        break;
      case 'ReturnStmt':
        this.resolveReturnStmt(stmt as ReturnStmt);
        break;
      case 'WithStmt':
        this.resolveWithStmt(stmt as WithStmt);
        break;
      case 'WhileStmt': {
        const whileStmt = stmt as WhileStmt;
        this.resolveExpression(whileStmt.condition);
        this.loopDepth++;
        this.resolveBlock(whileStmt.body);
        this.loopDepth--;
        break;
      }
      case 'ForStmt': {
        const forStmt = stmt as ForStmt;
        this.resolveExpression(forStmt.iterable);
        this.loopDepth++;
        const parentScope = this.currentScope;
        this.currentScope = new Scope('block', parentScope);
        this.currentScope.define({
          name: forStmt.variable,
          kind: 'variable',
          span: forStmt.span,
          isMut: false,
          declNode: forStmt,
        });
        const sym = this.currentScope.lookupLocal(forStmt.variable);
        if (sym) this.declaredSymbols.set(forStmt, sym);
        this.resolveBlock(forStmt.body, false);
        this.currentScope = parentScope;
        this.loopDepth--;
        break;
      }
      case 'LoopStmt': {
        const loopStmt = stmt as LoopStmt;
        this.loopDepth++;
        this.resolveBlock(loopStmt.body);
        this.loopDepth--;
        break;
      }
      case 'BreakStmt': {
        if (this.loopDepth <= 0) {
          this.diagnostics.reportError(
            'E2004',
            "Cannot use 'break' outside of a loop.",
            stmt.span,
            this.currentFile,
            "'break' is only permitted within 'while', 'for', or 'loop' statements."
          );
        }
        break;
      }
      case 'ContinueStmt': {
        if (this.loopDepth <= 0) {
          this.diagnostics.reportError(
            'E2004',
            "Cannot use 'continue' outside of a loop.",
            stmt.span,
            this.currentFile,
            "'continue' is only permitted within 'while', 'for', or 'loop' statements."
          );
        }
        break;
      }
    }
  }

  private resolveExpression(expr: Expr): void {
    switch (expr.kind) {
      case 'Identifier': {
        const id = expr as Identifier;
        const sym = this.currentScope.lookup(id.name);
        if (!sym) {
          this.diagnostics.reportError(
            'E2001',
            `Cannot find name '${id.name}' in this scope.`,
            id.span,
            this.currentFile,
            `Ensure '${id.name}' is declared in the current or an enclosing lexical scope.`
          );
        } else if (sym.kind === 'type' && sym.declNode?.kind === 'GenericParam') {
          this.diagnostics.reportError(
            'E2001',
            `'${id.name}' is a type parameter and cannot be used as a value.`,
            id.span,
            this.currentFile
          );
        } else {
          this.resolvedSymbols.set(id, sym);
        }
        break;
      }
      case 'BinaryExpr': {
        const bin = expr as BinaryExpr;
        this.resolveExpression(bin.left);
        this.resolveExpression(bin.right);
        break;
      }
      case 'UnaryExpr': {
        const un = expr as UnaryExpr;
        this.resolveExpression(un.operand);
        break;
      }
      case 'CallExpr': {
        const call = expr as CallExpr;
        this.resolveExpression(call.callee);
        if (call.typeArguments) {
          for (const ta of call.typeArguments) {
            this.resolveTypeAnnotation(ta);
          }
        }
        for (const arg of call.args) {
          this.resolveExpression(arg);
        }
        break;
      }
      case 'PipelineExpr': {
        const pipe = expr as PipelineExpr;
        this.resolveExpression(pipe.left);
        this.resolveExpression(pipe.right);
        break;
      }
      case 'IfExpr': {
        const ifExpr = expr as IfExpr;
        this.resolveExpression(ifExpr.condition);
        this.resolveBlock(ifExpr.thenBranch, true);
        if (ifExpr.elseBranch) {
          if (ifExpr.elseBranch.kind === 'Block') {
            this.resolveBlock(ifExpr.elseBranch as Block, true);
          } else {
            this.resolveExpression(ifExpr.elseBranch as IfExpr);
          }
        }
        break;
      }
      case 'BlockExpr': {
        const blockExpr = expr as BlockExpr;
        if (blockExpr.block) {
          this.resolveBlock(blockExpr.block, true);
        }
        break;
      }
      case 'AssignmentExpr': {
        const assign = expr as AssignmentExpr;
        if (assign.target.kind === 'Identifier') {
          const id = assign.target as Identifier;
          const sym = this.currentScope.lookup(id.name);
          if (!sym) {
            this.diagnostics.reportError(
              'E2001',
              `Cannot find name '${id.name}' in this scope.`,
              id.span,
              this.currentFile
            );
          } else {
            if (!sym.isMut) {
              this.diagnostics.reportError(
                'E2003',
                `Cannot assign to immutable variable '${id.name}'.`,
                id.span,
                this.currentFile,
                `Declare '${id.name}' as mutable using 'mut ${id.name}' to permit reassignment.`
              );
            }
            this.resolvedSymbols.set(id, sym);
          }
        } else {
          this.resolveExpression(assign.target);
        }
        this.resolveExpression(assign.value);
        break;
      }
      case 'OptionFallbackExpr': {
        const opt = expr as OptionFallbackExpr;
        this.resolveExpression(opt.left);
        this.resolveExpression(opt.right);
        break;
      }
      case 'OptionPropagateExpr': {
        const prop = expr as OptionPropagateExpr;
        this.resolveExpression(prop.operand);
        break;
      }
      case 'RangeExpr': {
        const range = expr as RangeExpr;
        if (range.start) this.resolveExpression(range.start);
        if (range.end) this.resolveExpression(range.end);
        break;
      }
      case 'MemberExpr': {
        const mem = expr as MemberExpr;
        this.resolveExpression(mem.object);
        if (mem.object.kind === 'Identifier') {
          const id = mem.object as Identifier;
          const sym = this.resolvedSymbols.get(id);
          if (sym && sym.kind === 'module' && sym.moduleRef) {
            const mod = sym.moduleRef as SeiraModule;
            const exp = mod.exports.get(mem.property);
            if (!exp) {
              const reexp = mod.reexports.get(mem.property);
              if (!reexp) {
                this.diagnostics.reportError(
                  'E6002',
                  `Symbol '${mem.property}' not found in module '${mod.id.path}'.`,
                  mem.span,
                  this.currentFile
                );
              }
            } else if (!exp.isPublic) {
              this.diagnostics.reportError(
                'E6005',
                `Cannot access private symbol '${mem.property}' in module '${mod.id.path}'.`,
                mem.span,
                this.currentFile,
                undefined,
                `Declare '${mem.property}' as 'pub' in '${mod.id.path}' to make it accessible.`
              );
            }
          }
        }
        break;
      }
      case 'Literal':
        // Literals require no name resolution
        break;
      case 'MatchExpr': {
        const matchExpr = expr as MatchExpr;
        this.resolveExpression(matchExpr.value);
        for (const arm of matchExpr.arms) {
          const parentScope = this.currentScope;
          this.currentScope = new Scope('block', parentScope);
          this.resolvePattern(arm.pattern);
          if (arm.body.kind === 'Block') {
            this.resolveBlock(arm.body as Block, false);
          } else {
            this.resolveExpression(arm.body as Expr);
          }
          this.currentScope = parentScope;
        }
        break;
      }
      case 'ListLiteral': {
        const list = expr as ListLiteral;
        for (const elem of list.elements) {
          this.resolveExpression(elem);
        }
        break;
      }
      case 'TupleLiteral': {
        const tup = expr as TupleLiteral;
        for (const elem of tup.elements) {
          this.resolveExpression(elem);
        }
        break;
      }
      case 'MapLiteral': {
        const map = expr as MapLiteral;
        for (const entry of map.entries) {
          this.resolveExpression(entry.key);
          this.resolveExpression(entry.value);
        }
        break;
      }
      case 'SetLiteral': {
        const setLit = expr as SetLiteral;
        for (const elem of setLit.elements) {
          this.resolveExpression(elem);
        }
        break;
      }
      case 'IndexExpr': {
        const idx = expr as IndexExpr;
        this.resolveExpression(idx.object);
        this.resolveExpression(idx.index);
        break;
      }
      case 'LambdaExpr': {
        const lambda = expr as LambdaExpr;
        const parentScope = this.currentScope;
        this.currentScope = new Scope('function', parentScope);
        for (const param of lambda.params) {
          if (param.typeAnnotation) {
            this.resolveTypeAnnotation(param.typeAnnotation);
          }
          const ok = this.currentScope.define({
            name: param.name,
            kind: 'param',
            span: param.span,
            isMut: param.isMut,
            declNode: param,
          });
          if (!ok) {
            this.diagnostics.reportError(
              'E2002',
              `Duplicate parameter '${param.name}' in lambda.`,
              param.span,
              this.currentFile
            );
          } else {
            const sym = this.currentScope.lookupLocal(param.name);
            if (sym) this.declaredSymbols.set(param, sym);
          }
        }
        if (lambda.body.kind === 'Block') {
          this.resolveBlock(lambda.body as Block, false);
        } else {
          this.resolveExpression(lambda.body as Expr);
        }
        this.currentScope = parentScope;
        break;
      }
    }
  }

  private resolvePattern(pattern: Pattern): void {
    if (pattern.kind === 'IdentifierPattern') {
      const idPattern = pattern as IdentifierPattern;
      const ok = this.currentScope.define({
        name: idPattern.name,
        kind: 'variable',
        span: idPattern.span,
        isMut: idPattern.isMut,
        declNode: idPattern,
      });
      if (ok) {
        const sym = this.currentScope.lookupLocal(idPattern.name);
        if (sym) this.declaredSymbols.set(idPattern, sym);
      }
    } else if (pattern.kind === 'ConstructorPattern') {
      const ctorPattern = pattern as ConstructorPattern;
      for (const arg of ctorPattern.args) {
        this.resolvePattern(arg);
      }
    }
    // LiteralPattern and WildcardPattern introduce no bindings
  }
}

