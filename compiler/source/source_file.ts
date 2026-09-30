/**
 * Seira Source File
 *
 * Represents an individual source file loaded during a compilation session.
 */

import { LineMap } from './line_map.ts';
import type { Position } from './position.ts';
import type { SourceId } from './source_id.ts';
import type { Span } from './span.ts';

export class SourceFile {
  public readonly id: SourceId;
  public readonly path: string;
  public readonly text: string;
  public readonly lineMap: LineMap;

  constructor(id: SourceId, path: string, text: string) {
    this.id = id;
    this.path = path;
    this.text = text;
    this.lineMap = new LineMap(text);
  }

  public lookupPosition(offset: number): Position {
    return this.lineMap.lookup(offset);
  }

  public lookupSpan(span: Span): { start: Position; end: Position } {
    return {
      start: this.lineMap.lookup(span.start),
      end: this.lineMap.lookup(span.end),
    };
  }

  public getSnippet(span: Span): string {
    const clampedStart = Math.max(0, Math.min(span.start, this.text.length));
    const clampedEnd = Math.max(clampedStart, Math.min(span.end, this.text.length));
    return this.text.slice(clampedStart, clampedEnd);
  }

  public getLine(line: number): string {
    return this.lineMap.getLineContent(line);
  }
}
