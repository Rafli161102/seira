# MIR Optimization Foundation — P1.16

**Release:** 0.0.17-d  
**Status:** Implemented on the P1.16 feature branch; CI validation required before merge.

## Pipeline placement

Source -> type checking/effect checking -> HIR -> MIR -> MIR optimization -> ownership/resource analysis -> backend boundary.

The optimizer consumes typed MIR only. It does not inspect AST or runtime values. The compiler driver validates MIR before optimization and validates the optimized module before ownership analysis.

## Implemented O1 foundation

- Constant folding for supported Int/Float arithmetic and comparisons, Bool equality, String/Char equality, and selected unary operators.
- Constant conditional branch simplification.
- Reachability analysis and unreachable basic-block removal.
- Dead pure-operation elimination for operations classified as non-trapping.
- Resource event position remapping when earlier operations are removed.
- Statistics for constant folds, folded branches, removed blocks, and removed dead operations.

## Safety constraints

The optimizer deliberately retains calls, resource lifecycle events, dereference operations, loads/projections, division/modulo that may trap, and unknown opcodes. It does not remove observable operations based only on destination liveness. Integer folding uses BigInt values; divide-by-zero and modulo-by-zero are not folded.

## Optimization levels

- optLevel 0: no MIR rewrite.
- optLevel 1: conservative pass set described above.
- optLevel 2 and 3: currently reuse the same conservative pass set; they do not promise additional optimization families.
- Development profile defaults to optLevel 0.

## Deferred

Copy propagation, loop optimizations, global value numbering, inlining, target-specific lowering, and a full named pass-manager/plugin API remain deferred. Native LLVM and WebAssembly emission remain unimplemented (E9001).

## Regression coverage

Tests cover constant folding, constant branch simplification, unreachable block removal, preservation of calls/resource events/trapping division, driver integration, optLevel 0 identity, and resource event position remapping.
