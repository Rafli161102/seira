/**
 * Seira Compiler Type Checker & Semantic Validator
 *
 * Implements static type inference, type checking, and semantic validation:
 * - Deterministic type representations and structural equality
 * - Static type inference (literals, variables, expressions)
 * - Explicit type annotation verification
 * - No implicit coercions (Int + String rejected)
 * - Strict Boolean requirements (no truthy/falsy semantics for if conditions, and/or/not)
 * - Function call validation (parameter count, argument types, return types)
 * - Assignment mutability and type compatibility checking
 * - Option<T> and Result<T, E> foundational semantics
 * - Postfix ? and pipeline (|>) semantic validation
 *
 * Emits diagnostic codes:
 * - E3001: Type mismatch
 * - E3002: Invalid operand type for operator
 * - E3003: Invalid function argument (count or type) / not callable
 * - E3004: Invalid return type
 * - E3005: Invalid condition type (non-Bool in if)
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
  Pattern,
  PipelineExpr,
  Program,
  RangeExpr,
  ReturnStmt,
  SetLiteral,
  Stmt,
  TraitDecl,
  TupleLiteral,
  TypeAliasDecl,
  TypeAnnotation,
  UnaryExpr,
  WhileStmt,
  WildcardPattern,
  WithStmt,
} from '../ast/ast.ts';
import { DiagnosticBag, type Span } from '../diagnostics/index.ts';
import { Resolver, type ResolverResult, type SymbolInfo } from '../resolver/index.ts';
import {
  areTypesEqual,
  BOOL_TYPE,
  BYTE_TYPE,
  CHAR_TYPE,
  createFunctionType,
  createListType,
  createMapType,
  createOptionType,
  createResultType,
  createSetType,
  createTupleType,
  FLOAT_TYPE,
  formatType,
  INT_TYPE,
  isBool,
  isFloat,
  isInt,
  isNumeric,
  isString,
  isTypeAssignable,
  isUInt,
  isUnknown,
  STRING_TYPE,
  substituteType,
  UINT_TYPE,
  unifyTypes,
  UNIT_TYPE,
  UNKNOWN_TYPE,
} from './types.ts';
import type {
  FunctionType,
  GenericParamType,
  MapType,
  OptionType,
  ResultType,
  SetType,
  Type,
  UnionType,
} from './types.ts';

export * from './types.ts';

export interface TypecheckResult {
  readonly success: boolean;
  readonly diagnostics: DiagnosticBag;
  readonly nodeTypes: Map<ASTNode, Type>;
}

export class TypeChecker {
  private readonly diagnostics: DiagnosticBag;
  private readonly nodeTypes = new Map<ASTNode, Type>();
  private currentResolverResult?: ResolverResult;
  private currentFile?: string;
  private currentFunctionReturnType?: Type;

  private readonly traits = new Map<string, TraitDecl>();
  private readonly implementations = new Map<string, Set<string>>();
  private readonly typeAliases = new Map<string, TypeAliasDecl>();
  private currentGenericParams?: Map<string, GenericParamType>;
  private readonly aliasExpansionStack = new Set<string>();

  constructor(diagnostics?: DiagnosticBag) {
    this.diagnostics = diagnostics ?? new DiagnosticBag();
  }

  public check(
    program: Program,
    resolverOrFile?: ResolverResult | string,
    file?: string
  ): TypecheckResult {
    let resolverResult: ResolverResult;
    let targetFile = file;

    if (typeof resolverOrFile === 'string') {
      targetFile = resolverOrFile;
      const resolver = new Resolver(this.diagnostics);
      resolverResult = resolver.resolve(program, targetFile);
    } else if (resolverOrFile && 'globalScope' in resolverOrFile) {
      resolverResult = resolverOrFile;
    } else {
      const resolver = new Resolver(this.diagnostics);
      resolverResult = resolver.resolve(program, targetFile);
    }

    this.currentResolverResult = resolverResult;
    this.currentFile = targetFile;

    this.traits.clear();
    this.implementations.clear();
    this.typeAliases.clear();
    this.currentGenericParams = undefined;
    this.aliasExpansionStack.clear();

    // Pass 1a: collect traits, type aliases, and trait implementations
    for (const item of program.items) {
      if (item.kind === 'TraitDecl') {
        const trait = item as TraitDecl;
        this.traits.set(trait.name, trait);
      } else if (item.kind === 'TypeAliasDecl') {
        const alias = item as TypeAliasDecl;
        this.typeAliases.set(alias.name, alias);
      } else if (item.kind === 'ImplDecl') {
        const impl = item as ImplDecl;
        const targetTypeName = impl.targetType.name;
        if (!this.implementations.has(targetTypeName)) {
          this.implementations.set(targetTypeName, new Set());
        }
        this.implementations.get(targetTypeName)!.add(impl.traitName);
      }
    }

    // Pass 1b: register function signatures so calls can be verified regardless of order
    for (const item of program.items) {
      if (item.kind === 'FunctionDecl') {
        this.registerFunctionSignature(item as FunctionDecl);
      }
    }

    // Pass 2: typecheck declarations and statements
    for (const item of program.items) {
      this.checkDeclaration(item);
    }

    return {
      success: !this.diagnostics.hasErrors(),
      diagnostics: this.diagnostics,
      nodeTypes: this.nodeTypes,
    };
  }

  private registerFunctionSignature(fn: FunctionDecl): void {
    let genericParamTypes: GenericParamType[] | undefined;
    const prevGenericParams = this.currentGenericParams;

    if (fn.genericParams && fn.genericParams.length > 0) {
      genericParamTypes = [];
      const gMap = new Map<string, GenericParamType>();
      for (const p of fn.genericParams) {
        const constraintType = p.constraint ? this.resolveTypeAnnotation(p.constraint) : undefined;
        const gType: GenericParamType = {
          kind: 'GenericParam',
          name: p.name,
          constraint: constraintType,
        };
        genericParamTypes.push(gType);
        gMap.set(p.name, gType);
      }
      this.currentGenericParams = gMap;
    }

    const paramTypes: Type[] = fn.params.map((p) =>
      p.typeAnnotation ? this.resolveTypeAnnotation(p.typeAnnotation) : UNKNOWN_TYPE
    );
    const returnType: Type = fn.returnType
      ? this.resolveTypeAnnotation(fn.returnType)
      : UNIT_TYPE;

    this.currentGenericParams = prevGenericParams;

    const fnType = createFunctionType(paramTypes, returnType, fn.isEffectful, genericParamTypes);
    this.nodeTypes.set(fn, fnType);

    const sym = this.currentResolverResult?.globalScope.lookup(fn.name);
    if (sym) {
      sym.type = fnType;
    }
  }

  private checkDeclaration(item: ASTNode): void {
    switch (item.kind) {
      case 'FunctionDecl':
        this.checkFunctionDecl(item as FunctionDecl);
        break;
      case 'TraitDecl':
        this.checkTraitDecl(item as TraitDecl);
        break;
      case 'ImplDecl':
        this.checkImplDecl(item as ImplDecl);
        break;
      case 'StructDecl':
      case 'EnumDecl':
      case 'TypeAliasDecl':
        break;
      default:
        this.checkStatement(item as Stmt);
        break;
    }
  }

  private checkTraitDecl(trait: TraitDecl): void {
    for (const method of trait.methods) {
      for (const param of method.params) {
        if (param.typeAnnotation) {
          this.resolveTypeAnnotation(param.typeAnnotation);
        }
      }
      if (method.returnType) {
        this.resolveTypeAnnotation(method.returnType);
      }
    }
  }

  private checkImplDecl(implDecl: ImplDecl): void {
    const targetType = this.resolveTypeAnnotation(implDecl.targetType);
    const traitDecl = this.traits.get(implDecl.traitName);

    if (!traitDecl) {
      this.diagnostics.reportError(
        'E4004',
        `Trait '${implDecl.traitName}' not found in implementation for '${formatType(targetType)}'.`,
        implDecl.span,
        this.currentFile
      );
      return;
    }

    // Verify all required methods from the trait are implemented
    for (const reqMethod of traitDecl.methods) {
      const implMethod = implDecl.methods.find((m) => m.name === reqMethod.name);
      if (!implMethod) {
        this.diagnostics.reportError(
          'E4004',
          `Type '${formatType(targetType)}' does not implement required method '${reqMethod.name}' from trait '${implDecl.traitName}'.`,
          implDecl.span,
          this.currentFile
        );
        continue;
      }

      const reqParamTypes = reqMethod.params.map((p) =>
        p.typeAnnotation ? this.resolveTypeAnnotation(p.typeAnnotation) : UNKNOWN_TYPE
      );
      const reqRetType = reqMethod.returnType ? this.resolveTypeAnnotation(reqMethod.returnType) : UNIT_TYPE;

      const implParamTypes = implMethod.params.map((p) =>
        p.typeAnnotation ? this.resolveTypeAnnotation(p.typeAnnotation) : UNKNOWN_TYPE
      );
      const implRetType = implMethod.returnType ? this.resolveTypeAnnotation(implMethod.returnType) : UNIT_TYPE;

      const paramMatch =
        reqParamTypes.length === implParamTypes.length &&
        reqParamTypes.every((p, idx) => areTypesEqual(p, implParamTypes[idx]));
      const retMatch = areTypesEqual(reqRetType, implRetType);

      if (!paramMatch || !retMatch) {
        this.diagnostics.reportError(
          'E4006',
          `Method signature mismatch for '${implMethod.name}' in implementation of trait '${implDecl.traitName}': expected '(${reqParamTypes.map(formatType).join(', ')}) -> ${formatType(reqRetType)}', but found '(${implParamTypes.map(formatType).join(', ')}) -> ${formatType(implRetType)}'.`,
          implMethod.span,
          this.currentFile
        );
      }

      // Check method body
      this.checkFunctionDecl(implMethod);
    }

    // Check for extraneous methods
    for (const implMethod of implDecl.methods) {
      if (!traitDecl.methods.some((m) => m.name === implMethod.name)) {
        this.diagnostics.reportError(
          'E4004',
          `Method '${implMethod.name}' is not declared in trait '${implDecl.traitName}'.`,
          implMethod.span,
          this.currentFile
        );
      }
    }
  }

  private typeSatisfiesConstraint(type: Type, constraintName: string): boolean {
    if (type.kind === 'Primitive' && type.name === 'Unknown') return true;
    if (type.kind === 'TypeAlias') {
      return this.typeSatisfiesConstraint(type.target, constraintName);
    }
    const typeName =
      type.kind === 'Custom' ? type.name : type.kind === 'Primitive' ? type.name : formatType(type);
    const implemented = this.implementations.get(typeName);
    return implemented ? implemented.has(constraintName) : false;
  }

  private checkFunctionDecl(fn: FunctionDecl): void {
    const prevGenericParams = this.currentGenericParams;
    if (fn.genericParams && fn.genericParams.length > 0) {
      const gMap = new Map<string, GenericParamType>();
      for (const p of fn.genericParams) {
        const constraintType = p.constraint ? this.resolveTypeAnnotation(p.constraint) : undefined;
        gMap.set(p.name, {
          kind: 'GenericParam',
          name: p.name,
          constraint: constraintType,
        });
      }
      this.currentGenericParams = gMap;
    }

    const declaredReturn = fn.returnType
      ? this.resolveTypeAnnotation(fn.returnType)
      : UNIT_TYPE;

    // Register parameter types on their declared symbols
    for (const param of fn.params) {
      const paramType = param.typeAnnotation
        ? this.resolveTypeAnnotation(param.typeAnnotation)
        : UNKNOWN_TYPE;
      const paramSym = this.currentResolverResult?.declaredSymbols.get(param);
      if (paramSym) {
        paramSym.type = paramType;
      }
    }

    const prevReturn = this.currentFunctionReturnType;
    this.currentFunctionReturnType = declaredReturn;

    if (fn.isExpressionBody && fn.bodyExpr) {
      const exprType = this.checkExpression(fn.bodyExpr, declaredReturn);
      if (fn.returnType && !isTypeAssignable(declaredReturn, exprType) && !isUnknown(exprType)) {
        this.diagnostics.reportError(
          'E3004',
          `Return type mismatch in function '${fn.name}': expected '${formatType(declaredReturn)}', but found '${formatType(exprType)}'.`,
          fn.bodyExpr.span,
          this.currentFile,
          `The expression evaluated to '${formatType(exprType)}', which is incompatible with declared return type '${formatType(declaredReturn)}'.`
        );
      }
    } else {
      const bodyType = this.checkBlock(fn.body);
      const hasExplicitTrailingReturn =
        fn.body.statements.length > 0 &&
        fn.body.statements[fn.body.statements.length - 1].kind === 'ReturnStmt';

      if (
        !hasExplicitTrailingReturn &&
        fn.returnType &&
        !isTypeAssignable(declaredReturn, bodyType) &&
        !isUnknown(bodyType)
      ) {
        const span = fn.body.statements.length > 0
          ? fn.body.statements[fn.body.statements.length - 1].span
          : fn.span;
        this.diagnostics.reportError(
          'E3004',
          `Return type mismatch in function '${fn.name}': expected '${formatType(declaredReturn)}', but found '${formatType(bodyType)}'.`,
          span,
          this.currentFile,
          `Function declares return type '${formatType(declaredReturn)}' but body evaluates to '${formatType(bodyType)}'.`
        );
      }
    }

    this.currentFunctionReturnType = prevReturn;
    this.currentGenericParams = prevGenericParams;
  }

  private checkBindingStmt(stmt: BindingStmt): void {
    let declaredType: Type | undefined;
    if (stmt.typeAnnotation) {
      declaredType = this.resolveTypeAnnotation(stmt.typeAnnotation);
    }

    let initType: Type = UNKNOWN_TYPE;
    if (stmt.initializer) {
      initType = this.checkExpression(stmt.initializer, declaredType);
    }

    // Check if this was a bare reassignment to an existing local variable
    const existingSym = this.currentResolverResult?.resolvedSymbols.get(stmt);
    if (existingSym) {
      if (existingSym.type && !isUnknown(existingSym.type) && !isUnknown(initType)) {
        if (!isTypeAssignable(existingSym.type, initType)) {
          this.diagnostics.reportError(
            'E3001',
            `Type mismatch in assignment: cannot assign value of type '${formatType(initType)}' to '${stmt.name}' of type '${formatType(existingSym.type)}'.`,
            stmt.initializer?.span ?? stmt.span,
            this.currentFile,
            `Expected '${formatType(existingSym.type)}', got '${formatType(initType)}'.`
          );
        }
      }
      this.nodeTypes.set(stmt, existingSym.type ?? initType);
      return;
    }

    let finalType = initType;
    if (declaredType) {
      if (stmt.initializer && !isTypeAssignable(declaredType, initType) && !isUnknown(initType)) {
        this.diagnostics.reportError(
          'E3001',
          `Type mismatch: expected '${formatType(declaredType)}', but found '${formatType(initType)}'.`,
          stmt.initializer.span,
          this.currentFile,
          `Cannot initialize variable '${stmt.name}' of type '${formatType(declaredType)}' with value of type '${formatType(initType)}'.`
        );
      }
      finalType = declaredType;
    }

    this.nodeTypes.set(stmt, finalType);
    const sym = this.currentResolverResult?.declaredSymbols.get(stmt) ??
      this.currentResolverResult?.globalScope.lookup(stmt.name);
    if (sym) {
      sym.type = finalType;
    }
  }

  private checkLetStmt(stmt: LetStmt): void {
    let declaredType: Type | undefined;
    if (stmt.typeAnnotation) {
      declaredType = this.resolveTypeAnnotation(stmt.typeAnnotation);
    }

    let initType: Type = UNKNOWN_TYPE;
    if (stmt.initializer) {
      initType = this.checkExpression(stmt.initializer, declaredType);
    }

    let finalType = initType;
    if (declaredType) {
      if (stmt.initializer && !isTypeAssignable(declaredType, initType) && !isUnknown(initType)) {
        this.diagnostics.reportError(
          'E3001',
          `Type mismatch: expected '${formatType(declaredType)}', but found '${formatType(initType)}'.`,
          stmt.initializer.span,
          this.currentFile,
          `Cannot initialize variable '${stmt.name}' of type '${formatType(declaredType)}' with value of type '${formatType(initType)}'.`
        );
      }
      finalType = declaredType;
    }

    this.nodeTypes.set(stmt, finalType);
    const sym = this.currentResolverResult?.declaredSymbols.get(stmt) ??
      this.currentResolverResult?.globalScope.lookup(stmt.name);
    if (sym) {
      sym.type = finalType;
    }
  }

  private checkConstStmt(stmt: ConstStmt): void {
    let declaredType: Type | undefined;
    if (stmt.typeAnnotation) {
      declaredType = this.resolveTypeAnnotation(stmt.typeAnnotation);
    }
    const initType = this.checkExpression(stmt.initializer, declaredType);
    let finalType = initType;

    if (declaredType) {
      if (!isTypeAssignable(declaredType, initType) && !isUnknown(initType)) {
        this.diagnostics.reportError(
          'E3001',
          `Type mismatch: expected '${formatType(declaredType)}', but found '${formatType(initType)}'.`,
          stmt.initializer.span,
          this.currentFile
        );
      }
      finalType = declaredType;
    }

    this.nodeTypes.set(stmt, finalType);
    const sym = this.currentResolverResult?.declaredSymbols.get(stmt) ??
      this.currentResolverResult?.globalScope.lookup(stmt.name);
    if (sym) {
      sym.type = finalType;
    }
  }

  private checkAssignStmt(stmt: AssignStmt): void {
    let targetType: Type = UNKNOWN_TYPE;
    let targetName = 'assignment target';

    if (stmt.target.kind === 'Identifier') {
      const id = stmt.target as Identifier;
      targetName = id.name;
      const sym = this.currentResolverResult?.resolvedSymbols.get(id);
      if (sym && sym.type) {
        targetType = sym.type;
      }
    } else {
      targetType = this.checkExpression(stmt.target);
    }

    const valType = this.checkExpression(stmt.value, targetType);

    if (stmt.operator === '=') {
      if (!isUnknown(targetType) && !isUnknown(valType)) {
        if (!isTypeAssignable(targetType, valType)) {
          this.diagnostics.reportError(
            'E3001',
            `Type mismatch in assignment: cannot assign value of type '${formatType(valType)}' to '${targetName}' of type '${formatType(targetType)}'.`,
            stmt.value.span,
            this.currentFile,
            `Expected '${formatType(targetType)}', got '${formatType(valType)}'.`
          );
        }
      }
    } else {
      // Compound assignment: +=, -=, *=, /=, %=
      const isTargetValid = isNumeric(targetType) || (isString(targetType) && stmt.operator === '+=');

      if (!isTargetValid && !isUnknown(targetType)) {
        this.diagnostics.reportError(
          'E3002',
          `Compound assignment operator '${stmt.operator}' is not valid for type '${formatType(targetType)}'.`,
          stmt.span,
          this.currentFile
        );
      } else if (!isTypeAssignable(targetType, valType) && !isUnknown(valType) && !isUnknown(targetType)) {
        this.diagnostics.reportError(
          'E3001',
          `Type mismatch in compound assignment: cannot apply '${stmt.operator}' with '${formatType(valType)}' on '${formatType(targetType)}'.`,
          stmt.value.span,
          this.currentFile
        );
      }
    }
  }

  private checkReturnStmt(stmt: ReturnStmt): void {
    const valType = stmt.value
      ? this.checkExpression(stmt.value, this.currentFunctionReturnType)
      : UNIT_TYPE;

    if (this.currentFunctionReturnType) {
      if (!isTypeAssignable(this.currentFunctionReturnType, valType) && !isUnknown(valType)) {
        this.diagnostics.reportError(
          'E3004',
          `Return type mismatch: expected '${formatType(this.currentFunctionReturnType)}', but returned '${formatType(valType)}'.`,
          stmt.value?.span ?? stmt.span,
          this.currentFile
        );
      }
    }
  }

  private checkWithStmt(stmt: WithStmt): void {
    const resType = this.checkExpression(stmt.resource);
    const sym = this.currentResolverResult?.declaredSymbols.get(stmt);
    if (sym) {
      sym.type = resType;
    }
    this.checkBlock(stmt.body);
  }

  private checkBlock(block: Block): Type {
    let lastType: Type = UNIT_TYPE;
    for (const stmt of block.statements) {
      this.checkStatement(stmt);
      if (stmt.kind === 'ExprStmt') {
        lastType = this.nodeTypes.get((stmt as ExprStmt).expression) ?? UNIT_TYPE;
      } else if (stmt.kind === 'ReturnStmt') {
        lastType = (stmt as ReturnStmt).value
          ? this.nodeTypes.get((stmt as ReturnStmt).value!) ?? UNIT_TYPE
          : UNIT_TYPE;
      } else {
        lastType = UNIT_TYPE;
      }
    }
    this.nodeTypes.set(block, lastType);
    return lastType;
  }

  private checkStatement(stmt: Stmt): void {
    switch (stmt.kind) {
      case 'BindingStmt':
        this.checkBindingStmt(stmt as BindingStmt);
        break;
      case 'LetStmt':
        this.checkLetStmt(stmt as LetStmt);
        break;
      case 'ConstStmt':
        this.checkConstStmt(stmt as ConstStmt);
        break;
      case 'AssignStmt':
        this.checkAssignStmt(stmt as AssignStmt);
        break;
      case 'ExprStmt':
        this.checkExpression((stmt as ExprStmt).expression);
        break;
      case 'ReturnStmt':
        this.checkReturnStmt(stmt as ReturnStmt);
        break;
      case 'WithStmt':
        this.checkWithStmt(stmt as WithStmt);
        break;
      case 'WhileStmt':
        this.checkWhileStmt(stmt as WhileStmt);
        break;
      case 'ForStmt':
        this.checkForStmt(stmt as ForStmt);
        break;
      case 'LoopStmt':
        this.checkLoopStmt(stmt as LoopStmt);
        break;
      case 'BreakStmt':
      case 'ContinueStmt':
        break;
    }
  }

  private checkWhileStmt(stmt: WhileStmt): void {
    const condType = this.checkExpression(stmt.condition);
    if (!isBool(condType) && !isUnknown(condType)) {
      this.diagnostics.reportError(
        'E3005',
        `While loop condition must be of type Bool, but found '${formatType(condType)}'.`,
        stmt.condition.span,
        this.currentFile,
        'Seira requires explicit Bool conditions with no implicit truthiness.'
      );
    }
    this.checkBlock(stmt.body);
  }

  private checkForStmt(stmt: ForStmt): void {
    const iterType = this.checkExpression(stmt.iterable);
    let elemType: Type = UNKNOWN_TYPE;

    if (iterType.kind === 'List') {
      elemType = iterType.element;
    } else if (iterType.kind === 'Set') {
      elemType = iterType.element;
    } else if (iterType.kind === 'Tuple') {
      elemType = iterType.elements.length > 0 ? iterType.elements[0] : UNKNOWN_TYPE;
    } else if (!isUnknown(iterType)) {
      this.diagnostics.reportError(
        'E3007',
        `Cannot iterate over expression of type '${formatType(iterType)}'. Only collections (List, Set) are iterable.`,
        stmt.iterable.span,
        this.currentFile
      );
    }

    const sym = this.currentResolverResult?.declaredSymbols.get(stmt);
    if (sym) {
      sym.type = elemType;
    }

    this.checkBlock(stmt.body);
  }

  private checkLoopStmt(stmt: LoopStmt): void {
    this.checkBlock(stmt.body);
  }

  public checkExpression(expr: Expr, expectedType?: Type): Type {
    let resultType: Type = UNKNOWN_TYPE;

    switch (expr.kind) {
      case 'Literal': {
        const lit = expr as Literal;
        const kind = lit.literalKind;
        if (kind === 'int') {
          resultType = lit.raw.endsWith('u') ? UINT_TYPE : INT_TYPE;
        } else if (kind === 'uint') {
          resultType = UINT_TYPE;
        } else if (kind === 'float') {
          resultType = FLOAT_TYPE;
        } else if (kind === 'bool') {
          resultType = BOOL_TYPE;
        } else if (kind === 'string') {
          resultType = STRING_TYPE;
        } else if (kind === 'char') {
          resultType = CHAR_TYPE;
        } else {
          if (typeof lit.value === 'boolean') {
            resultType = BOOL_TYPE;
          } else if (typeof lit.value === 'number') {
            resultType = Number.isInteger(lit.value) ? INT_TYPE : FLOAT_TYPE;
          } else if (typeof lit.value === 'string') {
            resultType = STRING_TYPE;
          }
        }
        break;
      }
      case 'Identifier': {
        const id = expr as Identifier;
        if (id.name === 'None') {
          if (expectedType && expectedType.kind === 'Option') {
            resultType = expectedType;
          } else {
            resultType = createOptionType(UNKNOWN_TYPE);
          }
          break;
        }
        const sym = this.currentResolverResult?.resolvedSymbols.get(id);
        if (sym && sym.type) {
          resultType = sym.type;
        } else {
          resultType = UNKNOWN_TYPE;
        }
        break;
      }
      case 'UnaryExpr': {
        const un = expr as UnaryExpr;
        const operandType = this.checkExpression(un.operand);

        if (un.operator === 'not') {
          if (!isBool(operandType) && !isUnknown(operandType)) {
            this.diagnostics.reportError(
              'E3002',
              `Operator 'not' requires a Bool operand, but found '${formatType(operandType)}'.`,
              un.operand.span,
              this.currentFile,
              `Seira does not have truthy/falsy coercion. Ensure the expression produces a Bool.`
            );
          }
          resultType = BOOL_TYPE;
        } else if (un.operator === '-' || un.operator === '+') {
          if (!isNumeric(operandType) && !isUnknown(operandType)) {
            this.diagnostics.reportError(
              'E3002',
              `Unary operator '${un.operator}' requires a numeric operand, but found '${formatType(operandType)}'.`,
              un.operand.span,
              this.currentFile
            );
          }
          resultType = operandType;
        }
        break;
      }
      case 'BinaryExpr': {
        const bin = expr as BinaryExpr;
        const leftType = this.checkExpression(bin.left);
        const rightType = this.checkExpression(bin.right);
        resultType = this.checkBinaryOp(bin.operator, leftType, rightType, bin.span);
        break;
      }
      case 'CallExpr': {
        const call = expr as CallExpr;
        resultType = this.checkCall(call, expectedType);
        break;
      }
      case 'PipelineExpr': {
        const pipe = expr as PipelineExpr;
        resultType = this.checkPipeline(pipe);
        break;
      }
      case 'IfExpr': {
        const ifExpr = expr as IfExpr;
        const condType = this.checkExpression(ifExpr.condition);

        if (!isBool(condType) && !isUnknown(condType)) {
          this.diagnostics.reportError(
            'E3005',
            `If condition must be of type Bool, but found '${formatType(condType)}'.`,
            ifExpr.condition.span,
            this.currentFile,
            `Seira does not permit implicit truthiness. Conditions must explicitly evaluate to Bool.`
          );
        }

        const thenType = this.checkBlock(ifExpr.thenBranch);
        if (ifExpr.elseBranch) {
          const elseType = ifExpr.elseBranch.kind === 'Block'
            ? this.checkBlock(ifExpr.elseBranch as Block)
            : this.checkExpression(ifExpr.elseBranch as IfExpr);

          if (!isTypeAssignable(thenType, elseType) && !isTypeAssignable(elseType, thenType)) {
            this.diagnostics.reportError(
              'E3001',
              `If branches have incompatible types: then branch produces '${formatType(thenType)}', but else branch produces '${formatType(elseType)}'.`,
              ifExpr.span,
              this.currentFile
            );
          }
          resultType = thenType;
        } else {
          resultType = UNIT_TYPE;
        }
        break;
      }
      case 'BlockExpr': {
        const blockExpr = expr as BlockExpr;
        if (blockExpr.block) {
          resultType = this.checkBlock(blockExpr.block);
        }
        break;
      }
      case 'AssignmentExpr': {
        const assign = expr as AssignmentExpr;
        let targetType: Type = UNKNOWN_TYPE;
        let targetName = 'assignment target';

        if (assign.target.kind === 'Identifier') {
          const id = assign.target as Identifier;
          targetName = id.name;
          const sym = this.currentResolverResult?.resolvedSymbols.get(id);
          if (sym && sym.type) {
            targetType = sym.type;
          }
        } else {
          targetType = this.checkExpression(assign.target);
        }

        const valType = this.checkExpression(assign.value);

        if (assign.operator === '=') {
          if (!isUnknown(targetType) && !isUnknown(valType) && !isTypeAssignable(targetType, valType)) {
            this.diagnostics.reportError(
              'E3001',
              `Type mismatch in assignment: cannot assign '${formatType(valType)}' to '${targetName}' of type '${formatType(targetType)}'.`,
              assign.value.span,
              this.currentFile
            );
          }
        }
        resultType = targetType;
        break;
      }
      case 'OptionFallbackExpr': {
        const opt = expr as OptionFallbackExpr;
        const leftType = this.checkExpression(opt.left);
        const rightType = this.checkExpression(opt.right);

        if (leftType.kind === 'Option') {
          if (!isTypeAssignable(leftType.inner, rightType) && !isUnknown(rightType)) {
            if (rightType.kind === 'Option' && isTypeAssignable(leftType.inner, rightType.inner)) {
              resultType = leftType;
            } else {
              this.diagnostics.reportError(
                'E3002',
                `Fallback operator '??' expects default of type '${formatType(leftType.inner)}', but found '${formatType(rightType)}'.`,
                opt.span,
                this.currentFile
              );
              resultType = leftType.inner;
            }
          } else {
            resultType = leftType.inner;
          }
        } else if (leftType.kind === 'Result') {
          resultType = leftType.ok;
        } else {
          resultType = leftType;
        }
        break;
      }
      case 'OptionPropagateExpr': {
        const prop = expr as OptionPropagateExpr;
        const opType = this.checkExpression(prop.operand);

        if (opType.kind === 'Option') {
          resultType = opType.inner;
        } else if (opType.kind === 'Result') {
          resultType = opType.ok;
        } else if (!isUnknown(opType)) {
          this.diagnostics.reportError(
            'E3002',
            `Operator '?' can only be applied to Option or Result, but found '${formatType(opType)}'.`,
            prop.span,
            this.currentFile
          );
          resultType = opType;
        }
        break;
      }
      case 'RangeExpr': {
        const range = expr as RangeExpr;
        if (range.start) {
          const startType = this.checkExpression(range.start);
          if (!isInt(startType) && !isUnknown(startType)) {
            this.diagnostics.reportError('E3002', `Range bounds must be Int, got '${formatType(startType)}'.`, range.start.span, this.currentFile);
          }
        }
        if (range.end) {
          const endType = this.checkExpression(range.end);
          if (!isInt(endType) && !isUnknown(endType)) {
            this.diagnostics.reportError('E3002', `Range bounds must be Int, got '${formatType(endType)}'.`, range.end.span, this.currentFile);
          }
        }
        resultType = { kind: 'List', element: INT_TYPE };
        break;
      }
      case 'MemberExpr': {
        const mem = expr as MemberExpr;
        const objType = this.checkExpression(mem.object);
        if (mem.isOptional) {
          if (objType.kind === 'Option') {
            resultType = createOptionType(UNKNOWN_TYPE);
          } else {
            resultType = objType;
          }
        } else if (objType.kind === 'Tuple') {
          const idx = parseInt(mem.property, 10);
          if (!isNaN(idx) && idx >= 0 && idx < objType.elements.length) {
            resultType = objType.elements[idx];
          } else {
            this.diagnostics.reportError(
              'E3002',
              `Tuple index '${mem.property}' is out of bounds for tuple with ${objType.elements.length} elements.`,
              mem.span,
              this.currentFile
            );
            resultType = UNKNOWN_TYPE;
          }
        } else if (objType.kind === 'Set') {
          if (mem.property === 'length') {
            resultType = INT_TYPE;
          } else if (mem.property === 'contains') {
            resultType = createFunctionType([objType.element], BOOL_TYPE);
          } else if (mem.property === 'insert') {
            resultType = createFunctionType([objType.element], objType);
          } else if (mem.property === 'remove') {
            resultType = createFunctionType([objType.element], objType);
          } else {
            resultType = UNKNOWN_TYPE;
          }
        } else if (objType.kind === 'List') {
          if (mem.property === 'length') {
            resultType = INT_TYPE;
          } else {
            resultType = UNKNOWN_TYPE;
          }
        } else {
          resultType = UNKNOWN_TYPE;
        }
        break;
      }
      case 'MatchExpr': {
        resultType = this.checkMatchExpr(expr as MatchExpr);
        break;
      }
      case 'ListLiteral': {
        resultType = this.checkListLiteral(expr as ListLiteral);
        break;
      }
      case 'TupleLiteral': {
        resultType = this.checkTupleLiteral(expr as TupleLiteral);
        break;
      }
      case 'MapLiteral': {
        resultType = this.checkMapLiteral(expr as MapLiteral);
        break;
      }
      case 'SetLiteral': {
        resultType = this.checkSetLiteral(expr as SetLiteral);
        break;
      }
      case 'IndexExpr': {
        resultType = this.checkIndexExpr(expr as IndexExpr);
        break;
      }
      case 'LambdaExpr': {
        resultType = this.checkLambdaExpr(expr as LambdaExpr, expectedType);
        break;
      }
    }

    this.nodeTypes.set(expr, resultType);
    return resultType;
  }

  private checkBinaryOp(op: string, left: Type, right: Type, span: Span): Type {
    if (isUnknown(left) || isUnknown(right)) {
      return UNKNOWN_TYPE;
    }

    // Union handling: binary operations on a union type are only permitted
    // if valid for all constituent variants
    if (left.kind === 'Union' || right.kind === 'Union') {
      const leftVariants = left.kind === 'Union' ? (left as UnionType).types : [left];
      const rightVariants = right.kind === 'Union' ? (right as UnionType).types : [right];
      const resultVariants: Type[] = [];

      for (const lv of leftVariants) {
        for (const rv of rightVariants) {
          if (op === '==' || op === '!=') {
            resultVariants.push(BOOL_TYPE);
            continue;
          }
          if (op === '<' || op === '>' || op === '<=' || op === '>=') {
            const valid =
              (isInt(lv) && isInt(rv)) ||
              (isUInt(lv) && isUInt(rv)) ||
              (isFloat(lv) && isFloat(rv));
            if (!valid) {
              this.diagnostics.reportError(
                'E3002',
                `Comparison operator '${op}' cannot compare '${formatType(left)}' and '${formatType(right)}'.`,
                span,
                this.currentFile,
                `Union variants include '${formatType(lv)}' and '${formatType(rv)}' which cannot be compared.`
              );
              return BOOL_TYPE;
            }
            resultVariants.push(BOOL_TYPE);
            continue;
          }
          if (op === '+' || op === '-' || op === '*' || op === '/' || op === '%') {
            const validNumeric =
              (isInt(lv) && isInt(rv)) ||
              (isUInt(lv) && isUInt(rv)) ||
              (isFloat(lv) && isFloat(rv));
            const validString = op === '+' && isString(lv) && isString(rv);
            if (!validNumeric && !validString) {
              this.diagnostics.reportError(
                'E3002',
                `Operator '${op}' cannot be applied to '${formatType(left)}' and '${formatType(right)}'.`,
                span,
                this.currentFile,
                `Union operation is invalid for variant combination '${formatType(lv)}' and '${formatType(rv)}'.`
              );
              return UNKNOWN_TYPE;
            }
            resultVariants.push(validString ? STRING_TYPE : lv);
            continue;
          }
        }
      }
      if (resultVariants.length === 1) return resultVariants[0];
      return { kind: 'Union', types: resultVariants };
    }

    // Boolean operations: and, or
    if (op === 'and' || op === 'or') {
      if (!isBool(left) || !isBool(right)) {
        this.diagnostics.reportError(
          'E3002',
          `Logical operator '${op}' requires Bool operands, but found '${formatType(left)}' and '${formatType(right)}'.`,
          span,
          this.currentFile,
          `Ensure both operands are Bool. Seira does not support truthy/falsy evaluation.`
        );
      }
      return BOOL_TYPE;
    }

    // Comparison operators: <, >, <=, >=
    if (op === '<' || op === '>' || op === '<=' || op === '>=') {
      const valid =
        (isInt(left) && isInt(right)) ||
        (isUInt(left) && isUInt(right)) ||
        (isFloat(left) && isFloat(right));

      if (!valid) {
        this.diagnostics.reportError(
          'E3002',
          `Comparison operator '${op}' cannot compare '${formatType(left)}' and '${formatType(right)}'.`,
          span,
          this.currentFile,
          `Operands must be matching numeric types.`
        );
      }
      return BOOL_TYPE;
    }

    // Equality operators: ==, !=
    if (op === '==' || op === '!=') {
      if (!isTypeAssignable(left, right) && !isTypeAssignable(right, left)) {
        this.diagnostics.reportError(
          'E3002',
          `Equality operator '${op}' cannot compare '${formatType(left)}' and '${formatType(right)}'.`,
          span,
          this.currentFile
        );
      }
      return BOOL_TYPE;
    }

    // Arithmetic operators: +, -, *, /, %
    if (op === '+' || op === '-' || op === '*' || op === '/' || op === '%') {
      // String concatenation with +
      if (op === '+' && isString(left) && isString(right)) {
        return STRING_TYPE;
      }

      if (isInt(left) && isInt(right)) return INT_TYPE;
      if (isUInt(left) && isUInt(right)) return UINT_TYPE;
      if (isFloat(left) && isFloat(right)) return FLOAT_TYPE;

      this.diagnostics.reportError(
        'E3002',
        `Invalid operands for arithmetic operator '${op}': '${formatType(left)}' and '${formatType(right)}'.`,
        span,
        this.currentFile,
        `Seira does not perform implicit conversions. Convert operands explicitly.`
      );
      return UNKNOWN_TYPE;
    }

    return UNKNOWN_TYPE;
  }

  private checkCall(call: CallExpr, expectedType?: Type): Type {
    let calleeType: Type = UNKNOWN_TYPE;
    let calleeName = 'anonymous';

    if (call.callee.kind === 'Identifier') {
      const id = call.callee as Identifier;
      calleeName = id.name;

      // Built-in constructors with contextual expected type propagation
      if (calleeName === 'Some' && call.args.length === 1) {
        const expectedInner =
          expectedType && expectedType.kind === 'Option' ? expectedType.inner : undefined;
        const innerType = this.checkExpression(call.args[0], expectedInner);
        return createOptionType(innerType);
      }
      if (calleeName === 'None') {
        if (expectedType && expectedType.kind === 'Option') {
          return expectedType;
        }
        return createOptionType(UNKNOWN_TYPE);
      }
      if (calleeName === 'Ok' && call.args.length === 1) {
        const expectedOk =
          expectedType && expectedType.kind === 'Result' ? expectedType.ok : undefined;
        const expectedErr =
          expectedType && expectedType.kind === 'Result' ? expectedType.err : UNKNOWN_TYPE;
        const okType = this.checkExpression(call.args[0], expectedOk);
        return createResultType(okType, expectedErr);
      }
      if (calleeName === 'Err' && call.args.length === 1) {
        const expectedErr =
          expectedType && expectedType.kind === 'Result' ? expectedType.err : undefined;
        const expectedOk =
          expectedType && expectedType.kind === 'Result' ? expectedType.ok : UNKNOWN_TYPE;
        const errType = this.checkExpression(call.args[0], expectedErr);
        return createResultType(expectedOk, errType);
      }
      if (calleeName === 'println' || calleeName === 'print') {
        for (const arg of call.args) {
          this.checkExpression(arg);
        }
        return UNIT_TYPE;
      }
      if (calleeName === 'open_resource') {
        for (const arg of call.args) {
          this.checkExpression(arg);
        }
        return { kind: 'Custom', name: 'Resource' };
      }

      const sym = this.currentResolverResult?.resolvedSymbols.get(id);
      if (sym && sym.type) {
        calleeType = sym.type;
      }
    } else {
      calleeType = this.checkExpression(call.callee);
    }

    if (calleeType.kind === 'Function') {
      const fnType = calleeType as FunctionType;
      if (fnType.genericParams && fnType.genericParams.length > 0) {
        return this.checkGenericFunctionCall(call, calleeName, fnType);
      }
      return this.checkConcreteFunctionCall(call, calleeName, fnType);
    }

    return UNKNOWN_TYPE;
  }

  private checkGenericFunctionCall(
    call: CallExpr,
    calleeName: string,
    fnType: FunctionType
  ): Type {
    const genericParams = fnType.genericParams!;
    const substitutions = new Map<string, Type>();

    if (call.typeArguments && call.typeArguments.length > 0) {
      if (call.typeArguments.length !== genericParams.length) {
        this.diagnostics.reportError(
          'E4001',
          `Generic argument count mismatch in call to '${calleeName}': expected ${genericParams.length}, but found ${call.typeArguments.length}.`,
          call.span,
          this.currentFile
        );
        return UNKNOWN_TYPE;
      }

      for (let i = 0; i < genericParams.length; i++) {
        const gParam = genericParams[i];
        const argType = this.resolveTypeAnnotation(call.typeArguments[i]);
        substitutions.set(gParam.name, argType);

        if (gParam.constraint) {
          const constraintName = formatType(gParam.constraint);
          if (!this.typeSatisfiesConstraint(argType, constraintName)) {
            this.diagnostics.reportError(
              'E4003',
              `Type '${formatType(argType)}' does not satisfy trait constraint '${constraintName}' in call to '${calleeName}'.`,
              call.typeArguments[i].span,
              this.currentFile
            );
          }
        }
      }
    } else {
      // Generic argument inference:
      // Pass 1: infer from non-lambda arguments
      for (let i = 0; i < call.args.length; i++) {
        if (call.args[i].kind !== 'LambdaExpr') {
          const argType = this.checkExpression(call.args[i]);
          if (i < fnType.params.length) {
            unifyTypes(fnType.params[i], argType, substitutions);
          }
        }
      }

      // Pass 2: check lambda arguments using contextual types from partial substitutions
      for (let i = 0; i < call.args.length; i++) {
        if (call.args[i].kind === 'LambdaExpr') {
          const expectedParamType =
            i < fnType.params.length ? substituteType(fnType.params[i], substitutions) : UNKNOWN_TYPE;
          const lambdaType = this.checkLambdaExpr(call.args[i] as LambdaExpr, expectedParamType);
          if (i < fnType.params.length) {
            unifyTypes(fnType.params[i], lambdaType, substitutions);
          }
        }
      }

      // Verify that all generic parameters were inferred
      for (const gParam of genericParams) {
        if (!substitutions.has(gParam.name)) {
          this.diagnostics.reportError(
            'E4002',
            `Cannot infer generic parameter '${gParam.name}' for function '${calleeName}'. Please provide explicit type arguments.`,
            call.span,
            this.currentFile
          );
          return UNKNOWN_TYPE;
        }

        // Verify trait constraints on inferred types
        if (gParam.constraint) {
          const inferredType = substitutions.get(gParam.name)!;
          const constraintName = formatType(gParam.constraint);
          if (!this.typeSatisfiesConstraint(inferredType, constraintName)) {
            this.diagnostics.reportError(
              'E4003',
              `Inferred type '${formatType(inferredType)}' does not satisfy trait constraint '${constraintName}' for parameter '${gParam.name}' in call to '${calleeName}'.`,
              call.span,
              this.currentFile
            );
          }
        }
      }
    }

    const concreteParams = fnType.params.map((p) => substituteType(p, substitutions));
    const concreteReturn = substituteType(fnType.returnType, substitutions);

    if (call.args.length !== concreteParams.length) {
      this.diagnostics.reportError(
        'E3003',
        `Function '${calleeName}' expects ${concreteParams.length} argument${concreteParams.length === 1 ? '' : 's'}, but got ${call.args.length}.`,
        call.span,
        this.currentFile
      );
    } else {
      for (let i = 0; i < call.args.length; i++) {
        const expectedP = concreteParams[i];
        const argType = this.checkExpression(call.args[i], expectedP);
        if (!isTypeAssignable(expectedP, argType) && !isUnknown(argType) && !isUnknown(expectedP)) {
          this.diagnostics.reportError(
            'E3003',
            `Argument ${i + 1} type mismatch in call to '${calleeName}': expected '${formatType(expectedP)}', but found '${formatType(argType)}'.`,
            call.args[i].span,
            this.currentFile
          );
        }
      }
    }

    return concreteReturn;
  }

  private checkConcreteFunctionCall(
    call: CallExpr,
    calleeName: string,
    fnType: FunctionType
  ): Type {
    if (call.typeArguments && call.typeArguments.length > 0) {
      this.diagnostics.reportError(
        'E4001',
        `Function '${calleeName}' is not generic and does not accept type arguments.`,
        call.span,
        this.currentFile
      );
    }

    if (call.args.length !== fnType.params.length) {
      this.diagnostics.reportError(
        'E3003',
        `Function '${calleeName}' expects ${fnType.params.length} argument${fnType.params.length === 1 ? '' : 's'}, but got ${call.args.length}.`,
        call.span,
        this.currentFile
      );
    } else {
      for (let i = 0; i < call.args.length; i++) {
        const paramType = fnType.params[i];
        const argType = this.checkExpression(call.args[i], paramType);
        if (!isTypeAssignable(paramType, argType) && !isUnknown(argType) && !isUnknown(paramType)) {
          this.diagnostics.reportError(
            'E3003',
            `Argument ${i + 1} type mismatch in call to '${calleeName}': expected '${formatType(paramType)}', but found '${formatType(argType)}'.`,
            call.args[i].span,
            this.currentFile
          );
        }
      }
    }
    return fnType.returnType;
  }

  private checkPipeline(pipe: PipelineExpr): Type {
    const valType = this.checkExpression(pipe.left);

    if (pipe.right.kind === 'CallExpr') {
      const call = pipe.right as CallExpr;
      let calleeType: Type = UNKNOWN_TYPE;
      let calleeName = 'anonymous';

      if (call.callee.kind === 'Identifier') {
        const id = call.callee as Identifier;
        calleeName = id.name;
        const sym = this.currentResolverResult?.resolvedSymbols.get(id);
        if (sym && sym.type) {
          calleeType = sym.type;
        }
      } else {
        calleeType = this.checkExpression(call.callee);
      }

      if (calleeType.kind === 'Function') {
        const fnType = calleeType as FunctionType;
        const totalArgs: Expr[] = [pipe.left, ...call.args];
        if (fnType.genericParams && fnType.genericParams.length > 0) {
          const syntheticCall: CallExpr = {
            kind: 'CallExpr',
            callee: call.callee,
            args: totalArgs,
            typeArguments: call.typeArguments,
            span: pipe.span,
          };
          return this.checkGenericFunctionCall(syntheticCall, calleeName, fnType);
        }

        const totalArgTypes = [valType, ...call.args.map((a) => this.checkExpression(a))];

        if (totalArgTypes.length !== fnType.params.length) {
          this.diagnostics.reportError(
            'E3003',
            `Pipeline call to '${calleeName}' expects ${fnType.params.length} arguments (including pipeline value), but got ${totalArgTypes.length}.`,
            call.span,
            this.currentFile
          );
        } else {
          for (let i = 0; i < totalArgTypes.length; i++) {
            if (!isTypeAssignable(fnType.params[i], totalArgTypes[i]) && !isUnknown(totalArgTypes[i])) {
              this.diagnostics.reportError(
                'E3003',
                `Pipeline argument ${i + 1} type mismatch: expected '${formatType(fnType.params[i])}', got '${formatType(totalArgTypes[i])}'.`,
                pipe.span,
                this.currentFile
              );
            }
          }
        }
        return fnType.returnType;
      }
    } else {
      let calleeType: Type = UNKNOWN_TYPE;
      let calleeName = 'anonymous';

      if (pipe.right.kind === 'Identifier') {
        const id = pipe.right as Identifier;
        calleeName = id.name;
        const sym = this.currentResolverResult?.resolvedSymbols.get(id);
        if (sym && sym.type) {
          calleeType = sym.type;
        }
      } else {
        calleeType = this.checkExpression(pipe.right);
      }

      if (calleeType.kind === 'Function') {
        const fnType = calleeType as FunctionType;
        if (fnType.genericParams && fnType.genericParams.length > 0) {
          const syntheticCall: CallExpr = {
            kind: 'CallExpr',
            callee: pipe.right,
            args: [pipe.left],
            span: pipe.span,
          };
          return this.checkGenericFunctionCall(syntheticCall, calleeName, fnType);
        }

        if (fnType.params.length < 1) {
          this.diagnostics.reportError(
            'E3003',
            `Pipeline target takes 0 arguments and cannot receive pipeline value.`,
            pipe.right.span,
            this.currentFile
          );
        } else if (!isTypeAssignable(fnType.params[0], valType) && !isUnknown(valType) && !isUnknown(fnType.params[0])) {
          this.diagnostics.reportError(
            'E3003',
            `Pipeline type mismatch: target expects '${formatType(fnType.params[0])}' as first argument, but pipeline value is '${formatType(valType)}'.`,
            pipe.left.span,
            this.currentFile
          );
        }
        return fnType.returnType;
      }
    }

    return UNKNOWN_TYPE;
  }

  private resolveTypeAnnotation(annotation: TypeAnnotation): Type {
    if (this.currentGenericParams?.has(annotation.name)) {
      return this.currentGenericParams.get(annotation.name)!;
    }

    if (this.typeAliases.has(annotation.name)) {
      if (this.aliasExpansionStack.has(annotation.name)) {
        return UNKNOWN_TYPE;
      }
      this.aliasExpansionStack.add(annotation.name);
      const alias = this.typeAliases.get(annotation.name)!;
      let target = this.resolveTypeAnnotation(alias.targetType);
      if (alias.genericParams && annotation.generics) {
        const substitutions = new Map<string, Type>();
        for (let i = 0; i < alias.genericParams.length; i++) {
          const gParam = alias.genericParams[i];
          const arg =
            i < annotation.generics.length
              ? this.resolveTypeAnnotation(annotation.generics[i])
              : UNKNOWN_TYPE;
          substitutions.set(gParam.name, arg);
        }
        target = substituteType(target, substitutions);
      }
      this.aliasExpansionStack.delete(annotation.name);
      return target;
    }

    switch (annotation.name) {
      case 'Int':
        return INT_TYPE;
      case 'UInt':
        return UINT_TYPE;
      case 'Float':
        return FLOAT_TYPE;
      case 'Bool':
        return BOOL_TYPE;
      case 'Char':
        return CHAR_TYPE;
      case 'String':
        return STRING_TYPE;
      case 'Byte':
        return BYTE_TYPE;
      case 'Unit':
        return UNIT_TYPE;
      case 'Function': {
        const params = annotation.functionParams
          ? annotation.functionParams.map((p) => this.resolveTypeAnnotation(p))
          : [];
        const ret = annotation.returnType ? this.resolveTypeAnnotation(annotation.returnType) : UNIT_TYPE;
        return createFunctionType(params, ret, false);
      }
      case 'Union': {
        const types = annotation.unionTypes
          ? annotation.unionTypes.map((t) => this.resolveTypeAnnotation(t))
          : [];
        return { kind: 'Union', types };
      }
      case 'Option': {
        const inner = annotation.generics && annotation.generics.length > 0
          ? this.resolveTypeAnnotation(annotation.generics[0])
          : UNKNOWN_TYPE;
        return createOptionType(inner);
      }
      case 'Result': {
        const ok = annotation.generics && annotation.generics.length > 0
          ? this.resolveTypeAnnotation(annotation.generics[0])
          : UNKNOWN_TYPE;
        const err = annotation.generics && annotation.generics.length > 1
          ? this.resolveTypeAnnotation(annotation.generics[1])
          : UNKNOWN_TYPE;
        return createResultType(ok, err);
      }
      case 'List': {
        const elem = annotation.generics && annotation.generics.length > 0
          ? this.resolveTypeAnnotation(annotation.generics[0])
          : UNKNOWN_TYPE;
        return { kind: 'List', element: elem };
      }
      case 'Tuple': {
        const elems = annotation.generics ? annotation.generics.map((g) => this.resolveTypeAnnotation(g)) : [];
        return createTupleType(elems);
      }
      case 'Map': {
        const k = annotation.generics && annotation.generics.length > 0 ? this.resolveTypeAnnotation(annotation.generics[0]) : UNKNOWN_TYPE;
        const v = annotation.generics && annotation.generics.length > 1 ? this.resolveTypeAnnotation(annotation.generics[1]) : UNKNOWN_TYPE;
        return createMapType(k, v);
      }
      case 'Set': {
        const elem = annotation.generics && annotation.generics.length > 0 ? this.resolveTypeAnnotation(annotation.generics[0]) : UNKNOWN_TYPE;
        return createSetType(elem);
      }
      default: {
        if (annotation.generics && annotation.generics.length > 0) {
          return {
            kind: 'Custom',
            name: annotation.name,
            typeArguments: annotation.generics.map((g) => this.resolveTypeAnnotation(g)),
          };
        }
        return { kind: 'Custom', name: annotation.name };
      }
    }
  }

  private checkMatchExpr(matchExpr: MatchExpr): Type {
    const valType = this.checkExpression(matchExpr.value);
    let armResultType: Type = UNKNOWN_TYPE;

    // Pattern tracking for exhaustiveness
    let hasWildcardOrBinding = false;
    let hasBoolTrue = false;
    let hasBoolFalse = false;
    let hasSome = false;
    let hasNone = false;
    let hasOk = false;
    let hasErr = false;

    for (const arm of matchExpr.arms) {
      const pat = arm.pattern;
      if (pat.kind === 'WildcardPattern') {
        hasWildcardOrBinding = true;
      } else if (pat.kind === 'IdentifierPattern') {
        hasWildcardOrBinding = true;
        const sym = this.currentResolverResult?.declaredSymbols.get(pat);
        if (sym) {
          sym.type = valType;
        }
      } else if (pat.kind === 'LiteralPattern') {
        const lit = pat.literal;
        let litType: Type = UNKNOWN_TYPE;
        if (lit.literalKind === 'int') litType = INT_TYPE;
        else if (lit.literalKind === 'uint') litType = UINT_TYPE;
        else if (lit.literalKind === 'float') litType = FLOAT_TYPE;
        else if (lit.literalKind === 'string') litType = STRING_TYPE;
        else if (lit.literalKind === 'char') litType = CHAR_TYPE;
        else if (lit.literalKind === 'bool') {
          litType = BOOL_TYPE;
          if (lit.value === true) hasBoolTrue = true;
          if (lit.value === false) hasBoolFalse = true;
        }
        if (!isTypeAssignable(valType, litType) && !isUnknown(valType)) {
          this.diagnostics.reportError(
            'E5002',
            `Pattern type mismatch: cannot match pattern of type '${formatType(litType)}' against expression of type '${formatType(valType)}'.`,
            pat.span,
            this.currentFile
          );
        }
      } else if (pat.kind === 'ConstructorPattern') {
        if (pat.name === 'Some') {
          hasSome = true;
          if (valType.kind !== 'Option' && !isUnknown(valType)) {
            this.diagnostics.reportError(
              'E5002',
              `Cannot match 'Some' pattern against non-Option type '${formatType(valType)}'.`,
              pat.span,
              this.currentFile
            );
          } else if (valType.kind === 'Option' && pat.args.length > 0) {
            const inner = pat.args[0];
            if (inner.kind === 'IdentifierPattern') {
              const sym = this.currentResolverResult?.declaredSymbols.get(inner);
              if (sym) sym.type = valType.inner;
            }
          }
        } else if (pat.name === 'None') {
          hasNone = true;
          if (valType.kind !== 'Option' && !isUnknown(valType)) {
            this.diagnostics.reportError(
              'E5002',
              `Cannot match 'None' pattern against non-Option type '${formatType(valType)}'.`,
              pat.span,
              this.currentFile
            );
          }
        } else if (pat.name === 'Ok') {
          hasOk = true;
          if (valType.kind !== 'Result' && !isUnknown(valType)) {
            this.diagnostics.reportError(
              'E5002',
              `Cannot match 'Ok' pattern against non-Result type '${formatType(valType)}'.`,
              pat.span,
              this.currentFile
            );
          } else if (valType.kind === 'Result' && pat.args.length > 0) {
            const inner = pat.args[0];
            if (inner.kind === 'IdentifierPattern') {
              const sym = this.currentResolverResult?.declaredSymbols.get(inner);
              if (sym) sym.type = valType.ok;
            }
          }
        } else if (pat.name === 'Err') {
          hasErr = true;
          if (valType.kind !== 'Result' && !isUnknown(valType)) {
            this.diagnostics.reportError(
              'E5002',
              `Cannot match 'Err' pattern against non-Result type '${formatType(valType)}'.`,
              pat.span,
              this.currentFile
            );
          } else if (valType.kind === 'Result' && pat.args.length > 0) {
            const inner = pat.args[0];
            if (inner.kind === 'IdentifierPattern') {
              const sym = this.currentResolverResult?.declaredSymbols.get(inner);
              if (sym) sym.type = valType.err;
            }
          }
        }
      }

      // Check arm body
      const bodyType =
        arm.body.kind === 'Block'
          ? this.checkBlock(arm.body as Block)
          : this.checkExpression(arm.body as Expr);

      if (isUnknown(armResultType)) {
        armResultType = bodyType;
      } else {
        if (
          !isTypeAssignable(armResultType, bodyType) &&
          !isTypeAssignable(bodyType, armResultType) &&
          !isUnknown(bodyType) &&
          !isUnknown(armResultType)
        ) {
          this.diagnostics.reportError(
            'E3001',
            `Match arm type mismatch: expected '${formatType(armResultType)}', but found '${formatType(bodyType)}'.`,
            arm.body.span,
            this.currentFile
          );
        }
      }
    }

    // Exhaustiveness checking (E5001)
    let isExhaustive = false;
    if (hasWildcardOrBinding) {
      isExhaustive = true;
    } else if (isBool(valType) && hasBoolTrue && hasBoolFalse) {
      isExhaustive = true;
    } else if (valType.kind === 'Option' && hasSome && hasNone) {
      isExhaustive = true;
    } else if (valType.kind === 'Result' && hasOk && hasErr) {
      isExhaustive = true;
    }

    if (!isExhaustive && !isUnknown(valType)) {
      this.diagnostics.reportError(
        'E5001',
        `Non-exhaustive pattern match for type '${formatType(valType)}'.`,
        matchExpr.span,
        this.currentFile,
        "Ensure all possible values are matched or provide a wildcard '_' or binding pattern."
      );
    }

    return armResultType;
  }

  private checkListLiteral(lit: ListLiteral): Type {
    if (lit.elements.length === 0) {
      return createListType(UNKNOWN_TYPE);
    }
    const elemType = this.checkExpression(lit.elements[0]);
    for (let i = 1; i < lit.elements.length; i++) {
      const currentType = this.checkExpression(lit.elements[i]);
      if (!isTypeAssignable(elemType, currentType) && !isUnknown(currentType) && !isUnknown(elemType)) {
        this.diagnostics.reportError(
          'E3001',
          `List element ${i + 1} type mismatch: expected '${formatType(elemType)}', but found '${formatType(currentType)}'.`,
          lit.elements[i].span,
          this.currentFile,
          'Seira lists are strictly homogeneous.'
        );
      }
    }
    return createListType(elemType);
  }

  private checkTupleLiteral(lit: TupleLiteral): Type {
    const elemTypes = lit.elements.map((e) => this.checkExpression(e));
    return createTupleType(elemTypes);
  }

  private checkMapLiteral(lit: MapLiteral): Type {
    if (lit.entries.length === 0) {
      return createMapType(UNKNOWN_TYPE, UNKNOWN_TYPE);
    }
    const keyType = this.checkExpression(lit.entries[0].key);
    const valType = this.checkExpression(lit.entries[0].value);
    for (let i = 1; i < lit.entries.length; i++) {
      const curKey = this.checkExpression(lit.entries[i].key);
      const curVal = this.checkExpression(lit.entries[i].value);
      if (!isTypeAssignable(keyType, curKey) && !isUnknown(curKey) && !isUnknown(keyType)) {
        this.diagnostics.reportError(
          'E3001',
          `Map key ${i + 1} type mismatch: expected '${formatType(keyType)}', but found '${formatType(curKey)}'.`,
          lit.entries[i].key.span,
          this.currentFile
        );
      }
      if (!isTypeAssignable(valType, curVal) && !isUnknown(curVal) && !isUnknown(valType)) {
        this.diagnostics.reportError(
          'E3001',
          `Map value ${i + 1} type mismatch: expected '${formatType(valType)}', but found '${formatType(curVal)}'.`,
          lit.entries[i].value.span,
          this.currentFile
        );
      }
    }
    return createMapType(keyType, valType);
  }

  private checkSetLiteral(lit: SetLiteral): Type {
    if (lit.elements.length === 0) {
      return createSetType(UNKNOWN_TYPE);
    }
    const elemType = this.checkExpression(lit.elements[0]);
    for (let i = 1; i < lit.elements.length; i++) {
      const curType = this.checkExpression(lit.elements[i]);
      if (!isTypeAssignable(elemType, curType) && !isUnknown(curType) && !isUnknown(elemType)) {
        this.diagnostics.reportError(
          'E3001',
          `Set element ${i + 1} type mismatch: expected '${formatType(elemType)}', but found '${formatType(curType)}'.`,
          lit.elements[i].span,
          this.currentFile
        );
      }
    }
    return createSetType(elemType);
  }

  private checkIndexExpr(idx: IndexExpr): Type {
    const objType = this.checkExpression(idx.object);
    const indexType = this.checkExpression(idx.index);

    if (objType.kind === 'List') {
      if (!isInt(indexType) && !isUInt(indexType) && !isUnknown(indexType)) {
        this.diagnostics.reportError(
          'E3002',
          `List index must be of type Int or UInt, but found '${formatType(indexType)}'.`,
          idx.index.span,
          this.currentFile
        );
      }
      return createOptionType(objType.element);
    }

    if (objType.kind === 'Map') {
      if (!isTypeAssignable(objType.key, indexType) && !isUnknown(indexType) && !isUnknown(objType.key)) {
        this.diagnostics.reportError(
          'E3002',
          `Map key mismatch: expected '${formatType(objType.key)}', but found '${formatType(indexType)}'.`,
          idx.index.span,
          this.currentFile
        );
      }
      return createOptionType(objType.value);
    }

    if (!isUnknown(objType)) {
      this.diagnostics.reportError(
        'E3002',
        `Cannot index into expression of type '${formatType(objType)}'. Safe indexing is supported on List and Map.`,
        idx.span,
        this.currentFile
      );
    }

    return UNKNOWN_TYPE;
  }

  private checkLambdaExpr(lambda: LambdaExpr, contextualType?: Type): Type {
    const prevReturn = this.currentFunctionReturnType;
    const paramTypes: Type[] = [];
    const contextualFn =
      contextualType && contextualType.kind === 'Function'
        ? (contextualType as FunctionType)
        : undefined;

    for (let i = 0; i < lambda.params.length; i++) {
      const param = lambda.params[i];
      let pType: Type = UNKNOWN_TYPE;

      if (param.typeAnnotation) {
        pType = this.resolveTypeAnnotation(param.typeAnnotation);
      } else if (contextualFn && i < contextualFn.params.length && !isUnknown(contextualFn.params[i])) {
        pType = contextualFn.params[i];
      } else {
        pType = UNKNOWN_TYPE;
      }

      paramTypes.push(pType);
      const sym = this.currentResolverResult?.declaredSymbols.get(param);
      if (sym) {
        sym.type = pType;
      }
    }

    const expectedReturn = contextualFn?.returnType;
    this.currentFunctionReturnType = expectedReturn;

    const bodyType =
      lambda.body.kind === 'Block'
        ? this.checkBlock(lambda.body as Block)
        : this.checkExpression(lambda.body as Expr, expectedReturn);

    this.currentFunctionReturnType = prevReturn;
    return createFunctionType(paramTypes, bodyType);
  }
}

