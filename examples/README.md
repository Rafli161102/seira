# Seira Language Examples

This directory contains introductory code examples demonstrating the syntax and semantics of the **Seira** programming language.

---

## Important Notice: Release 0.0.4-s Status

> [!NOTE]
> In release **0.0.4-s (Language Foundation)**, the Seira compiler provides **lexical analysis, AST parsing, name resolution, and static type analysis** via `seira check`.
> Direct native compilation and full execution (`seira run`, `seira build`) are **planned for the Alpha series** once backend code generation (LLVM / WebAssembly) is introduced.
> These files are documented language examples that can be checked for grammatical and semantic conformance.

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
fn double(x: Int) -> Int {
    x * 2
}

fn add_bonus(x: Int, bonus: Int) -> Int {
    x + bonus
}

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
