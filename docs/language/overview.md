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

### A. Implemented Subsystems (0.0.10-s I/O & Resource Boundary Foundation)
- **Lexer & Tokens** [IMPLEMENTED]: Tokenization of identifiers, keywords (`fn`, `let`, `mut`, `with`, `and`, `or`, `not`, `if`, `else`, `match`, `return`, `type`, `struct`, `trait`, `impl`, `while`, `for`, `in`, `loop`, `break`, `continue`), pipe token (`|`), locked symbols (`=`, `:`, `->`, `=>`, `.`, `|>`, `?`, `?.`, `??`, `!`, `@`, `...`), integer literals (decimal, hex, binary, uint suffix `u`), float literals, string literals, char literals, and comments (`//`, `/* */`). Banned operators (`++`, `--`, `&&`, `||`, `null`, `===`, `!==`, `::`) rejected with helpful hints. Unicode scalar code point support without splitting surrogate pairs.
- **Parser & AST** [IMPLEMENTED]: Full Pratt precedence climbing parser for expressions, bare bindings, statement bindings, expression-body functions, block functions, generic parameters (`<T, U: Constraint>`), explicit type arguments (`callee<T>(args)`), structs, enums, type aliases (`type UserId = Int`), union types (`T1 | T2`), function types (`(P1, P2) -> R`), trait declarations (`trait Printable`), trait implementations (`impl Target: Trait`), structured control flow (`while`, `for ... in`, `loop`, `break`, `continue`), pattern matching `match`, collection literals (`List`, `Tuple`, `Map`, `Set`), indexing, member access, lambdas, and deterministic error recovery with `synchronize()`.
- **Name Resolution & Scopes** [IMPLEMENTED]: Lexical scope hierarchy (global, module, function, block, generic parameter scope), predictable lexical shadowing, top-level declaration hoisting (including traits and functions), trait implementation coherence checking (duplicate impl rejection `E4005`), unresolved identifier detection (`E2001`), generic parameter value usage rejection (`E2001`), duplicate declaration rejection (`E2002`), immutable reassignment rejection (`E2003`), loop control validation (`E2004` for `break`/`continue` outside loop), canonical built-in trait registry (`BUILTIN_TRAIT_MAP`) preventing trait shadowing, and cross-module resolution (`import`, `use`, `pub use`).
- **Module & Package Subsystem** [IMPLEMENTED]: Canonical `.sr` source extension (with legacy `.sra` compatibility), `sr` CLI tool, filesystem-mapped modules, package manifest (`Seira.toml`), SHA-256 lockfile (`Seira.lock`), path dependencies, workspace support, circular dependency prevention (`E6008`, `E6012`), and public/private visibility enforcement (`pub`, `pub use`, `E6005`).
- **Type System & Generic Analysis** [IMPLEMENTED]: Static type inference, structural type equality (`areTypesEqual`, `isTypeAssignable`), generic parameters and substitution (`substituteType`), bidirectional unification and generic argument inference (`unifyTypes`), explicit type argument checking (`E4001`), generic inference failure detection (`E4002`), trait constraints validation at call sites (`E4003`), trait implementation completeness checking (`E4004`), trait method signature contract validation (`E4006`), transparent type alias equivalence (`UserId ≡ Int`), static union type checking and safe variant operation validation, function type compatibility, lambda contextual typing, Option/Result generic semantics, pipeline generic typing (`|>`), static resource validation for `with` statements (`E3001`), and known built-in method lookup diagnostics (`E3003`).
- **Standard Library Foundation & Prelude** [IMPLEMENTED]: Minimal global Prelude (`Option`, `Result`, `Some`, `None`, `Ok`, `Err`, `MemoryReader`, `MemoryWriter`, `MemoryStream`, `print`, `println`, `open_resource`), `std.core`, `std.option`, `std.result`, `std.collections`, `std.iter`, `std.io`, and lazy iterator combinators.
- **I/O & Resource Boundary Foundation** [IMPLEMENTED]: Composable capability architecture (`Reader`, `Writer`, `Seekable`, `Flushable`, `Sized`, `Resource`), strict Byte/Text boundary (`Byte`, `Bytes`, `Char`, `String`), encoding foundation (UTF-8 default, ASCII, UTF-16, UTF-32) with structured error reporting, first-class immutable `Path`, safe `File` lifecycle (open → use → close), and capability-separated memory streams (`MemoryReader`, `MemoryWriter`, `MemoryStream`).
- **Deterministic Resource Lifecycle (`with`)** [IMPLEMENTED]: First-class `with` statement with static resource constraint validation and guaranteed deterministic LIFO cleanup across normal scope exit, early return, break, continue, and panic paths.
- **Tree-Walking Execution Engine** [IMPLEMENTED]: Seira Value Model v1.0 (`Int`, `UInt`, `Float`, `Bool`, `Char`, `String`, `Byte`, `Unit`, `Option`, `Result`, `List`, `Tuple`, `Map`, `Set`, `Function`, `Bytes`, `Path`, `File`, `MemoryReader`, `MemoryWriter`, `MemoryStream`), lexical closure capture, safe collection indexing, static trait dispatch, multi-module execution, single-entry convention, and dedicated runtime diagnostic panics (`R0xxx`).
- **Diagnostics Engine** [IMPLEMENTED]: Structured diagnostic reporting across `E1xxx` (Syntax), `E2xxx` (Resolution), `E3xxx` (Type), `E4xxx` (Trait & Generics), `E5xxx` (Pattern Matching), `E6xxx` (Module & Package), `E9xxx` (Milestone/Backend), and `R0xxx` (Runtime Panics) with source pointers, ASCII line snippets, hints, suggestions, and ICE reports.
- **Compiler Driver & CLI** [IMPLEMENTED]: Canonical `sr` command (and `seira` alias) supporting single-file mode (`sr run script.sr`), package mode (`sr run`), `sr check`, `sr info`, and `sr --version`.

### B. Architectural Skeletons (0.0.10-s Baseline)
- **HIR Lowering** [ARCHITECTURAL SKELETON]: Stub contracts for High-Level IR representation (Reserved: 0.0.11-d).
- **MIR Lowering** [ARCHITECTURAL SKELETON]: Stub contracts for Mid-Level IR representation (Reserved: 0.0.11-d).
- **Backend Emitter** [ARCHITECTURAL SKELETON]: Stub contracts for native LLVM and WebAssembly code generation (Reserved: 0.1.0-alpha).

### C. Planned / Deferred Features
- Intermediate representations (HIR/MIR lowering) and CFG optimizations (Planned: 0.0.11-d).
- Full borrow checker and compile-time ownership tracking (Planned: Phase 2).
- Full effect inference and algebraic handler typing (Planned: Phase 2).
- Native LLVM and WebAssembly code generation (Reserved: 0.1.0-alpha).
- Structured concurrency and async runtime scheduler (Reserved: 0.1.0-alpha).
- Dynamic trait objects (`dyn Trait`), vtables, runtime dynamic dispatch, associated types, and specialization are explicitly out of scope for early milestones.
- P2 runtime evaluator host duck-typing fallback is deferred to future runtime refactoring.

### D. Reserved Long-Term Features (Post-1.0 Exploration)
- Advanced compile-time reflection [RESERVED].
- Formal verification annotations [RESERVED].
