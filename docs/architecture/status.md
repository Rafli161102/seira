# Current Architecture Status — Seira 0.0.19-d

**As of:** 2026-10-31  
**Published release baseline:** main / 0.0.16-d  
**Development baseline:** develop / 0.0.18-d  
**Candidate milestone:** P1.18 — Backend Readiness Contract  
**Project status:** Experimental; not production-ready; Alpha has not been released.

This document supersedes stale implementation-status tables in historical Seed architecture documents.

## Implementation matrix

| Area | Current status | Evidence / boundary |
|---|---|---|
| Frontend, resolver, type checker | Implemented and hardened through P1.14 | Further semantic conformance in P1.17 |
| HIR lowering and validation | Implemented | Typed source-aware HIR |
| MIR lowering and verification | Implemented | Typed CFG/SSA, block parameters, dominance/use validation |
| Ownership/resource analysis | Initial implementation, P1.13 CFG join hardening merged | NLL foundation, reborrows, projected places; reference escapes and general interprocedural alias propagation deferred |
| Effect checking | Initial explicit call-boundary enforcement, P1.15 | Not a complete algebraic effect system |
| MIR optimization | P1.16 merged | Named verifier-gated passes; conservative O1 only |
| Conformance testing | P1.17 merged | Semantic matrix, stable diagnostics, deterministic bounded lexer fuzz; true AST-vs-MIR differential execution deferred |
| Backend ABI contract | P1.18 candidate | Versioned target/runtime contract and MIR input validation |
| Native LLVM code generation | Not implemented | No native emitter; E9001 for valid MIR |
| WebAssembly code generation | Not implemented | No WASM emitter; E9001 for valid MIR |
| AOT artifacts | Not implemented | No object, executable, or wasm module output |

## P1.18 backend readiness boundary

The candidate introduces:
- Backend ABI version constant and target contract data types.
- Native/wasm32 object format and data-layout compatibility checks.
- Runtime ABI version and required symbol validation.
- Target capability name validation.
- MIR verification at the backend boundary; invalid MIR reports E9003.
- Valid MIR still reaches the explicit E9001 unsupported-emitter diagnostic.

The contract validator does not select a production ABI, target triple, calling convention, runtime symbol naming convention, or LLVM toolchain. Test descriptors are illustrative fixtures, not official target profiles.

## Actual pipeline and execution

Source -> Lexer -> Parser/AST -> Resolver -> Type Checker/Effect Check -> HIR -> MIR -> Verified MIR Optimization -> Resource/Ownership Analysis -> Backend contract validation -> E9001 (emitter unavailable).

Execution remains the TypeScript tree-walking evaluator. MIR is not currently executed. Native and wasm32 code generation remain unimplemented.

## Branch status

- main: 0.0.16-d release baseline.
- develop: 0.0.17-d integration baseline after P1.16 merge.
- feature/p1.17-conformance-testing: P1.17 candidate; CI pending.
- feature/p1.18-backend-readiness: P1.18 contract candidate, based on the P1.17 feature branch and dependent on its merge.
- dev-infra: infrastructure and CI.

Branch Governance validates branch direction and ancestry-checks merged temporary branch cleanup. GitHub-hosted branch protection still requires maintainer configuration.

See [P1.13–P1.18 roadmap](../roadmap/P1.13-P1.18.md).
