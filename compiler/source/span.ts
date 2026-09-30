/**
 * Seira Source Span
 *
 * Represents a contiguous range in source code:
 * - start: 0-indexed character offset (inclusive)
 * - end: 0-indexed character offset (exclusive)
 * - sourceId: optional SourceId of the owning file
 * - line: optional 1-indexed line for fast diagnostic rendering
 * - column: optional 1-indexed column for fast diagnostic rendering
 */

import type { SourceId } from './source_id.ts';

export interface Span {
  readonly start: number;
  readonly end: number;
  readonly sourceId?: SourceId;
  readonly line?: number;
  readonly column?: number;
}

export function createSpan(
  start: number,
  end: number,
  sourceId?: SourceId,
  line?: number,
  column?: number
): Span {
  return {
    start,
    end,
    sourceId,
    line,
    column,
  };
}

export function emptySpan(sourceId?: SourceId): Span {
  return {
    start: 0,
    end: 0,
    sourceId,
    line: 1,
    column: 1,
  };
}

export function mergeSpans(first: Span, last: Span): Span {
  return {
    start: Math.min(first.start, last.start),
    end: Math.max(first.end, last.end),
    sourceId: first.sourceId ?? last.sourceId,
    line: first.line ?? last.line,
    column: first.column ?? last.column,
  };
}

export function containsOffset(span: Span, offset: number): boolean {
  return offset >= span.start && offset < span.end;
}
