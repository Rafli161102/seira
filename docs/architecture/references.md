# References & Borrowed Mutation

## Supported source syntax

Seira's \`develop\` branch supports shared and mutable references:

\`\`\`seira
fn read(value: &Int) -> Int {
    *value
}

fn increment(value: &mut Int) {
    *value += 1;
}

fn main() {
    mut counter = 40;
    increment(&mut counter);
    println(read(&counter));
}
\`\`\`

- \`&T\` and \`&value\` create shared references.
- \`&mut T\` and \`&mut value\` create exclusive mutable references.
- \`*reference\` reads the referenced binding.
- \`*reference = value\` and compound assignment mutate through a mutable reference.
- Writing through a shared reference is rejected with \`E3008\`.
- Dereferencing a non-reference is rejected with \`E3002\`.

## Compiler representation

The parser retains dereference as a unary expression. The type checker verifies that its operand is a reference and derives the inner value type. Assignment checking inspects the reference mutability separately from the dereferenced value type.

HIR represents borrow and dereference using typed unary nodes. MIR lowers reference creation to \`borrow.shared\` / \`borrow.mutable\`, reads to \`deref.load\`, and writes to \`deref.store\`. The ownership checker seeds reference parameters as incoming loans supplied by the caller, allows reads through active shared or mutable loans, and permits stores only through active mutable loans. P1.6 adds backward MIR value-liveness analysis: a loan ends after the reference's last semantic use, even when the lexical scope and its synthetic `borrow.end` marker have not yet been reached. P1.7 tracks each child loan's parent, suspends mutable parent-reference use while child loans remain live, and resumes parent access after child expiration.

## Runtime representation

A runtime reference stores the owning RuntimeEnvironment, binding name, mutability, and an optional ordered tuple/struct-field path. With no path it points to the complete lexical binding cell. With a path such as [1, 0] or [field:stats, field:score], it points to a nested tuple element or struct field. Passing a reference to a function preserves the root binding and complete projection path. Mutable dereference assignment rebuilds nested tuple/struct containers and writes the updated value back to the root binding. Reference return values and other escapes are rejected by the front end.

## Deliberate limitations

This is a first MIR-based NLL foundation, not full lifetime analysis. Source borrowing accepts named local bindings, named struct-field projections, positional tuple projections, List element index projections, and Map value projections through literal or dynamic keys. Struct, tuple, List, and Map references are executable in the tree-walking runtime. References cannot be returned or escape the defining function. Map key mutation, arbitrary pointer/address expressions, closure-capture ownership, reference escapes, and general interprocedural alias propagation remain future work. Native and WebAssembly backends are also not implemented yet.


## CFG alias joins (P1.13)

When predecessor branches merge references that may point to different root owners or parent reborrows, the checker retains an unknown alias identity. This overlaps conservatively instead of choosing one predecessor owner. It prevents a branch-merged mutable reference from bypassing a conflict for one possible owner.

## NLL boundary (P1.6)

Liveness is computed over SSA values and reachable CFG edges. Branch arguments are considered live only when their corresponding target block parameters are live. Compiler-generated `borrow.end` operations do not count as semantic reference uses. This enables a local owner to become accessible after the last actual use of a borrow, before lexical scope exit. Reborrowing, place/field-sensitive analysis, and general interprocedural alias propagation remain deferred.


## Reborrowing boundary (P1.7)

The supported reborrow places are named references behind one dereference: `&*r` and `&mut *r`. Shared children can coexist; mutable children require a mutable parent and exclude sibling children. A mutable parent reference is unavailable while any child is live, while a shared parent remains readable alongside shared children. Parent access becomes available again when a child expires under NLL or reaches its borrow-end marker. Runtime reborrows preserve the original environment and binding name, so child reads and writes target the same binding cell.


## Tuple projection references (P1.9)

The runtime reference value has an optional tuplePath: number[] projection. Borrow expressions such as pair.0 and pair.1.0 resolve to the lexical root binding plus the ordered tuple positions. Reborrowing through a dereference retains this path. Dereference reads select the nested element; mutable writes copy the tuple chain outward and replace the root binding from the evaluator.

Only constant positional tuple members are supported by this runtime path. List/map indexing, dynamic indices, and user-defined struct-field references remain outside this increment.


## Runtime struct values and field references (P1.10)

A struct declaration is instantiated by a positional constructor call whose arguments follow declaration field order: `Person("Mika", 23)`. The evaluator stores the value as a Struct runtime value containing its type name and named field map. Member reads retrieve declared fields by name.

Reference paths use ordered projections of tuple positions and struct field names. Thus `&mut player.stats.score` retains the root binding and every nested segment. Dereference mutation reconstructs the nested Struct/Tuple values from the leaf outward and writes the new root value to its original mutable binding. Reborrowing preserves the full path. List index references are added in P1.11; Map index references and named-argument constructor syntax remain deferred.


## Runtime List index references (P1.11)

A List element can be borrowed through an index expression, including a variable index: `element = &values[index]` or `element = &mut values[index]`. The referred value is the List element type `T`, not the `Option<T>` returned by ordinary `values[index]` reads. The runtime reference carries the original lexical binding plus a List-position projection. Nested paths may combine List positions with tuple positions and struct fields. Dereference assignment updates the selected slot by rebuilding immutable containers back to the original mutable binding; sibling elements remain unchanged.

For ownership analysis, a literal index is represented as `@N`, allowing distinct constant positions to be borrowed independently. An index expression whose value is not a compile-time integer literal is represented as `@*`; it conservatively aliases every List position at that path depth. This rule prevents unsound assumptions about two runtime indices being different. A dynamic out-of-range borrow fails at runtime with a structured diagnostic. Safe non-borrowing indexing retains its existing `Option<T>` semantics.

Map index references are deliberately unsupported in this increment. The model does not yet define stable projected places or alias checks for arbitrary map keys. References still cannot escape their defining function, and general interprocedural alias propagation remains deferred.


## Runtime Map value references (P1.12)

Existing Map values can be borrowed using `&map[key]` and `&mut map[key]`. Ordinary `map[key]` lookup still returns `Option<V>`; a successful reference targets `V` rather than the Option wrapper. The runtime resolves the key once and stores the canonical structural key in the reference ordered place path. Missing keys fail with a structured runtime diagnostic. This does not provide insertion through a reference or mutable access to the key itself.

A Map stored beneath a named binding or struct field can be projected by a key, and the path is retained for dereference operations. Dereference writes reconstruct the changed Map value while preserving the original key and the other entries. Reborrowing preserves the full root and key path.

For ownership, statically known keys are encoded with their literal kind to avoid collisions between values of different types. Distinct keys can coexist under mutable loans; identical keys conflict. A dynamic key is represented as `#*` and conservatively aliases all keys in the same Map place. MIR keeps the key expression as an operand to preserve evaluation and liveness. This remains a local ownership model: reference escapes and general interprocedural alias propagation are deferred.
