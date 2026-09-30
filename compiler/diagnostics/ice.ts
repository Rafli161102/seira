/**
 * Seira Internal Compiler Error (ICE)
 *
 * Distinguishes unexpected compiler implementation failures from user source code errors.
 * - User code errors produce standard diagnostics (E1xxx–E9xxx).
 * - Compiler implementation bugs raise an InternalCompilerError with crash triage info.
 */

import type { Span } from '../source/span.ts';

export class InternalCompilerError extends Error {
  public readonly code: string = 'ICE';
  public readonly phase?: string;
  public readonly span?: Span;
  public readonly file?: string;

  constructor(message: string, phase?: string, span?: Span, file?: string) {
    super(`Internal Compiler Error: ${message}`);
    this.name = 'InternalCompilerError';
    this.phase = phase;
    this.span = span;
    this.file = file;

    // Maintain proper stack trace in V8 / Node.js
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, InternalCompilerError);
    }
  }

  public formatCrashReport(): string {
    const loc = this.file ? ` (in ${this.file})` : '';
    const phaseStr = this.phase ? ` during [${this.phase}]` : '';
    return [
      `internal compiler error: ${this.message}${phaseStr}${loc}`,
      'This is a bug in the Seira compiler.',
      'Please submit an issue report at: https://github.com/Rafli161102/seira/issues',
    ].join('\n');
  }
}

export function isInternalCompilerError(err: unknown): err is InternalCompilerError {
  return err instanceof InternalCompilerError;
}
