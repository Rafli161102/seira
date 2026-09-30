/**
 * Seira Runtime System Entry Point
 *
 * Defines the runtime execution boundaries:
 * - Runtime Context
 * - Memory Service & Deterministic Scopes
 * - Resource Manager & Services
 * - Panic Subsystem
 * - Task Abstraction & Async Model
 * - Effect Runtime
 * - Value Representation
 * - Host Adapter
 */

export * from './async/index.ts';
export * from './context/index.ts';
export * from './effects/index.ts';
export * from './host/index.ts';
export * from './memory/index.ts';
export * from './panic/index.ts';
export * from './services/index.ts';
export * from './value/index.ts';

export interface RuntimeVersion {
  readonly version: '0.0.1-s';
  readonly status: 'Seed Foundation';
}

export const RUNTIME_INFO: RuntimeVersion = {
  version: '0.0.1-s',
  status: 'Seed Foundation',
};
