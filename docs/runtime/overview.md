# Seira Runtime Architecture

## 1. System Role

The Seira runtime is responsible for program execution, memory layout, resource lifecycles, and effect dispatching:
- **Compiler ≠ Runtime**: The compiler emits static code conforming to the Seira ABI. The runtime manages operational execution.
- **Runtime ≠ Language Semantics**: The language dictates *what* programs mean; the runtime determines *how* they execute safely and predictably.

---

## 2. Core Architectural Pillars

### A. Value Representation (`runtime/value`)
- **Tagged Values**: Fast representation of primitives (integers, floats, booleans, unit) and heap references.
- **Immutable by Default**: Value semantics prevent shared mutable state across execution boundaries.
- **Fat Pointers / Slices**: Bounds-checked views into continuous memory buffers.

### B. Deterministic Resource Management (`runtime/memory`)
- **`with` Cleanup Scopes**: Seira enforces deterministic resource cleanup upon exiting lexical scopes.
- **No Stop-the-World Tracing GC**: Seira relies on region-based and deterministic lifetime scopes rather than unpredictable pause-the-world garbage collection.
- **Allocator Interface**: Pluggable memory allocators optimized for native targets and WebAssembly linear memory.

### C. Effect Runtime (`runtime/effects`)
- **Explicit Effect Markers (`!`)**: Functions performing I/O or state modification interact with effect handlers.
- **Handler Stacks**: Pluggable effect handlers enabling mock environments for testing and sandboxed execution for untrusted code.

### D. Async Execution Model (`runtime/async`)
- **Cooperative Structured Concurrency**: Tasks are bounded by parent execution contexts.
- **Zero Cost When Unused**: Applications that do not perform asynchronous I/O do not pay the memory or startup tax of an async scheduler.

---

## 3. Status in 0.0.6-s (Data & Control Foundation)

| Runtime Component | Status in 0.0.6-s | Target Milestone | Description |
| :--- | :--- | :--- | :--- |
| **Seira Value Model v0.2** | **Implemented** | 0.0.6-s | Primitives, Option, Result, List, Tuple, Map, Set, Function closures |
| **Tree-Walking Evaluator** | **Implemented** | 0.0.5-s / 0.0.6-s | Deterministic AST evaluation engine (`seira run`) |
| **Control Flow & Pattern Matching** | **Implemented** | 0.0.6-s | Executable `if`, `while`, `for`, `loop`, `break`, `continue`, `match` |
| **Runtime Diagnostics (`R0xxx`)** | **Implemented** | 0.0.5-s | Structured panics for division by zero, underflow, stack overflow |
| **Scope Cleanup Foundation** | **Mock Compatibility Stub** | Phase 2 | Mock `with` and `open_resource` stubs (production RAII in Phase 2) |
| **Effect Handler Interface** | **Skeleton / Reserved** | Phase 2 | Basic host output `println`/`print` functional; full effects in Phase 2 |
| **Async Scheduler** | **Skeleton / Reserved** | Alpha Series | Task queues and event loop integration |
| **Native Allocator** | **Skeleton / Reserved** | Alpha Series | LLVM runtime memory management |
| **WebAssembly Memory Manager** | **Skeleton / Reserved** | Alpha Series | Wasm page linear memory allocation |
