/**
 * Seira High-Level Intermediate Representation (HIR) — Lowering Engine
 *
 * Implements the official AST -> HIR lowering pass:
 * AST + ResolverResult + TypecheckResult -> HIRProgram
 *
 * Responsibilities:
 * - Maps AST nodes to canonical, strongly-typed HIR nodes.
 * - Desugars pipelines (|>), fallback (??), propagation (?), and with blocks.
 * - Attaches semantic symbol identities (SymbolId) and types (HIRType).
 * - Preserves source provenance via SourceOrigin (Source vs Synthetic).
 * - Generates deterministic NodeIds and semantic IDs.
 */

import type {
  ASTNode,
  AssignStmt,
  BinaryExpr,
  BindingStmt,
  Block,
  BlockExpr,
  CallExpr,
  ConstStmt,
  ConstructorPattern,
  Expr,
  ExprStmt,
  ForStmt,
  FunctionDecl,
  GenericParamNode,
  Identifier,
  IdentifierPattern,
  IfExpr,
  ImplDecl,
  IndexExpr,
  LambdaExpr,
  LetStmt,
  ListLiteral,
  Literal,
  LiteralPattern,
  LoopStmt,
  MapLiteral,
  MatchArm,
  MatchExpr,
  MemberExpr,
  OptionFallbackExpr,
  OptionPropagateExpr,
  Param,
  Pattern,
  PipelineExpr,
  Program,
  ReturnStmt,
  SetLiteral,
  Stmt,
  StructDecl,
  TopLevelItem,
  TraitDecl,
  TupleLiteral,
  UnaryExpr,
  WhileStmt,
  WildcardPattern,
  WithStmt,
} from '../ast/ast.ts';
import { DiagnosticBag, type Span } from '../diagnostics/index.ts';
import { Resolver, type ResolverResult } from '../resolver/index.ts';
import { TypeChecker, type TypecheckResult } from '../typecheck/index.ts';
import type { Type } from '../typecheck/types.ts';
import {
  createFieldId,
  createFunctionId,
  createGenericParamId,
  createImplId,
  createModuleId,
  createNodeId,
  createSymbolId,
  createTraitId,
  createTypeId,
  type FieldId,
  type FunctionId,
  type GenericParamId,
  type NodeId,
  type SymbolId,
  type TraitId,
} from './ids.ts';
import type {
  HIRBlock,
  HIRConstructKind,
  HIRExpr,
  HIRField,
  HIRFunction,
  HIRFunctionSignature,
  HIRGenericParam,
  HIRImpl,
  HIRItem,
  HIRMatchArm,
  HIRMethodDispatch,
  HIRModule,
  HIRParameter,
  HIRPattern,
  HIRProgram,
  HIRStmt,
  HIRStruct,
  HIRTrait,
} from './nodes.ts';
import { fromSource, fromSynthetic, type SourceOrigin } from './origin.ts';
import {
  HIR_BOOL_TYPE,
  HIR_BYTE_TYPE,
  HIR_CHAR_TYPE,
  HIR_FLOAT_TYPE,
  HIR_INT_TYPE,
  HIR_STRING_TYPE,
  HIR_UINT_TYPE,
  HIR_UNIT_TYPE,
  HIR_UNKNOWN_TYPE,
  type HIRType,
  typeToHIRType,
} from './types.ts';

export class HIRLowering {
  private readonly diagnostics: DiagnosticBag;
  private nextNodeId: number = 1;
  private currentFile?: string;
  private resolverResult?: ResolverResult;
  private typecheckResult?: TypecheckResult;
  private currentFunction?: string;
  private disambiguatorMap = new Map<string, number>();

  constructor(diagnostics?: DiagnosticBag) {
    this.diagnostics = diagnostics ?? new DiagnosticBag();
  }

  private allocId(): NodeId {
    return createNodeId(this.nextNodeId++);
  }

  private getSymbolId(name: string, scopeName: string = 'local'): SymbolId {
    const key = `${scopeName}:${name}`;
    const count = (this.disambiguatorMap.get(key) ?? 0) + 1;
    this.disambiguatorMap.set(key, count);
    return createSymbolId(scopeName, name, count > 1 ? count : undefined);
  }

