# Seira Runtime Boundary Architecture

| Field | Value |
|---|---|
| Subsystem | `runtime/` |
| Specification | Seira 0.0.2-s Runtime Boundary Architecture |
| Target Milestone | 0.0.2-s (Seed Series) |
| Architecture Status | **Architectural Foundation & Contracts** |

---

## 1. Overview & Separation

The Seira runtime is an execution-support layer strictly separated from the compiler:

```text
Compiler Core (compiler/)   ≠   Runtime System (runtime/)
```

- **The Compiler** does NOT import or execute runtime implementation code during compilation.
- **The Runtime** does NOT depend on compiler internal structures, AST, or CLI tooling.
- For native binary targets, runtime services are compiled into target object files or static libraries.
- For WebAssembly targets, runtime services are supplied through WASI host adapters or JavaScript bindings.

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
| `RuntimeContext` | **Architectural Foundation** | 0.0.1-s / 0.0.2-s | Session context holding root scope and effect registry |
| `MemoryService` | **Architectural Foundation** | 0.0.2-s | Deterministic `ResourceScope` and cleaner contracts |
| `ResourceManager` | **Architectural Foundation** | 0.0.2-s | Service registry and handle lifecycle interface |
| `PanicService` | **Architectural Foundation** | 0.0.2-s | Panic payload, hook registration, deterministic unwind |
| `TaskService` | **Architectural Foundation** | 0.0.2-s | Structured task scheduling contracts |
| `HostAdapter` | **Architectural Foundation** | 0.0.1-s / 0.0.2-s | POSIX / Node.js monotonic clock and I/O interface |
| Production Runtime | **Planned** | 0.1.0-alpha | Native C/Rust/LLVM runtime library |
