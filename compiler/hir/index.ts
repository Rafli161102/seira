/**
 * Seira High-Level Intermediate Representation (HIR)
 *
 * Official semantic representation boundary between AST-level language
 * representation and the future MIR/backend pipeline.
 *
 * Characteristics:
 * - Resolved (symbols, functions, fields, traits, impls)
 * - Strongly typed (canonical HIRType on every node)
 * - Source-aware (direct source mapping & synthetic tracking)
 * - Deterministic (canonical ID generation and formatting)
 * - Canonical (desugared pipelines, fallbacks, try propagation, resource blocks)
 * - Backend-neutral (purely high-level, no low-level IR constructs)
 */

export * from './ids.ts';
export * from './origin.ts';
export * from './types.ts';
export * from './nodes.ts';
export * from './visitor.ts';
export * from './lowering.ts';
export * from './validator.ts';
export * from './printer.ts';

// Backward compatibility alias
import type { NodeId } from './ids.ts';
export type HIRId = NodeId;
