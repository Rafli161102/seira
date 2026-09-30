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
| `=` | Binding / Assignment | `let x = 42`, `count = 1` |
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
- **No `null`**: Absence of value is explicitly represented via `Option<T>` with `None`.
- **No ternary `?:`**: Use concise `if / else` expressions: `if condition { a } else { b }`.
- **Boolean Logic**: Always use words `and`, `or`, `not` instead of `&&`, `||`, `!`.
- **No truthy/falsy coercion**: Only `Bool` expressions can be used in `if` conditions and boolean operations.
- **No `++` or `--`**: Increment/decrement is explicitly `x = x + 1` or `x += 1`.
- **Immutability by Default**: All variable bindings are immutable unless marked with `mut`.
- **Explicit Mutation**: `mut counter = 0` or `let mut counter = 0`.
- **Resource Lifecycle**: Deterministic resource management via `with resource [as alias] { ... }`.

---

## 3. Subsystem Status Breakdown

Every subsystem is labeled with its current architectural status:

### A. Implemented Subsystems (0.0.6-s Data & Control Foundation)
- **Lexer & Tokens** [IMPLEMENTED]: Tokenization of identifiers, keywords (`fn`, `let`, `mut`, `with`, `and`, `or`, `not`, `if`, `else`, `match`, `return`, `type`, `struct`, `trait`, `while`, `for`, `in`, `loop`, `break`, `continue`), locked symbols (`=`, `:`, `->`, `=>`, `.`, `|>`, `?`, `?.`, `??`, `!`, `@`, `...`), integer literals (decimal, hex, binary, uint suffix `u`), float literals, string literals, char literals, and comments (`//`, `/* */`). Banned operators (`++`, `--`, `&&`, `||`, `null`, `===`, `!==`, `::`) rejected with helpful hints.
- **Parser & AST** [IMPLEMENTED]: Full Pratt precedence climbing parser for expressions, bare bindings, statement bindings, expression-body functions, block functions, structs, enums, type aliases, structured control flow (`while`, `for ... in`, `loop`, `break`, `continue`), pattern matching `match`, collection literals (`List`, `Tuple`, `Map`, `Set`), indexing, member access, lambdas, and deterministic error recovery with `synchronize()`.
- **Name Resolution & Scopes** [IMPLEMENTED]: Lexical scope hierarchy (global, module, function, block), predictable lexical shadowing, top-level declaration hoisting, duplicate declaration rejection (`E2002`), unresolved identifier detection (`E2001`), immutable reassignment rejection (`E2003`), and loop control validation (`E2004` for `break`/`continue` outside loop).
- **Type System & Inference** [IMPLEMENTED]: Static type inference, structural type equality (`areTypesEqual`, `isTypeAssignable`), explicit type annotations and verification (`E3001`), operator operand typing (`E3002`), function call argument count and type validation (`E3003`), function return type checking (`E3004`), strict Boolean requirements for `if` and `while` conditions (`E3005`), tuple positional access validation (`E3006`), iteration target checking (`E3007`), pattern matching exhaustiveness (`E5001`), pattern kind checking (`E5002`), Option/Result foundational semantics, and pipeline expression checking (`|>`).
- **Tree-Walking Execution Engine** [IMPLEMENTED]: Seira Value Model v0.2 (`Int`, `UInt`, `Float`, `Bool`, `Char`, `String`, `Byte`, `Unit`, `Option`, `Result`, `List`, `Tuple`, `Map`, `Set`, `Function`), lexical closure capture, safe collection indexing, method dispatch for collections, deterministic application entry convention, and dedicated runtime diagnostic panics (`R0xxx`).
- **Diagnostics Engine** [IMPLEMENTED]: Structured diagnostic reporting across `E1xxx` (Syntax), `E2xxx` (Resolution), `E3xxx` (Type), `E5xxx` (Pattern Matching), `E9xxx` (Milestone/Backend), and `R0xxx` (Runtime Panics) with source pointers, ASCII line snippets, hints, suggestions, and ICE reports.
- **Compiler Driver & CLI** [IMPLEMENTED]: `CompilerDriver` orchestrating stages end-to-end, CLI commands `version`, `info`, `check <file.sra>`, and `run <file.sra>`.

### B. Architectural Skeletons (0.0.6-s Baseline)
- **HIR Lowering** [ARCHITECTURAL]: Stub for High-Level IR representation.
- **MIR Lowering** [ARCHITECTURAL]: Stub for Mid-Level IR representation.
- **Backend Emitter** [ARCHITECTURAL]: Stub for native and WASM codegen.
- **Runtime Resource Engine** [ARCHITECTURAL]: LIFO resource cleanup stub (`open_resource`, `with` blocks as mock compatibility foundation).

### C. Planned / Deferred Features (0.0.7-s through Alpha)
- Full borrow checker and ownership tracking (Planned: 0.0.7-s / 0.0.11-d).
- Full effect inference and handler typing (Planned: 0.0.8-s / 0.0.11-d).
- Trait bounds solver and monomorphization (Planned: 0.0.9-s / 0.0.11-d).
- High-level and mid-level intermediate representations (HIR/MIR lowering) (Planned: 0.0.11-d).
- Native LLVM and WebAssembly code generation (Reserved: 0.1.0-alpha).
- Structured concurrency and async runtime (Reserved: 0.1.0-alpha).

### D. Reserved Long-Term Features (Post-1.0 Exploration)
- Advanced compile-time reflection [RESERVED].
- Formal verification annotations [RESERVED].
