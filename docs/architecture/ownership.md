> **Historical baseline notice:** This document was authored for the Seed Series (0.0.10-s) and is retained as a historical architecture record. For current implementation status on `develop`, consult [`current-state.md`](current-state.md) and the [P1.13–P1.18 roadmap](../roadmap/P1.13-P1.18.md). Do not interpret old milestone labels or test counts below as current Development status.

---

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

## P1.13 — CFG join alias hardening

A reference merged from predecessor blocks must not be assigned an arbitrary single owner. When predecessor states disagree about the owner or parent reference, the checker records an unknown identity and treats it as potentially overlapping every owner or parent. This is intentionally conservative: it can reject some programs that a future points-to analysis could prove disjoint, but it must not accept a conflicting mutable access by forgetting one predecessor's alias.

The regression suite includes a branch where each predecessor borrows a different owner, references merge through a block parameter, and a new mutable borrow attempts to access one possible owner. The merge must report `E7005`. This does not provide interprocedural points-to propagation, reference escapes, closure-capture lifetime analysis, or partial-move analysis.

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

This is an initial NLL foundation, not a complete Rust-style borrow checker. Place-sensitive analysis supports named struct fields, tuple positions, and List index projections. Dynamic List indices are represented conservatively and may alias any position; Map index references, closure-capture ownership, and arbitrary alias propagation remain unsupported. Call-boundary checking treats reference parameters as caller-supplied loans and expires them after their last use inside the callee; deeper interprocedural alias propagation remains future work.


## Source-level references (P1.4)

The frontend accepts shared and mutable reference annotations (`&T`, `&mut T`) and borrow expressions (`&value`, `&mut value`). This increment restricts borrow places to named local bindings; a mutable borrow also requires the source binding to be declared with `mut`. HIR carries the reference type, and MIR emits `borrow.shared` / `borrow.mutable` followed by `borrow.end` at lexical scope exit. The ownership pass checks conflicting active loans and direct owner reads while an exclusive mutable loan is active.

P1.5 adds dereference reads (`deref.load`) and writes (`deref.store`) through active references. Incoming reference parameters are modelled as external loans within the callee, and a write is accepted only through a mutable loan.

This remains an initial lexical-borrow model, not a complete lifetime system. Reference return types and borrowed references escaping a function are rejected with `E3008`. Reborrowing, field-sensitive loans, inferred/NLL lifetimes, closure-capture borrowing, and references to temporaries are not part of this increment.


## MIR loan liveness (P1.6)

The backward liveness pass computes per-operation live-after sets. It includes ordinary operation operands, terminator operands, and branch arguments only when the corresponding target block parameter is live. This preserves liveness across SSA block-parameter merges without treating dead edge arguments as semantic uses. `borrow.end` is intentionally ignored as a use because it is a compiler-generated lexical cleanup marker. Once a local or incoming reference value is absent from the live-after set, its loan becomes ended in the forward ownership state. The regression suite covers mutable dereference followed by direct owner access before scope exit.


## Reborrowing & loan hierarchy (P1.7)

MIR marks reborrow operations explicitly. A reborrow consumes a reference value as its parent, inherits the parent's root owner, and records `parentId` on the child loan. Shared children may coexist unless an exclusive child is already active. Mutable reborrows require a mutable parent and no active child loans. A mutable parent reference is unavailable while any child loan remains live; a shared parent may still be read alongside shared children. Any incompatible parent access produces `E7005`. Child expiration through P1.6 NLL or an explicit `borrow.end` removes the suspension condition, allowing later parent use.

The analysis is intentionally limited to named-reference dereference reborrows (`&*r`, `&mut *r`). It does not yet provide reborrowing of fields, arbitrary places, or interprocedural alias tracking.


## Place-sensitive field loans (P1.8)

A field borrow carries a root SSA value and a dot-separated place path in MIR attributes. An empty path means the whole value. Two non-empty paths are disjoint when neither path equals nor prefixes the other; otherwise the places overlap. Thus `pair.left` and `pair.right` can be borrowed independently, while `pair.profile` overlaps `pair.profile.name`. Field-read MIR operations carry the same root/path metadata, allowing the checker to permit reads from disjoint fields but reject reads overlapping an active mutable loan. Mutable field borrows require a mutable root binding.

