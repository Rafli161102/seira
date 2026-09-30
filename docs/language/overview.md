# Seira Language Specification & Overview

## 1. Axioms and Core Philosophy

```
«Everything is a Value.
Programs are Transformations.
The outside world is an Effect.»
```

Seira's design balances expressive high-level ergonomics with zero-cost systems control:
- **Simple to write. Predictable to run.**
- **Write less. Control more.**

---

## 2. Locked Language Syntax

The following syntactic rules and symbols are locked:

### Core Symbols
| Symbol | Meaning | Example |
| :--- | :--- | :--- |
| `=` | Binding / Assignment | `let x = 42` |
| `:` | Type annotation | `val: Int` |
| `->` | Function return type | `fn add(a: Int, b: Int) -> Int` |
| `=>` | Match / Lambda arrow | `val => val * 2` |
| `.` | Member access | `user.name` |
| `\|>` | Pipeline operator | `data \|> filter(is_valid) \|> map(to_json)` |
| `?` | Option / Result propagation | `fetch_user()?` |
| `?.` | Safe navigation | `user?.profile?.avatar` |
| `??` | Option fallback (default value) | `maybe_name ?? "Guest"` |
| `!` | Explicit effect marker | `fn write_file!(path: String) -> Result<Unit, IoError>` |
| `@` | Attributes & annotations | `@inline`, `@repr(C)` |
| `...` | Rest / Spread operator | `[head, ...tail]` |

### Fundamental Syntax Rules
- **No `null`**: Absence of value is explicitly represented via `Option<T>`.
- **No ternary `?:`**: Use concise `if / else` expressions: `if condition { a } else { b }`.
- **Boolean Logic**: Always use words `and`, `or`, `not` instead of `&&`, `||`, `!`.
- **No `++` or `--`**: Increment/decrement is explicitly `x = x + 1` or `x += 1`.
- **Immutability by Default**: All variable bindings are immutable unless marked with `mut`.
- **Explicit Mutation**: `let mut counter = 0`.
- **Resource Lifecycle**: Deterministic resource management via `with resource { ... }`.

---

## 3. Status Breakdown

### A. Locked Specification (Target Language Direction)
The complete language design specifies:
- Algebraic Data Types (structs and enums).
- Pattern matching (`match`).
- First-class traits and generics.
- Effect system tracking side effects statically.
- Cooperative async execution with structured concurrency.

### B. Current Implementation (Version 0.0.1-s Seed)
In the 0.0.1-s Seed Foundation release, the language foundation implements:
- **Lexer**: Tokenization of identifiers, keywords (`fn`, `let`, `mut`, `with`, `and`, `or`, `not`, `if`, `else`, `match`, `return`, `type`, `struct`, `trait`), locked symbols (`=`, `:`, `->`, `=>`, `.`, `|>`, `?`, `?.`, `??`, `!`, `@`, `...`), integer literals, float literals, string literals, and comments (`//`).
- **Parser**: Function declarations (`fn name(params) -> ReturnType { ... }`), call expressions, pipeline expressions (`|>`), fallback expressions (`??`), identifiers, and literals.
- **Diagnostics**: Exact source location reporting (line, column, span, source snippet).
- **Tooling**: Syntax validation via `seira check <file.sra>`.

### C. Reserved / Future Features (Milestones 0.0.2-s through Alpha)
- Type inference and static type checking.
- Trait bounds and generic parameter resolution.
- Static effect checking and handler propagation.
- Code generation (Native LLVM & WebAssembly).
- Pattern exhaustiveness checking.

### D. Experimental Features (Post-1.0 Exploration)
- Advanced compile-time reflection.
- Formal verification annotations.
