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

export interface BreakOutcome {
  readonly kind: 'Break';
}

export interface ContinueOutcome {
  readonly kind: 'Continue';
}

export interface PanicOutcome {
  readonly kind: 'Panic';
  readonly error: RuntimeError;
}

export type RuntimeOutcome =
  | NormalOutcome
  | ReturnOutcome
  | BreakOutcome
  | ContinueOutcome
  | PanicOutcome;

// ─── Outcome Constructors ─────────────────────────────────────────────────────

export function normalOutcome(value: RuntimeValue): NormalOutcome {
  return { kind: 'Normal', value };
}

export function returnOutcome(value: RuntimeValue): ReturnOutcome {
  return { kind: 'Return', value };
}

export function breakOutcome(): BreakOutcome {
  return { kind: 'Break' };
}

export function continueOutcome(): ContinueOutcome {
  return { kind: 'Continue' };
}

export function panicOutcome(error: RuntimeError): PanicOutcome {
  return { kind: 'Panic', error };
}

export function isNormal(outcome: RuntimeOutcome | undefined): outcome is NormalOutcome {
  return outcome !== undefined && outcome.kind === 'Normal';
}

export function isReturn(outcome: RuntimeOutcome | undefined): outcome is ReturnOutcome {
  return outcome !== undefined && outcome.kind === 'Return';
}

export function isBreak(outcome: RuntimeOutcome | undefined): outcome is BreakOutcome {
  return outcome !== undefined && outcome.kind === 'Break';
}

export function isContinue(outcome: RuntimeOutcome | undefined): outcome is ContinueOutcome {
  return outcome !== undefined && outcome.kind === 'Continue';
}

export function isPanic(outcome: RuntimeOutcome | undefined): outcome is PanicOutcome {
  return outcome !== undefined && outcome.kind === 'Panic';
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
    code: 'R0001',
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
    code: 'R0002',
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
    code: 'R0003',
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
    code: 'R0004',
    message: `Runtime error: Call stack depth exceeded (depth: ${depth}).`,
    span,
    file,
    help: 'Check for unintended infinite recursion.',
  };
}

/**
 * Creates a structured runtime error for unsigned integer underflow.
 */
export function uintUnderflowError(lhs: bigint, rhs: bigint, span?: Span, file?: string): RuntimeError {
  return {
    code: 'R0005',
    message: `Runtime error: Unsigned integer underflow: ${lhs}u - ${rhs}u cannot be represented as UInt.`,
    span,
    file,
    notes: ['UInt values in Seira are non-negative and do not wrap or clamp.'],
    help: 'Ensure the left operand is greater than or equal to the right operand before subtracting UInt values.',
  };
}
