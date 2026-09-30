/**
 * Seira Runtime System Entry Point
 * Defines the execution engine, value representations, memory scopes, and effect infrastructure.
 */

export * from './async/index.ts';
export * from './effects/index.ts';
export * from './memory/index.ts';
export * from './value/index.ts';

export interface RuntimeVersion {
  readonly version: '0.0.1-s';
  readonly status: 'Seed Foundation';
}

export const RUNTIME_INFO: RuntimeVersion = {
  version: '0.0.1-s',
  status: 'Seed Foundation',
};
