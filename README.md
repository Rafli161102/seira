# Seira

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Release: 0.0.10-s](https://img.shields.io/badge/Release-0.0.10--s%20Seed-green.svg)](CHANGELOG.md)
[![Status: I/O & Resource Boundary Foundation](https://img.shields.io/badge/Status-I%2FO%20%26%20Resource%20Boundary%20Foundation-orange.svg)](#project-status)

**Seira** is an experimental modern programming language project focused on predictable semantics, explicit effects, strong static typing, and a compiler architecture designed for native and WebAssembly targets. It is open source, community-oriented, and currently in its early Seed stage.

> **Simple to write. Predictable to run.**  
> *Write less. Control more.*

---

## Project Status

> [!IMPORTANT]
> **Current Status: Seed (0.0.10-s) — I/O & Resource Boundary Foundation v1.0**  
> Seira is currently an early-stage experimental programming language project establishing its compiler architecture, language foundation, tooling boundaries, and engineering infrastructure.  
> **Seira is NOT production-ready, and Alpha is not yet released.**  
> In the current 0.0.10-s release, Seira establishes the official I/O, Capability, and Resource boundaries:
> - **Capability Architecture**: Capabilities are composable, not universal (`Reader`, `Writer`, `Seekable`, `Flushable`, `Sized`, `Resource`).
> - **Byte/Text Boundary**: Strict boundary between raw binary data (`Byte`, `Bytes`) and text (`Char`, `String`). Conversions are explicit (`encode` / `decode`); implicit coercion is strictly prohibited.
> - **Encoding Foundation**: Supported standard encodings (UTF-8 default, ASCII, UTF-16, UTF-32) returning deterministic `Result` types. Invalid byte sequences produce structured errors, never panics or corruption.
> - **Path Abstraction**: First-class, immutable, normalized `Path` type distinct from `String` with composable operations (`join`, `parent`, `file_name`, `extension`, `is_absolute`, `normalize`).
> - **File I/O Foundation**: Deterministic, safe `File` lifecycle (open → use → close). Operations on closed files or mode violations produce deterministic `Result` errors (`AlreadyClosed`, `PermissionDenied`, `NotFound`, `InvalidSeek`).
> - **Deterministic Resource Management**: First-class `with` statement with guaranteed deterministic cleanup in strict LIFO order across all exit paths (normal scope exit, early return, break, continue, and panic).
> - **Memory I/O Refinement**: Target-independent `MemoryReader` (`Reader` + `Seekable` + `Sized`), `MemoryWriter` (`Writer` + `Flushable` + `Sized`), and `MemoryStream` (all 5 capabilities) enabling fast, hermetic execution without OS/network side effects.


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

The following examples demonstrate syntax and semantic features supported and validated by the current `0.0.10-s` implementation:

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

*(Note: In 0.0.10-s, code is validated by the front-end compiler pipeline and executable via the tree-walking engine with `sr run`. `main` is an application entry convention used by the execution layer; top-level scripts execute directly without `main`).*

---

## Implementation Status

To maintain technical honesty and clear engineering boundaries, repository capabilities are strictly categorized:

| Category | Definition | Subsystems / Features |
| :--- | :--- | :--- |
| **Implemented** | Built, integrated, and validated by automated tests | • Source management (`compiler/source/`) with coordinate mapping and spans<br>• Lexical scanner (`compiler/lexer/`) with full literal and token matrix, Unicode scalar code points<br>• Pratt precedence parser (`compiler/parser/`) with error recovery and visibility markers<br>• Source-aware AST node hierarchy (`compiler/ast/`)<br>• Module and package subsystem (`compiler/module/`) with filesystem mapping, deterministic discovery, package manifest (`Seira.toml`), SHA-256 lockfile (`Seira.lock`), path dependencies, workspace foundation, and circular dependency prevention<br>• Name resolution & lexical scoping (`compiler/resolver/`) with cross-module symbols, `import`, `use`, aliases, `pub use` re-exports, canonical built-in trait registry (`BUILTIN_TRAIT_MAP`), and `pub` visibility boundaries<br>• Static type inference, collection typing, generic types, generic functions, type aliases, union types, function types, trait declarations, trait implementations, trait constraints, static trait resolution, resource validation for `with`, and cross-module type checking (`compiler/typecheck/`)<br>• Standard Library Foundation (`std/src/`) and Prelude with `Option`, `Result`, traits, collections, and lazy iterator pipelines<br>• I/O & Resource Boundary Foundation (`0.0.10-s`): composable capabilities (`Reader`, `Writer`, `Seekable`, `Flushable`, `Sized`, `Resource`), strict Byte/Text boundary (`Byte`, `Bytes`, `Char`, `String`), encoding foundation (UTF-8, ASCII, UTF-16, UTF-32), immutable `Path`, safe `File` lifecycle (open → use → close), and capability-separated memory streams (`MemoryReader`, `MemoryWriter`, `MemoryStream`)<br>• Deterministic resource management: first-class `with` statement with guaranteed strict LIFO cleanup across scope exits, returns, and panics<br>• Structured diagnostics engine (`compiler/diagnostics/`) with active `E1xxx`–`E6xxx` error families and runtime panics `R0xxx`<br>• Structured control flow (`if`/`else` values, `while`, `for`, `loop`, `break`, `continue`)<br>• Pattern matching (`match` with literals, wildcards, bindings, Option, Result, and static exhaustiveness validation)<br>• Seira Collections (`List`, `Tuple`, `Map`, `Set`) with safe indexing and structural value equality<br>• First-class lambdas, lexical closures, higher-order generic functions, and pipeline composition<br>• Tree-walking execution engine & Seira Value Model v1.0 (`runtime/execution/`) with multi-module execution, dedicated runtime diagnostics (`R0xxx`), single-entry convention, and UInt underflow panic (`R0005`)<br>• Canonical `sr` CLI tool (`bin/sr`) and `.sr` extension supporting both standalone single-file mode (`sr run script.sr`) and project package mode (`sr run`) |
| **Architecturally Prepared** | Formal contracts, interfaces, and boundary types defined | • High-Level Intermediate Representation (`compiler/hir/`)<br>• Mid-Level Intermediate Representation (`compiler/mir/`)<br>• Backend emission interfaces (`compiler/backend/`)<br>• Runtime session and service boundaries (`runtime/context.ts`, `services/`) |
| **Specified** | Formally documented in locked architecture specifications | • Full algebraic effect system and effect handler semantics (basic host I/O primitives `println`/`print` executable; full effect enforcement in Phase 2)<br>• Full compile-time borrow checking and ownership system (deterministic scope cleanup active via `with` blocks in 0.0.10-s; static borrow checking in Phase 2)<br>• Concurrency model (structured concurrency, channels, event loop)<br>• Standard library API contracts for network, system, and process |
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
HIR Lowering         [Architectural Contract (0.0.2-s)]
  ↓
MIR Lowering         [Architectural Contract (0.0.2-s)]
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

PHASE 2: DEVELOPMENT (0.0.11-d → 0.0.30-d)  ◄ [NEXT PHASE]
  └── Toolchain maturation, intermediate representations, and effect checking.

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
# Output: Seira 0.0.10-s

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