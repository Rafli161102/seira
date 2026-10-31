/**
 * Seira Compiler Driver
 *
 * Orchestrates the sequential compiler pipeline:
 * Source -> Lexer -> Parser -> Resolver -> Type Checking -> HIR -> MIR -> Resource/Ownership Checking -> Backend
 *
 * Implements clean stage-based compilation with clear engineering boundaries.
 */

import { existsSync, readFileSync } from 'node:fs';
import type { Program } from '../ast/ast.ts';
import { CompilerBackend, type BackendResult } from '../backend/index.ts';
import { DiagnosticBag } from '../diagnostics/index.ts';
import { InternalCompilerError } from '../diagnostics/ice.ts';
import { HIRLowering, HIRValidator, type HIRProgram } from '../hir/index.ts';
import { Lexer } from '../lexer/lexer.ts';
import type { Token } from '../lexer/token.ts';
import { MIRBuilder, validateMIR, type MIRModule } from '../mir/index.ts';
import { analyzeOwnership, type OwnershipAnalysisResult } from '../ownership/index.ts';
import {
  ModuleGraph,
  PackageGraph,
  PackageLoader,
  SeiraModule,
  SeiraPackage,
  WorkspaceLoader,
} from '../module/index.ts';
import { Parser } from '../parser/parser.ts';
import { Resolver, type ResolverResult } from '../resolver/index.ts';
import { TypeChecker, type TypecheckResult } from '../typecheck/index.ts';
import type { CompilerConfig } from './config.ts';
import { CompilerContext } from './context.ts';
import { CompilerStage, isStageAtLeast } from './stage.ts';

export interface DriverOptions {
  readonly stopAfter?: CompilerStage;
  readonly config?: Partial<CompilerConfig>;
}

export interface PackageCompilationResult {
  readonly success: boolean;
  readonly package?: SeiraPackage;
  readonly modules: Map<string, SeiraModule>;
  readonly sortedModules: SeiraModule[];
  readonly diagnostics: DiagnosticBag;
  readonly entryModule?: SeiraModule;
}

export interface CompilationResult {
  readonly success: boolean;
  readonly stage: CompilerStage;
  readonly tokens: ReadonlyArray<Token>;
  readonly ast?: Program;
  readonly hir?: HIRProgram;
  readonly mir?: MIRModule;
  readonly ownership?: OwnershipAnalysisResult;
  readonly backendResult?: BackendResult;
  readonly diagnostics: DiagnosticBag;
  readonly context: CompilerContext;
}

export class CompilerDriver {
  private readonly defaultContext?: CompilerContext;

  constructor(context?: CompilerContext) {
    this.defaultContext = context;
  }

  public compile(
    source: string,
    filePath?: string,
    options?: DriverOptions
  ): CompilationResult {
    const context = this.defaultContext ?? new CompilerContext(options?.config);
    const virtualPath = filePath ?? '<anonymous>';
    context.loadSource(virtualPath, source);
    return this.executePipeline(context, virtualPath, options?.stopAfter ?? context.config.stopAfter);
  }

  public compileFile(filePath: string, options?: DriverOptions): CompilationResult {
    if (!existsSync(filePath)) {
      const context = this.defaultContext ?? new CompilerContext(options?.config);
      context.diagnostics.reportError(
        'E9002',
        `Source file '${filePath}' not found.`,
        { start: 0, end: 0, line: 1, column: 1 },
        filePath
      );
      return {
        success: false,
        stage: CompilerStage.Lex,
        tokens: [],
        diagnostics: context.diagnostics,
        context,
      };
    }

    const source = readFileSync(filePath, 'utf-8');
    return this.compile(source, filePath, options);
  }

