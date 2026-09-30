/**
 * Seira Runtime Host Adapter
 *
 * Decouples the Seira runtime from the underlying host execution environment:
 * - Native POSIX / Windows host adapter
 * - WebAssembly / WASI host adapter
 * - Embedded / Bare-metal host adapter
 *
 * Status: Architectural skeleton for Seed Foundation (0.0.1-s).
 */

export interface HostAdapter {
  writeStdout(bytes: Uint8Array): void;
  writeStderr(bytes: Uint8Array): void;
  nowNanoseconds(): bigint;
  exitProcess(code: number): never;
}

export class DefaultHostAdapter implements HostAdapter {
  public writeStdout(bytes: Uint8Array): void {
    process.stdout.write(bytes);
  }

  public writeStderr(bytes: Uint8Array): void {
    process.stderr.write(bytes);
  }

  public nowNanoseconds(): bigint {
    return process.hrtime.bigint();
  }

  public exitProcess(code: number): never {
    process.exit(code);
  }
}
