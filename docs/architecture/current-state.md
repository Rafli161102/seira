# Seira Architecture — Current Implementation Status

| Field | Value |
|---|---|
| Published baseline | main / 0.0.16-d |
| Development baseline | develop / 0.0.17-d |
| P1.17 candidate | 0.0.18-d |
| P1.18 candidate | 0.0.19-d |
| Audit date | 2026-10-31 |
| Project status | Experimental; not production-ready |

## Implementation matrix

| Area | Status | Limitations |
|---|---|---|
| Frontend, resolver, type checker | Implemented through P1.14 | Continued conformance hardening |
| HIR/MIR | Typed HIR, CFG/SSA MIR, verifier implemented | P1.16 conservative verified optimizer merged |
| Ownership | P1.13 CFG-join hardening merged; initial NLL/projections available | Reference escapes, general interprocedural alias propagation, closure-capture ownership deferred |
| Effects | P1.15 explicit effect-call boundary merged | No effect inference, polymorphism, handlers, complete host-operation classification |
| Runtime | TypeScript tree-walking evaluator | No MIR interpreter |
| Conformance | P1.17 candidate: semantic matrix, deterministic diagnostics, bounded lexer fuzz | CI pending; true AST-vs-MIR differential execution unavailable |
| Backend contract | P1.18 candidate: versioned target/runtime ABI, data-layout checks, MIR input validation | No official target profile or code emitter |
| Native backend | Interface only; E9001 for valid MIR | No LLVM/native emitter |
| WASM backend | Interface only; E9001 for valid MIR | No WASM emitter/artifact execution |

## P1.18 contract behavior

The backend contract validator checks ABI version, target triple, object format, pointer width, endianness, maximum alignment, supported integer widths, calling convention, runtime ABI version/symbols, and capability names. The backend request validator also invokes MIR verification. Invalid MIR is rejected with E9003. Valid MIR still receives E9001 because emission is not implemented.

The target descriptors used in tests are illustrative only; no official ABI or target triple has been selected.

## Runtime and backend truth

The runtime is a TypeScript tree-walking evaluator. HIR/MIR are compiler representations, not the execution engine. Native LLVM and WebAssembly code generation are not implemented. No native executable or wasm artifact is produced.

## Branch status

- main: 0.0.16-d.
- develop: 0.0.17-d.
- P1.17 branch: feature/p1.17-conformance-testing.
- P1.18 branch: feature/p1.18-backend-readiness (depends on P1.17).
- dev-infra: infrastructure and CI.

See [P1.13–P1.18 roadmap](../roadmap/P1.13-P1.18.md).
