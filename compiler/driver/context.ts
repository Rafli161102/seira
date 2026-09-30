/**
 * Seira Compilation Context & Session Management
 *
 * Encapsulates a single compilation session with an explicit lifecycle:
 * create -> configure -> load source -> compile -> collect diagnostics -> finish
 *
 * Eliminates uncontrolled global mutable state.
 */

import { DiagnosticBag } from '../diagnostics/index.ts';
import { InternalCompilerError } from '../diagnostics/ice.ts';
import { SourceFile } from '../source/source_file.ts';
import { SourceManager } from '../source/source_manager.ts';
import { createDefaultConfig, type CompilerConfig } from './config.ts';

export const SessionState = {
  Created: 'created',
  Configured: 'configured',
  SourceLoaded: 'source_loaded',
  Compiling: 'compiling',
  Finished: 'finished',
} as const;

export type SessionState = (typeof SessionState)[keyof typeof SessionState];

export class CompilerContext {
  private state: SessionState;
  public readonly config: CompilerConfig;
  public readonly sourceManager: SourceManager;
  public readonly diagnostics: DiagnosticBag;
  private readonly sessionData = new Map<string, unknown>();

  constructor(config?: Partial<CompilerConfig>) {
    this.config = createDefaultConfig(config);
    this.sourceManager = new SourceManager();
    this.diagnostics = new DiagnosticBag();
    this.state = SessionState.Configured;
  }

  public getState(): SessionState {
    return this.state;
  }

  public loadSource(path: string, text: string): SourceFile {
    if (this.state === SessionState.Finished) {
      throw new InternalCompilerError('Cannot load source into an already finished compilation session.');
    }
    const file = this.sourceManager.addFile(path, text);
    this.state = SessionState.SourceLoaded;
    return file;
  }

  public beginCompilation(): void {
    if (this.state === SessionState.Finished) {
      throw new InternalCompilerError('Cannot re-compile a finished session.');
    }
    this.state = SessionState.Compiling;
  }

  public finish(): void {
    this.state = SessionState.Finished;
  }

  public setSessionData<T>(key: string, value: T): void {
    this.sessionData.set(key, value);
  }

  public getSessionData<T>(key: string): T | undefined {
    return this.sessionData.get(key) as T | undefined;
  }
}
