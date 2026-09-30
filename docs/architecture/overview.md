# Seira Architecture Overview

## 1. System Philosophy

Seira is architected from first principles to realize two foundational tenets:
- **Simple to write. Predictable to run.**
- **Write less. Control more.**

Its conceptual axiom dictates:
```
«Everything is a Value.
Programs are Transformations.
The outside world is an Effect.»
```

To support this, the repository is split into distinct, decoupled subsystems with well-defined boundaries.

---

## 2. High-Level Subsystems

```
┌─────────────────────────────────────────────────────────────┐
│                       Tooling & CLI                         │
│   (bin/seira, tools/cli, manifest parser, package manager)  │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
               ▼                               ▼
┌─────────────────────────────┐ ┌─────────────────────────────┐
│      Compiler Pipeline      │ │       Runtime System        │
│  Source ➔ Lexer ➔ Parser    │ │  Value Model, Scope Tree,   │
│  ➔ AST ➔ Resolver ➔ Typecheck│ │  Deterministic Cleanup,     │
│  ➔ HIR ➔ MIR ➔ Backend      │ │  Effect Handlers, Async Loop│
└──────────────┬──────────────┘ └──────────────┬──────────────┘
               │                               │
               ▼                               ▼
       Target Artifacts               Standard Library
    (Native Object / Wasm)           (std/core, io, sys)
```

### Architectural Separation
1. **Compiler ≠ Runtime**: The compiler is purely a static analysis and code generation engine. It possesses no runtime state.
2. **Compiler ≠ Tooling/Package Manager**: Package resolution and manifest logic (`Seira.toml`) reside in tooling modules.
3. **Runtime ≠ Language Semantics**: Language semantics define the meaning of code; the runtime provides the memory and execution environment.
4. **Standard Library ≠ Core Language**: Primitive semantics belong to the language; standard library utilities build on those primitives.

---

## 3. Status Classification Matrix

| Feature / Subsystem | Status in 0.0.1-s | Target Milestone | Description |
| :--- | :--- | :--- | :--- |
| **Lexer Foundation** | **Current Implementation** | 0.0.1-s | Tokenization of keywords, symbols, literals, spans |
| **Parser Foundation** | **Current Implementation** | 0.0.1-s | Recursive descent parsing of functions & expressions |
| **AST Definitions** | **Current Implementation** | 0.0.1-s | Structured AST node representations |
| **Diagnostics Engine** | **Current Implementation** | 0.0.1-s | Source span error reporting with line/column coordinates |
| **Manifest System** | **Current Implementation** | 0.0.1-s | `Seira.toml` specification, parser, and validator |
| **CLI Core** | **Current Implementation** | 0.0.1-s | `seira --version`, `info`, `check`, `init`, `new` |
| **Name Resolver** | **Skeleton / Reserved** | 0.0.2-s | Symbol tables, scope resolution, import graphs |
| **Type Checker & Inference** | **Skeleton / Reserved** | 0.0.3-s / 0.0.4-s | Strong typing, HM inference, trait resolution |
| **Effect Checker** | **Skeleton / Reserved** | 0.0.5-s | Effect tracking (`!`) and purity verification |
| **HIR / MIR Lowering** | **Skeleton / Reserved** | Development Series | High/Mid-level intermediate representations |
| **LLVM Native Backend** | **Skeleton / Reserved** | Alpha Series | Machine code emission for x86_64 and AArch64 |
| **WebAssembly Backend** | **Skeleton / Reserved** | Alpha Series | Wasm binary emission and component model |
| **Runtime Execution Engine** | **Skeleton / Reserved** | Development / Alpha | Value execution, memory allocators, async scheduler |

---

## 4. Locked Technical Foundations

These design decisions are strictly locked:
- Static typing with strong type system and aggressive type inference.
- Immutability by default; explicit mutation with `mut`.
- Resource cleanup using `with` blocks.
- Explicit effects marked by `!`.
- No `null`, no ternary `?:`, no `++`/`--`.
- Native + WebAssembly multi-target architecture.
