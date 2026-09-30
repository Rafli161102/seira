# Contributing to Seira

Thank you for your interest in contributing to the **Seira** programming language project!

Seira is designed around the philosophy:
> **Simple to write. Predictable to run.**  
> *Simple to contribute. Predictable to evolve.*

To maintain high code quality and architectural integrity, all contributors are expected to follow these guidelines.

---

## 1. Code of Conduct

All contributors and maintainers are expected to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). Please read it before participating in discussions or submitting work.

---

## 2. Git Branch Strategy

The Seira repository enforces a structured Git branching strategy.

### Permanent Branches

The repository has **exactly three permanent branches**:

| Branch | Purpose | Rules |
| :--- | :--- | :--- |
| `main` | Stable source of truth, official releases, release tags (`vX.Y.Z`). | No direct commits. Changes only merge via Pull Request from `develop` or `release/*`. CI must be green. |
| `develop` | Active development integration branch. Where compiler, runtime, stdlib, tooling, tests, and documentation converge. | PR required. CI must be green. |
| `dev-infra` | CI/CD, GitHub Actions, build infrastructure, release automation, and developer tooling. | Changes merged via PR. |

> **Note**: Do **NOT** create permanent branches such as `compiler`, `runtime`, `stdlib`, `wasm`, `llvm`, `security`, or `docs`. Those represent architectural modules within the codebase, not Git branches.

### Temporary Branches

All development takes place on short-lived temporary branches branched off `develop` (or `main` in the case of critical hotfixes):

| Branch Pattern | Usage | Example |
| :--- | :--- | :--- |
| `feature/*` | New features or extensions | `feature/parser-foundation` |
| `fix/*` | Bug fixes | `fix/cli-version-flag` |
| `docs/*` | Documentation updates | `docs/contributing-guide` |
| `refactor/*` | Code improvements without semantic changes | `refactor/project-layout` |
| `release/*` | Release preparation and stabilization | `release/0.0.1-s` |
| `hotfix/*` | Critical fixes targeted at `main` | `hotfix/security-parser-overflow` |

Temporary branches must be deleted upon merging into `develop` or `main`.

---

## 3. Contribution Workflow

1. **Find or Open an Issue**: Check existing issues before starting. For major features or changes to locked language semantics, an [RFC](docs/rfcs/README.md) is required first.
2. **Fork and Branch**:
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/your-feature-name
   ```
3. **Develop with Tests**:
   - Write clear, idiomatic code adhering to module boundaries.
   - Add automated tests under `tests/` for all new behavior.
   - Run existing tests: `npm test`.
4. **Commit Hygiene**:
   - Use conventional commit messages: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`.
   - Keep commits focused and atomic.
5. **Open a Pull Request**:
   - Target the `develop` branch (or `dev-infra` for CI workflows).
   - Fill out the [Pull Request Template](.github/PULL_REQUEST_TEMPLATE.md).
   - Ensure all CI checks pass.
6. **Code Review**:
   - Address feedback from project maintainers and reviewers.
   - Maintainers will squash/merge once approvals are granted.

---

## 4. Codebase Organization & Architectural Boundaries

Maintain strict separation of concerns across our modules:

```
seira/
├── compiler/     # Lexer, parser, AST, diagnostics, typechecker, IR, code generator
├── runtime/      # Execution engine, memory models, deterministic cleanup, effects
├── std/          # Standard library specifications and implementation
├── tools/        # CLI, package manifest tooling, developer utilities
├── tests/        # Automated tests (unit, integration, conformance)
├── examples/     # Code examples written in Seira (.sra)
└── docs/         # Architecture, language, and process documentation
```

### Architectural Boundaries to Respect:
- **Compiler ≠ Runtime**: The compiler analyzes and transforms code; the runtime manages execution, values, and memory.
- **Compiler ≠ Package Manager**: Package manifest resolution is handled in tooling, not inside the core compiler pipeline.
- **Runtime ≠ Language Semantics**: Language semantics define the meaning of syntax; the runtime implements the operational behavior.
- **Standard Library ≠ Core Language**: Primitive semantics belong to the language; reusable utilities belong in `std/`.
- **Module ≠ Package**: A module is a single namespace/file compilation unit; a package is a distributable unit defined by `Seira.toml`.

---

## 5. Coding Standards & Implementation Discipline

- **No Fake Implementations**: Do not build mock or pretend functionality and claim it works. Unimplemented features must explicitly raise a diagnostic error indicating they are reserved.
- **Test Every Behavior**: Every bug fix, parser rule, and CLI command must have corresponding automated tests in `tests/`.
- **Documentation and Code Agreement**: Keep documentation in sync with actual code. Never document planned features as already implemented.
- **TypeScript & Tooling**: Keep types strict and avoid using `any`.

---

## 6. RFC Requirement for Major Changes

Seira enforces an RFC (Request for Comments) process for:
- Syntax or grammar modifications
- Type system or inference changes
- Ownership and resource lifecycle changes
- Effect system primitives
- Standard library contracts
- Breaking changes

Read [RFC Process](docs/rfcs/README.md) to propose significant changes.
Trivial bug fixes and documentation improvements do not require an RFC.
