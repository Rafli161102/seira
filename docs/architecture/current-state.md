# Seira Architecture — Current Implementation Status

| Field | Value |
|---|---|
| Audited baseline | develop / 0.0.16-d |
| Audit date | 2026-10-31 |
| Status | Experimental Development; not production-ready |

This is the authoritative current-state summary. Older Seed architecture specifications remain historical records and must not override this document.

## Implementation matrix

| Area | Status at 0.0.16-d | Limitations |
|---|---|---|
| Lexer, parser, AST, resolver | Implemented | Continued conformance hardening |
| Type checker | Implemented; P1.14 hardening recorded | Full trait solver, recursive inference, associated/higher-kinded types, subtyping and monomorphization deferred |
| HIR | AST-to-HIR lowering and validation implemented | Not executable machine code |
| MIR | Typed CFG, SSA, block parameters, place projections and verifier implemented | No optimization pipeline yet |
| Ownership | MIR resource/borrow data-flow, initial NLL, reborrowing, tuple/struct/List/Map projections; P1.13 conservative CFG-join fix | Reference escapes, general interprocedural alias propagation, closure-capture ownership deferred |
| Effects | P1.15 explicit effect-call boundary and function type markers | No effect inference, polymorphism, handlers, or full host-operation classification |
| Runtime | TypeScript tree-walking evaluator | Not a MIR interpreter; no native/WASM artifact execution |
| Standard library | Seed foundations implemented | Broader OS/network/process contracts remain future work |
| MIR optimization | Not implemented | P1.16 |
| Conformance/fuzzing | Existing tests and CI | Expanded semantic corpus and fuzzing in P1.17 |
| Native backend | Backend interface only; returns E9001 | No LLVM/native emitter |
| WASM backend | Backend interface only; returns E9001 | No WASM emitter or artifact execution |

## Actual compiler pipeline

Source -> Lexer -> Parser/AST -> Resolver -> Type Checker -> HIR Lowering/Validation -> MIR Lowering/Verification -> Resource/Ownership Analysis -> Backend boundary (E9001)

The EffectCheck stage is exposed as a compiler checkpoint; P1.15 enforces initial explicit effect-call rules in effect-aware type checking. It is not a complete algebraic effect system.

## Runtime and backend truth

The runtime is currently a TypeScript tree-walking evaluator. HIR and MIR are compiler representations, not the execution engine. The backend contract names native and wasm32 targets, but the current emitter intentionally returns E9001. Target names in Seira.toml are intended targets, not proof that code generation exists.

## Branch model and main synchronization

- main: release baseline.
- develop: active language/compiler development.
- dev-infra: repository infrastructure and CI.
- feature/*: temporary milestone branches.

The branch comparison on 2026-10-31 reports main and develop as diverged with a common ancestor. Preserve both histories. Reconcile main-only commits in a dedicated reviewed synchronization/release PR. Do not force-push either branch and do not claim synchronization until the PR is merged and both heads are verified.

## Next milestones

- P1.16 — MIR Optimization Foundation (0.0.17-d)
- P1.17 — Compiler Conformance & Differential Testing (0.0.18-d)
- P1.18 — Backend Readiness (0.0.19-d)

See ../roadmap/P1.13-P1.18.md.
