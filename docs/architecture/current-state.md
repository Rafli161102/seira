# Seira Architecture — Current Implementation Status

| Field | Value |
|---|---|
| Published baseline | main / 0.0.19-d |
| Development baseline | develop / 0.0.19-d |
| P1.16 merged | 0.0.17-d |
| P1.17 merged | 0.0.18-d |
| P1.18 merged | 0.0.19-d |
| Audit date | 2026-10-31 |
| Project status | Experimental; not production-ready |

## Implementation matrix

| Area | Status | Limitations |
|---|---|---|
| Frontend, resolver, type checker | Implemented through P1.14 | Further language conformance work remains |
| HIR/MIR | Typed HIR, CFG/SSA MIR, verifier implemented | P1.16 conservative verified optimizer merged |
| Ownership | P1.13 CFG-join hardening merged; initial NLL/projections available | Reference escapes, general interprocedural alias propagation, closure-capture ownership deferred |
| Effects | P1.15 explicit effect-call boundary merged | No effect inference, polymorphism, handlers, or complete host-operation classification |
| Runtime | TypeScript tree-walking evaluator | No MIR interpreter |
| Conformance | P1.17 merged: semantic matrix, deterministic diagnostics, bounded lexer fuzz | True AST-vs-MIR differential execution unavailable until a MIR interpreter exists |
| Backend contract | P1.18 merged: versioned target/runtime ABI, layout checks, MIR input validation | No official production target profile or emitter |
| Native backend | Interface and readiness contract only; E9001 for valid MIR | No LLVM/native emitter |
| WASM backend | Interface and readiness contract only; E9001 for valid MIR | No WASM emitter/artifact execution |

## P1.18 contract behavior

The backend contract validates ABI version, target kind/triple, object format, pointer width, endianness, maximum alignment, supported integer widths, calling convention, runtime ABI version/symbols, and capability names. The backend request validator also runs MIR verification. Invalid MIR is rejected with E9003. Valid MIR still receives E9001 because code generation is not implemented.

Test triples and symbols are illustrative fixtures, not approved production target profiles. No official ABI, calling convention, runtime symbol naming convention, or LLVM toolchain has been selected.

## Runtime and backend truth

The runtime remains a TypeScript tree-walking evaluator. HIR/MIR are compiler representations, not the execution engine. No native executable or wasm artifact is produced or executed. P1.18 completes backend readiness contracts only; it does not complete code generation.

## Branch synchronization

- main: 0.0.19-d release baseline.
- develop: 0.0.19-d integration baseline.
- dev-infra: infrastructure and CI.
- feature branches: temporary and cleaned after verified merge.

PR #20 synchronized main with develop. Both branches report 0.0.19-d and the compare shows no file-level differences; the remaining ahead/behind count is merge-history only. Permanent branch protection/rulesets still require maintainer configuration in GitHub settings.

See [P1.13–P1.18 roadmap](../roadmap/P1.13-P1.18.md).
