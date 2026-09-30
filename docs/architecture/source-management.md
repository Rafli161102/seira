# Seira Source Management Architecture

| Field | Value |
|---|---|
| Subsystem | `compiler/source/` |
| Specification | Seira 0.0.2-s Source Management Architecture |
| Target Milestone | 0.0.2-s (Seed Series) |
| Architecture Status | **Implemented & Locked** |

---

## 1. Overview

The source management subsystem provides foundational representations for source text identity, location tracking, coordinate mapping, and span resolution.

It ensures that source location resolution is fast, deterministic, and free of uncontrolled global mutable state.

---

## 2. Core Abstractions

### `SourceId`
An opaque identifier uniquely assigned to a source file when loaded into a `SourceManager` session:
```typescript
export type SourceId = number;
```

### `Position`
An exact character position within a file:
- `line`: 1-indexed line number
- `column`: 1-indexed column offset
- `offset`: 0-indexed character offset from the start of the source text

### `Span`
A half-open range `[start, end)` representing a contiguous slice of source code:
```typescript
export interface Span {
  readonly start: number;     // 0-indexed offset (inclusive)
  readonly end: number;       // 0-indexed offset (exclusive)
  readonly sourceId?: SourceId;
  readonly line?: number;     // 1-indexed line
  readonly column?: number;   // 1-indexed column
}
```

### `LineMap`
Calculates line-start offsets during file loading and provides $O(\log N)$ binary search lookup for character offsets:
- `lookup(offset: number): Position`
- `getLineContent(line: number): string`
- `getLineCount(): number`
- `lineToOffset(line: number): number`

### `SourceFile`
Encapsulates an individual source file with its assigned `SourceId`, file path, text buffer, and precomputed `LineMap`. Provides snippet extraction and coordinate conversion.

### `SourceManager`
Owns all source files for a single compilation session:
- Scoped to `CompilerContext` — no global singleton
- Resolves spans across multi-file compilation sessions
- Formats source snippets with line context for diagnostic reporting

---

## 3. Implementation Status

| Component | Status | Milestone |
|---|---|---|
| `SourceId` | **Implemented** | 0.0.2-s |
| `Position` | **Implemented** | 0.0.2-s |
| `Span` | **Implemented** | 0.0.2-s |
| `LineMap` | **Implemented** | 0.0.2-s |
| `SourceFile` | **Implemented** | 0.0.2-s |
| `SourceManager` | **Implemented** | 0.0.2-s |
