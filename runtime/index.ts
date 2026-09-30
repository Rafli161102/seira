/**
 * Seira Runtime System Entry Point
 *
 * Defines the runtime execution boundaries:
 * - Execution Engine (Tree-Walking, 0.0.5-s)
 * - Execution Context, Environment, Values, Outcomes
 * - Runtime Context
 * - Memory Service & Deterministic Scopes
 * - Resource Manager & Services
 * - Panic Subsystem
 * - Effect Runtime
 * - Value Representation (legacy architectural skeleton)
 * - Host Adapter
 */

export * from './async/index.ts';
export * from './context/index.ts';
export * from './effects/index.ts';
export * from './execution/index.ts';
export * from './host/index.ts';
export * from './memory/index.ts';
export * from './panic/index.ts';
export * from './services/index.ts';
// Note: ./value/index.ts legacy exports superseded by ./execution/values.ts
// Kept for backwards compatibility with existing runtime tests
export {
  UnitValue,
  makeInt,
  makeFloat,
  makeBool,
  makeString,
  makeSome,
  NoneValue,
  makeOk,
  makeErr,
  ValueTag,
} from './value/index.ts';
export type { SeiraValue } from './value/index.ts';

export interface RuntimeVersion {
  readonly version: '0.0.7-s';
  readonly status: 'Type & Generic Foundation';
}

export const RUNTIME_INFO: RuntimeVersion = {
  version: '0.0.7-s',
  status: 'Type & Generic Foundation',
};
