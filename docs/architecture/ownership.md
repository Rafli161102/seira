# Ownership & Borrow Analysis

## Boundary

Ownership analysis consumes verified MIR. It does not inspect raw syntax and does not change runtime behavior. The initial implementation establishes the compiler data-flow boundary for resource ownership and borrow events.

The current language front end emits MIRResourceOp acquire/release events for with scopes. The checker verifies those events across the control-flow graph. The MIR contract also reserves explicit opcodes for ownership and borrow operations so future syntax can use the same analysis:

| Opcode | Meaning |
|---|---|
| ownership.move | Transfer ownership from operand 0 to the destination value |
| ownership.drop | Explicitly consume/drop operand 0 |
| ownership.write | Mutate operand 0; rejected while any borrow is active |
| borrow.shared | Create a shared loan from operand 0 into the destination |
| borrow.mutable | Create an exclusive mutable loan from operand 0 into the destination |
| borrow.end | End the loan referenced by operand 0 |

**Current front-end support:** Seira exposes `&T` / `&mut T` type annotations and `&value` / `&mut value` borrow expressions. P1.5 adds dereference read/write operations (`deref.load`, `deref.store`) and passes reference parameters into callee MIR as external loans. Runtime reference values point to the original lexical binding cell. The checker verifies that only mutable loans permit dereference stores. P1.7 adds child loans for reborrows, blocks parent use while an exclusive child is live, permits compatible shared children, and requires a mutable parent for a mutable child.

## Resource event ordering

Every MIRResourceOp carries an optional position, the number of ordinary MIR operations already emitted when the event occurs. This preserves event ordering within a basic block:

- acquire is recorded after the resource-producing expression,
- release is recorded at lexical scope exit,
- events at the same position retain insertion order.

The MIR verifier checks that event positions are within the block and that the referenced value is already defined.

## Data-flow model

The analysis computes predecessor states to a fixed point over reachable basic blocks. At CFG joins it conservatively merges resource ownership, moved values, and active loans. It checks every block again after the data-flow state stabilizes, avoiding diagnostics from partially discovered predecessor paths.

The checker currently validates:

- use after release, double release, and release without a live acquisition,
- resource leaks on function return, including path-dependent leaks,
- ownership moves and use after move,
- compatible shared borrows and exclusive mutable-borrow rules,
- direct owner access, mutation, drop, or move while a conflicting loan is active,
- unknown, ended, path-dependent, or escaping borrows.

Returning an owned resource value is treated as an ownership transfer to the caller. Returning a borrowed value while its loan remains active is rejected.

## Diagnostics

| Code | Meaning |
|---|---|
| E7001 | Resource is not live on every path or is used after release |
| E7002 | Invalid resource acquire/release or double release |
| E7003 | Resource may leak at function return |
| E7004 | Invalid ownership transfer or release after move |
| E7005 | Conflicting borrow, move, drop, or release while borrowed |
| E7006 | Use after move or direct owner access/mutation under an exclusive loan |
| E7007 | Invalid borrow end, use after borrow end, or borrow escaping the function |

## Limitations and next work

This is an initial NLL foundation, not a complete Rust-style borrow checker. Liveness is based on MIR SSA values and CFG edges; it does not yet model field-sensitive places, closure-capture ownership, or arbitrary alias propagation. Call-boundary checking treats reference parameters as caller-supplied loans and expires them after their last use inside the callee; deeper interprocedural alias propagation remains future work.


## Source-level references (P1.4)

The frontend accepts shared and mutable reference annotations (`&T`, `&mut T`) and borrow expressions (`&value`, `&mut value`). This increment restricts borrow places to named local bindings; a mutable borrow also requires the source binding to be declared with `mut`. HIR carries the reference type, and MIR emits `borrow.shared` / `borrow.mutable` followed by `borrow.end` at lexical scope exit. The ownership pass checks conflicting active loans and direct owner reads while an exclusive mutable loan is active.

P1.5 adds dereference reads (`deref.load`) and writes (`deref.store`) through active references. Incoming reference parameters are modelled as external loans within the callee, and a write is accepted only through a mutable loan.

This remains an initial lexical-borrow model, not a complete lifetime system. Reference return types and borrowed references escaping a function are rejected with `E3008`. Reborrowing, field-sensitive loans, inferred/NLL lifetimes, closure-capture borrowing, and references to temporaries are not part of this increment.


## MIR loan liveness (P1.6)

The backward liveness pass computes per-operation live-after sets. It includes ordinary operation operands, terminator operands, and branch arguments only when the corresponding target block parameter is live. This preserves liveness across SSA block-parameter merges without treating dead edge arguments as semantic uses. `borrow.end` is intentionally ignored as a use because it is a compiler-generated lexical cleanup marker. Once a local or incoming reference value is absent from the live-after set, its loan becomes ended in the forward ownership state. The regression suite covers mutable dereference followed by direct owner access before scope exit.


## Reborrowing & loan hierarchy (P1.7)

MIR marks reborrow operations explicitly. A reborrow consumes a reference value as its parent, inherits the parent's root owner, and records `parentId` on the child loan. Shared children may coexist unless an exclusive child is already active. Mutable reborrows require a mutable parent and no active child loans. A mutable parent reference is unavailable while any child loan remains live; a shared parent may still be read alongside shared children. Any incompatible parent access produces `E7005`. Child expiration through P1.6 NLL or an explicit `borrow.end` removes the suspension condition, allowing later parent use.

The analysis is intentionally limited to named-reference dereference reborrows (`&*r`, `&mut *r`). It does not yet provide reborrowing of fields, arbitrary places, or interprocedural alias tracking.
