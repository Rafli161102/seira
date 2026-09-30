# Seira Language Examples

This directory contains introductory code examples demonstrating the syntax and semantics of the **Seira** programming language.

---

## Important Notice: Release 0.0.7-s Status

> [!NOTE]
> In release **0.0.7-s (Type & Generic Foundation)**, the Seira toolchain provides full front-end static analysis via `seira check` and interactive execution via `seira run`.
> Language features supported include generic types, generic functions, type aliases, union types, function types, trait definitions, trait constraints, static trait resolution, collections, pattern matching, closures, and functional pipelines.
> Direct native compilation (`seira build`) is planned for the Alpha series once backend code generation (LLVM / WebAssembly) is introduced.

---

## Examples in this Directory

### 1. `hello_world.sra`
Minimal canonical program illustrating a function declaration and string output:
```sra
fn main() {
    println("Hello, Seira!")
}
```

Check and run:
```bash
seira check examples/hello_world.sra
seira run examples/hello_world.sra
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

Check with:
```bash
seira check examples/pipeline.sra
```

### 3. `control_flow.sra`
Illustrates loops, branch expressions, collections, and pattern matching.

Check and run:
```bash
seira check examples/control_flow.sra
seira run examples/control_flow.sra
```

### 4. `generics_and_traits.sra`
Demonstrates generic types, generic functions, type aliases, union types, trait contracts, trait constraints, and higher-order generic functions:
```sra
type UserId = Int
type Identifier = UserId | String

trait Printable {
    fn print()
}

impl Int: Printable {
    fn print() {
        println(42)
    }
}

fn print_item<T: Printable>(item: T) -> T {
    item
}

fn identity<T>(value: T) -> T {
    value
}

fn apply<T, R>(f: (T) -> R, value: T) -> R {
    f(value)
}

fn wrap<T>(value: T) -> Option<T> {
    Some(value)
}

fn main() {
    num = identity(42)
    println(num)

    verified = print_item(100)
    println(verified)

    doubled = apply(x => x * 2, 21)
    println(doubled)

    boxed = 99 |> wrap
    match boxed {
        Some(v) => println(v)
        None => println(0)
    }
}
```

Check and run:
```bash
seira check examples/generics_and_traits.sra
seira run examples/generics_and_traits.sra
```
