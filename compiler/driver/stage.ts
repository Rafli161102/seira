/**
 * Seira Compiler Stages
 *
 * Defines the sequential compiler pipeline stages:
 * Source -> Lexer -> Parser -> Resolver -> Type Checking -> Effect Checking -> Resource Checking -> HIR -> MIR -> Backend
 */

export const CompilerStage = {
  Lex: 'lex',
  Parse: 'parse',
  Resolve: 'resolve',
  Typecheck: 'typecheck',
  EffectCheck: 'effect_check',
  ResourceCheck: 'resource_check',
  HIR: 'hir',
  MIR: 'mir',
  Backend: 'backend',
} as const;

export type CompilerStage = (typeof CompilerStage)[keyof typeof CompilerStage];

export const STAGE_ORDER: ReadonlyArray<CompilerStage> = [
  CompilerStage.Lex,
  CompilerStage.Parse,
  CompilerStage.Resolve,
  CompilerStage.Typecheck,
  CompilerStage.EffectCheck,
  CompilerStage.ResourceCheck,
  CompilerStage.HIR,
  CompilerStage.MIR,
  CompilerStage.Backend,
];

export function isStageAtLeast(current: CompilerStage, required: CompilerStage): boolean {
  const currentIdx = STAGE_ORDER.indexOf(current);
  const requiredIdx = STAGE_ORDER.indexOf(required);
  return currentIdx >= requiredIdx;
}