  private getType(node: ASTNode): HIRType {
    if (this.typecheckResult && this.typecheckResult.nodeTypes.has(node)) {
      return typeToHIRType(this.typecheckResult.nodeTypes.get(node)!);
    }
    return HIR_UNKNOWN_TYPE;
  }

  /**
   * Lowers a Program AST into a canonical HIRProgram.
   * Accepts ResolverResult and TypecheckResult. If omitted, runs them automatically.
   */
  public lower(
    program: Program,
    resolverOrFile?: ResolverResult | string,
    typecheckOrFile?: TypecheckResult | string,
    file?: string
  ): HIRProgram {
    let targetFile = file;
    let resolverResult: ResolverResult | undefined;
    let typecheckResult: TypecheckResult | undefined;

    if (typeof resolverOrFile === 'string') {
      targetFile = resolverOrFile;
    } else if (resolverOrFile && 'globalScope' in resolverOrFile) {
      resolverResult = resolverOrFile;
    }

    if (typeof typecheckOrFile === 'string') {
      targetFile = typecheckOrFile;
    } else if (typecheckOrFile && 'nodeTypes' in typecheckOrFile) {
      typecheckResult = typecheckOrFile;
    }

    this.currentFile = targetFile;
    this.nextNodeId = 1;
    this.disambiguatorMap.clear();

    // If semantic results were not supplied, execute front-end passes cleanly
    if (!resolverResult) {
      const resolver = new Resolver(this.diagnostics);
      resolverResult = resolver.resolve(program, this.currentFile);
    }
    this.resolverResult = resolverResult;

    if (!typecheckResult) {
      const typeChecker = new TypeChecker(this.diagnostics);
      typecheckResult = typeChecker.check(program, resolverResult, this.currentFile);
    }
    this.typecheckResult = typecheckResult;

    // Report I1001 for milestone observability & backward-compatibility test
    this.diagnostics.reportInfo(
      'I1001',
      'Lowered AST to High-Level Intermediate Representation (HIR).',
      program.span,
      this.currentFile,
      'HIR represents canonical typed semantic nodes for 0.0.11-s.'
    );

    const origin = fromSource(program.span, this.currentFile);
    const topLevelItems: HIRItem[] = [];

    for (const item of program.items) {
      const lowered = this.lowerTopLevelItem(item);
      if (lowered) {
        topLevelItems.push(lowered);
      }
    }

    const defaultModule: HIRModule = {
      kind: 'HIRModule',
      id: this.allocId(),
      moduleId: createModuleId(this.currentFile ?? 'main'),
      name: this.currentFile ?? 'main',
      items: topLevelItems,
      source: origin,
    };

    return {
      kind: 'HIRProgram',
      id: this.allocId(),
      version: '0.0.4-s',
      modules: [defaultModule],
      topLevelItems,
      source: origin,
    };
  }

  // ─── Top-Level Items ────────────────────────────────────────────────────────

  private lowerTopLevelItem(item: TopLevelItem): HIRItem | undefined {
    switch (item.kind) {
      case 'FunctionDecl':
        return this.lowerFunctionDecl(item as FunctionDecl);
      case 'StructDecl':
        return this.lowerStructDecl(item as StructDecl);
      case 'TraitDecl':
        return this.lowerTraitDecl(item as TraitDecl);
      case 'ImplDecl':
        return this.lowerImplDecl(item as ImplDecl);
      case 'ModuleDecl':
      case 'ImportDecl':
      case 'UseDecl':
      case 'EnumDecl':
      case 'TypeAliasDecl':
        return undefined;
      default:
        return this.lowerStmt(item as Stmt);
    }
  }

  private lowerGenericParams(params?: GenericParamNode[], container: string = ''): ReadonlyArray<HIRGenericParam> {
    if (!params || params.length === 0) return [];
    return params.map((p) => ({
      id: createGenericParamId(container, p.name),
      name: p.name,
      constraint: p.constraint ? createTraitId(p.constraint.name) : undefined,
    }));
  }

