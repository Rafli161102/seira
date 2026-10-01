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

## 3. Development & Engineering Lifecycle

Seira adheres strictly to a staged technical-gate engineering model:

```text
Design  ➔  Review  ➔  Lock  ➔  Specification  ➔  Implementation  ➔  Test  ➔  Audit  ➔  Merge / Release
```

1. **Design & Review**: Features and language changes begin with architectural discussion or an official [RFC](docs/rfcs/README.md).
2. **Lock & Specification**: Once consensus is achieved, the design is formalized in architecture documents and locked. Implementation must follow locked specifications; speculative or out-of-scope additions are strictly rejected.
3. **Branch Model**: Work begins on a focused branch off `develop` (`feature/*`, `fix/*`, `docs/*`).
4. **Implementation & Scope Control**:
   - Changes must respect module boundaries (`compiler/`, `runtime/`, `std/`, `tools/`).
   - Scope creep is prohibited: only implement what is specified for the current milestone.
   - No mock or pretend implementations.
5. **Testing & Regression Expectations**:
   - Every semantic change, bug fix, or feature must include automated regression tests under `tests/`.
   - All tests must pass: `npm test` (zero failures, zero skips, sub-second execution).
   - Static type checking must be verified: `npm run typecheck` (`tsc --noEmit`).
   - CLI smoke tests must pass: `./bin/sr --version`, `./bin/sr info`, `./bin/sr check examples/hello_world.sr`.
6. **Documentation Requirements**:
   - Documentation must accurately reflect the code as it actually exists.
   - Never document planned or future features as implemented.
7. **Independent Re-Audit**: Major milestones undergo independent read-only re-audits before locking. All blocking P1 findings must be genuinely resolved before release.
8. **Pull Request & CI Verification**:
   - PR targets `develop` (or `dev-infra` for CI workflows).
   - The multi-platform CI matrix (`ubuntu-latest`, `macos-latest`, `windows-latest` across Node `22.x` and `24.x`) must pass green.
   - Maintainers squash/merge approved PRs. Release tags (`vX.Y.Z`) are cut exclusively from `main`.

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
├── examples/     # Code examples written in Seira (.sr)
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
