# Seira Architecture Overview

| Field | Value |
|---|---|
| Specification | Seira 0.0.2-s Repository Architecture |
| Target Milestone | 0.0.2-s (Seed Series) |
| Architecture Status | **Implemented & Locked** |

---

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

```text
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

## 3. Subsystem Architecture Specifications

Detailed architecture documents provide deep-dive specifications for each boundary:

- [Repository Architecture](repository.md): Repository layout, modular directories, and dependency flow
- [Compiler Architecture](compiler.md): Subsystems, pipeline stages, driver, and compilation lifecycle
- [Source Management Architecture](source-management.md): `SourceId`, `SourceFile`, `Span`, `Position`, `LineMap`, and `SourceManager`
- [Diagnostics Architecture](diagnostics.md): Code families (`E1xxx`–`E9xxx`), source pointers, and ICE crash reporting
- [Testing Architecture](testing.md): Categorized suites (`unit`, `integration`, `compiler`, `diagnostics`, `runtime`, `conformance`, `fixtures`)
- [Runtime Boundary Architecture](runtime-boundary.md): Decoupled runtime services (`RuntimeContext`, `MemoryService`, `ResourceManager`, `PanicService`, `TaskService`, `HostAdapter`)
- [Backend Boundary Architecture](backend-boundary.md): MIR-to-Backend boundary (`BackendEmitter`, Native LLVM, WebAssembly)

---

## 4. Status Classification Matrix

| Feature / Subsystem | Status in 0.0.2-s | Target Milestone | Description |
| :--- | :--- | :--- | :--- |
| **Source Management** | **Implemented** | 0.0.2-s | `SourceManager`, `LineMap`, `Span`, `Position` |
| **Compiler Driver & Lifecycle** | **Implemented** | 0.0.2-s | `CompilerDriver`, `CompilerContext`, `CompilerConfig` |
| **Diagnostics & ICE** | **Implemented** | 0.0.2-s | Structured code families and `InternalCompilerError` boundary |
| **Lexer Foundation** | **Implemented** | 0.0.1-s | Tokenization of keywords, symbols, literals, spans |
| **Parser Foundation** | **Implemented** | 0.0.1-s | Recursive descent parsing of functions & expressions |
| **AST Definitions** | **Implemented** | 0.0.2-s | Structured AST node representations and prepared nodes |
| **Manifest System** | **Implemented** | 0.0.1-s | `Seira.toml` specification, parser, and validator |
| **CLI Core** | **Implemented** | 0.0.2-s | `seira --version`, `info`, `check`, `init`, `new` |
| **Name Resolver** | **Architectural Skeleton** | Reserved (0.0.3-s) | Symbol tables, scope resolution, import graphs |
| **Type Checker & Inference** | **Architectural Skeleton** | Reserved (0.0.3-s) | Strong typing, HM inference, trait resolution |
| **Effect Checker** | **Architectural Skeleton** | Reserved (0.0.5-s) | Effect tracking (`!`) and purity verification |
| **HIR / MIR Lowering** | **Architectural Skeleton** | Reserved (0.0.11-d) | High/Mid-level intermediate representations |
| **LLVM Native Backend** | **Architectural Skeleton** | Reserved (0.1.0-alpha) | Machine code emission for x86_64 and AArch64 |
| **WebAssembly Backend** | **Architectural Skeleton** | Reserved (0.1.0-alpha) | Wasm binary emission and component model |
| **Runtime Execution Engine** | **Architectural Foundation** | Reserved (0.1.0-alpha) | Value execution, memory allocators, async scheduler |

---

## 5. Locked Technical Foundations

These design decisions are strictly locked:
- Static typing with strong type system and aggressive type inference.
- Immutability by default; explicit mutation with `mut`.
- Resource cleanup using `with` blocks.
- Explicit effects marked by `!`.
- No `null`, no ternary `?:`, no `++`/`--`.
- Native + WebAssembly multi-target architecture.
