# Seira Architecture — Current Implementation Status

| Field | Value |
|---|---|
| Published release baseline | main / 0.0.16-d |
| Development integration baseline | develop / 0.0.16-d |
| Candidate milestone | P1.16 / 0.0.17-d on feature branch |
| Audit date | 2026-10-31 |
| Project status | Experimental; not production-ready |

This document is the authoritative current-state summary. Older Seed architecture specifications remain historical records and must not override it.

## Implementation matrix

| Area | Status | Limitations |
|---|---|---|
| Lexer, parser, AST, resolver | Implemented | Further conformance hardening in P1.17 |
| Type checker | P1.14 hardening merged | Full trait solver, recursive inference, associated/higher-kinded types, subtyping and monomorphization deferred |
| HIR | AST-to-HIR lowering and validation implemented | Not executable machine code |
| MIR | Typed CFG, SSA, block parameters, place projections and verifier implemented | P1.16 adds a conservative optimization pipeline |
| Ownership | MIR resource/borrow data-flow, initial NLL, reborrowing, tuple/struct/List/Map projections; P1.13 conservative CFG-join fix merged | Reference escapes, general interprocedural alias propagation, closure-capture ownership deferred |
| Effects | P1.15 explicit effect-call boundary and function type markers merged | No effect inference, polymorphism, handlers, or full host-operation classification |
| Runtime | TypeScript tree-walking evaluator | Not a MIR interpreter; no native/WASM artifact execution |
| Standard library | Seed foundations implemented | Broader OS/network/process contracts remain future work |
| MIR optimization | P1.16 candidate on feature branch | Conservative O1 only; optLevel 0 default; levels 2/3 reuse O1 |
| Conformance/fuzzing | Existing tests and CI | Expanded semantic corpus and fuzzing planned for P1.17 |
| Native backend | Backend interface only; returns E9001 | No LLVM/native emitter |
| WASM backend | Backend interface only; returns E9001 | No WASM emitter or artifact execution |

## Actual compiler pipeline

Source -> Lexer -> Parser/AST -> Resolver -> Type Checker / Effect Check -> HIR Lowering/Validation -> MIR Lowering/Verification -> MIR Optimization (when optLevel > 0) -> Resource/Ownership Analysis -> Backend boundary (E9001).

## P1.16 optimization boundary

The candidate adds three named passes:
1. Constant folding and constant-branch simplification.
2. Unreachable basic-block elimination.
3. Dead pure-operation elimination.

Each pass candidate is checked by the MIR verifier before it is committed. A failed candidate stops the pipeline and produces E4005. Calls, resource operations, dereferences, projections, potentially trapping division, and unknown operations are retained. Resource event positions are remapped when preceding operations are removed.

optLevel 0 preserves the input MIR. optLevel 1 enables the conservative pass set. optLevel 2 and 3 currently reuse the same O1 pass set; they do not imply further optimization families. Copy propagation, loop optimization, GVN, and inlining remain deferred.

## Runtime and backend truth

The runtime is currently a TypeScript tree-walking evaluator. HIR and MIR are compiler representations, not the execution engine. The backend contract names native and wasm32 targets, but the current emitter intentionally returns E9001. Target names in Seira.toml are intended targets, not proof that code generation exists.

P1.18 backend readiness is a contract/specification milestone. Operational native/WASM support must not be claimed until real emitters produce artifacts and target-specific end-to-end tests execute them.

## Branch and release status

- main: 0.0.16-d release baseline; synchronized from develop through merged PR #17 without force-pushing.
- develop: 0.0.16-d compiler integration baseline.
- dev-infra: infrastructure and CI.
- feature/p1.16-mir-optimization-foundation: P1.16 implementation candidate; PR #16 requires green CI before merge.

The branch comparison shows no file-level difference between the synchronized main snapshot and develop at the 0.0.16-d merge point; their commit graphs retain merge-history differences. GitHub-hosted branch protection remains a repository-settings task for a maintainer. Branch Governance now validates PR direction and contains ancestry-checked cleanup for merged temporary branches.

## Next milestones

- P1.17 — Compiler Conformance & Differential Testing (0.0.18-d)
- P1.18 — Backend Readiness (0.0.19-d)

See [P1.13–P1.18 roadmap](../roadmap/P1.13-P1.18.md).
