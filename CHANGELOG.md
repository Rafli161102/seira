# Changelog

All notable changes to the Seira programming language will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to the Seira Staged Versioning Model:
- **Seed Series**: `0.0.1-s` through `0.0.10-s`
- **Development Series**: `0.0.11-d` through `0.0.30-d`
- **Alpha Series**: `0.1.0-alpha.1` through `0.1.0-alpha.10`
- **Beta Series**: `0.1.0-beta.1` through `0.1.0-beta.10`
- **Release Candidates**: `0.1.0-rc.1` ...
- **Stable**: `1.0.0`

---

## [0.0.1-s] - 2026-09-30

### Added
- **Repository Architecture**: Established official open-source foundation with modular directories (`compiler/`, `runtime/`, `std/`, `tools/`, `tests/`, `examples/`, `docs/`).
- **Governance & Contribution**: Added `CONTRIBUTING.md`, `GOVERNANCE.md`, `CODE_OF_CONDUCT.md`, and `SECURITY.md`.
- **Git Branch Strategy**: Formalized 3 permanent branches (`main`, `develop`, `dev-infra`) and temporary branch naming rules.
- **RFC Process**: Established RFC directory structure, guidelines, and proposal template (`docs/rfcs/template.md`).
- **Documentation Foundation**: Added comprehensive documentation for language overview, architecture, compiler pipeline, runtime model, standard library layout, and development setup.
- **Project Manifest**: Defined `Seira.toml` manifest specification and implemented parser/validator foundation.
- **CLI Foundation (`seira`)**:
  - Implemented `seira --version` / `seira version` (identifying `Seira 0.0.1-s`).
  - Implemented `seira --help` with categorized commands (implemented vs reserved).
  - Implemented `seira info` showing runtime environment, toolchain details, and project status.
  - Implemented `seira check <file.sra>` for validating source syntax via Seed lexer/parser.
  - Implemented `seira init` and `seira new` for bootstrapping new Seira projects.
  - Reserved command skeletons (`build`, `run`, `test`, `fmt`, `doc`, `clean`, `cache`, `add`, `remove`, `update`, `fetch`) with clear diagnostic notices.
- **Compiler Skeleton**:
  - **Lexer**: Tokenization of Seira keywords (`fn`, `mut`, `with`, `and`, `or`, `not`, etc.), symbols (`=`, `:`, `->`, `=>`, `.`, `|>`, `?`, `?.`, `??`, `!`, `@`, `...`), identifiers, integer/floating-point literals, string literals, comments.
  - **Parser**: Recursive descent parser supporting function declarations, parameter lists, return types, blocks, statements, expressions, pipeline chains (`|>`), call expressions, and member access.
  - **AST**: Strongly-typed Abstract Syntax Tree node definitions.
  - **Diagnostics**: Source-span tracking with formatted errors, line/column coordinates, and error codes.
  - **Module Skeletons**: Architectural contracts and documented interfaces for `resolver`, `typecheck`, `hir`, `mir`, and `backend`.
- **Runtime Skeleton**:
  - Value model architecture and tag representation.
  - Memory scope model for deterministic resource cleanup (`with`).
  - Effect runtime interfaces and async scheduler foundation.
- **Testing Foundation**:
  - Automated test suite covering lexer, parser, diagnostics, manifest, and CLI.
  - Conformance test harness foundation for future multi-backend verification.
- **CI/CD Foundation**: GitHub Actions workflow testing build, type-checking, test suite, and repository invariants.
- **Language Example**: Added `examples/hello_world.sra` illustrating locked Seira syntax.
