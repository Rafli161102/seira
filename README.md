# Seira

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Release: 0.0.12-d](https://img.shields.io/badge/Release-0.0.12--d%20Development-orange.svg)](CHANGELOG.md)
[![Status: Development](https://img.shields.io/badge/Status-Development-orange.svg)](#project-status)

**Seira** is an experimental modern programming language project focused on predictable semantics, explicit effects, strong static typing, and a compiler architecture designed for native and WebAssembly targets. It is open source, community-oriented, and currently in its early Development Series.

> **Simple to write. Predictable to run.**  
> *Write less. Control more.*

---

## Project Status

> [!IMPORTANT]
> **Current Status: Development (0.0.12-d) — Runtime List Index References & Alias Safety**  
> Seira is an experimental programming language in the first Development Series release, building on the completed Seed compiler, package, standard-library, I/O, and resource foundations.  
> **Seira is NOT production-ready, and Alpha has not yet been released.**  
> This release advances ownership and runtime semantics with:
> - **Runtime List Index References**: shared and mutable references can target list elements using constant or dynamic indices (for example, `&mut values[index]`).
> - **Alias-Safe Borrowing**: distinct constant list positions can be borrowed independently; dynamic indices conservatively alias any list position.
> - **Retained Struct and Field References**: user-defined structs, named-field reads, and nested tuple/struct paths from `0.0.11-d` remain supported.
> - **Nested Reference Projections**: tuple positions, struct fields, and List elements retain their full path back to the original binding; dereference writes preserve sibling values.
> - **Ownership Validation**: MIR place-sensitive analysis rejects overlapping loans, permits disjoint fields/constant List positions, and treats dynamic List indices conservatively as aliases.
> - **Retained Seed Foundations**: the `0.0.10-s` I/O, capability, encoding, path, and deterministic resource-management contracts remain part of the language baseline.

The existing `develop` branch contains post-Seed compiler and language work. The compiler has an AST-to-HIR-to-MIR path with typed control-flow graphs, SSA values, block-parameter merges for mutable state across conditionals and loops, resource lifetime operations, and a MIR verifier for definitions, use ordering, branch arguments, and dominance. The MIR pipeline also runs ownership/borrow data-flow checks. Source-level references support shared/mutable named bindings, tuple positional borrows (`&pair.0`, `&mut pair.1.0`), runtime struct-field borrows (`&mut person.name`, `&mut player.stats.score`), and List element borrows (`&values[index]`, `&mut values[index]`), along with dereference reads/writes. Struct constructors follow declaration field order, and runtime references retain ordered tuple, struct-field, and List-index paths while rebuilding modified values back into the root binding. Constant List positions are tracked independently; dynamic positions use a conservative wildcard alias and may conflict with any List element borrow. Map index borrowing and general interprocedural alias propagation remain future work. The ownership checker computes MIR SSA value liveness and ends loans after their last semantic use, rather than treating synthetic lexical `borrow.end` markers as real uses. This is an initial NLL foundation; reference escapes are rejected. The MIR remains an intermediate representation foundation; native and WebAssembly code generation are future work.

### Recent Development Updates (`develop`)

- **P1.11 — Runtime List Index References & Alias Safety:** added shared/mutable references to List elements via constant and dynamic indices, nested copy-on-write mutation, constant-index disjointness, and conservative dynamic-index alias checking.
- **P1.10 — Runtime Struct Values & Field References:** added positional struct constructors, runtime Struct values, named-field reads, shared/mutable references to named fields and nested mixed tuple/field paths, and copy-on-write mutation through references.
- **P1.9 — Runtime Tuple-Projection References:** added shared/mutable references to tuple positions, including nested paths such as `&mut pair.1.0`; dereference reads projected values and mutable writes rebuild the tuple while preserving siblings. Reborrowing retains the same tuple path.
- **P1.8 — Place-Sensitive & Field-Sensitive Borrowing:** added MIR place projections for named struct fields, allowing disjoint field borrows while rejecting overlapping and parent/nested-place conflicts; field access checks now use projected places.
- **P1.7 — Reborrowing & Loan Hierarchy:** added `&*reference` / `&mut *reference`, parent-child loan tracking, parent suspension while exclusive child reborrows are live, and parent access resumption after child expiry.
- **P1.6 — MIR Loan Liveness & NLL Foundation:** added backward CFG value-liveness analysis so loans end after their last semantic reference use; synthetic lexical `borrow.end` markers no longer extend loan lifetime.
- **P1.5 — Dereference & Borrowed Mutation:** added dereference parsing/type checking, mutable-reference assignment, MIR `deref.load` / `deref.store`, ownership validation for shared versus mutable references, and runtime reference cells.
- **P1.4 — Reference Types & Borrow Syntax:** added `&T`, `&mut T`, `&value`, and `&mut value`, with lexical borrow tracking.
- All development changes are recorded in the [Changelog](CHANGELOG.md) and are committed to the existing `develop` branch.


---

## Core Philosophy

Seira is built upon three foundational axioms:

```text
«Everything is a Value.
Programs are Transformations.
The outside world is an Effect.»
```

### Core Design Principles

1. **Concise**: High signal-to-noise ratio syntax without boilerplate.
2. **Predictable**: No hidden control flow, no implicit coercions, deterministic execution.
3. **Composable**: Functions and transformations form the backbone of application logic.
4. **Efficient**: Zero-cost abstractions, zero runtime overhead for unused features, performance-first design.
5. **Explicit Effects**: Side effects are typed and tracked (`!`), keeping pure code truly pure.
6. **Progressive Control**: Start high-level and safe; dive down to granular memory and resource control when needed.

---

## Language Examples

The following examples demonstrate syntax and semantic features supported and validated by the current `0.0.12-d` implementation:

### 1. Hello World
```sr
// Canonical function and output
fn main() {
    println("Hello, Seira!")
}
```

### 2. Functional Pipelines, Option Fallback, and Lambdas
```sr
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

### 3. Collections, Safe Indexing, Pattern Matching, and Loops
```sr
fn describe_first(items: List<Int>) -> String {
    match items[0] {
        Some(first) => if first > 0 { "positive" } else { "non-positive" }
        None => "empty"
    }
}

fn run_pipeline() {
    numbers = [1, 2, 3, 4, 5]
    mut sum = 0
    for n in numbers {
        sum += n
    }
    
    // Lambdas and pipeline composition
    doubled = sum |> (x => x * 2)
    println(doubled)
}
```

### 4. Generics, Type Aliases, Unions, and Traits
```sr
// Type Alias & Union Type
type UserId = Int
type Identifier = UserId | String

// Generic Type Declaration
type Box<T> {
    value: T
}

// Trait Definition & Implementation
trait Printable {
    fn print()
}

type User {
    id: Int
}

impl User: Printable {
    fn print() {
        println(self.id)
    }
}

// Generic Function with Trait Constraint
fn print_item<T: Printable>(item: T) {
    item.print()
}

// Higher-order generic function & inference
fn identity<T>(value: T) -> T {
    value
}

fn main() {
    num = identity(42)
    user = User { id: 1 }
    print_item(user)
}
```

*(Note: In 0.0.12-d, code is validated by the front-end compiler pipeline and executable via the tree-walking engine with `sr run`. `main` is an application entry convention used by the execution layer; top-level scripts execute directly without `main`).*

---

## Implementation Status

To maintain technical honesty and clear engineering boundaries, repository capabilities are strictly categorized:

| Category | Definition | Subsystems / Features |
| :--- | :--- | :--- |
| **Implemented** | Built, integrated, and validated by automated tests | • Source management (`compiler/source/`) with coordinate mapping and spans<br>• Lexical scanner (`compiler/lexer/`) with full literal and token matrix, Unicode scalar code points<br>• Pratt precedence parser (`compiler/parser/`) with error recovery and visibility markers<br>• Source-aware AST node hierarchy (`compiler/ast/`)<br>• Module and package subsystem (`compiler/module/`) with filesystem mapping, deterministic discovery, package manifest (`Seira.toml`), SHA-256 lockfile (`Seira.lock`), path dependencies, workspace foundation, and circular dependency prevention<br>• Name resolution & lexical scoping (`compiler/resolver/`) with cross-module symbols, `import`, `use`, aliases, `pub use` re-exports, canonical built-in trait registry (`BUILTIN_TRAIT_MAP`), and `pub` visibility boundaries<br>• Static type inference, collection typing, generic types, generic functions, type aliases, union types, function/reference types, trait declarations, trait implementations, trait constraints, static trait resolution, shared/mutable borrow validation, tuple-position and List-index borrow typing, dereference typing, resource validation for `with`, and cross-module type checking (`compiler/typecheck/`)<br>• Standard Library Foundation (`std/src/`) and Prelude with `Option`, `Result`, traits, collections, and lazy iterator pipelines<br>• I/O & Resource Boundary Foundation (`0.0.10-s`): composable capabilities (`Reader`, `Writer`, `Seekable`, `Flushable`, `Sized`, `Resource`), strict Byte/Text boundary (`Byte`, `Bytes`, `Char`, `String`), encoding foundation (UTF-8, ASCII, UTF-16, UTF-32), immutable `Path`, safe `File` lifecycle (open → use → close), and capability-separated memory streams (`MemoryReader`, `MemoryWriter`, `MemoryStream`)<br>• Deterministic resource management: first-class `with` statement with guaranteed strict LIFO cleanup across scope exits, returns, and panics<br>• Structured diagnostics engine (`compiler/diagnostics/`) with active `E1xxx`–`E7xxx` error families and runtime panics `R0xxx`<br>• Structured control flow (`if`/`else` values, `while`, `for`, `loop`, `break`, `continue`)<br>• Pattern matching (`match` with literals, wildcards, bindings, Option, Result, and static exhaustiveness validation)<br>• Seira Collections (`List`, `Tuple`, `Map`, `Set`) with safe indexing and structural value equality<br>• First-class lambdas, lexical closures, higher-order generic functions, and pipeline composition<br>• Tree-walking execution engine & Seira Value Model v1.0 (`runtime/execution/`) with multi-module execution, runtime reference cells for named bindings and nested tuple/struct-field/List-index paths, dereference reads/writes, dedicated runtime diagnostics (`R0xxx`), single-entry convention, and UInt underflow panic (`R0005`)<br>• Canonical `sr` CLI tool (`bin/sr`) and `.sr` extension supporting both standalone single-file mode (`sr run script.sr`) and project package mode (`sr run`) |
| **Architecturally Prepared** | Formal contracts, interfaces, and boundary types defined | • High-Level Intermediate Representation (`compiler/hir/`)<br>• Mid-Level Intermediate Representation (`compiler/mir/`)<br>• Backend emission interfaces (`compiler/backend/`)<br>• Runtime session and service boundaries (`runtime/context.ts`, `services/`) |
| **Specified** | Formally documented in locked architecture specifications | • Full algebraic effect system and effect handler semantics (basic host I/O primitives `println`/`print` executable; full effect enforcement in Phase 2)<br>• Complete lifetime analysis and borrow checking (current `develop` supports shared/mutable borrows, dereference, mutable-reference writes, initial MIR-based NLL, shared/mutable reborrowing, compiler field-sensitive struct and tuple projections, runtime tuple/struct/List references, and conservative alias handling for dynamic List indices; Map key references, reference escapes, and general interprocedural alias propagation remain future work)<br>• Concurrency model (structured concurrency, channels, event loop)<br>• Standard library API contracts for network, system, and process |
| **Planned** | Scheduled in the multi-phase project roadmap | • LLVM native code generation backend<br>• WebAssembly (WASM) emission backend<br>• Ahead-of-time compilation (`sr build`)<br>• Package manager registry and dependency resolution |

### Completed Milestones

- **`0.0.1-s` — Seed Foundation**: Repository bootstrap, root documentation, initial structure, CLI entry point.
- **`0.0.2-s` — Repository Architecture**: Subsystem boundaries, source management, diagnostics bag, driver lifecycle, runtime contracts, backend interfaces.
- **`0.0.3-s` — Compiler Foundation**: Lexer, Pratt parser, AST hierarchy, error recovery, token validation.
- **`0.0.4-s` — Language Foundation**: Name resolution, lexical scoping, basic static type system, structural type equality, pipeline validation.
- **`0.0.5-s` — Execution Foundation**: Tree-walking evaluator, Seira Value Model v0.1, dedicated runtime panic namespace (`R0xxx`), deterministic application entry convention, UInt underflow protection (`R0005`), and `seira run` CLI command.
- **`0.0.6-s` — Data & Control Foundation**: Structured control flow (`if`, `while`, `for`, `loop`, `break`, `continue`), pattern matching (`match` with static exhaustiveness), collections (`List`, `Tuple`, `Map`, `Set`), safe indexing, first-class lambdas, closures, higher-order functions, and pipeline integration.
- **`0.0.7-s` — Type & Generic Foundation**: Generic types, generic functions, generic parameter and argument inference, explicit type arguments, type constraints, type aliases (`type UserId = Int`), union types (`type ID = Int | String`), first-class function types (`(Int) -> Int`), higher-order generic functions, contextual lambda typing, trait foundation (`trait Printable`, `impl Type: Trait`), static trait constraints, static trait resolution, and active `E4xxx` diagnostic family.
- **`0.0.8-s` — Module & Package Foundation**: Canonical `.sr` source extension, `sr` CLI launcher, single-file and package modes, filesystem module mapping, `Seira.toml`, SHA-256 `Seira.lock`, `import`, `use`, aliases, `pub` visibility, `pub use` re-exports, cross-module types/generics/traits, circular dependency detection (`E6008`, `E6012`), path dependencies, workspace foundation, and active `E6xxx` diagnostic family.
- **`0.0.9-s` — Standard Library & Core Contract Foundation**: Native `std` package, minimal global Prelude, `Option<T>` and `Result<T, E>` contracts, foundational traits (`Eq`, `Ord`, `Hash`, `Display`, `Debug`, `Clone`, `Default`, `Iterator`), collection contracts, lazy iterator pipelines, and initial in-memory test doubles.
- **`0.0.10-s` — I/O & Resource Boundary Foundation v1.0**: Composable capabilities (`Reader`, `Writer`, `Seekable`, `Flushable`, `Sized`, `Resource`), strict Byte/Text boundary (`Byte`, `Bytes`, `Char`, `String`), encoding foundation (UTF-8, ASCII, UTF-16, UTF-32), immutable `Path`, safe `File` lifecycle (open → use → close), deterministic `with` statement with strict LIFO cleanup, capability-separated memory streams (`MemoryReader`, `MemoryWriter`, `MemoryStream`), canonical built-in trait registry, Unicode scalar semantics, 388 tests, independent audit passed.
- **`0.0.11-d` — Runtime Struct Values & Field References**: User-defined positional struct constructors, runtime Struct values, named field reads, shared/mutable field references, mixed tuple/struct projections, nested mutation, and P1.10 ownership/typecheck/execution regression coverage.
- **`0.0.12-d` — Runtime List Index References & Alias Safety**: shared/mutable List element borrows using constant and dynamic indices, path-preserving runtime mutation, constant-index disjointness, conservative dynamic-index alias checking, and P1.11 regression coverage.

---

## Architecture Overview

Seira's compiler architecture is designed to support native and WebAssembly targets through a clean multi-stage pipeline:

```text
Source Code (.sr / .sra)
  ↓
Module Discovery     [IMPLEMENTED (0.0.8-s)]
  ↓
Package Graph        [IMPLEMENTED (0.0.8-s)]
  ↓
SourceManager        [IMPLEMENTED (0.0.2-s)]
  ↓
Lexer                [IMPLEMENTED (0.0.3-s)]
  ↓
Parser               [IMPLEMENTED (0.0.3-s)]
  ↓
AST                  [IMPLEMENTED (0.0.3-s / 0.0.8-s)]
  ↓
Name Resolution      [IMPLEMENTED (0.0.4-s / 0.0.8-s)]
  ↓
Type Analysis        [IMPLEMENTED (0.0.4-s / 0.0.8-s)]
  ↓
Semantic Validation  [IMPLEMENTED (0.0.4-s / 0.0.8-s)]
  ↓
Tree-Walking Exec    [IMPLEMENTED (0.0.5-s / 0.0.8-s)]
  ↓
HIR Lowering         [IMPLEMENTED on develop]
  ↓
MIR Lowering         [IMPLEMENTED on develop]
  ↓
Backend Emitter      [Architectural Contract (0.0.2-s)]
  ↓
Native / WebAssembly [Planned: Alpha Series]
```

---

## Roadmap

Seira adheres to a locked, staged versioning and milestone sequence:

```text
PHASE 0: DESIGN
  └── Architectural specifications and language axioms.

PHASE 1: SEED (0.0.1-s → 0.0.10-s)  ◄ [COMPLETED MILESTONE: 0.0.10-s]
  ├── 0.0.1-s: Seed Foundation (Complete)
  ├── 0.0.2-s: Repository Architecture (Complete)
  ├── 0.0.3-s: Compiler Foundation (Complete)
  ├── 0.0.4-s: Language Foundation (Complete)
  ├── 0.0.5-s: Execution Foundation (Complete)
  ├── 0.0.6-s: Data & Control Foundation (Complete)
  ├── 0.0.7-s: Type & Generic Foundation (Complete)
  ├── 0.0.8-s: Module & Package Foundation (Complete)
  ├── 0.0.9-s: Standard Library Foundation (Complete)
  └── 0.0.10-s: I/O & Resource Boundary Foundation (Complete)

PHASE 2: DEVELOPMENT (0.0.11-d → 0.0.30-d)  ◄ [CURRENT RELEASE: 0.0.12-d]
  ├── 0.0.11-d: Runtime Struct Values & Field References (Complete)
  ├── 0.0.12-d: Runtime List Index References & Alias Safety (Complete)
  └── Remaining development: toolchain maturation, intermediate representations, and effect checking.

PHASE 3: ALPHA (0.1.0-alpha.x)
  └── Native (LLVM) code generation, WebAssembly backend, and executable binaries.

PHASE 4: BETA (0.1.0-beta.x)
  └── Standard library completion, stability, and developer tooling.

PHASE 5: RELEASE CANDIDATES (0.1.0-rc.x)
  └── Release stabilization, performance profiling, and bug fixes.

PHASE 6: STABLE (1.0.0)
  └── Production-ready language specification, standard library, and toolchain.

PHASE 7: PRODUCTION (1.1+)
  └── Long-term backwards compatibility and ecosystem growth.
```

---

## Documentation

- [Architecture Overview](docs/architecture/overview.md)
- [Repository Architecture](docs/architecture/repository.md)
- [Compiler Architecture](docs/architecture/compiler.md)
- [Source Management Architecture](docs/architecture/source-management.md)
- [Diagnostics Architecture](docs/architecture/diagnostics.md)
- [Testing Architecture](docs/architecture/testing.md)
- [Runtime Boundary Architecture](docs/architecture/runtime-boundary.md)
- [Reference & Borrow Architecture](docs/architecture/references.md)
- [Backend Boundary Architecture](docs/architecture/backend-boundary.md)
- [Language Specification](docs/language/overview.md)
- [RFC Process & Templates](docs/rfcs/README.md)
- [Development Setup & Guidelines](docs/contributing/development-setup.md)

---

## Development

### Prerequisites
- Node.js `v22+` (Node `v26` recommended)

### Clone & Setup
```bash
git clone https://github.com/Rafli161102/seira.git
cd seira
npm ci
```

### Running the CLI
```bash
# Check version (canonical sr command)
./bin/sr --version
# Output: Seira 0.0.12-d

# Inspect environment and active pipeline stages
./bin/sr info

# Single-file mode: check and run standalone .sr source files directly
./bin/sr check examples/single_file.sr
./bin/sr run examples/single_file.sr

# Package mode: initialize, check, and run projects with Seira.toml
./bin/sr init my_app
cd my_app
../bin/sr check
../bin/sr run

# Short aliases are also supported:
# sr r (run), sr c (check), sr b (build), sr t (test), sr f (fmt), sr i (info), sr v (version)
```

### Running Tests
```bash
npm test
```

### Type Checking
```bash
npm run typecheck
```

---

## Contributing

We welcome community participation! Please review:
- [CONTRIBUTING.md](CONTRIBUTING.md) for branch strategy, PR workflows, and engineering guidelines.
- The Seira project enforces a permanent three-branch model (`main`, `develop`, `dev-infra`). All development branches merge into `develop`.

---

## Governance

Seira is guided by transparent, consensus-driven governance. See [GOVERNANCE.md](GOVERNANCE.md) for role definitions and the [RFC Process](docs/rfcs/README.md) for proposing language changes.

---

## Security

For security vulnerability reporting procedures, please consult [SECURITY.md](SECURITY.md).

---

## License

Seira is open-source software licensed under the [MIT License](LICENSE).