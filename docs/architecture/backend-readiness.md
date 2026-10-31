# Backend Readiness Contract — P1.18

**Target milestone:** 0.0.19-d  
**Current status:** Specification / readiness work only. Native and WASM code generation are not implemented.  
**Current backend diagnostic:** E9001.

## Purpose

P1.18 defines the contract required before a real code generator can be implemented. This document is not an emitter implementation and does not authorize CLI claims that native or WebAssembly builds work.

## Input invariants

A backend must receive a MIR module that has passed:
1. HIR validation and typed lowering.
2. MIR structural verification (definitions, uses, block edges, dominance, and terminators).
3. Ownership/resource analysis for the supported language subset.
4. MIR optimization verification after every enabled pass.

Backends must reject malformed or unsupported MIR with structured diagnostics. They must not silently reinterpret unknown operations.

## Target matrix

| Capability | Native target | wasm32 target |
|---|---|---|
| Integer/float primitives | To be specified per target data layout | To be specified per wasm32 data layout |
| Aggregate/tuple/struct layout | ABI specification required | Linear-memory layout specification required |
| Strings/collections | Runtime ABI required | Runtime imports/linear-memory ABI required |
| Closures/function values | Calling convention and environment layout required | Table/indirect-call and environment layout required |
| Resource cleanup | Panic/unwind and deterministic cleanup ABI required | Trap/unwind and cleanup strategy required |
| I/O and host capabilities | OS/runtime adapter required | WASI or explicit host imports required |
| Debug/source mapping | Object debug metadata required | DWARF/source map policy required |

No target capability is considered implemented merely because its target name appears in Seira.toml.

## ABI decisions required before emission

- Target triple, data layout, pointer width, endianness, and alignment.
- Integer representation and overflow semantics.
- Aggregate layout and field offsets.
- Function calling convention, parameter/return lowering, symbol mangling, and ABI version.
- Runtime entry point and process exit contract.
- Allocation, ownership/drop, panic/unwind, and resource cleanup ABI.
- String, List, Map, Set, closure, and trait-object representation.
- Host I/O and capability import contracts.
- Object format, relocation, linker invocation, and artifact metadata.
- Debug information and source-span mapping.

## Backend acceptance criteria

1. Versioned backend ABI specification and conformance fixtures.
2. MIR verifier rejects invalid modules before backend invocation.
3. Every unsupported MIR opcode/feature produces a deterministic diagnostic.
4. A native vertical slice emits an executable and runs it in CI before native support is advertised.
5. A wasm32 vertical slice emits a valid module and executes it in a documented runtime before WASM support is advertised.
6. Differential tests compare supported behavior with the reference tree-walking evaluator.
7. Cross-platform artifact tests cover the declared target matrix.

## Implementation boundary

The current CompilerBackend is an architectural skeleton and returns E9001. P1.18 may complete ABI/data-layout contracts and a backend proof-of-concept, but the feature remains **not implemented** until a real emitter produces and executes artifacts. The Alpha milestone may select LLVM or another code-generation technology only after these contracts and target constraints are reviewed.
