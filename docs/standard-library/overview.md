# Seira Standard Library Overview

## 1. Design Principles

- **Standard Library ≠ Core Language**: Primitive language semantics (syntax, types, effect markers) are defined in the compiler. General-purpose utilities and higher-level abstractions reside in `std/`.
- **Minimal Core, Rich Extensibility**: The base standard library (`std/core`) requires zero host operating system dependencies and compiles cleanly to both bare-metal/native and WebAssembly.
- **Explicit Effects for I/O**: Any standard library module interacting with the host environment (`std/io`, `std/sys`, `std/net`) explicitly declares effectful operations (`!`).

---

## 2. Directory Layout & Module Structure

```
std/
├── core/       # Primitives, Option<T>, Result<T, E>, collections, traits
├── io/         # Stream abstractions, file I/O, formatted output (println!)
└── sys/        # Host OS abstractions, time, environment variables, processes
```

### Module Responsibilities

#### `std/core`
- **Foundation Types**:
  - `Option<T>` (`Some(T)` or `None`)
  - `Result<T, E>` (`Ok(T)` or `Err(E)`)
  - Primitive numeric types (`Int`, `Int32`, `Int64`, `Float`, `Float32`, `Float64`, `Bool`, `Char`, `String`, `Unit`)
- **Traits**:
  - `Clone`, `Default`, `Display`, `Debug`, `Eq`, `Ord`, `Hash`

#### `std/io`
- Standard streams (`stdin`, `stdout`, `stderr`).
- Formatted printing (`println`, `print`).
- Buffer readers, writers, and byte stream traits.

#### `std/sys`
- Operating system details, memory queries, command-line arguments, environment inspection.

---

## 3. Status in 0.0.1-s

- **0.0.1-s (Seed Foundation)**: Architectural layout and module interface specifications established.
- **0.0.2-s through 0.0.10-s (Seed Series)**: Definition of core traits and AST/type representations.
- **Development Series (0.0.11-d+)**: In-memory data structures and compiler-builtin mappings.
- **Alpha Series (0.1.0-alpha)**: Functional standard library compiled with the Seira native and Wasm toolchains.
