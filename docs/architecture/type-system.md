# Type System Hardening — P1.14

**Release:** `0.0.15-d`  
**Status:** Implemented on the P1.14 feature branch; CI validation pending.

## Generic unification contract

Generic inference must be deterministic and transactional:

1. A repeated generic variable must resolve to the same structural type across every occurrence.
2. `Unknown` is not a concrete inference result. It must not lock a generic variable prematurely; if no later constraint resolves it, the existing inference-failure diagnostic is emitted.
3. A failed nested unification must leave the caller's substitution map unchanged.
4. Type aliases are normalized through the existing structural equality/assignability rules.
5. Function unification includes the effect marker; a pure function and an effectful function are different function types.

## Function compatibility

Seira does not yet define a general subtype or variance system. Until such a specification exists, function parameter types are invariant when checking assignability. This avoids relying on an unimplemented contravariant/covariant relation. Return types retain the existing assignability relation.

## Regression coverage

P1.14 adds tests for:
- Conflicting repeated generic parameters (for example, one `T` inferred from `Int` and `Float`).
- Rollback of partial substitutions after a failed nested match.
- Pure versus effectful function unification.
- Invariant function parameter compatibility.
- Source-level rejection of a generic call whose repeated arguments resolve to conflicting types.

## Deferred work

This milestone does not implement a full trait solver, recursive type inference, associated types, higher-kinded types, variance annotations, subtyping, or monomorphization. Those features require separate language semantics and RFC review.
