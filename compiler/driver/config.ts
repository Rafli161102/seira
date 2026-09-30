/**
 * Seira Compiler Configuration
 *
 * Defines explicit compilation options without relying on hidden global environment state.
 */

import type { CompilerStage } from './stage.ts';

export type CompilerEdition = '2026';
export type TargetTriple = 'native' | 'wasm32-unknown-unknown';
export type BuildProfile = 'dev' | 'release';
export type OptLevel = 0 | 1 | 2 | 3;

export interface CompilerConfig {
  readonly edition: CompilerEdition;
  readonly target: TargetTriple;
  readonly profile: BuildProfile;
  readonly optLevel: OptLevel;
  readonly debug: boolean;
  readonly stopAfter?: CompilerStage;
}

export function createDefaultConfig(overrides?: Partial<CompilerConfig>): CompilerConfig {
  return {
    edition: '2026',
    target: 'native',
    profile: 'dev',
    optLevel: 0,
    debug: true,
    stopAfter: undefined,
    ...overrides,
  };
}
