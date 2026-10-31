# Compiler Conformance & Deterministic Testing — P1.17 / P1.19

**P1.17 target release:** 0.0.18-d  
**P1.19 target release:** 0.0.20-d

## Current test strategy

The conformance suite includes the Seed syntax corpus plus Development semantic cases for generic inference, mutable-reference syntax, effect-call boundaries, invalid type programs, and parser rejection. It compares diagnostic codes and source spans across repeated compilations. A bounded deterministic lexer generator uses a fixed LCG seed and checks EOF presence, monotonic token offsets, non-reversed spans, and source bounds.

## AST-versus-MIR differential boundary

P1.19 introduces a small MIR interpreter and an AST-versus-MIR differential oracle for the implemented scalar subset. Current coverage includes:
- integer arithmetic, comparisons, and equality;
- strict boolean operations and conditional branches;
- SSA block-parameter transfer across branches and loop back-edges;
- direct calls between functions present in the MIR module.

The MIR interpreter verifies the complete input module before execution. It enforces step and call-depth limits and returns explicit diagnostics for unsupported operations. Differential tests compare observable return values only; output, host capabilities, aggregate values, references, resource cleanup, iterators, closures, and exception/propagation semantics are not yet covered.

## Deferred

- Full MIR execution coverage and a shared AST/MIR runtime value model.
- Host I/O, built-in functions, external/module calls, and effect semantics in MIR.
- Reference/place reads and writes, ownership-aware runtime checks, resource cleanup.
- Aggregate construction/projection, iterators, closures, methods, and pattern matching.
- Persistent fuzz corpus minimization and long-running scheduled fuzzing.
- Native/WASM artifact conformance after real emitters exist.