  private lowerFunctionDecl(fn: FunctionDecl, container: string = ''): HIRFunction {
    const prevFunction = this.currentFunction;
    this.currentFunction = fn.name;

    const fnId = createFunctionId(container, fn.name);
    const symId = createSymbolId(container || 'global', fn.name);
    const origin = fromSource(fn.span, this.currentFile);
    const genericParams = this.lowerGenericParams(fn.genericParams, fn.name);

    const fnType = this.typecheckResult?.nodeTypes.get(fn);
    const params: HIRParameter[] = fn.params.map((p, idx) => {
      const pSym = createSymbolId(`fn:${fn.name}`, p.name);
      let pType = HIR_UNKNOWN_TYPE;
      if (fnType && fnType.kind === 'Function' && fnType.params && fnType.params[idx]) {
        pType = typeToHIRType(fnType.params[idx]);
      } else {
        pType = this.getType(p);
      }
      return {
        kind: 'HIRParameter',
        id: this.allocId(),
        symbolId: pSym,
        name: p.name,
        type: pType,
        isMut: p.isMut,
        source: fromSource(p.span, this.currentFile),
      };
    });

    let returnType = HIR_UNIT_TYPE;
    if (fnType && fnType.kind === 'Function' && fnType.returnType) {
      returnType = typeToHIRType(fnType.returnType);
    } else {
      returnType = this.getType(fn);
    }
    const body = fn.isExpressionBody && fn.bodyExpr
      ? this.lowerExprToBlock(fn.bodyExpr)
      : this.lowerBlock(fn.body);

    const effects = fn.isEffectful ? ['IO'] : [];

    this.currentFunction = prevFunction;

    return {
      kind: 'HIRFunction',
      id: this.allocId(),
      functionId: fnId,
      symbolId: symId,
      name: fn.name,
      params,
      returnType,
      isEffectful: fn.isEffectful,
      effects,
      genericParams,
      body,
      isPublic: fn.isPublic ?? false,
      source: origin,
    };
  }

  private lowerStructDecl(struct: StructDecl): HIRStruct {
    const origin = fromSource(struct.span, this.currentFile);
    const typeId = createTypeId(struct.name);
    const genericParams = this.lowerGenericParams(struct.genericParams, struct.name);

    const fields: HIRField[] = struct.fields.map((f) => ({
      id: createFieldId(struct.name, f.name),
      name: f.name,
      type: this.getType(f.type),
      source: fromSource(f.type.span, this.currentFile),
    }));

    return {
      kind: 'HIRStruct',
      id: this.allocId(),
      typeId,
      name: struct.name,
      fields,
      genericParams,
      isPublic: struct.isPublic ?? false,
      source: origin,
    };
  }

  private lowerTraitDecl(trait: TraitDecl): HIRTrait {
    const origin = fromSource(trait.span, this.currentFile);
    const traitId = createTraitId(trait.name);
    const genericParams = this.lowerGenericParams(trait.genericParams, trait.name);

    const methods: HIRFunctionSignature[] = trait.methods.map((m) => ({
      name: m.name,
      params: m.params.map((p) => ({ name: p.name, type: this.getType(p) })),
      returnType: this.getType(m),
      isEffectful: m.isEffectful,
    }));

    return {
      kind: 'HIRTrait',
      id: this.allocId(),
      traitId,
      name: trait.name,
      genericParams,
      methods,
      isPublic: trait.isPublic ?? false,
      source: origin,
    };
  }

  private lowerImplDecl(impl: ImplDecl): HIRImpl {
    const origin = fromSource(impl.span, this.currentFile);
    const targetTypeName = impl.targetType.name;
    const traitName = impl.traitName;
    const implId = createImplId(targetTypeName, traitName);
    const targetType = this.getType(impl.targetType);
    const traitId = traitName ? createTraitId(traitName) : undefined;

    const methods: HIRFunction[] = impl.methods.map((m) =>
      this.lowerFunctionDecl(m, `${targetTypeName}:${traitName}`)
    );

    return {
      kind: 'HIRImpl',
      id: this.allocId(),
      implId,
      targetType,
      traitId,
      methods,
      source: origin,
    };
  }

  // ─── Blocks & Statements ────────────────────────────────────────────────────

  private lowerBlock(block: Block): HIRBlock {
    const origin = fromSource(block.span, this.currentFile);
    const statements: HIRStmt[] = [];

    for (const stmt of block.statements) {
      statements.push(this.lowerStmt(stmt));
    }

    return {
      kind: 'HIRBlock',
      id: this.allocId(),
      statements,
      source: origin,
    };
  }

