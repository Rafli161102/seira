# Seira Programming Language

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Release: 0.0.1-s](https://img.shields.io/badge/Release-0.0.1--s%20Seed-green.svg)](CHANGELOG.md)
[![Status: Seed Foundation](https://img.shields.io/badge/Status-Seed%20Foundation-orange.svg)](#status)

> **Simple to write. Predictable to run.**  
> *Write less. Control more.*

**Seira** is an open-source programming language. The long-term goal of the project is:
> *A fast, modern, predictable, and secure programming language for native and WebAssembly software.*

> [!IMPORTANT]
> **Current Status: Seed (0.0.1-s)**  
> Seira is in its earliest seed stage. **Alpha is not released yet.**  
> Seira is under active development and is **not production-ready**. In this Seed release, the project provides foundational architecture, documentation, project manifest support, a minimal CLI, a Seed lexer/parser, and diagnostic foundations. Direct native compilation and full execution will arrive during the Alpha series.

---

## 1. Core Language Identity

Seira is built upon three foundational axioms:

```
«Everything is a Value.
Programs are Transformations.
The outside world is an Effect.»
```

### Core Principles

1. **Concise**: High signal-to-noise ratio syntax without boilerplate.
2. **Predictable**: No hidden control flow, no implicit coercions, deterministic execution.
3. **Composable**: Functions and transformations form the backbone of application logic.
4. **Efficient**: Zero-cost abstractions, zero runtime overhead for unused features, performance-first design.
5. **Explicit Effects**: Side effects are typed and tracked (`!`), keeping pure code truly pure.
6. **Progressive Control**: Start high-level and safe; dive down to granular memory and resource control when needed.

---

## 2. Locked Language Foundations

The following design decisions are architectural constraints locked in the Seira specification:

- **Static & Strong Typing**: Aggressive type inference ensures safety with minimal ceremony.
- **Values by Default**: Values are immutable by default; mutation is explicitly declared with `mut`.
- **First-Class Functions**: Functions are values that compose seamlessly via pipelines (`|>`).
- **Data Modeling**: Structs, algebraic enums, `Option<T>`, and `Result<T, E>`.
- **No Null**: Null pointers and `null`/`undefined` values do not exist.
- **Resource Lifecycle**: Deterministic resource management using `with` blocks.
- **Explicit Effects**: Effectful functions and operations are declared with `!` notation.
- **No Implicit Operators**: No ternary `?:`, no `++`/`--`. Boolean logic uses readable `and`, `or`, `not`.
- **Target Backends**: Native code generation and WebAssembly (Wasm).

---

## 3. Project Identity

| Attribute | Specification |
| :--- | :--- |
| **Language Name** | Seira |
| **Source Extension** | `.sra` |
| **Official CLI** | `seira` |
| **Current Version** | `0.0.1-s` (*Seed Foundation*) |
| **License** | [MIT License](LICENSE) |
| **Target Backends** | Native (LLVM) & WebAssembly (Wasm) |

---

## 4. Current Status: Release 0.0.1-s (Seed Foundation)

Seira follows a staged release model:

```
Seed Series (0.0.1-s ... 0.0.10-s)
  ↓
Development Series (0.0.11-d ... 0.0.30-d)
  ↓
Alpha Series (0.1.0-alpha.1 ... 0.1.0-alpha.10)
  ↓
Beta Series (0.1.0-beta.1 ... 0.1.0-beta.10)
  ↓
Release Candidates (0.1.0-rc.1 ...)
  ↓
Stable 1.0.0
```

### What is implemented in `0.0.1-s`:
- [x] Official repository architecture and 3 permanent branches (`main`, `develop`, `dev-infra`).
- [x] Contributor documentation, governance model, and RFC process.
- [x] Project manifest format (`Seira.toml`) parsing and validation.
- [x] Official CLI (`seira`) with `--version`, `--help`, `info`, and `check` commands.
- [x] Compiler pipeline skeleton (`lexer`, `parser`, `ast`, `diagnostics`).
- [x] Lexer for Seira tokens (keywords, symbols `|>`, `??`, `?`, `!`, `@`, literals, comments).
- [x] Minimal parser for function definitions, statements, and expressions.
- [x] Diagnostics engine with source spans and formatted error reporting.
- [x] Runtime architecture skeleton (value model, memory/resource scopes, effect interfaces, context, panic, services, host adapter).
- [x] Automated test suite across lexer, parser, diagnostics, manifest, runtime, and CLI.

### What is reserved / planned for future releases:
- Full LLVM native code generator and WebAssembly emission backend.
- Type checker, trait solver, and effect verification engine.
- Complete standard library (`std/core`, `std/collections`, `std/io`, `std/fs`, `std/net`, `std/time`, etc.).
- Runtime execution engine and async task scheduler.
- Package manager network registry and dependency resolution.

---

## 5. Quick Start

### Prerequisites
- Node.js `v22+` (Node `v26` recommended)

### Clone & Setup
```bash
git clone https://github.com/Rafli161102/seira.git
cd seira
npm install  # installs dev tools for typechecking and linting
```

### Running the CLI
```bash
# Check version
./bin/seira --version
# Output: Seira 0.0.1-s

# Inspect environment and project
./bin/seira info

# Check syntax of a Seira source file
./bin/seira check examples/hello_world.sra
```

### Running Tests
```bash
npm test
```

---

## 6. Syntax Preview (`.sra`)

```sra
// examples/hello_world.sra
// Seira Language Seed Example

fn main() {
    println("Hello, Seira!")
}
```

```sra
// Functional transformation with pipelines and Option fallback
fn compute_score(input: Option<Int>) -> Int {
    input
        ?? 0
        |> double
        |> add_bonus(10)
}
```

*(Note: In 0.0.1-s, syntax is validated by `seira check`. Executable code generation is planned for the Alpha series).*

---

## 7. Architecture & Documentation

- [Architecture Overview](docs/architecture/overview.md)
- [Language Specification](docs/language/overview.md)
- [Compiler Architecture](docs/compiler/overview.md)
- [Runtime Architecture](docs/runtime/overview.md)
- [Standard Library Layout](docs/standard-library/overview.md)
- [RFC Process & Templates](docs/rfcs/README.md)
- [Development Setup & Guidelines](docs/contributing/development-setup.md)

---

## 8. Contributing & Governance

We welcome community participation! Please read:
- [CONTRIBUTING.md](CONTRIBUTING.md) for branch strategy, PR guidelines, and coding standards.
- [GOVERNANCE.md](GOVERNANCE.md) for the project decision-making model.
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community standards.
- [SECURITY.md](SECURITY.md) for responsible vulnerability reporting.

---

## 9. License

Seira is open-source software licensed under the [MIT License](LICENSE).