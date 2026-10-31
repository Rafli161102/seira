# Compiler Conformance & Deterministic Testing — P1.17

**Target release:** 0.0.18-d  
**Status:** Implemented on the P1.17 feature branch; CI validation pending.

## Current test strategy

The conformance suite includes the Seed syntax corpus plus Development semantic cases for generic inference, mutable-reference syntax, effect-call boundaries, invalid type programs, and parser rejection. It also compares diagnostic codes and source spans across repeated compilations.

A bounded deterministic lexer generator uses a fixed LCG seed and a fixed alphabet of valid and invalid token fragments. Each sample must end with EOF, have monotonic token start offsets, have non-reversed spans, and keep all spans within source bounds.

## Differential-testing boundary

The current execution oracle is the TypeScript tree-walking evaluator. HIR/MIR lowering and MIR optimization exist, but no MIR interpreter and no native/WASM emitter exist. Therefore, true AST-evaluator-versus-MIR-execution differential testing is not possible yet. This milestone records that boundary rather than comparing paths that do not exist.

## Deferred

- Parser/typechecker grammar-based generators.
- Persistent fuzz corpus minimization and long-running scheduled fuzzing.
- MIR interpreter and AST-vs-MIR execution comparison.
- Native/WASM artifact conformance.
