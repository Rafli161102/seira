# Seira Architecture — Current Implementation Status

| Field | Value |
|---|---|
| Repository | [Rafli161102/seira](https://github.com/Rafli161102/seira) |
| Audited baseline | `develop` / `0.0.13-d` |
| Baseline commit | `2640cda8c193b9ef09733be2cfbc6fa6dc05ee1a` |
| Audit date | 2026-10-31 |
| Status | Development; not production-ready |

This document supersedes stale implementation-status labels in historical Seed architecture specifications. It describes what is present in the audited baseline, not what is merely planned.

## Implemented in develop

| Area | Verified implementation | Boundary / limitation |
|---|---|---|
| Frontend | Lexer, parser, AST, resolver, type checker | Continue type-system hardening in P1.14 |
| HIR | AST-to-HIR lowering, typed nodes, source origins, validator | HIR is implemented; not a machine-code backend |
| MIR | Typed CFG, SSA values, block parameters, place projections, verifier | MIR is an intermediate representation |
| Ownership | MIR data-flow analysis, resource events, shared/mutable loans, NLL foundation, reborrowing, tuple/struct/List/Map projections | Not a complete Rust-equivalent borrow checker; reference escapes and general interprocedural alias propagation remain unsupported |
| Runtime | TypeScript tree-walking evaluator and tagged runtime values | Execution does not yet run emitted native/WASM artifacts |
| Effects | Effect-related metadata and a reserved compiler stage | Full effect inference, propagation, and enforcement are not implemented |
| Optimization | No complete MIR optimization pipeline established | P1.16 |
| Testing | Node test runner, unit/integration/conformance suites, CI matrix | Historical 388-test figure belongs to 0.0.10-s; do not present it as current count |
| Backend | Backend interface and explicit unsupported diagnostic E9001 | No native LLVM emitter or WASM emitter is implemented |

## Actual compiler pipeline

```text
Source
  -> Lexer
  -> Parser / AST
  -> Resolver
  -> Type Checker
  -> HIR Lowering + HIR Validation
  -> MIR Lowering + MIR Verification
  -> Ownership / Resource Analysis
  -> Backend boundary (currently unsupported: E9001)
```

The `EffectCheck` stage is reserved in the stage enum and the driver currently treats it as a stop point after type checking. It is not a completed effect checker and is not a separate fully enforced pipeline pass.

## Runtime and backend truth

The runtime implementation is currently a TypeScript tree-walking evaluator. The backend module defines a target interface for `native` and `wasm32`, but emission deliberately returns E9001. The target names in `Seira.toml` describe intended targets, not available code generation.

## Branch model

- `main`: approved release baseline; do not rewrite history to synchronize.
- `develop`: active compiler/language integration.
- `dev-infra`: infrastructure and CI changes.
- `feature/*`: temporary milestone branches, removed after verified merge.

At audit time, `main` and `develop` had diverged (59 commits ahead / 8 commits behind in the earlier comparison). Do not force-update either branch. Prepare and review an explicit synchronization/release PR after resolving the divergent histories and deciding which Seed-only commits must be retained.

## Next milestones

See [P1.13–P1.18 Development Roadmap](../roadmap/P1.13-P1.18.md). Target versions:
- P1.13: `0.0.14-d`
- P1.14: `0.0.15-d`
- P1.15: `0.0.16-d`
- P1.16: `0.0.17-d`
- P1.17: `0.0.18-d`
- P1.18: `0.0.19-d`

A milestone is complete only after implementation, tests, CI, README, and CHANGELOG agree.
