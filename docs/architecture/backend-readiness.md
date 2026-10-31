# Backend Readiness Contract — P1.18

**Target release:** 0.0.19-d  
**Status:** Contract-validation candidate implemented; code generation remains NOT IMPLEMENTED.  
**Current emitter diagnostic:** E9001 for valid MIR; E9003 for invalid MIR input.

## Implemented contract surface

The compiler now defines a versioned backend contract in compiler/backend/contract.ts:
- Backend ABI version.
- Target kind, target triple, object format, and calling convention.
- Data layout: pointer width, endianness, maximum alignment, and supported integer widths.
- Runtime ABI version and required entry, panic, allocation, deallocation, resource cleanup, and I/O symbols.
- Declared target capabilities.

The validator checks structural consistency. wasm32 requires a 32-bit pointer, little-endian layout, wasm object format, and a wasm32 triple. Native descriptors require a native triple, 32/64-bit pointers, and a non-wasm object format. ABI versions must match; runtime symbols and capabilities must be non-empty and unique.

These descriptors do not select a production ABI. Test triples and symbols are illustrative only.

## MIR input boundary

validateBackendRequest validates both the target contract and the MIR module. CompilerBackend.emit independently invokes validateMIR when given a MIR module:
- Invalid MIR is rejected with E9003 before the unsupported-emitter response.
- Valid MIR reaches E9001 because code generation is not implemented.

## Not implemented

- LLVM IR generation, native object files, executable linking, or native artifact execution.
- WebAssembly module generation or WASI/host execution.
- Official target triples/data layouts.
- Official calling conventions, symbol mangling, runtime ABI implementations, relocation, debug metadata, and linker integration.

## Required before a real emitter

1. Approve target triples and data layouts.
2. Specify integer and aggregate layout/overflow semantics.
3. Specify function ABI, parameter/return lowering, symbol mangling, and ABI versioning.
4. Specify runtime entry, allocation, panic/unwind, resource cleanup, strings, collections, closures, and host I/O.
5. Specify object format, relocation, linker invocation, and debug/source mapping.
6. Add target-specific conformance fixtures and execute emitted artifacts in CI.

P1.18 is readiness work. Native/WASM support must remain marked NOT IMPLEMENTED until real emitters produce and execute artifacts.
