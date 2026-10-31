# Seira Architecture — Current Implementation Status

| Field | Value |
|---|---|
| Published baseline | main / 0.0.19-d |
| Development baseline | develop / 0.0.19-d |
| P1.16 merged | 0.0.17-d |
| P1.17 merged | 0.0.18-d |
| P1.18 merged | 0.0.19-d |
| P1.19 feature branch | 0.0.20-d (PR #26 open) |
| Audit date | 2026-10-31 |
| Project status | Experimental; not production-ready |

## Implementation matrix

| Area | Status | Limitations |
|---|---|---|
| Frontend, resolver, type checker | Implemented through P1.14 | Further language conformance work remains |
| HIR/MIR | Typed HIR, CFG/SSA MIR, verifier implemented | P1.16 conservative verified optimizer merged |
| MIR interpreter | P1.19 proposed experimental interpreter on feature branch | Aggregates, references, resource events, host calls, iterators, closures, methods, and patterns unsupported; CI exposed a loop-carried SSA lowering defect under repair |
| Ownership | P1.13 CFG-join hardening merged; initial NLL/projections available | Reference escapes, general interprocedural alias propagation, closure-capture ownership deferred |
| Effects | P1.15 explicit effect-call boundary merged | No effect inference, polymorphism, handlers, or complete host-operation classification |
| Runtime | TypeScript AST tree-walking evaluator remains the default runtime | MIR interpreter is a separate experimental subset; no shared value/runtime layer |
| Conformance | P1.17 semantic matrix and deterministic tests; P1.19 AST/MIR return-value differential tests for supported subset | Not full language equivalence; output and host effects are not compared |
| Backend contract | P1.18 versioned target/runtime ABI, target layout checks, MIR validation | No official production target profile or emitter |
| Native backend | Interface and readiness contract only; E9001 for valid MIR | No LLVM/native emitter |
| WASM backend | Interface and readiness contract only; E9001 for valid MIR | No WASM emitter/artifact execution |

## P1.19 proposed MIR interpreter boundary

The proposed interpreter validates MIR before execution and evaluates constants, scalar arithmetic/comparisons, scalar unary operators, direct calls to functions in the same MIR module, and Return/Branch/CondBranch/Panic terminators. Block parameters are transferred simultaneously on edges. A loop-carried SSA regression was found in CI and is being fixed on PR #26; do not consider the milestone complete until all matrix jobs pass.

Unsupported operations fail closed with E9101; invalid MIR is rejected with E9003. Runtime faults and strict-Bool violations produce E9102. The AST tree-walking evaluator remains the default runtime and the MIR interpreter is currently a development conformance tool, not the default execution engine.

See [MIR interpreter architecture](mir-interpreter.md) and [P1.19–P1.24 roadmap](../roadmap/P1.19-P1.24.md).

## P1.18 contract behavior

The backend contract validates ABI version, target kind/triple, object format, pointer width, endianness, maximum alignment, supported integer widths, calling convention, runtime ABI version/symbols, and capability names. The backend request validator also runs MIR verification. Invalid MIR is rejected with E9003. Valid MIR still receives E9001 because code generation is not implemented.

Test triples and symbols are illustrative fixtures, not approved production target profiles. No official ABI, calling convention, runtime symbol naming convention, or LLVM toolchain has been selected.

## Runtime and backend truth

The AST runtime remains the supported execution path. PR #26 proposes an experimental interpreter over a deliberately small MIR subset; it is not yet merged. No native executable, object file, or wasm artifact is produced or executed. P1.18 completes backend readiness contracts only; it does not complete code generation.

## Branch synchronization

- main: 0.0.20-d release baseline.
- develop: 0.0.20-d integration baseline.
- dev-infra: infrastructure and CI.
- feature branches: temporary and cleaned after verified merge.

Future milestones must retain the same standard: implementation, regression tests, typecheck, full suite, security audit, CI matrix, README/CHANGELOG/version synchronization, architecture updates, and a reviewable PR.