P1.8 introduced named struct-field projections in compiler/MIR ownership analysis. P1.9 added runtime constant tuple-position references. P1.10 adds runtime Struct values and field references. P1.11 adds runtime List index references and conservative alias handling. Map indices, union/enum payload projections, and general interprocedural alias tracking remain deferred.


## Runtime tuple projections (P1.9)

Runtime references may carry an optional tuple path alongside the root lexical binding name. Each path component is a zero-based tuple position; nested tuple positions are represented as an ordered path (for example, pair.1.0). Dereference reads walk that path. Mutable dereference writes rebuild the affected tuple chain from the leaf outward and assign the resulting tuple to the original mutable binding, preserving all untouched sibling elements.

This runtime representation is deliberately narrower than the compiler's place model: numeric tuple-member projections are executable, while named user-defined struct fields remain compiler/MIR-only. Dynamic list/map index borrowing, index alias analysis, and references to union/enum payloads are not included in P1.9.


## Runtime struct field projections (P1.10)

User-defined structs are represented at runtime as named Struct values with named fields. Positional constructors follow declaration field order, for example `Person("Mika", 23)`. Runtime references store ordered tuple-position and struct-field projections from the root lexical binding. This supports nested paths such as `player.stats.score`, shared reads, exclusive mutation, and reborrowing without detached field copies.

The MIR ownership checker uses the same logical root-plus-path model. Distinct sibling paths remain independently borrowable, while identical and parent/nested paths overlap. Runtime writes rebuild nested immutable tuple/struct containers from the modified leaf back to the root mutable binding. List index references are covered by P1.11; Map index references remain deferred.


## Runtime List index projections & alias safety (P1.11)

Borrowing a List element uses the source forms `&values[index]` and `&mut values[index]`. Ordinary safe indexing is unchanged and still yields `Option<T>`; a borrow of an in-bounds List slot refers to the element type `T` itself. Runtime reference paths now include a zero-based List projection in addition to tuple positions and struct field names. Dereference reads and writes resolve the complete path from the original lexical root binding. A mutable write rebuilds List/Tuple/Struct containers from the modified leaf outward and retains every untouched sibling.

MIR encodes a statically known non-negative index as `@N` and an index that is not a compile-time integer literal as `@*`. Distinct constant positions such as `@0` and `@1` are disjoint. A dynamic `@*` projection conservatively overlaps every constant or dynamic List index at that projection depth because the runtime value may select the same element. Indexed reads carry the same root-plus-place metadata, so a read of a disjoint constant position can remain available while another element is mutably borrowed. Out-of-range runtime borrows fail with a structured runtime diagnostic rather than producing a dangling reference.

Map key projections are intentionally not included: equality, stable key addressing, and alias rules for map entries need a separate semantic contract. This milestone does not add Map borrows or general interprocedural alias propagation.


## Runtime Map key projections & alias safety (P1.12)

Map entry borrowing uses the existing index syntax: `&scores[key]` or `&mut scores[key]`. Ordinary safe lookup remains `Option<V>`; a successful borrow refers to the stored value `V`. A missing key is not an addressable place and therefore produces a structured runtime diagnostic instead of inserting a new entry or manufacturing an empty slot.

MIR stores Map places as a root binding plus a typed key path. Literal keys receive a type-aware stable segment (for example, `#string:alpha`), while an expression whose value is not a compile-time literal becomes `#*`. Distinct literal keys are independent; equal literal keys overlap. A dynamic key conservatively overlaps every Map key at the same path depth because its runtime value may equal any key. Key/index expressions are retained as MIR operands so evaluation and liveness survive lowering. Whole-Map replacement remains blocked while an entry loan is active through the existing root-place ownership checks.

Runtime references retain the structural key value and resolve it with Seira value equality. Mutable writes rebuild the selected Map entry without changing its key or disturbing sibling entries. Map keys themselves are not mutable through a value reference. Map insertion/removal through a separate owner path, reference escapes, and general interprocedural alias propagation are not expanded by this milestone.
