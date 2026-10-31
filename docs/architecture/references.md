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

HIR represents borrow and dereference using typed unary nodes. MIR lowers reference creation to \`borrow.shared\` / \`borrow.mutable\`, reads to \`deref.load\`, and writes to \`deref.store\`. The ownership checker seeds reference parameters as external loans supplied by the caller, allows reads through active shared or mutable loans, and permits stores only through active mutable loans.

## Runtime representation

A runtime reference stores the owning \`RuntimeEnvironment\`, binding name, and mutability. It points to the original lexical binding cell instead of copying the current value. Therefore, passing \`&mut value\` to a function preserves the link to the caller's binding; dereference assignment updates that same binding. Reference return values and other escapes are rejected by the front end.

## Deliberate limitations

This is lexical borrowing, not full lifetime analysis. Borrow places are restricted to named local bindings. References cannot be returned or escape the defining function. NLL, reborrowing, field-sensitive borrowing, arbitrary pointer/address expressions, closure-capture ownership, and general interprocedural alias propagation remain future work. Native and WebAssembly backends are also not implemented yet.
