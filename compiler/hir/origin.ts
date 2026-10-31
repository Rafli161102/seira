/**
 * Seira High-Level Intermediate Representation (HIR) — Source Origin Tracking
 *
 * Implements source origin tracking to differentiate:
 * - Direct source mapping (Source)
 * - Synthetic nodes generated via lowering/desugaring (Synthetic)
 *
 * Reuses Seira's existing SourceManager and Span infrastructure.
 */

import type { Span } from '../source/span.ts';

export type SourceOriginKind = 'Source' | 'Synthetic';

export interface SourceOrigin {
  readonly kind: SourceOriginKind;
  readonly span: Span;
  readonly file?: string;
  readonly reason?: string;
  readonly parentSpan?: Span;
}

export function fromSource(span: Span, file?: string): SourceOrigin {
  return {
    kind: 'Source',
    span,
    file,
  };
}

export function fromSynthetic(parentSpan: Span, reason: string, file?: string): SourceOrigin {
  return {
    kind: 'Synthetic',
    span: parentSpan,
    file,
    reason,
    parentSpan,
  };
}

export function isSynthetic(origin: SourceOrigin): boolean {
  return origin.kind === 'Synthetic';
}
