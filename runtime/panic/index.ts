/**
 * Seira Runtime Panic Subsystem
 *
 * Distinguishes unrecoverable panics from expected failure conditions (Result<T, E>):
 * - Deterministic unwind or immediate abort
 * - Panic hook registration for logging or telemetry
 * - Guaranteed resource cleanup during unwinding
 *
 * Status: Architectural skeleton for Seed Foundation (0.0.1-s).
 */

export interface PanicPayload {
  readonly message: string;
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
}

export type PanicHook = (payload: PanicPayload) => void;

let globalPanicHook: PanicHook | null = null;

export function setPanicHook(hook: PanicHook): void {
  globalPanicHook = hook;
}

export function panic(payload: PanicPayload): never {
  if (globalPanicHook) {
    try {
      globalPanicHook(payload);
    } catch {
      // Prevent recursive panics inside hook
    }
  }

  const loc = payload.file ? ` at ${payload.file}:${payload.line ?? 0}:${payload.column ?? 0}` : '';
  throw new Error(`Seira Panic${loc}: ${payload.message}`);
}