  private lowerExprToBlock(expr: Expr): HIRBlock {
    const loweredExpr = this.lowerExpr(expr);
    const origin = loweredExpr.source;
    return {
      kind: 'HIRBlock',
      id: this.allocId(),
      statements: [
        {
          kind: 'HIRReturnStmt',
          id: this.allocId(),
          value: loweredExpr,
          source: origin,
        },
      ],
      resultExpr: loweredExpr,
      source: origin,
    };
  }

  private lowerStmt(stmt: Stmt): HIRStmt {
    const origin = fromSource(stmt.span, this.currentFile);

    switch (stmt.kind) {
      case 'LetStmt': {
        const letStmt = stmt as LetStmt;
        const symId = this.getSymbolId(letStmt.name, this.currentFunction ?? 'block');
        return {
          kind: 'HIRLetStmt',
          id: this.allocId(),
          symbolId: symId,
          name: letStmt.name,
          isMut: letStmt.isMut,
          type: this.getType(letStmt),
          initializer: letStmt.initializer ? this.lowerExpr(letStmt.initializer) : undefined,
          source: origin,
        };
      }

      case 'ConstStmt': {
        const constStmt = stmt as ConstStmt;
        const symId = this.getSymbolId(constStmt.name, this.currentFunction ?? 'block');
        return {
          kind: 'HIRLetStmt',
          id: this.allocId(),
          symbolId: symId,
          name: constStmt.name,
          isMut: false,
          type: this.getType(constStmt),
          initializer: this.lowerExpr(constStmt.initializer),
          source: origin,
        };
      }

      case 'BindingStmt': {
        const bindStmt = stmt as BindingStmt;
        const existingSym = this.resolverResult?.resolvedSymbols.get(bindStmt);
        if (existingSym) {
          const symId = createSymbolId(this.currentFunction ?? 'block', bindStmt.name);
          const targetType = existingSym.type ? typeToHIRType(existingSym.type) : this.getType(bindStmt);
          const targetExpr: HIRExpr = {
            kind: 'HIRLocalExpr',
            id: this.allocId(),
            symbolId: symId,
            name: bindStmt.name,
            type: targetType,
            source: origin,
          };
          return {
            kind: 'HIRAssignStmt',
            id: this.allocId(),
            operator: '=',
            target: targetExpr,
            value: this.lowerExpr(bindStmt.initializer),
            source: origin,
          };
        }

        const symId = this.getSymbolId(bindStmt.name, this.currentFunction ?? 'block');
        return {
          kind: 'HIRLetStmt',
          id: this.allocId(),
          symbolId: symId,
          name: bindStmt.name,
          isMut: bindStmt.isMut,
          type: this.getType(bindStmt),
          initializer: this.lowerExpr(bindStmt.initializer),
          source: origin,
        };
      }

      case 'AssignStmt': {
        const assign = stmt as AssignStmt;
        return {
          kind: 'HIRAssignStmt',
          id: this.allocId(),
          operator: assign.operator,
          target: this.lowerExpr(assign.target),
          value: this.lowerExpr(assign.value),
          source: origin,
        };
      }

      case 'ExprStmt': {
        const exprStmt = stmt as ExprStmt;
        return {
          kind: 'HIRExprStmt',
          id: this.allocId(),
          expr: this.lowerExpr(exprStmt.expression),
          source: origin,
        };
      }

      case 'ReturnStmt': {
        const ret = stmt as ReturnStmt;
        return {
          kind: 'HIRReturnStmt',
          id: this.allocId(),
          value: ret.value ? this.lowerExpr(ret.value) : undefined,
          source: origin,
        };
      }

      case 'BreakStmt':
        return {
          kind: 'HIRBreakStmt',
          id: this.allocId(),
          source: origin,
        };

      case 'ContinueStmt':
        return {
          kind: 'HIRContinueStmt',
          id: this.allocId(),
          source: origin,
        };

      case 'WithStmt': {
        const withStmt = stmt as WithStmt;
        const resExpr = this.lowerExpr(withStmt.resource);
        const aliasSymId = withStmt.alias
          ? this.getSymbolId(withStmt.alias, 'with')
          : undefined;
        return {
          kind: 'HIRWithStmt',
          id: this.allocId(),
          resource: resExpr,
          resourceType: resExpr.type,
          aliasSymbolId: aliasSymId,
          aliasName: withStmt.alias,
          body: this.lowerBlock(withStmt.body),
          cleanupContract: 'close',
          source: origin,
        };
      }

      case 'WhileStmt': {
        const whileStmt = stmt as WhileStmt;
        return {
          kind: 'HIRLoopStmt',
          id: this.allocId(),
          loopKind: 'Condition',
          condition: this.lowerExpr(whileStmt.condition),
          body: this.lowerBlock(whileStmt.body),
          source: origin,
        };
      }

      case 'ForStmt': {
        const forStmt = stmt as ForStmt;
        const symId = this.getSymbolId(forStmt.variable, 'for');
        return {
          kind: 'HIRLoopStmt',
          id: this.allocId(),
          loopKind: 'Iterator',
          iterator: {
            symbolId: symId,
            variableName: forStmt.variable,
            iterable: this.lowerExpr(forStmt.iterable),
          },
          body: this.lowerBlock(forStmt.body),
          source: origin,
        };
      }

      case 'LoopStmt': {
        const loopStmt = stmt as LoopStmt;
        return {
          kind: 'HIRLoopStmt',
          id: this.allocId(),
          loopKind: 'Infinite',
          body: this.lowerBlock(loopStmt.body),
          source: origin,
        };
      }
    }
  }

