# Seira Compiler Architecture

## 1. Compiler Pipeline

The Seira compiler is designed as a multi-stage, modular transformation pipeline:

```
Source Code (.sra)
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

## 2. Module Responsibilities & Status in 0.0.1-s

| Module | Architectural Responsibility | Status in 0.0.1-s |
| :--- | :--- | :--- |
| `compiler/lexer` | Scans source UTF-8 characters into a stream of tokens, tracking accurate byte offsets, lines, and columns. | **Implemented** |
| `compiler/parser` | Consumes tokens and constructs the AST using recursive descent with operator precedence. | **Implemented (Seed Subsets)** |
| `compiler/ast` | Type definitions for AST nodes (Program, FunctionDecl, Stmt, Expr, etc.). | **Implemented** |
| `compiler/diagnostics` | Emits formatted compiler diagnostics with line:column pointers, severity, and error codes. | **Implemented** |
| `compiler/resolver` | Resolves symbol names, bindings, scopes, and cross-module dependencies. | **Skeleton / Reserved** |
| `compiler/typecheck` | Hindley-Milner type inference, trait resolution, subtyping, and effect checking (`!`). | **Skeleton / Reserved** |
| `compiler/hir` | Lowers AST to High-Level IR with desugared control flow and simplified expressions. | **Skeleton / Reserved** |
| `compiler/mir` | Lowers HIR to Mid-Level IR (SSA CFG) for deterministic resource cleanup analysis and optimization. | **Skeleton / Reserved** |
| `compiler/backend` | Code generation targeting Native (via LLVM) and WebAssembly (via Wasm emission). | **Skeleton / Reserved** |

---

## 3. Implementation Discipline

1. **Deterministic Diagnostics**: Every error produced during compilation contains exact file path, line number, column number, and an unambiguous message.
2. **No Mock Implementations**: Unimplemented compiler stages do not pretend to succeed. If a compiler phase is invoked that is not yet ready, a structured diagnostic is emitted:
   ```
   [SEIRA-E0001] Phase 'resolver' is an architectural skeleton not yet enabled in 0.0.1-s.
   ```
3. **Pluggable Architecture**: Backends are decoupled from front-end AST and HIR passes, enabling independent maintenance of LLVM native codegen and WebAssembly compilation.
