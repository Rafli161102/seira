# Seira

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Release: 0.0.5-s](https://img.shields.io/badge/Release-0.0.5--s%20Seed-green.svg)](CHANGELOG.md)
[![Status: Execution Foundation](https://img.shields.io/badge/Status-Execution%20Foundation-orange.svg)](#project-status)

**Seira** is an experimental modern programming language project focused on predictable semantics, explicit effects, strong static typing, and a compiler architecture designed for native and WebAssembly targets. It is open source, community-oriented, and currently in its early Seed stage.

> **Simple to write. Predictable to run.**  
> *Write less. Control more.*

---

## Project Status

> [!IMPORTANT]
> **Current Status: Seed (0.0.5-s) — Execution Foundation**  
> Seira is currently an early-stage experimental programming language project. The repository is establishing its compiler architecture, language foundation, tooling boundaries, and engineering infrastructure.  
> **Seira is NOT production-ready, and Alpha is not yet released.**  
> In the current 0.0.5-s release, the project provides a working execution engine (`runtime/execution/`) that executes semantically validated Seira programs via tree-walking evaluation (`seira run`), backed by the full front-end compiler pipeline (lexing, parsing, name resolution, and static type analysis). Direct native code generation and WebAssembly emission will be implemented in subsequent phases.

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

## Language Example

The following examples demonstrate syntax and semantic features supported and validated by the current `0.0.4-s` implementation:

### 1. Hello World
```sra
// Canonical function and output
fn main() {
    println("Hello, Seira!")
}
```

### 2. Functional Pipelines and Option Fallback
```sra
// Pure transformations with pipelines (|>) and Option fallback (??)
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

*(Note: In 0.0.4-s, code is validated through syntax, scoping, and static type analysis using `seira check`. Executable code generation is planned for the Alpha series).*

---

## Implementation Status

To maintain technical honesty and clear engineering boundaries, repository capabilities are strictly categorized:

| Category | Definition | Subsystems / Features |
| :--- | :--- | :--- |
| **Implemented** | Built, integrated, and validated by automated tests | • Source management (`compiler/source/`) with coordinate mapping and spans<br>• Lexical scanner (`compiler/lexer/`) with full literal and token matrix<br>• Pratt precedence parser (`compiler/parser/`) with error recovery<br>• Source-aware AST node hierarchy (`compiler/ast/`)<br>• Name resolution & lexical scoping (`compiler/resolver/`)<br>• Basic type inference and static checking (`compiler/typecheck/`)<br>• Structured diagnostics engine (`compiler/diagnostics/`)<br>• Compiler driver orchestrating front-end pipeline (`compiler/driver/`)<br>• Tree-walking execution engine & Seira Value Model v0.1 (`runtime/execution/`)<br>• Manifest validation (`Seira.toml`) and official CLI (`seira check`, `seira run`) |
| **Architecturally Prepared** | Formal contracts, interfaces, and boundary types defined | • High-Level Intermediate Representation (`compiler/hir/`)<br>• Mid-Level Intermediate Representation (`compiler/mir/`)<br>• Backend emission interfaces (`compiler/backend/`)<br>• Runtime session and service boundaries (`runtime/context.ts`, `services/`) |
| **Specified** | Formally documented in locked architecture specifications | • Full algebraic effect system and effect handler semantics<br>• Scoped resource ownership model (`with` blocks, deterministic cleanup)<br>• Memory model, borrow checking, and zero-overhead abstractions<br>• Concurrency model (structured concurrency, channels, event loop)<br>• Standard library API contracts (`std/core`, `std/collections`, `std/io`, etc.) |
| **Planned** | Scheduled in the multi-phase project roadmap | • LLVM native code generation backend<br>• WebAssembly (WASM) emission backend<br>• Ahead-of-time compilation (`seira build`)<br>• Package manager registry and dependency resolution |

### Completed Milestones

- **`0.0.1-s` — Seed Foundation**: Repository bootstrap, root documentation, initial structure, CLI entry point.
- **`0.0.2-s` — Repository Architecture**: Subsystem boundaries, source management, diagnostics bag, driver lifecycle, runtime contracts, backend interfaces.
- **`0.0.3-s` — Compiler Foundation**: Lexer, Pratt parser, AST hierarchy, error recovery, token validation.
- **`0.0.4-s` — Language Foundation**: Name resolution, lexical scoping, basic static type system, structural type equality, pipeline validation.
- **`0.0.5-s` — Execution Foundation**: Tree-walking evaluator, Seira Value Model v0.1, runtime outcomes & panics, deterministic execution, and `seira run` CLI command.
- **`0.0.6-s` — NOT STARTED**: Scheduled next in the Seed series.

---

## Architecture Overview

Seira's compiler architecture is designed to support native and WebAssembly targets through a clean multi-stage pipeline:

```text
Source Code (.sra)
  ↓
SourceManager        [IMPLEMENTED (0.0.2-s)]
  ↓
Lexer                [IMPLEMENTED (0.0.3-s)]
  ↓
Parser               [IMPLEMENTED (0.0.3-s)]
  ↓
AST                  [IMPLEMENTED (0.0.3-s / 0.0.4-s)]
  ↓
Name Resolution      [IMPLEMENTED (0.0.4-s)]
  ↓
Type Analysis        [IMPLEMENTED (0.0.4-s)]
  ↓
Semantic Validation  [IMPLEMENTED (0.0.4-s)]
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

PHASE 1: SEED (0.0.1-s → 0.0.10-s)  ◄ [CURRENT PHASE]
  ├── 0.0.1-s: Seed Foundation (Complete)
  ├── 0.0.2-s: Repository Architecture (Complete)
  ├── 0.0.3-s: Compiler Foundation (Complete)
  ├── 0.0.4-s: Language Foundation (Complete)
  ├── 0.0.5-s: Execution Foundation (Complete)
  └── 0.0.6-s → 0.0.10-s: (Not Started)

PHASE 2: DEVELOPMENT (0.0.11-d → 0.0.30-d)
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
# Check version
./bin/seira --version
# Output: Seira 0.0.5-s

# Inspect environment and project
./bin/seira info

# Validate syntax, scoping, and types of a Seira source file
./bin/seira check examples/hello_world.sra

# Execute a validated Seira source file
./bin/seira run examples/hello_world.sra
# Output: Hello, Seira!
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