  // ─── Expressions ────────────────────────────────────────────────────────────

  public lowerExpr(expr: Expr): HIRExpr {
    const origin = fromSource(expr.span, this.currentFile);
    const exprType = this.getType(expr);

    switch (expr.kind) {
      case 'Literal': {
        const lit = expr as Literal;
        const litKind = lit.literalKind ?? this.inferLiteralKind(lit.value);
        return {
          kind: 'HIRLiteralExpr',
          id: this.allocId(),
          literalKind: litKind,
          value: lit.value,
          raw: lit.raw,
          type: exprType.kind === 'Unknown' ? this.typeFromLiteralKind(litKind) : exprType,
          source: origin,
        };
      }

      case 'Identifier': {
        const id = expr as Identifier;
        const sym = this.resolverResult?.resolvedSymbols.get(id);
        const symbolId = sym ? createSymbolId(sym.kind, sym.name) : createSymbolId('unknown', id.name);
        if (sym && (sym.kind === 'function' || sym.kind === 'builtin')) {
          return {
            kind: 'HIRGlobalExpr',
            id: this.allocId(),
            symbolId,
            name: id.name,
            type: exprType,
            source: origin,
          };
        }
        return {
          kind: 'HIRLocalExpr',
          id: this.allocId(),
          symbolId,
          name: id.name,
          type: exprType,
          source: origin,
        };
      }

      case 'BinaryExpr': {
        const bin = expr as BinaryExpr;
        return {
          kind: 'HIRBinaryExpr',
          id: this.allocId(),
          operator: bin.operator,
          left: this.lowerExpr(bin.left),
          right: this.lowerExpr(bin.right),
          type: exprType,
          source: origin,
        };
      }

      case 'UnaryExpr': {
        const un = expr as UnaryExpr;
        return {
          kind: 'HIRUnaryExpr',
          id: this.allocId(),
          operator: un.operator,
          operand: this.lowerExpr(un.operand),
          type: exprType,
          source: origin,
        };
      }

      // Canonical desugaring: a |> b
      case 'PipelineExpr': {
        const pipe = expr as PipelineExpr;
        return this.desugarPipeline(pipe);
      }

      // Canonical desugaring: opt ?? def
      case 'OptionFallbackExpr': {
        const fallback = expr as OptionFallbackExpr;
        const synthOrigin = fromSynthetic(fallback.span, 'desugared_option_fallback', this.currentFile);
        return {
          kind: 'HIRFallbackExpr',
          id: this.allocId(),
          left: this.lowerExpr(fallback.left),
          right: this.lowerExpr(fallback.right),
          type: exprType,
          source: synthOrigin,
        };
      }

      // Canonical desugaring: expr?
      case 'OptionPropagateExpr': {
        const prop = expr as OptionPropagateExpr;
        const operand = this.lowerExpr(prop.operand);
        const synthOrigin = fromSynthetic(prop.span, 'desugared_try_propagation', this.currentFile);
        const tryKind = operand.type.kind === 'Result' ? 'Result' : 'Option';
        return {
          kind: 'HIRTryExpr',
          id: this.allocId(),
          operand,
          tryKind,
          type: exprType,
          source: synthOrigin,
        };
      }

      case 'CallExpr': {
        const call = expr as CallExpr;
        return this.lowerCall(call);
      }

      case 'MemberExpr': {
        const mem = expr as MemberExpr;
        const target = this.lowerExpr(mem.object);
        const structName = target.type.name && target.type.name !== 'Unknown' ? target.type.name : 'member';
        return {
          kind: 'HIRFieldAccessExpr',
          id: this.allocId(),
          target,
          fieldId: createFieldId(structName, mem.property),
          fieldName: mem.property,
          type: exprType,
          source: origin,
        };
      }

      case 'IndexExpr': {
        const idx = expr as IndexExpr;
        return {
          kind: 'HIRIndexExpr',
          id: this.allocId(),
          target: this.lowerExpr(idx.object),
          index: this.lowerExpr(idx.index),
          type: exprType,
          source: origin,
        };
      }

      case 'IfExpr': {
        const ifExpr = expr as IfExpr;
        let elseBranch: HIRBlock | HIRExpr | undefined;
        if (ifExpr.elseBranch) {
          if ('condition' in ifExpr.elseBranch) {
            elseBranch = this.lowerExpr(ifExpr.elseBranch as Expr);
          } else {
            elseBranch = this.lowerBlock(ifExpr.elseBranch as Block);
          }
        }
        return {
          kind: 'HIRIfExpr',
          id: this.allocId(),
          condition: this.lowerExpr(ifExpr.condition),
          thenBranch: this.lowerBlock(ifExpr.thenBranch),
          elseBranch,
          type: exprType,
          source: origin,
        };
      }

      case 'BlockExpr': {
        const blkExpr = expr as BlockExpr;
        return {
          kind: 'HIRBlockExpr',
          id: this.allocId(),
          block: this.lowerBlock(blkExpr.block),
          type: exprType,
          source: origin,
        };
      }

      case 'MatchExpr': {
        const match = expr as MatchExpr;
        const arms: HIRMatchArm[] = match.arms.map((a) => ({
          kind: 'HIRMatchArm',
          id: this.allocId(),
          pattern: this.lowerPattern(a.pattern),
          body: 'kind' in a.body && a.body.kind === 'Block'
            ? this.lowerBlock(a.body as Block)
            : this.lowerExpr(a.body as Expr),
          source: fromSource(a.span, this.currentFile),
        }));
        return {
          kind: 'HIRMatchExpr',
          id: this.allocId(),
          value: this.lowerExpr(match.value),
          arms,
          isExhaustive: true,
          type: exprType,
          source: origin,
        };
      }

      case 'LambdaExpr': {
        const lambda = expr as LambdaExpr;
        const fnType = exprType.kind === 'Function' ? exprType : undefined;
        const params: HIRParameter[] = lambda.params.map((p, idx) => {
          let paramType = HIR_UNKNOWN_TYPE;
          if (fnType && fnType.paramTypes && fnType.paramTypes[idx]) {
            paramType = fnType.paramTypes[idx];
          } else {
            paramType = this.getType(p);
          }
          return {
            kind: 'HIRParameter',
            id: this.allocId(),
            symbolId: this.getSymbolId(p.name, 'lambda'),
            name: p.name,
            type: paramType,
            isMut: p.isMut,
            source: fromSource(p.span, this.currentFile),
          };
        });
        const body = 'kind' in lambda.body && lambda.body.kind === 'Block'
          ? this.lowerBlock(lambda.body as Block)
          : this.lowerExprToBlock(lambda.body as Expr);
        return {
          kind: 'HIRClosureExpr',
          id: this.allocId(),
          params,
          body,
          capturedSymbols: [],
          type: exprType,
          source: origin,
        };
      }

      case 'ListLiteral': {
        const list = expr as ListLiteral;
        return {
          kind: 'HIRConstructExpr',
          id: this.allocId(),
          constructKind: 'List',
          elements: list.elements.map((e) => this.lowerExpr(e)),
          type: exprType,
          source: origin,
        };
      }

      case 'TupleLiteral': {
        const tup = expr as TupleLiteral;
        return {
          kind: 'HIRConstructExpr',
          id: this.allocId(),
          constructKind: 'Tuple',
          elements: tup.elements.map((e) => this.lowerExpr(e)),
          type: exprType,
          source: origin,
        };
      }

      case 'MapLiteral': {
        const map = expr as MapLiteral;
        const entries = map.entries.map((entry) => ({
          key: this.lowerExpr(entry.key),
          value: this.lowerExpr(entry.value),
        }));
        return {
          kind: 'HIRConstructExpr',
          id: this.allocId(),
          constructKind: 'Map',
          entries,
          type: exprType,
          source: origin,
        };
      }

      case 'SetLiteral': {
        const set = expr as SetLiteral;
        return {
          kind: 'HIRConstructExpr',
          id: this.allocId(),
          constructKind: 'Set',
          elements: set.elements.map((e) => this.lowerExpr(e)),
          type: exprType,
          source: origin,
        };
      }

      default:
        return {
          kind: 'HIRLiteralExpr',
          id: this.allocId(),
          literalKind: 'unit',
          value: null,
          raw: '()',
          type: HIR_UNIT_TYPE,
          source: origin,
        };
    }
  }

