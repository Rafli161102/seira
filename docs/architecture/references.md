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

A runtime reference stores the owning \`RuntimeEnvironment\`, binding name, and mutability. It points to the original lexical binding cell instead of copying the current value. Therefore, passing \`&mut value\` to a function preserves the link to the caller's binding; dereference assignment updates that same binding. Reference return values and other escapes are rejected by the front end.

## Deliberate limitations

This is a first MIR-based NLL foundation, not full lifetime analysis. Borrow places are restricted to named local bindings. References cannot be returned or escape the defining function. field-sensitive borrowing, arbitrary pointer/address expressions, closure-capture ownership, and general interprocedural alias propagation remain future work. Native and WebAssembly backends are also not implemented yet.


## NLL boundary (P1.6)

Liveness is computed over SSA values and reachable CFG edges. Branch arguments are considered live only when their corresponding target block parameters are live. Compiler-generated `borrow.end` operations do not count as semantic reference uses. This enables a local owner to become accessible after the last actual use of a borrow, before lexical scope exit. Reborrowing, place/field-sensitive analysis, and general interprocedural alias propagation remain deferred.


## Reborrowing boundary (P1.7)

The supported reborrow places are named references behind one dereference: `&*r` and `&mut *r`. Shared children can coexist; mutable children require a mutable parent and exclude sibling children. A mutable parent reference is unavailable while any child is live, while a shared parent remains readable alongside shared children. Parent access becomes available again when a child expires under NLL or reaches its borrow-end marker. Runtime reborrows preserve the original environment and binding name, so child reads and writes target the same binding cell.
