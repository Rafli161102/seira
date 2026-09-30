/**
 * Seira Source Position
 *
 * Represents an exact character position within a source file.
 * - line: 1-indexed line number
 * - column: 1-indexed column offset
 * - offset: 0-indexed character offset from start of file
 */

export interface Position {
  readonly line: number;
  readonly column: number;
  readonly offset: number;
}

export function createPosition(line: number, column: number, offset: number): Position {
  return { line, column, offset };
}
