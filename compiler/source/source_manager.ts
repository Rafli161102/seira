/**
 * Seira Source Manager
 *
 * Scoped manager owning all source files within a compilation session.
 * Eliminates global mutable state by tying source ownership directly to session lifecycles.
 */

import type { Position } from './position.ts';
import { SourceFile } from './source_file.ts';
import type { SourceId } from './source_id.ts';
import type { Span } from './span.ts';

export interface ResolvedSpan {
  readonly file: SourceFile;
  readonly start: Position;
  readonly end: Position;
  readonly snippet: string;
}

export class SourceManager {
  private nextId: SourceId = 1;
  private readonly files = new Map<SourceId, SourceFile>();
  private readonly pathToId = new Map<string, SourceId>();

  public addFile(path: string, text: string): SourceFile {
    const existingId = this.pathToId.get(path);
    if (existingId !== undefined) {
      const file = new SourceFile(existingId, path, text);
      this.files.set(existingId, file);
      return file;
    }

    const id = this.nextId++;
    const file = new SourceFile(id, path, text);
    this.files.set(id, file);
    this.pathToId.set(path, id);
    return file;
  }

  public getFile(id: SourceId): SourceFile | undefined {
    return this.files.get(id);
  }

  public getFileByPath(path: string): SourceFile | undefined {
    const id = this.pathToId.get(path);
    if (id === undefined) return undefined;
    return this.files.get(id);
  }

  public resolvePosition(sourceId: SourceId, offset: number): Position | undefined {
    const file = this.files.get(sourceId);
    if (!file) return undefined;
    return file.lookupPosition(offset);
  }

  public resolveSpan(span: Span): ResolvedSpan | undefined {
    let file: SourceFile | undefined;

    if (span.sourceId !== undefined) {
      file = this.files.get(span.sourceId);
    }

    if (!file && this.files.size === 1) {
      // Convenience resolution when session contains a single primary source
      file = this.files.values().next().value;
    }

    if (!file) return undefined;

    const { start, end } = file.lookupSpan(span);
    const snippet = file.getSnippet(span);

    return {
      file,
      start,
      end,
      snippet,
    };
  }

  public getAllFiles(): ReadonlyArray<SourceFile> {
    return Array.from(this.files.values());
  }

  public clear(): void {
    this.files.clear();
    this.pathToId.clear();
    this.nextId = 1;
  }
}
