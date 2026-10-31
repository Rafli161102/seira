> **Historical baseline notice:** This document was authored for the Seed Series (0.0.10-s) and is retained as a historical architecture record. For current implementation status on `develop`, consult [`current-state.md`](current-state.md) and the [P1.13–P1.18 roadmap](../roadmap/P1.13-P1.18.md). Do not interpret old milestone labels or test counts below as current Development status.

---

# Seira Runtime Boundary Architecture

> **Historical baseline:** this specification records the 0.0.10-s Seed architecture as of 2026-10-01. HIR, MIR, MIR verification and initial MIR-based ownership/borrow analysis have since been implemented in Development. Old version labels below are historical; consult [Current Architecture Status](status.md) for current capability boundaries.


| Field | Value |
|---|---|
| Subsystem | `runtime/` |
| Specification | Seira 0.0.10-s Runtime Boundary Architecture |
| Target Milestone | 0.0.10-s (Seed Series) |
| Architecture Status | **Implemented (Seed Engine) & Architectural Contracts** |

---

## 1. Overview & Separation

The Seira runtime is an execution-support layer strictly separated from the compiler:

```text
Compiler Core (compiler/)   ≠   Runtime System (runtime/)
```

- **The Compiler** does NOT import or execute runtime implementation code during compilation.
- **The Runtime** does NOT depend on compiler internal structures, AST, or CLI tooling.
- The current executable path remains the tree-walking evaluator in `runtime/execution/`; HIR/MIR are compiler analysis representations, not yet the execution engine.
- Native runtime services for compiled binaries remain future work and are not currently emitted.
- WebAssembly runtime adapters remain future work and are not currently emitted.

---

## 2. Core Architectural Boundaries

The runtime boundary is defined by six modular services:

### 1. `RuntimeContext`
Encapsulates execution state for a Seira process or thread:
- Root resource scope
- Ambient effect handler context
- Service registry
- Platform configuration

### 2. `MemoryService`
Manages allocations, bounds enforcement, and scope creation:
- Deterministic resource lifetimes via `with` blocks
- LIFO resource cleanup without stop-the-world garbage collection pauses

### 3. `ResourceManager`
Tracks external system resources:
- File descriptors, network sockets, OS handles
- Deterministic reclamation upon scope exit

### 4. `PanicService`
Manages unrecoverable errors:
- Distinguishes expected failures (`Result<T, E>`) from panics
- Panic hook registration for logging and telemetry
- Guaranteed unwinding and cleanup

### 5. `TaskService`
Structured concurrency abstraction:
- Child tasks cannot outlive their enclosing lexical scope
- Cooperative execution model

### 6. `HostAdapter`
Decouples the runtime from the underlying host platform:
- Standard I/O streams (`stdout`, `stderr`)
- High-resolution monotonic clock (`nowNanoseconds`)
- Process termination (`exitProcess`)

---

## 3. Implementation Status

| Component | Status | Milestone | Description |
|---|---|---|---|
| `ExecutionEngine` (`runtime/execution/`) | **Implemented** | 0.0.5-s – 0.0.10-s | Tree-walking evaluator, environment frames, single-entry convention |
| Seira Value Model v1.0 | **Implemented** | 0.0.5-s – 0.0.10-s | Primitives, Option, Result, List, Tuple, Map, Set, Closures, Bytes, Path, File |
| Deterministic `with` Lifecycle | **Implemented** | 0.0.10-s | First-class `with` statement with guaranteed strict LIFO cleanup across scope exits and panics |
| Memory & File I/O Runtime | **Implemented** | 0.0.10-s | `MemoryReader`, `MemoryWriter`, `MemoryStream`, `File` operations |
| Unicode Scalar Evaluation | **Implemented** | 0.0.10-s | Scalar-boundary text evaluation preserving non-BMP surrogate pairs |
| `RuntimeContext` & Services | **Architectural Foundation** | 0.0.1-s / 0.0.2-s | Session context holding root scope and effect registry contracts |
| Production Native Runtime | **Planned** | 0.1.0-alpha | Native C/Rust/LLVM runtime library for compiled binaries |
