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

**Important:** Seira does not yet expose source-level reference/borrow syntax or infer these opcodes from ordinary function signatures. Borrow rules are implemented and tested at the MIR boundary; front-end borrow syntax and alias-aware reference lowering remain subsequent work.

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

This is a conservative ownership foundation, not a complete Rust-style borrow checker. In particular, it does not yet perform source-level lifetime inference, field-sensitive borrowing, reborrowing, closure-capture ownership, escape analysis across calls, or alias-aware borrow propagation through arbitrary block parameters. Those capabilities require explicit reference types and ownership-aware call signatures in HIR/MIR.

The next increment should add reference types and source syntax, lower them to the opcodes above, and extend the checker with reborrows, call-boundary effects, and non-lexical lifetimes.
