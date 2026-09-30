# Seira Standard Library Overview

## 1. Design Principles

- **Standard Library ≠ Core Language**: Primitive language semantics (syntax, types, effect markers) are defined in the compiler. General-purpose utilities and higher-level abstractions reside in `std/`.
- **Minimal Core, Rich Extensibility**: The base standard library (`std/core`) requires zero host operating system dependencies and compiles cleanly to both bare-metal/native and WebAssembly.
- **Explicit Effects for I/O**: Any standard library module interacting with the host environment (`std/io`, `std/fs`, `std/net`, `std/time`, `std/sys`) explicitly declares effectful operations (`!`).

---

## 2. Directory Layout & Module Structure

```
std/
├── core/         # Primitives, fundamental traits (Clone, Display)
├── collections/  # Collections (List, Map, Set)
├── text/         # String slices, formatting, text utilities
├── option/       # Option<T> type and monadic combinators
├── result/       # Result<T, E> error handling
├── iterator/     # Iterator<Item> and pipeline adapters
├── math/         # Numeric functions, constants (PI, E)
├── io/           # Console streams and formatting (println!)
├── fs/           # Filesystem streams and with resource blocks
├── net/          # TCP/UDP networking with explicit effects (!)
├── time/         # Clocks, Instant, Duration, sleep!
└── sys/          # Host OS abstractions, arguments, exit!
```

---

## 3. Status in 0.0.1-s (Seed Foundation)

- **0.0.1-s (Seed Foundation)**: Architectural layout and module interface specifications established.
- **0.0.2-s through 0.0.10-s (Seed Series)**: Definition of core traits and AST/type representations.
- **Development Series (0.0.11-d+)**: In-memory data structures and compiler-builtin mappings.
- **Alpha Series (0.1.0-alpha)**: Functional standard library compiled with the Seira native and Wasm toolchains.
