# Effect System Foundation — P1.15

**Release:** 0.0.16-d  
**Scope:** Initial effect-call enforcement, not a complete algebraic effect system.

## Syntax

Function declarations may carry an explicit effect marker:

    fn write!() {
        println("writing")
    }

    fn refresh!() {
        write()
    }

Function types preserve the same marker, for example ()! -> Int. The effect marker participates in structural equality, generic unification, and assignability (P1.14).

## Rules implemented

- A pure function cannot call an explicitly effectful function; the checker reports E8001.
- An effectful function may call either pure or effectful functions.
- Top-level script execution is treated as an explicit host boundary and may invoke effectful functions.
- A lambda adopts the effect marker from an expected function type; an effectful callback body is checked in an effectful context.
- Trait implementation methods must match the effect marker declared by the trait method; mismatch reports E4006.
- The compiler exposes CompilerStage.EffectCheck. At this milestone, enforcement runs within the effect-aware type-check traversal; stopping at EffectCheck returns after that combined semantic pass.

## Explicit limitations

Built-in print, println, filesystem, networking and runtime host operations are not all assigned explicit effect signatures. There is no effect inference, effect polymorphism, capability-derived effect tracking, effect-row unification, or effect-handler syntax/runtime. These remain future work and must not be advertised as implemented.

## Regression coverage

- Pure-to-effectful call rejected with E8001.
- Effectful-to-effectful call accepted.
- Top-level host-boundary call accepted.
- Trait method effect mismatch rejected with E4006.
- Effectful function-type callback checked in an effectful context.
- Driver stops at the EffectCheck checkpoint.
