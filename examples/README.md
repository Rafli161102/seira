# Seira Language Examples

This directory contains introductory code examples demonstrating the syntax and semantics of the **Seira** programming language.

---

## Important Notice: Release 0.0.1-s Status

> [!NOTE]
> In release **0.0.1-s (Seed Foundation)**, the Seira compiler provides **lexical analysis, AST parsing, and syntax validation** via `seira check`.
> Full binary compilation and direct execution (`seira run`, `seira build`) are **planned for the Alpha series** once backend code generation (LLVM / WebAssembly) is introduced.
> These files are documented language examples that can be checked for grammatical conformance, not yet standalone executable binaries.

---

## Examples in this Directory

### 1. `hello_world.sra`
Minimal canonical program illustrating a function declaration and string output:
```sra
fn main() {
    println("Hello, Seira!")
}
```

Validate with:
```bash
seira check examples/hello_world.sra
```

### 2. `pipeline.sra`
Illustrates function composition via the pipeline operator (`|>`) and Option fallback (`??`):
```sra
fn compute_score(input: Option<Int>) -> Int {
    input
        ?? 0
        |> double
        |> add_bonus(10)
}
```

Validate with:
```bash
seira check examples/pipeline.sra
```
