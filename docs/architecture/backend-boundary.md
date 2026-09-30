# Seira Backend Boundary Architecture

| Field | Value |
|---|---|
| Subsystem | `compiler/backend/` |
| Specification | Seira 0.0.2-s Backend Boundary Architecture |
| Target Milestone | 0.0.2-s (Seed Series) |
| Architecture Status | **Architectural Skeleton & Contract** |

---

## 1. Overview & Separation

The Seira backend translates compiler intermediate representations into target machine code or bytecode:

```text
HIR  →  MIR  →  Backend Interface  →  Target Implementation (LLVM / WASM)
```

### Critical Architectural Invariants:
1. **Backends Consume MIR**: Backend code generation NEVER consumes raw source code or AST directly. It consumes canonical, control-flow-analyzed `MIRModule` representations.
2. **Pluggable Emitter Interface**: Backends implement the common `BackendEmitter` interface.
3. **No Premature Implementation**: Native LLVM code generation and WebAssembly bytecode generation are scheduled for the Alpha Series (0.1.0-alpha). Skeletons explicitly emit diagnostic `E9001` when invoked.

---

## 2. Core Abstractions

### `BackendTarget`
Supported code generation targets:
- `native`: Native machine code via LLVM (targeting x86_64, AArch64)
- `wasm32`: WebAssembly bytecode and component model

### `BackendOptions`
Configuration passed to the code generation phase:
```typescript
export interface BackendOptions {
  readonly target: TargetBackend;
  readonly optLevel: 0 | 1 | 2 | 3;
  readonly debug: boolean;
}
```

### `BackendResult`
Structured result returned from backend emission:
```typescript
export interface BackendResult {
  readonly success: boolean;
  readonly target: TargetBackend;
  readonly outputBytes?: Uint8Array;
  readonly diagnostics: DiagnosticBag;
}
```

### `BackendEmitter`
Common interface implemented by backend code generators:
```typescript
export interface BackendEmitter {
  readonly target: TargetBackend;
  emit(mir?: MIRModule | BackendOptions, options?: Partial<BackendOptions>): BackendResult;
}
```

---

## 3. Implementation Status

| Component | Status | Milestone | Description |
|---|---|---|---|
| `BackendEmitter` | **Architectural Contract** | 0.0.2-s | Interface contract defining code generation API |
| `CompilerBackend` | **Architectural Skeleton** | 0.0.2-s | Skeleton emitter reporting milestone error `E9001` |
| Native LLVM Backend | **Planned** | 0.1.0-alpha | LLVM IR generation and optimization passes |
| WebAssembly Backend | **Planned** | 0.1.0-alpha | Binary Wasm bytecode emission |