  // ─── Call & Pipeline Lowering ───────────────────────────────────────────────

  private lowerCall(call: CallExpr): HIRExpr {
    const origin = fromSource(call.span, this.currentFile);
    const callType = this.getType(call);
    const args = call.args.map((a) => this.lowerExpr(a));
    const genericArgs = call.typeArguments?.map((t) => typeToHIRType({ kind: 'Custom', name: t.name }));

    // Method Call: receiver.method(...)
    if (call.callee.kind === 'MemberExpr') {
      const mem = call.callee as MemberExpr;
      const receiver = this.lowerExpr(mem.object);
      const dispatch = this.resolveMethodDispatch(receiver.type, mem.property);

      return {
        kind: 'HIRMethodCallExpr',
        id: this.allocId(),
        receiver,
        method: mem.property,
        dispatch,
        args,
        genericArgs,
        type: callType,
        source: origin,
      };
    }

    // Direct Named Function Call: fn_name(...)
    if (call.callee.kind === 'Identifier') {
      const id = call.callee as Identifier;
      const fnId = createFunctionId('', id.name);
      const calleeExpr = this.lowerExpr(call.callee);

      return {
        kind: 'HIRCallExpr',
        id: this.allocId(),
        functionId: fnId,
        callee: calleeExpr,
        args,
        genericArgs,
        type: callType,
        source: origin,
      };
    }

    // Function Value / Closure Call: f(...)
    const callee = this.lowerExpr(call.callee);
    return {
      kind: 'HIRFunctionValueCallExpr',
      id: this.allocId(),
      callee,
      args,
      type: callType,
      source: origin,
    };
  }