  public compilePackage(packageDir: string, options?: DriverOptions): PackageCompilationResult {
    const diagnostics = new DiagnosticBag();
    const pkg = PackageLoader.load(packageDir, diagnostics);

    if (!pkg || diagnostics.hasErrors()) {
      return {
        success: false,
        package: pkg ?? undefined,
        modules: new Map(),
        sortedModules: [],
        diagnostics,
      };
    }

    // Discover a workspace from this package directory (or one of its ancestors).
    // The workspace package map is required to resolve { workspace = true } dependencies.
    const workspaceLoader = new WorkspaceLoader(diagnostics);
    const workspaceRoot = workspaceLoader.findWorkspaceRoot(packageDir);
    const workspace = workspaceRoot ? workspaceLoader.loadWorkspace(workspaceRoot) : null;

    if (diagnostics.hasErrors()) {
      return {
        success: false,
        package: pkg,
        modules: pkg.modules,
        sortedModules: [],
        diagnostics,
      };
    }

    // Resolve package dependencies via PackageGraph, including workspace members.
    const packageGraph = new PackageGraph(diagnostics, workspace?.packages);
    const resolvedPackages = packageGraph.resolvePackage(packageDir);

    if (diagnostics.hasErrors()) {
      return {
        success: false,
        package: pkg,
        modules: pkg.modules,
        sortedModules: [],
        diagnostics,
      };
    }

    // Collect all available modules across packages
    const availableModules = new Map<string, SeiraModule>();
    const allModulesToCompile: SeiraModule[] = [];

    // First, modules from dependent packages
    for (const depPkg of resolvedPackages) {
      if (depPkg.name === pkg.name) continue;
      for (const [modPath, mod] of depPkg.modules) {
        availableModules.set(`${depPkg.name}.${modPath}`, mod);
        availableModules.set(`${depPkg.name}::${modPath}`, mod);
        allModulesToCompile.push(mod);
      }
    }

    // Modules from current package
    for (const [modPath, mod] of pkg.modules) {
      availableModules.set(modPath, mod);
      availableModules.set(`${pkg.name}.${modPath}`, mod);
      availableModules.set(`${pkg.name}::${modPath}`, mod);
      allModulesToCompile.push(mod);
    }

    // Lex and parse each module
    for (const mod of allModulesToCompile) {
      if (mod.ast) continue;
      try {
        const sourceText = readFileSync(mod.filePath, 'utf-8');
        const lexer = new Lexer(sourceText, mod.filePath, diagnostics);
        const tokens = lexer.tokenize();
        const parser = new Parser(tokens, mod.filePath, diagnostics);
        const ast = parser.parse();
        mod.collectDeclarations(ast);
      } catch (err: any) {
        diagnostics.reportError(
          'E9002',
          `Failed to read or parse module '${mod.id.path}': ${err.message}`,
          { start: 0, end: 0, line: 1, column: 1 },
          mod.filePath
        );
      }
    }

    if (diagnostics.hasErrors()) {
      return {
        success: false,
        package: pkg,
        modules: pkg.modules,
        sortedModules: [],
        diagnostics,
      };
    }

    // Resolve module order within each package independently.
    // Module names are package-scoped: package_a::utils and package_b::utils
    // must not overwrite one another merely because both files are named utils.sr.
    // Cross-package ordering is already guaranteed by PackageGraph.
    const sortedModules: SeiraModule[] = [];
    for (const resolvedPkg of resolvedPackages) {
      const activePkg = resolvedPkg.name === pkg.name ? pkg : resolvedPkg;
      const packageModules = new Map(activePkg.modules);
      const moduleGraph = new ModuleGraph(packageModules, diagnostics);
      sortedModules.push(...moduleGraph.resolveOrder());
    }

    if (diagnostics.hasErrors()) {
      return {
        success: false,
        package: pkg,
        modules: pkg.modules,
        sortedModules: [],
        diagnostics,
      };
    }

    // Resolve and typecheck modules in topological order
    for (const mod of sortedModules) {
      const resolver = new Resolver(diagnostics, {
        availableModules,
        currentModule: mod,
        isModuleMode: true,
      });
      const resResult = resolver.resolve(mod.ast!, mod.filePath);

      if (!diagnostics.hasErrors()) {
        const typeChecker = new TypeChecker(diagnostics);
        typeChecker.check(mod.ast!, resResult, mod.filePath);
      }
    }

    const entryModule = pkg.entryModule;

    return {
      success: !diagnostics.hasErrors(),
      package: pkg,
      modules: pkg.modules,
      sortedModules,
      diagnostics,
      entryModule,
    };
  }

  public compileSession(
    context: CompilerContext,
    targetStage?: CompilerStage
  ): CompilationResult {
    const files = context.sourceManager.getAllFiles();
    if (files.length === 0) {
      throw new InternalCompilerError('Cannot compile session without any loaded source files.');
    }
    const primaryFile = files[0];
    return this.executePipeline(context, primaryFile.path, targetStage ?? context.config.stopAfter);
  }

