# Seira Compiler Architecture

## 1. Compiler Pipeline

The Seira compiler is designed as a multi-stage, modular transformation pipeline:

```
Source Code (.sr)
      ↓
   [Lexer]          ──► Tokens + Source Spans
      ↓
   [Parser]         ──► Abstract Syntax Tree (AST)
      ↓
  [Resolver]        ──► Scoped Symbol Tables & Module Graph
      ↓
  [Typecheck]       ──► Typed AST + Effect Verification
      ↓
    [HIR]           ──► High-Level Intermediate Representation
      ↓
    [MIR]           ──► Mid-Level IR (Control Flow Graph, Borrow/Resource Checking)
      ↓
   [Backend]        ──► Native (LLVM IR / Object) or WebAssembly (Wasm)
```

---

## 2. Module Responsibilities & Status in 0.0.10-s

| Module | Architectural Responsibility | Status in 0.0.10-s |
| :--- | :--- | :--- |
| `compiler/source` | SourceManager, coordinate mapping, SourceId, Spans, Positions, and LineMap. | **Implemented (0.0.2-s)** |
| `compiler/lexer` | Scans source UTF-8 characters into tokens, tracking accurate byte offsets, lines, and columns with full literal and token matrix. | **Implemented (0.0.3-s / 0.0.8-s)** |
| `compiler/parser` | Constructs the AST using Pratt precedence climbing, supporting expressions, bindings, control flow, traits, generics, visibility, and error recovery. | **Implemented (0.0.3-s / 0.0.8-s)** |
| `compiler/ast` | Type definitions for AST nodes preserving source spans and visibility markers. | **Implemented (0.0.3-s / 0.0.8-s)** |
| `compiler/diagnostics` | Emits formatted compiler diagnostics (`E1xxx`–`E6xxx`, `R0xxx`, `W1xxx`, `I1xxx`) with line:column pointers, carets, severity, and error codes. | **Implemented (0.0.1-s / 0.0.8-s)** |
| `compiler/module` | Module discovery, filesystem mapping, package manifest (`Seira.toml`), lockfile (`Seira.lock`), workspaces, and cycle detection. | **Implemented (0.0.8-s)** |
| `compiler/driver` | Orchestrates compiler pipeline stages end-to-end for single-file and package compilation modes. | **Implemented (0.0.3-s / 0.0.8-s)** |
| `compiler/resolver` | Lexical scoping, symbol binding, shadowing, cross-module resolution (`import`, `use`, `pub use`), and canonical built-in trait registry. | **Implemented (0.0.4-s / 0.0.8-s / 0.0.10-s)** |
| `compiler/typecheck` | Static type inference, structural equality, generics, unions, type aliases, trait contract validation, resource validation, and method diagnostics. | **Implemented (0.0.4-s / 0.0.7-s / 0.0.8-s / 0.0.10-s)** |
| `compiler/hir` | Lowers AST to High-Level IR with desugared control flow and simplified expressions. | **Skeleton / Reserved (0.0.11-d)** |
| `compiler/mir` | Lowers HIR to Mid-Level IR (SSA CFG) for deterministic resource cleanup analysis and optimization. | **Skeleton / Reserved (0.0.11-d)** |
| `compiler/backend` | Code generation targeting Native (via LLVM) and WebAssembly (via Wasm emission). | **Skeleton / Reserved (0.1.0-alpha)** |

---

## 3. Implementation Discipline

1. **Deterministic Diagnostics**: Every error produced during compilation contains exact file path, line number, column number, and an unambiguous message.
2. **No Mock Implementations**: Unimplemented compiler stages do not pretend to succeed. If an architectural phase is invoked that is reserved for a future milestone, an explicit structured diagnostic is emitted:
   ```
   [E9001] Phase 'backend' is an architectural skeleton reserved for Alpha series (0.1.0-alpha).
   ```
3. **Pluggable Architecture**: Backends are decoupled from front-end AST and HIR passes, enabling independent maintenance of LLVM native codegen and WebAssembly compilation.
