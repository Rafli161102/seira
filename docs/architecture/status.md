# Current Architecture Status — Seira 0.0.14-d

**As of:** 2026-10-31  
**Development baseline:** `2640cda8c193b9ef09733be2cfbc6fa6dc05ee1a`  
**Current milestone:** P1.13 — Ownership & Borrow Checker Hardening  
**Project status:** Experimental; not production-ready; Alpha has not been released.

This document supersedes stale implementation-status tables in historical Seed architecture documents. Those documents remain design-history records, not statements of current implementation.

## Implementation matrix

| Area | Current status | Evidence / boundary |
|---|---|---|
| Lexer, parser, AST, resolver, type checker | Implemented | `compiler/lexer`, `parser`, `ast`, `resolver`, `typecheck` |
| HIR lowering and validation | Implemented | AST to typed, source-aware HIR |
| MIR lowering and verification | Implemented | HIR to typed CFG/SSA with block parameters, edge arguments, dominance/use validation |
| Resource lifecycle analysis | Implemented | MIR acquire/release events and CFG data-flow |
| Ownership / borrow analysis | Initial implementation | Shared/mutable loans, reborrows, SSA-liveness NLL foundation, field/tuple/List/Map projections, dynamic alias conservatism, P1.13 unknown-owner CFG joins |
| Runtime execution | Implemented as tree-walking | `runtime/execution`; HIR/MIR are not yet the execution engine |
| Standard Library Seed foundation | Implemented | `std/src` and `std` packages |
| Effect checking | Not implemented as a dedicated enforced pass | Function types carry an effect marker; enforcement and propagation are incomplete |
| MIR optimization | Not implemented | No production optimization pass pipeline |
| Native LLVM code generation | Not implemented | Backend returns `E9001` |
| WebAssembly code generation | Not implemented | Backend returns `E9001` |
| AOT build artifacts | Not implemented | CLI build remains reserved |

## Ownership boundary

P1.13 fixes a CFG-join unsoundness: if predecessor states disagree on a root owner or parent reborrow, the merged state now uses a conservative unknown identity. This prevents the checker from choosing one owner and forgetting another possible alias. The approach can be conservative; it is not a substitute for complete points-to/interprocedural analysis.

Still deferred: reference escapes and returned references, general interprocedural alias propagation, closure-capture lifetime analysis, full partial-move semantics, and a complete language-wide lifetime specification.

## Backend truth

The backend contract accepts MIR and describes native/WASM targets, but current emission is a skeleton that deliberately reports `E9001`. P1.18 is a readiness/contract milestone only; code generation remains unimplemented until real emitters produce validated artifacts and target-specific tests pass.

## Validation truth

The P1.12 merge into `develop` had a 6/6 CI matrix pass across Ubuntu/macOS/Windows and Node.js 22/24. P1.13 adds a new CFG-join ownership regression; its own CI result must be read from the P1.13 PR, not inferred from P1.12. The 388-test table in `testing.md` is a historical 0.0.10-s snapshot, not the current suite total.

## Branch policy

Permanent branches are `main` (release), `develop` (compiler integration), and `dev-infra` (infrastructure). Temporary `feature/*`, `fix/*`, `docs/*`, and `infra/*` branches are merged by PR and deleted after merge. GitHub-hosted branch protection settings must also be enabled by a repository maintainer; workflow validation alone is not branch protection.

## Next milestones

- P1.14 / 0.0.15-d — Type System Hardening
- P1.15 / 0.0.16-d — Effect System Foundation
- P1.16 / 0.0.17-d — MIR Optimization Foundation
- P1.17 / 0.0.18-d — Compiler Conformance & Differential Testing
- P1.18 / 0.0.19-d — Backend Readiness