  private executePipeline(
    context: CompilerContext,
    filePath: string,
    stopAfter?: CompilerStage
  ): CompilationResult {
    context.beginCompilation();
    const effectiveStop = stopAfter ?? CompilerStage.Parse;

    const sourceFile = context.sourceManager.getFileByPath(filePath);
    const sourceText = sourceFile?.text ?? '';

    // Stage 1: Lexical Analysis
    const lexer = new Lexer(sourceText, filePath, context.diagnostics, sourceFile?.id);
    const tokens = lexer.tokenize();

    if (context.diagnostics.hasErrors() || effectiveStop === CompilerStage.Lex) {
      context.finish();
      return {
        success: !context.diagnostics.hasErrors(),
        stage: CompilerStage.Lex,
        tokens,
        diagnostics: context.diagnostics,
        context,
      };
    }

    // Stage 2: Parsing & AST Construction
    const parser = new Parser(tokens, filePath, context.diagnostics);
    let ast: Program | undefined;

    try {
      ast = parser.parse();
    } catch (err) {
      if (err instanceof InternalCompilerError) {
        throw err;
      }
      // Parser error already reported to diagnostics
    }

    if (context.diagnostics.hasErrors() || !ast || effectiveStop === CompilerStage.Parse) {
      context.finish();
      return {
        success: !context.diagnostics.hasErrors() && ast !== undefined,
        stage: CompilerStage.Parse,
        tokens,
        ast,
        diagnostics: context.diagnostics,
        context,
      };
    }

    // Stage 3: Name Resolution
    let resolverResult: ResolverResult | undefined;
    if (isStageAtLeast(effectiveStop, CompilerStage.Resolve)) {
      const resolver = new Resolver(context.diagnostics);
      resolverResult = resolver.resolve(ast, filePath);

      if (context.diagnostics.hasErrors() || effectiveStop === CompilerStage.Resolve) {
        context.finish();
        return {
          success: !context.diagnostics.hasErrors(),
          stage: CompilerStage.Resolve,
          tokens,
          ast,
          diagnostics: context.diagnostics,
          context,
        };
      }
    }

    // Stage 4: Type Checking & Semantic Analysis
    let typecheckResult: TypecheckResult | undefined;
    if (isStageAtLeast(effectiveStop, CompilerStage.Typecheck)) {
      const typeChecker = new TypeChecker(context.diagnostics);
      typecheckResult = typeChecker.check(ast, resolverResult, filePath);

      if (context.diagnostics.hasErrors() || effectiveStop === CompilerStage.Typecheck) {
        context.finish();
        return {
          success: !context.diagnostics.hasErrors(),
          stage: CompilerStage.Typecheck,
          tokens,
          ast,
          diagnostics: context.diagnostics,
          context,
        };
      }
    }

    // Stage 5: High-Level Intermediate Representation (HIR) Lowering & Validation
    let hir: HIRProgram | undefined;
    if (isStageAtLeast(effectiveStop, CompilerStage.HIR)) {
      const hirLowering = new HIRLowering(context.diagnostics);
      hir = hirLowering.lower(ast, resolverResult, typecheckResult, filePath);

      if (hir && !context.diagnostics.hasErrors()) {
        const hirValidator = new HIRValidator(context.diagnostics);
        hirValidator.validate(hir);
      }

      if (context.diagnostics.hasErrors() || effectiveStop === CompilerStage.HIR) {
        context.finish();
        return {
          success: !context.diagnostics.hasErrors(),
          stage: CompilerStage.HIR,
          tokens,
          ast,
          hir,
          diagnostics: context.diagnostics,
          context,
        };
      }
    }

    // Stage 6: Mid-Level Intermediate Representation (MIR) Construction (Architectural Skeleton)
    let mir: MIRModule | undefined;
    if (isStageAtLeast(effectiveStop, CompilerStage.MIR) && hir) {
      const mirBuilder = new MIRBuilder();
      mir = mirBuilder.build(hir);
      const mirValidation = validateMIR(mir);
      for (const error of mirValidation.errors) {
        context.diagnostics.reportError('E4005', `MIR Validation Error: ${error}`, hir.source.span, hir.source.file);
      }

      if (context.diagnostics.hasErrors() || effectiveStop === CompilerStage.MIR) {
        context.finish();
        return {
          success: !context.diagnostics.hasErrors(),
          stage: CompilerStage.MIR,
          tokens,
          ast,
          hir,
          mir,
          diagnostics: context.diagnostics,
          context,
        };
      }
    }

    // Stage 7: Ownership & Borrow Analysis over MIR
    let ownership: OwnershipAnalysisResult | undefined;
    if (isStageAtLeast(effectiveStop, CompilerStage.ResourceCheck) && mir) {
      ownership = analyzeOwnership(mir);
      for (const issue of ownership.issues) {
        const span = issue.source?.span ?? hir?.source.span ?? { start: 0, end: 0, line: 1, column: 1 };
        const file = issue.source?.file ?? hir?.source.file;
        context.diagnostics.reportError(issue.code, issue.message, span, file);
      }

      if (context.diagnostics.hasErrors() || effectiveStop === CompilerStage.ResourceCheck) {
        context.finish();
        return {
          success: !context.diagnostics.hasErrors(),
          stage: CompilerStage.ResourceCheck,
          tokens,
          ast,
          hir,
          mir,
          ownership,
          diagnostics: context.diagnostics,
          context,
        };
      }
    }

    // Stage 8: Backend Code Generation (Architectural Skeleton)
    let backendResult: BackendResult | undefined;
    if (isStageAtLeast(effectiveStop, CompilerStage.Backend)) {
      const backend = new CompilerBackend(
        context.config.target === 'wasm32-unknown-unknown' ? 'wasm32' : 'native',
        context.diagnostics
      );
      backendResult = backend.emit(mir, {
        target: context.config.target === 'wasm32-unknown-unknown' ? 'wasm32' : 'native',
        optLevel: context.config.optLevel,
        debug: context.config.debug,
      });
    }

    context.finish();
    return {
      success: !context.diagnostics.hasErrors() && (backendResult?.success ?? false),
      stage: CompilerStage.Backend,
      tokens,
      ast,
      hir,
      mir,
      ownership,
      backendResult,
      diagnostics: context.diagnostics,
      context,
    };
  }
}
