# RFC 0001: Map Key References & Collection Alias Safety

- **RFC Number**: 0001
- **Author**: RFLI / Seira Project Maintainer
- **Status**: In Review
- **Target Release**: 0.0.13-d
- **Created**: 2026-10-31

---

## 1. Summary

This RFC proposes shared and mutable references to the value stored at an existing Map key, using Seira's existing index syntax. It retains Option<V> for ordinary safe lookup, and makes borrow alias analysis aware of typed literal keys while remaining conservative for dynamic keys.

## 2. Motivation

Map indexing currently provides safe lookup as Option<V>, but Map values cannot be borrowed as places. This prevents updates through Seira's reference model and leaves Map projections as the remaining collection-place gap after List index references.

The feature must not expose unstable entry addresses, mutate keys, or assume two runtime-computed keys differ. It must preserve the existing immutable value model and local MIR ownership guarantees.

## 3. Detailed Design

### Source contract

    fn main() {
        mut scores = {"alpha": 10, "beta": 20};
        score_ref = &mut scores["alpha"];
        *score_ref += 5;
        key = "beta";
        other_ref = &scores[key];
        println(*score_ref);
        println(*other_ref);
        println(scores["alpha"]);
    }

Ordinary scores[key] remains Option<V>. Borrowing an existing entry yields a reference to V, not to the Option wrapper. A missing key is not a valid place and produces a structured runtime diagnostic. Borrowing does not implicitly insert entries.

### Runtime representation

A reference path gains a Map projection carrying the canonical runtime key. Reads locate the entry using Seira structural value equality. Mutable writes rebuild the Map entries collection with the original key and replacement value; entry order and unrelated entries are preserved. Map keys are never mutated through this reference.

### Type checking

The root must be a named place and mutable references require a mutable root binding. The Map key expression must be assignable to the Map declared key type. The reference inner type is V, while ordinary indexing continues to infer Option<V>.

### MIR and ownership

A literal key is represented by a type-aware path segment such as #string:alpha. A non-literal key is represented by #*. Equal literal keys overlap; distinct literal keys are disjoint. A dynamic key conservatively overlaps every key at that Map path depth.

The key expression remains a MIR operand, and place metadata records its projection count. This preserves evaluation and SSA liveness when a borrow is lowered from a projected Map place. Replacing the whole Map is blocked while an entry loan remains live by the root-place ownership rule.

### Scope

This RFC does not add mutable keys, Map entry insertion or removal through a reference, references escaping their defining function, or general interprocedural alias propagation.

## 4. Drawbacks & Trade-offs

- Dynamic keys may trigger conservative conflicts even when their runtime values differ.
- Structural key comparison is required when resolving a runtime reference path.
- An absent key cannot be borrowed; callers must establish the entry before taking a reference.
- This does not constitute a complete Rust-style borrow checker or prove all cross-call alias properties.

## 5. Alternatives Considered

- Returning Option<&V> from ordinary indexing was rejected because it changes the established Option<V> contract and requires Option-contained reference ownership semantics.
- Inserting a default value for a missing key was rejected because it hides mutation and requires a Default contract that is not universally available.
- Treating all Map keys as overlapping is safe but needlessly rejects borrows of distinct constant keys. Typed literal paths allow a more precise local rule while dynamic keys remain conservative.

## 6. Unresolved Questions

- Should future standard-library APIs expose entry, get_mut, or insert_if_absent operations with dedicated ownership contracts?
- Should user-defined equality implementations participate in Map key identity, or remain outside the compile-time key-place identity model?
- What interprocedural effect and alias summaries will be required when references can be passed through larger call graphs?

Implementation is staged on feature/p1.12-map-key-references while this RFC is in review. Merge into develop remains gated on RFC review and green CI.