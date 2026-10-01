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

## 3. Status in 0.0.10-s (I/O & Resource Boundary Foundation)

| Runtime Component | Status in 0.0.10-s | Implementation Milestone | Description |
| :--- | :--- | :--- | :--- |
| **Seira Value Model v1.0** | **Implemented** | 0.0.5-s – 0.0.10-s | Primitives, Option, Result, List, Tuple, Map, Set, Function closures, Bytes, Byte, Path, File, MemoryReader, MemoryWriter, MemoryStream |
| **Tree-Walking Evaluator** | **Implemented** | 0.0.5-s – 0.0.10-s | Deterministic AST evaluation engine (`sr run`) with multi-module execution |
| **Static Trait Dispatch** | **Implemented** | 0.0.7-s / 0.0.10-s | Compile-time resolved trait methods executed without runtime vtables |
| **Control Flow & Pattern Matching** | **Implemented** | 0.0.6-s | Executable `if`, `while`, `for`, `loop`, `break`, `continue`, `match` |
| **Deterministic Resource Cleanup** | **Implemented** | 0.0.10-s | First-class `with` statement with strict LIFO cleanup across scope exits, returns, and panics |
| **Memory I/O Execution** | **Implemented** | 0.0.10-s | Fast, hermetic `MemoryReader`, `MemoryWriter`, and `MemoryStream` execution |
| **Unicode Scalar Semantics** | **Implemented** | 0.0.10-s | Non-splitting scalar evaluation preserving Unicode character and surrogate integrity |
| **Runtime Diagnostics (`R0xxx`)** | **Implemented** | 0.0.5-s | Structured panics for division by zero (`R0001`), unsupported op (`R0002`), internal error (`R0003`), recursion depth (`R0004`), UInt underflow (`R0005`) |
| **Effect Handler Interface** | **Skeleton / Reserved** | Phase 2 (0.0.11-d+) | Basic host output `println`/`print` functional; algebraic effects in Phase 2 |
| **Async Scheduler** | **Skeleton / Reserved** | Alpha Series | Task queues and event loop integration |
| **Native Allocator** | **Skeleton / Reserved** | Alpha Series | LLVM runtime memory management |
| **WebAssembly Memory Manager** | **Skeleton / Reserved** | Alpha Series | Wasm page linear memory allocation |
