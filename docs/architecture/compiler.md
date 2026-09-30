# Seira Compiler Architecture Specification

| Field | Value |
|---|---|
| Specification | Seira 0.0.2-s Compiler Architecture |
| Target Milestone | 0.0.2-s (Seed Series) |
| Architecture Status | **Implemented & Locked** |

---

## 1. Compiler Subsystem Boundaries

The Seira compiler is organized into distinct subsystems within `compiler/`:

```text
compiler/
├── source/          # SourceManager, SourceFile, Span, Position, LineMap
├── lexer/           # Lexical analysis and tokenization
├── parser/          # Recursive descent parsing and syntactic verification
├── ast/             # Abstract Syntax Tree node definitions
├── diagnostics/     # Structured diagnostics engine and InternalCompilerError
├── driver/          # Compilation orchestration, CompilerContext, and configuration
├── resolver/        # [Skeleton] Name resolution and symbol scoping
├── typecheck/       # [Skeleton] Type inference, mutability, and effect verification
├── hir/             # [Skeleton] High-Level Intermediate Representation
├── mir/             # [Skeleton] Mid-Level Intermediate Representation (CFG / SSA)
└── backend/         # [Skeleton] Code generation interface (Native LLVM, WASM)
```

---

## 2. Compilation Pipeline

The compilation pipeline moves through sequential stages orchestrated by `CompilerDriver`:

```text
Source Code
    ↓
[Source Manager]      Assigns SourceId, computes LineMap
    ↓
[Lexer]               Tokenizes locked symbols, keywords, rejects banned syntax
    ↓
[Parser]              Constructs AST, verifies grammar and delimiters
    ↓
[Resolver]            (Skeleton — Reserved: 0.0.3-s) Scope tree, symbol resolution
    ↓
[Type Checking]       (Skeleton — Reserved: 0.0.3-s) Bidirectional inference, effects
    ↓
[HIR Lowering]        (Skeleton — Reserved: 0.0.11-d) Desugaring, canonical representation
    ↓
[MIR Builder]         (Skeleton — Reserved: 0.0.11-d) Control flow graph, SSA, resource ops
    ↓
[Backend Target]      (Skeleton — Reserved: 0.1.0-alpha) LLVM IR / WebAssembly emission
```

---

## 3. Subsystem Implementation Status

| Subsystem | Status | Milestone | Description |
|---|---|---|---|
| `source/` | **Implemented** | 0.0.2-s | Scoped `SourceManager`, `LineMap` O(log N) binary search lookup, `Span` tracking |
| `lexer/` | **Implemented** | 0.0.1-s | Tokenization of locked symbols, keywords, boolean words, rejection of banned tokens |
| `parser/` | **Implemented** | 0.0.1-s | Recursive descent parsing for functions, expressions, pipelines (`|>`), `with` |
| `ast/` | **Implemented** | 0.0.2-s | Strongly-typed node hierarchy with prepared module, pattern, and attribute nodes |
| `diagnostics/` | **Implemented** | 0.0.2-s | Structured code families (E1xxx–E9xxx), spans, snippets, and ICE boundary |
| `driver/` | **Implemented** | 0.0.2-s | `CompilerDriver`, `CompilerContext` session lifecycle, `CompilerConfig` |
| `resolver/` | **Architectural Skeleton** | Reserved (0.0.3-s) | Contracts for `SymbolTable`, `SymbolInfo`, `ScopeKind` |
| `typecheck/` | **Architectural Skeleton** | Reserved (0.0.3-s) | Contracts for `Type`, `TypecheckResult`, inference hooks |
| `hir/` | **Architectural Skeleton** | Reserved (0.0.11-d) | Contracts for `HIRProgram`, `HIRModule`, `HIRFunction`, `HIRBlock` |
| `mir/` | **Architectural Skeleton** | Reserved (0.0.11-d) | Contracts for `MIRModule`, `BasicBlock`, `MIROperation`, `MIRResourceOp` |
| `backend/` | **Architectural Skeleton** | Reserved (0.1.0-alpha) | Contracts for `BackendEmitter`, `BackendOptions`, `BackendResult` |

---

## 4. Compiler Driver & Session Lifecycle

The `CompilerContext` manages the lifecycle of a single compilation session without relying on global mutable state:

```text
create(config)
     ↓
configure()
     ↓
loadSource(path, text)
     ↓
beginCompilation()
     ↓
execute stages (stopAfter?)
     ↓
collect diagnostics
     ↓
finish()
```

Recompiling or loading sources into a finished session throws an `InternalCompilerError`.