  private desugarPipeline(pipe: PipelineExpr): HIRExpr {
    const synthOrigin = fromSynthetic(pipe.span, 'desugared_pipeline', this.currentFile);
    const pipeType = this.getType(pipe);
    const leftLowered = this.lowerExpr(pipe.left);

    // If right is already a CallExpr: foo |> bar(arg) -> bar(foo, arg)
    if (pipe.right.kind === 'CallExpr') {
      const rightCall = pipe.right as CallExpr;
      const args = [leftLowered, ...rightCall.args.map((a) => this.lowerExpr(a))];

      if (rightCall.callee.kind === 'Identifier') {
        const id = rightCall.callee as Identifier;
        const fnId = createFunctionId('', id.name);
        return {
          kind: 'HIRCallExpr',
          id: this.allocId(),
          functionId: fnId,
          callee: this.lowerExpr(rightCall.callee),
          args,
          type: pipeType,
          source: synthOrigin,
        };
      }

      return {
        kind: 'HIRFunctionValueCallExpr',
        id: this.allocId(),
        callee: this.lowerExpr(rightCall.callee),
        args,
        type: pipeType,
        source: synthOrigin,
      };
    }

    // If right is an identifier or other expression: foo |> bar -> bar(foo)
    if (pipe.right.kind === 'Identifier') {
      const id = pipe.right as Identifier;
      const fnId = createFunctionId('', id.name);
      return {
        kind: 'HIRCallExpr',
        id: this.allocId(),
        functionId: fnId,
        callee: this.lowerExpr(pipe.right),
        args: [leftLowered],
        type: pipeType,
        source: synthOrigin,
      };
    }

    return {
      kind: 'HIRFunctionValueCallExpr',
      id: this.allocId(),
      callee: this.lowerExpr(pipe.right),
      args: [leftLowered],
      type: pipeType,
      source: synthOrigin,
    };
  }

