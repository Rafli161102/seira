/**
 * Seira Source Identity
 *
 * Uniquely identifies a source file within a compilation session.
 */

export type SourceId = number;

export function isSourceId(val: unknown): val is SourceId {
  return typeof val === 'number' && Number.isInteger(val) && val >= 0;
}
