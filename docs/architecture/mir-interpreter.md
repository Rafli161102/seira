# MIR Interpreter — P1.19

## Purpose

P1.19 adds a development-only execution oracle for a deliberately limited subset of Seira MIR. It makes AST-versus-MIR differential tests possible before native or WebAssembly code generation exists. The AST tree-walking evaluator remains the default runtime.

## Execution model

- The complete MIR module is checked with `validateMIR` before execution.
- Each MIR function call receives a fresh SSA value map.
- Function parameters initialize their corresponding MIR values.
- Operations write their destination value once at runtime.
- Branch edges read all arguments before assigning target block parameters, preserving simultaneous phi/block-parameter semantics.
- Conditional branches require actual Bool values; JavaScript truthiness is not used.
- Direct calls resolve by semantic FunctionId and execute only functions included in the same MIR module.
- The default step budget is 100,000 operations/terminators and the default call-depth limit is 256.

## Supported first-slice operations

| Operation / terminator | Semantics |
|---|---|
| `const`, `unit`, `copy` | Scalar constants, Unit, and value copy |
| `global.read`, `local.read` | Function references used by in-module direct calls |
| `binary` | Int/UInt/Float arithmetic, comparisons, primitive equality, String concatenation |
| `unary` | Numeric negation and strict Bool `not` |
| `call` | Direct calls to MIR functions in the current module |
| `borrow.end` | Static lifetime marker; no runtime action in this subset |
| `Return`, `Branch`, `CondBranch`, `Panic` | Function return and CFG transfer |

## Explicitly unsupported

Aggregate construction and projection, reference/dereference and place operations, mutable stores, resource acquire/release events, iterators, closures, indirect and method calls, host/builtin calls, pattern matching, Option/Result propagation, and other unknown operations are rejected with E9101. Runtime type/operand faults return E9102; invalid MIR is rejected with E9003; missing entry functions return E9100; step and call-depth limits return E9103 and E9104.

The interpreter never silently skips unsupported side effects or resource cleanup. It is not a production runtime and must not be used to claim full language execution support.

## Next work

P1.20 expands differential conformance and aligns the AST/MIR value model. Later work adds runtime host-call semantics and resource/place behavior before an actual native backend vertical slice is attempted.