  private resolveMethodDispatch(receiverType: HIRType, property: string): HIRMethodDispatch {
    const BUILTIN_OPERATIONS = new Set([
      'map', 'filter', 'take', 'skip', 'enumerate', 'zip', 'fold', 'reduce', 'collect',
      'is_some', 'is_none', 'unwrap', 'expect', 'unwrap_or', 'unwrap_or_else', 'and_then', 'or_else',
      'is_ok', 'is_err', 'map_err',
      'length', 'is_empty', 'first', 'last', 'get', 'push', 'contains', 'iter', 'reverse',
      'keys', 'values', 'insert', 'remove',
      'trim', 'split', 'replace', 'chars', 'bytes', 'encode', 'decode',
      'read', 'read_all', 'write', 'seek', 'position', 'flush', 'close', 'is_closed', 'reset', 'clear',
    ]);

    if (BUILTIN_OPERATIONS.has(property)) {
      return { kind: 'Builtin', operation: property };
    }

    const traitMethods = new Map<string, string>([
      ['read', 'Reader'],
      ['write', 'Writer'],
      ['seek', 'Seekable'],
      ['flush', 'Flushable'],
      ['length', 'Sized'],
      ['close', 'Resource'],
      ['print', 'Printable'],
    ]);

    const matchingTrait = traitMethods.get(property);
    if (matchingTrait) {
      return {
        kind: 'Trait',
        traitId: createTraitId(matchingTrait),
        methodId: createFunctionId(matchingTrait, property),
      };
    }

    return {
      kind: 'Concrete',
      methodId: createFunctionId(receiverType.name, property),
    };
  }

  // ─── Pattern Lowering ───────────────────────────────────────────────────────

  private lowerPattern(pattern: Pattern): HIRPattern {
    const origin = fromSource(pattern.span, this.currentFile);

    switch (pattern.kind) {
      case 'WildcardPattern':
        return {
          kind: 'HIRWildcardPattern',
          id: this.allocId(),
          source: origin,
        };

      case 'LiteralPattern': {
        const litPat = pattern as LiteralPattern;
        const litExpr = this.lowerExpr(litPat.literal) as any;
        return {
          kind: 'HIRLiteralPattern',
          id: this.allocId(),
          literal: litExpr,
          source: origin,
        };
      }

      case 'IdentifierPattern': {
        const idPat = pattern as IdentifierPattern;
        const symId = this.getSymbolId(idPat.name, 'pattern');
        return {
          kind: 'HIRBindingPattern',
          id: this.allocId(),
          symbolId: symId,
          name: idPat.name,
          isMut: idPat.isMut,
          type: this.getType(pattern),
          source: origin,
        };
      }

      case 'ConstructorPattern': {
        const ctor = pattern as ConstructorPattern;
        return {
          kind: 'HIRConstructorPattern',
          id: this.allocId(),
          name: ctor.name,
          args: ctor.args.map((a) => this.lowerPattern(a)),
          source: origin,
        };
      }
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private inferLiteralKind(val: string | number | bigint | boolean): 'int' | 'uint' | 'float' | 'bool' | 'char' | 'string' {
    if (typeof val === 'boolean') return 'bool';
    if (typeof val === 'bigint') return 'int';
    if (typeof val === 'number') return Number.isInteger(val) ? 'int' : 'float';
    if (typeof val === 'string') return val.length === 1 ? 'char' : 'string';
    return 'int';
  }

  private typeFromLiteralKind(kind: string): HIRType {
    switch (kind) {
      case 'int': return HIR_INT_TYPE;
      case 'uint': return HIR_UINT_TYPE;
      case 'float': return HIR_FLOAT_TYPE;
      case 'bool': return HIR_BOOL_TYPE;
      case 'char': return HIR_CHAR_TYPE;
      case 'string': return HIR_STRING_TYPE;
      default: return HIR_UNIT_TYPE;
    }
  }
}
