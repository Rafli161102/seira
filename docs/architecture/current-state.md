# Seira Architecture — Current Implementation Status

| Field | Value |
|---|---|
| Published release baseline | main / 0.0.16-d |
| Development integration baseline | develop / 0.0.17-d |
| Candidate milestone | P1.17 / 0.0.18-d on feature branch |
| Audit date | 2026-10-31 |
| Project status | Experimental; not production-ready |

## Implementation matrix

| Area | Status | Limitations |
|---|---|---|
| Frontend and resolver | Implemented | P1.17 adds conformance and generated tests |
| Type system | P1.14 hardening merged | Full trait solver, recursive inference, associated/higher-kinded types, subtyping and monomorphization deferred |
| HIR/MIR | Typed HIR, CFG/SSA MIR, verifier implemented | MIR optimization foundation P1.16 merged |
| Ownership | P1.13 CFG-join hardening merged; initial NLL and projection analysis available | Reference escapes, general interprocedural alias propagation, closure-capture ownership deferred |
| Effects | P1.15 explicit effect-call boundary merged | No effect inference, polymorphism, handlers, or complete host-operation classification |
| Runtime | TypeScript tree-walking evaluator | Not a MIR interpreter |
| Conformance | P1.17 semantic matrix and deterministic lexer fuzz candidate | True AST-vs-MIR differential execution deferred until a MIR interpreter exists |
| Native backend | Backend interface only; returns E9001 | No LLVM/native emitter |
| WASM backend | Backend interface only; returns E9001 | No WASM emitter or artifact execution |

## P1.17 test coverage candidate

- Semantic conformance cases for generic functions, mutable-reference syntax, effectful call boundaries, invalid type programs, and parser rejection.
- Repeated compilation checks that diagnostic codes and source spans remain deterministic.
- Bounded seeded lexer fuzzing over valid and invalid token fragments.
- Each generated sample asserts EOF presence, monotonic spans, and span bounds.

This is deterministic generated testing, not an unbounded fuzzer. It does not claim a true AST-vs-MIR differential oracle because no MIR interpreter exists.

## Actual execution and backend boundary

The runtime is a TypeScript tree-walking evaluator. The MIR optimizer runs on compiler IR but does not execute MIR. Native and wasm32 emitter interfaces still return E9001. No native/WASM artifacts are produced or executed.

## Branch status

- main: 0.0.16-d release baseline.
- develop: 0.0.17-d integration baseline after P1.16 merge.
- dev-infra: infrastructure and CI.
- feature/p1.17-conformance-testing: P1.17 candidate; CI required before merge.

GitHub-hosted branch protection still requires maintainer configuration. Branch Governance validates PR direction and performs ancestry-checked cleanup for merged temporary branches.

## Next milestone

- P1.18 — Backend Readiness (0.0.19-d).

See [P1.13–P1.18 roadmap](../roadmap/P1.13-P1.18.md).
