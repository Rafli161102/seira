/**
 * Seira Line Map
 *
 * Efficiently maps source character offsets to line and column coordinates.
 * Uses binary search over precalculated line-start offsets.
 */

import { createPosition, type Position } from './position.ts';

export class LineMap {
  private readonly lineStarts: number[];
  private readonly sourceText: string;

  constructor(sourceText: string) {
    this.sourceText = sourceText;
    const starts: number[] = [0];
    const len = sourceText.length;

    for (let i = 0; i < len; i++) {
      if (sourceText.charCodeAt(i) === 10) {
        // '\n'
        starts.push(i + 1);
      }
    }

    this.lineStarts = starts;
  }

  public getLineCount(): number {
    return this.lineStarts.length;
  }

  public lineToOffset(line: number): number {
    if (line < 1 || line > this.lineStarts.length) {
      throw new RangeError(`Line ${line} is out of bounds (1..${this.lineStarts.length})`);
    }
    return this.lineStarts[line - 1];
  }

  public lookup(offset: number): Position {
    const clampedOffset = Math.max(0, Math.min(offset, this.sourceText.length));

    // Binary search to find the greatest line whose start <= clampedOffset
    let low = 0;
    let high = this.lineStarts.length - 1;
    let lineIdx = 0;

    while (low <= high) {
      const mid = (low + high) >> 1;
      if (this.lineStarts[mid] <= clampedOffset) {
        lineIdx = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const line = lineIdx + 1; // 1-indexed
    const lineStart = this.lineStarts[lineIdx];
    const column = clampedOffset - lineStart + 1; // 1-indexed

    return createPosition(line, column, clampedOffset);
  }

  public getLineContent(line: number): string {
    if (line < 1 || line > this.lineStarts.length) {
      return '';
    }

    const start = this.lineStarts[line - 1];
    const end = line < this.lineStarts.length ? this.lineStarts[line] : this.sourceText.length;

    let content = this.sourceText.slice(start, end);
    // Strip trailing \r and \n
    if (content.endsWith('\n')) {
      content = content.slice(0, -1);
    }
    if (content.endsWith('\r')) {
      content = content.slice(0, -1);
    }

    return content;
  }
}
