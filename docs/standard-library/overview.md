# Seira Standard Library Overview

## 1. Design Principles

- **Standard Library ≠ Core Language**: Primitive language semantics (syntax, types, effect markers) are defined in the compiler. General-purpose utilities and higher-level abstractions reside in `std/`.
- **Minimal Core, Rich Extensibility**: The base standard library (`std/core`) requires zero host operating system dependencies and compiles cleanly to both bare-metal/native and WebAssembly.
- **Explicit Effects for I/O**: Any standard library module interacting with the host environment (`std/io`, `std/fs`, `std/net`, `std/time`, `std/sys`) explicitly declares effectful operations (`!`).

---

## 2. Package Structure & Implemented Modules (`std/src/`)

```
std/
├── Seira.toml        # Package manifest for std (version 0.0.10-s)
└── src/
    ├── lib.sr        # Package root and module re-exports
    ├── core.sr       # Core contracts and canonical traits (Eq, Ord, Hash, Display, Debug, Clone, Default, Iterator, Reader, Writer, Seekable, Flushable, Sized, Resource)
    ├── option.sr     # Option<T> type and functional combinators
    ├── result.sr     # Result<T, E> error handling and combinators
    ├── collections.sr# Collection contracts (List, Map, Set, Tuple)
    ├── iter.sr       # Iterator<Item> and pipeline adapters
    └── io.sr         # I/O capabilities and resource contracts
```

### Intentionally Minimal Prelude
The Seira Prelude provides global access to core value types and operations without explicit imports:
- **Core Types & Constructors**: `Option`, `Result`, `Some`, `None`, `Ok`, `Err`
- **Output Primitives**: `print`, `println`
- **Memory I/O Primitives**: `MemoryReader`, `MemoryWriter`, `MemoryStream`
- **Resource Management**: `open_resource`, `with` statement
- **Heavy Subsystems**: Networking, database connectors, and complex OS subsystems remain strictly excluded from the Prelude and require explicit module imports.

---

## 3. Status in 0.0.10-s (Seed Series Completion)

- **0.0.9-s (Standard Library & Core Contract Foundation)**: Native `std` package layout, Prelude, `Option`/`Result` contracts, collection contracts, iterator pipeline adapters, and initial traits.
- **0.0.10-s (I/O & Resource Boundary Foundation v1.0)**:
  - Canonical built-in trait registry shared across Resolver and TypeChecker.
  - Composable capability separation (`Reader`, `Writer`, `Seekable`, `Flushable`, `Sized`, `Resource`).
  - Strict Byte/Text boundary (`Byte`, `Bytes`, `Char`, `String`) with explicit encoding/decoding.
  - Standard encodings (UTF-8, ASCII, UTF-16, UTF-32) returning deterministic `Result` types.
  - First-class immutable `Path` abstraction.
  - Deterministic `File` I/O lifecycle (open → use → close) with error reporting (`AlreadyClosed`, `NotFound`, `PermissionDenied`, `InvalidSeek`).
  - First-class `with` statement resource management with deterministic LIFO cleanup.
  - Unicode scalar value semantics across string slicing and memory streams.
- **Development Series (0.0.11-d+)**: Intermediate representation lowering and native in-memory optimizations.
- **Alpha Series (0.1.0-alpha)**: Compiled native standard library runtime with LLVM and WebAssembly backend targets.
