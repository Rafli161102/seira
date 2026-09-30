/**
 * Seira Runtime Outcomes (0.0.5-s Execution Foundation)
 *
 * Every execution action produces an explicit RuntimeOutcome.
 * This eliminates ambiguity between normal values, control flow, and failures.
 *
 * Outcomes for 0.0.5-s:
 *   Normal(value)  — expression produced a value
 *   Return(value)  — return statement triggered; terminates the current function
 *   Panic(payload) — unrecoverable runtime error
 *
 * Future outcomes (NOT implemented in 0.0.5-s):
 *   Break, Continue — loop control flow
 *   Suspend         — async/effect suspension
 *
 * RuntimeOutcome is an internal execution mechanism.
 * It must NEVER be exposed directly to Seira programs.
 */

import type { RuntimeValue } from './values.ts';
import type { Span } from '../../compiler/source/span.ts';

// ─── Runtime Error ────────────────────────────────────────────────────────────

export interface RuntimeError {
  readonly code: string;
  readonly message: string;
  readonly span?: Span;
  readonly file?: string;
  readonly notes?: ReadonlyArray<string>;
  readonly help?: string;
}

// ─── Runtime Outcomes ─────────────────────────────────────────────────────────

export interface NormalOutcome {
  readonly kind: 'Normal';
  readonly value: RuntimeValue;
}

export interface ReturnOutcome {
  readonly kind: 'Return';
  readonly value: RuntimeValue;
}

export interface PanicOutcome {
  readonly kind: 'Panic';
  readonly error: RuntimeError;
}

export type RuntimeOutcome = NormalOutcome | ReturnOutcome | PanicOutcome;

// ─── Outcome Constructors ─────────────────────────────────────────────────────

export function normalOutcome(value: RuntimeValue): NormalOutcome {
  return { kind: 'Normal', value };
}

export function returnOutcome(value: RuntimeValue): ReturnOutcome {
  return { kind: 'Return', value };
}

export function panicOutcome(error: RuntimeError): PanicOutcome {
  return { kind: 'Panic', error };
}

// ─── Outcome Utilities ────────────────────────────────────────────────────────

export function isNormal(outcome: RuntimeOutcome): outcome is NormalOutcome {
  return outcome.kind === 'Normal';
}

export function isReturn(outcome: RuntimeOutcome): outcome is ReturnOutcome {
  return outcome.kind === 'Return';
}

export function isPanic(outcome: RuntimeOutcome): outcome is PanicOutcome {
  return outcome.kind === 'Panic';
}

/** Extracts the value from a Normal or Return outcome. Panics if called on a Panic outcome. */
export function unwrapValue(outcome: NormalOutcome | ReturnOutcome): RuntimeValue {
  return outcome.value;
}

/**
 * Creates a structured runtime error for division-by-zero.
 */
export function divisionByZeroError(span?: Span, file?: string): RuntimeError {
  return {
    code: 'E5001',
    message: 'Runtime error: Division by zero.',
    span,
    file,
    notes: ['Integer division by zero is always an error in Seira.'],
    help: 'Guard against zero divisors before performing division.',
  };
}

/**
 * Creates a structured runtime error for unsupported operations.
 */
export function unsupportedOperationError(op: string, span?: Span, file?: string): RuntimeError {
  return {
    code: 'E5002',
    message: `Runtime error: Unsupported operation '${op}' in current execution context.`,
    span,
    file,
    help: `The operation '${op}' is defined in the language specification but not yet executable in 0.0.5-s.`,
  };
}

/**
 * Creates a structured runtime error for an invalid execution state.
 */
export function invalidStateError(message: string, span?: Span, file?: string): RuntimeError {
  return {
    code: 'E5003',
    message: `Internal execution error: ${message}`,
    span,
    file,
  };
}

/**
 * Creates a structured runtime error for stack overflow.
 */
export function stackOverflowError(depth: number, span?: Span, file?: string): RuntimeError {
  return {
    code: 'E5004',
    message: `Runtime error: Call stack depth exceeded (depth: ${depth}).`,
    span,
    file,
    help: 'Check for unintended infinite recursion.',
  };
}
