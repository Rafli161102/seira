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
  CallExpr,
  ConstStmt,
  EnumDecl,
  Expr,
  ExprStmt,
  FunctionDecl,
  Identifier,
  IfExpr,
  LetStmt,
  MemberExpr,
  OptionFallbackExpr,
  OptionPropagateExpr,
  PipelineExpr,
  Program,
  RangeExpr,
  ReturnStmt,
  Stmt,
  StructDecl,
  TypeAliasDecl,
  TypeAnnotation,
  UnaryExpr,
  WithStmt,
} from '../ast/ast.ts';
import { DiagnosticBag, type Span } from '../diagnostics/index.ts';
import { Scope, type ScopeKind, type SymbolInfo } from './scope.ts';

export * from './scope.ts';

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
  private currentFile?: string;

  constructor(diagnostics?: DiagnosticBag) {
    this.diagnostics = diagnostics ?? new DiagnosticBag();
    this.globalScope = new Scope('global');
    this.currentScope = this.globalScope;
    this.registerBuiltins();
  }

  private registerBuiltins(): void {
    const dummySpan: Span = { start: 0, end: 0, line: 1, column: 1 };

    // Standard built-in types
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
    ];
    for (const typeName of builtinTypes) {
      this.globalScope.define({
        name: typeName,
        kind: 'type',
        span: dummySpan,
        isMut: false,
      });
    }

    // Built-in I/O functions
    this.globalScope.define({
      name: 'println',
      kind: 'builtin',
      span: dummySpan,
      isMut: false,
    });
    this.globalScope.define({
      name: 'print',
      kind: 'builtin',
      span: dummySpan,
      isMut: false,
    });

    // Built-in constructors and utilities
    this.globalScope.define({
      name: 'Some',
      kind: 'builtin',
      span: dummySpan,
      isMut: false,
    });
    this.globalScope.define({
      name: 'None',
      kind: 'builtin',
      span: dummySpan,
      isMut: false,
    });
    this.globalScope.define({
      name: 'Ok',
      kind: 'builtin',
      span: dummySpan,
      isMut: false,
    });
    this.globalScope.define({
      name: 'Err',
      kind: 'builtin',
      span: dummySpan,
      isMut: false,
    });
    this.globalScope.define({
      name: 'open_resource',
      kind: 'builtin',
      span: dummySpan,
      isMut: false,
    });
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
        case 'FunctionDecl': {
          const ok = this.globalScope.define({
            name: item.name,
            kind: 'function',
            span: item.span,
            isMut: false,
            declNode: item,
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
      }
    }
  }

  private resolveDeclaration(item: ASTNode): void {
    switch (item.kind) {
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
      case 'BindingStmt':
        this.resolveBindingStmt(item as BindingStmt);
        break;
      case 'LetStmt':
        this.resolveLetStmt(item as LetStmt);
        break;
      case 'ConstStmt':
        this.resolveConstStmt(item as ConstStmt);
        break;
      case 'AssignStmt':
        this.resolveAssignStmt(item as AssignStmt);
        break;
      case 'ExprStmt':
        this.resolveExpression((item as ExprStmt).expression);
        break;
      case 'ReturnStmt':
        this.resolveReturnStmt(item as ReturnStmt);
        break;
      case 'WithStmt':
        this.resolveWithStmt(item as WithStmt);
        break;
    }
  }

  private resolveFunctionDecl(fn: FunctionDecl): void {
    const parentScope = this.currentScope;
    this.currentScope = new Scope('function', parentScope);

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
    this.resolveTypeAnnotation(alias.targetType);
  }

  private resolveTypeAnnotation(annotation: TypeAnnotation): void {
    const sym = this.currentScope.lookup(annotation.name);
    if (!sym || sym.kind !== 'type') {
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
        break;
      }
      case 'Literal':
        // Literals require no name resolution
        break;
    }
  }
}
