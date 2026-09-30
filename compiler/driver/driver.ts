/**
 * Seira Compiler Driver
 *
 * Orchestrates the sequential compiler pipeline:
 * Source -> Lexer -> Parser -> Resolver -> Type Checking -> Effect Checking -> Resource Checking -> HIR -> MIR -> Backend
 *
 * Implements clean stage-based compilation with clear engineering boundaries.
 */

import { existsSync, readFileSync } from 'node:fs';
import type { Program } from '../ast/ast.ts';
import { CompilerBackend, type BackendResult } from '../backend/index.ts';
import { DiagnosticBag } from '../diagnostics/index.ts';
import { InternalCompilerError } from '../diagnostics/ice.ts';
import { HIRLowering, type HIRProgram } from '../hir/index.ts';
import { Lexer } from '../lexer/lexer.ts';
import type { Token } from '../lexer/token.ts';
import { MIRBuilder, type MIRModule } from '../mir/index.ts';
import { Parser } from '../parser/parser.ts';
import { Resolver } from '../resolver/index.ts';
import { TypeChecker } from '../typecheck/index.ts';
import type { CompilerConfig } from './config.ts';
import { CompilerContext } from './context.ts';
import { CompilerStage, isStageAtLeast } from './stage.ts';

export interface DriverOptions {
  readonly stopAfter?: CompilerStage;
  readonly config?: Partial<CompilerConfig>;
}

export interface CompilationResult {
  readonly success: boolean;
  readonly stage: CompilerStage;
  readonly tokens: ReadonlyArray<Token>;
  readonly ast?: Program;
  readonly hir?: HIRProgram;
  readonly mir?: MIRModule;
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

    // Stage 3: Name Resolution (Architectural Skeleton)
    if (isStageAtLeast(effectiveStop, CompilerStage.Resolve)) {
      const resolver = new Resolver(context.diagnostics);
      resolver.resolve(ast, filePath);

      if (effectiveStop === CompilerStage.Resolve) {
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

    // Stage 4: Type Checking & Inference (Architectural Skeleton)
    if (isStageAtLeast(effectiveStop, CompilerStage.Typecheck)) {
      const typeChecker = new TypeChecker(context.diagnostics);
      typeChecker.check(ast, filePath);

      if (effectiveStop === CompilerStage.Typecheck) {
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

    // Stage 5: High-Level Intermediate Representation (HIR) Lowering (Architectural Skeleton)
    let hir: HIRProgram | undefined;
    if (isStageAtLeast(effectiveStop, CompilerStage.HIR)) {
      const hirLowering = new HIRLowering(context.diagnostics);
      hir = hirLowering.lower(ast, filePath);

      if (effectiveStop === CompilerStage.HIR) {
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

      if (effectiveStop === CompilerStage.MIR) {
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

    // Stage 7: Backend Code Generation (Architectural Skeleton)
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
      backendResult,
      diagnostics: context.diagnostics,
      context,
    };
  }
}
