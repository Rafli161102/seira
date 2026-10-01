# Seira Multi-Language Implementation Architecture Policy

| Field | Value |
|---|---|
| Policy | Multi-Language Implementation Architecture Policy |
| Effective From | Milestone 0.0.3-s Onward |
| Policy Status | **Locked Architectural Policy** |

---

## 1. Core Principle

**The Seira Language Specification MUST remain completely independent from the implementation language of the Seira compiler.**

The following concepts are strictly separated:
- **Seira Language**: The specification, grammar, semantics, value model, effect system, and ownership model defining `.sr` code.
- **Compiler Implementation**: The executable codebase responsible for lexing, parsing, analyzing, and lowering Seira code.
- **Runtime Implementation**: The execution support layer providing memory scopes, allocators, and host adapters.
- **Developer Tooling**: CLI utilities, package managers, and formatters.
- **Web Tooling**: Web playground, browser runners, and online documentation.
- **IDE Tooling**: Language Server Protocol (LSP) servers, editors, and syntax highlighters.
- **Build Infrastructure**: CI workflows, test runners, and packaging scripts.

**Core Invariant**: Never encode the assumption `"Seira compiler = TypeScript"` (or any specific host language) into the language specification or architectural contracts.

---

## 2. TypeScript Status in Seed Series

The Seed implementation currently uses **TypeScript + Node.js**.
- This remains the active, valid implementation stack for Seed Series (`0.0.x-s`).
- TypeScript is **NOT** permanently locked as the implementation language of the Seira Compiler Core.
- The stack status is classified as **CURRENT IMPLEMENTATION**, not a permanent language decision.
- **No premature migration**: The existing TypeScript implementation must NOT be rewritten or migrated merely because a native implementation is desirable in the future.
- The compiler architecture must remain conceptually language-neutral so that future migration to a native implementation (e.g. Rust, Zig, C++) can be executed without modifying Seira language semantics.

---

## 3. Multi-Language Repository Model

The Seira repository is architected to allow multiple implementation languages across decoupled subsystems:

```text
Seira Language (.sr)
    ↓
Compiler Core
    ↓ Native Implementation (e.g. Rust / Zig / C++ evaluated in future milestone)

Developer Tooling (CLI / Package Tooling)
    ↓ TypeScript / Node.js

Web Playground & Interactive Docs
    ↓ TypeScript / Next.js / WebAssembly

IDE Tooling & Language Server
    ↓ TypeScript / Native LSP

Runtime Engine & Host Adapters
    ↓ Native Implementation (C / Rust / Zig / C++)

Target Backends
    ├── Native (LLVM)
    └── WebAssembly (Wasm)
```

The presence of multiple programming languages on GitHub (TypeScript, native languages, Shell, Markdown, Seira `.sr`) is expected and architecturally sound, provided every language has a clear, isolated subsystem responsibility.

---

## 4. Responsibility Over Language

Implementation languages are chosen strictly based on **subsystem responsibility**:
- **Strong architectural cohesion**: A single logical subsystem must not be fragmented across multiple languages without overwhelming technical justification.
- **Subsystem boundary rule**: *"One responsibility, one appropriate implementation boundary"* rather than *"One repository, one programming language"*.

---

## 5. Language-Neutral Architecture Invariants

All compiler and runtime abstractions must be formulated without host-language-specific bias:
- **Token Model**: Lexical symbols, keywords, and literals defined by Seira formal grammar, not JS/TS lexical oddities.
- **AST Semantics**: Source spans, AST hierarchy, and AST nodes independent of TS-specific types or JS object shapes.
- **IR & Semantics**: HIR, MIR, Type System, Effect System, and Ownership semantics designed for native execution.
- **No Coercion Assumptions**: Seira semantics must never rely on JS truthiness, JS prototype inheritance, JS numeric representations (IEEE 754 float-only), or Node.js runtime globals.
- **Diagnostics Model**: Structured error bags, source spans, and compiler codes (`E1xxx`–`E9xxx`) designed to be implemented identically in any systems language.

---

## 6. Future Native Compiler Evaluation

A dedicated future milestone will systematically evaluate native implementation languages for the Compiler Core based on concrete technical criteria:
- Compiler throughput and compilation latency
- Deterministic memory management and safety
- Developer productivity and tooling ecosystem
- LLVM and WebAssembly backend integration
- Cross-platform portability
- Ecosystem maintainability and contributor accessibility

No native language is pre-selected. The decision will be made during a dedicated design milestone following the principle:
$$\text{Architecture First} \longrightarrow \text{Implementation-Language Decision Later}$$

---

## 7. Current Rules of Engagement (0.0.3-s Onward)

1. **Maintain Current Stack**: Continue using the existing TypeScript/Node.js stack for compiler foundation work.
2. **Preserve Neutrality**: Keep all compiler and AST structures language-neutral and migratable.
3. **No Speculative Splitting**: Do not introduce second or third implementation languages without explicit milestone mandate.
4. **Distinguish Product from Implementation**: Seira (`.sr`) is the product; TypeScript is merely the current bootstrapping compiler implementation.
