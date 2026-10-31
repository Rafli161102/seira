# Current Architecture Status — Seira 0.0.19-d

**As of:** 2026-10-31  
**Published release baseline:** main / 0.0.19-d  
**Development baseline:** develop / 0.0.19-d  
**Completed milestone:** P1.18 — Backend Readiness Contract  
**Project status:** Experimental; not production-ready; Alpha has not been released.

This document supersedes stale implementation-status tables in historical Seed architecture documents.

## Implementation matrix

| Area | Current status | Evidence / boundary |
|---|---|---|
| Frontend, resolver, type checker | Implemented and hardened through P1.14 | Further semantic conformance remains possible |
| HIR lowering and validation | Implemented | Typed source-aware HIR |
| MIR lowering and verification | Implemented | Typed CFG/SSA, block parameters, dominance/use validation |
| Ownership/resource analysis | Initial implementation; P1.13 CFG-join hardening merged | NLL foundation, reborrows, projected places; reference escapes and general interprocedural alias propagation deferred |
| Effect checking | Initial explicit call-boundary enforcement, P1.15 | Not a complete algebraic effect system |
| MIR optimization | P1.16 merged | Named verifier-gated passes; conservative O1 only |
| Conformance testing | P1.17 merged | Semantic matrix, stable diagnostics, deterministic bounded lexer fuzz; true AST-vs-MIR differential execution deferred |
| Backend ABI contract | P1.18 merged | Versioned target/runtime contract and MIR input validation |
| Native LLVM code generation | Not implemented | No native emitter; E9001 for valid MIR |
| WebAssembly code generation | Not implemented | No WASM emitter; E9001 for valid MIR |
| AOT artifacts | Not implemented | No object, executable, or wasm module output |

## P1.18 backend readiness boundary

The merged implementation provides:
- Backend ABI version constant and target contract types.
- Native/wasm32 target descriptor validation.
- Runtime ABI version and required symbol validation.
- Target capability validation.
- Backend request validation combining target contract checks and MIR verification.
- E9003 for invalid MIR before emission; E9001 for valid MIR because emitters do not exist.

The validator does not select a production ABI, target triple, calling convention, runtime symbol convention, or LLVM toolchain. Test descriptors are illustrative fixtures, not official target profiles.

## Actual pipeline and execution

Source -> Lexer -> Parser/AST -> Resolver -> Type Checker/Effect Check -> HIR -> MIR -> Verified MIR Optimization -> Resource/Ownership Analysis -> Backend contract validation -> E9001 (emitter unavailable).

Execution remains the TypeScript tree-walking evaluator. MIR is not currently executed. Native and wasm32 code generation remain unimplemented.

## Branch status

- main: 0.0.19-d.
- develop: 0.0.19-d.
- dev-infra: infrastructure and CI.
- feature branches: temporary; merged feature branches are automatically removed after ancestry verification.

Main and develop have the same file tree at 0.0.19-d. GitHub-hosted branch protection still requires maintainer configuration.

