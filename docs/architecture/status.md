# Current Architecture Status — Seira 0.0.18-d

**As of:** 2026-10-31  
**Development baseline:** 0.0.17-d (P1.16 merged; P1.17 feature branch)  
**Current milestone branch:** P1.17 — Compiler Conformance & Deterministic Testing  
**Project status:** Experimental; not production-ready; Alpha has not been released.

This document supersedes stale implementation-status tables in historical Seed architecture documents. Those documents remain design-history records, not statements of current implementation.

## Implementation matrix

| Area | Current status | Evidence / boundary |
|---|---|---|
| Lexer, parser, AST, resolver, type checker | Implemented and hardened | compiler/lexer, parser, ast, resolver, typecheck; transactional generic inference, strict repeated-variable matching, effect-aware function types |
| HIR lowering and validation | Implemented | AST to typed, source-aware HIR |
| MIR lowering and verification | Implemented | HIR to typed CFG/SSA with block parameters, edge arguments, dominance/use validation |
| Resource lifecycle analysis | Implemented | MIR acquire/release events and CFG data-flow |
| Ownership / borrow analysis | Initial implementation | Shared/mutable loans, reborrows, SSA-liveness NLL foundation, field/tuple/List/Map projections, dynamic alias conservatism, P1.13 unknown-owner CFG joins |
| Effect checking | Initial call-boundary enforcement | Explicit fn name!; pure-to-effectful calls rejected with E8001; effectful caller propagation, function-type effect markers, trait method effect signature checks; host primitives not all classified |
| Runtime execution | Implemented as tree-walking | runtime/execution; HIR/MIR are not yet the execution engine |
| Standard Library Seed foundation | Implemented | std/src and std packages |
| MIR optimization | P1.16 conservative verified pass manager merged | Constant folding, constant branch simplification, unreachable-block removal, dead pure-operation elimination; optLevel 2/3 currently reuse the same pass set |
| Compiler conformance | P1.17 candidate | Semantic matrix, deterministic diagnostics, bounded lexer token fuzzing; CI pending |
| Native LLVM code generation | Not implemented | Backend returns E9001 |
| WebAssembly code generation | Not implemented | Backend returns E9001 |
| AOT build artifacts | Not implemented | CLI build remains reserved |

## Type system boundary — P1.14

Generic unification is transactional: failed nested matches do not leak partial substitutions. Repeated occurrences of one generic parameter must resolve consistently. Unknown argument types may provisionally bind a generic variable and can be refined by a later concrete argument. Function unification includes the effect marker. Function parameter compatibility is invariant until a formal subtype/variance model is specified.

Still deferred: recursive type aliases, full trait solver/coherence, associated types, higher-kinded types, subtyping, explicit variance, and monomorphization.

## Ownership boundary — P1.13

When predecessor states disagree on a reference root owner or parent reborrow, CFG loan joins use a conservative unknown identity. This prevents a merged reference from forgetting one possible alias. The model may reject some safe programs; complete points-to/interprocedural analysis is not implemented.

Still deferred: reference escapes and returned references, general interprocedural alias propagation, closure-capture lifetime analysis, full partial-move semantics, and a complete language-wide lifetime specification.

## Effect boundary — P1.15

Function declarations marked with ! are represented as effectful function types. Calls from pure function bodies to effectful callees produce E8001; effectful callers may call effectful callees. Top-level source execution is treated as the explicit host boundary. Lambda bodies adopt an expected function type's effect marker. Trait implementation methods must preserve the trait method's effect marker (E4006). The compiler exposes CompilerStage.EffectCheck; effect enforcement currently runs as part of the type-check traversal, and stopping at EffectCheck returns after that combined pass.

This is not a complete algebraic effect system. Built-in print, println, filesystem, networking and runtime host operations are not all assigned explicit effect signatures. Effect inference, effect polymorphism, capability-derived effect tracking, effect rows, and effect-handler syntax/runtime remain future work.

## MIR optimization boundary — P1.16

The current optimizer operates on typed MIR. It folds supported constant arithmetic/comparisons, simplifies constant conditional branches, removes unreachable blocks, and eliminates only operations classified as pure and non-trapping. Calls, resource events, dereferences, potentially trapping division, and unknown operations are retained. The driver verifies optimized MIR before proceeding to ownership analysis. Optimization defaults to disabled at optLevel 0; levels 2 and 3 currently reuse the conservative O1 pass set and do not imply additional optimization families.

## MIR optimization boundary — P1.16

The optimizer consumes typed MIR. It folds supported constant arithmetic/comparisons and selected unary operations, simplifies constant conditional branches, removes unreachable blocks, and eliminates only operations classified as pure and non-trapping. Calls, resource events, dereferences, projections/loads, potentially trapping division, and unknown operations are retained. Resource event positions are adjusted when earlier pure operations are removed. The driver verifies MIR before optimization and validates every optimization pass candidate; a rejected candidate is not committed and produces E4005. Development defaults to optLevel 0; optLevel 2 and 3 currently reuse the conservative O1 pass set and do not imply additional optimization families.

## Backend truth — P1.18 readiness target

The backend contract accepts MIR and describes native/WASM targets, but current emission is a skeleton that deliberately reports E9001. No LLVM IR, native executable, WebAssembly module, object file, or AOT artifact is currently produced. P1.18 formalizes ABI, target layout, runtime imports and backend acceptance criteria only. Operational code generation must remain marked unimplemented until a real emitter and target-specific end-to-end tests exist.

## Validation truth

P1.12, P1.13 and P1.14 passed their GitHub Actions CI matrices on Ubuntu/macOS/Windows and Node.js 22/24. P1.15 introduces additional effect-checking regressions; use the CI status for the P1.15 pull request before considering the milestone complete. The 388-test table in testing.md is a historical 0.0.10-s snapshot, not the current suite total.

## Branch policy

Permanent branches are main (release), develop (compiler integration), and dev-infra (infrastructure). Temporary feature/*, fix/*, docs/*, and infra/* branches are merged by PR and deleted after merge. GitHub-hosted branch protection settings must also be enabled by a repository maintainer; workflow validation alone is not branch protection.

## Next milestones

- P1.17 / 0.0.18-d — Compiler Conformance & Differential Testing
- P1.18 / 0.0.19-d — Backend Readiness
