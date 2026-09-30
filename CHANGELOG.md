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

## [0.0.4-s] - 2026-09-30

### Added
- **Language Foundation Semantic Pipeline**:
  - Connected front-end semantic stages: `AST -> Name Resolution -> Basic Type Analysis -> Semantic Validation -> Diagnostics`.
- **Name Resolution Subsystem (`compiler/resolver/`)**:
  - Implemented lexical scope hierarchy (`global`, `module`, `function`, `block`).
  - Added deterministic symbol tables (`Scope`, `SymbolInfo`, `SymbolKind`).
  - Implemented top-level declaration hoisting for functions, structs, enums, and type aliases.
  - Implemented predictable lexical shadowing across nested scopes without accidental outer mutation.
  - Implemented duplicate declaration detection in the same lexical scope (`E2002`).
  - Implemented unresolved identifier detection (`E2001`).
  - Implemented mutability distinction: `x = value` (immutable) vs `mut x = value` (mutable), rejecting reassignment to immutable bindings (`E2003`).
- **Basic Type System & Analysis (`compiler/typecheck/`)**:
  - Established semantic type representations: primitives (`Int`, `UInt`, `Float`, `Bool`, `Char`, `String`, `Byte`, `Unit`, `Unknown`), compounds (`Option<T>`, `Result<T, E>`, `List<T>`, `Tuple`, `Function` `(P1, P2, ...) -> R`), and extensible types (`GenericParam`, `TypeAlias`, `Union`, `Custom`).
  - Implemented structural type equality (`areTypesEqual`, `isTypeAssignable`) independent of JavaScript/TypeScript object reference identity.
  - Implemented deterministic static type inference for literal values and binding expressions.
  - Implemented explicit type annotation verification, rejecting incompatible assignments with `E3001`.
  - Enforced strict Boolean conditions in `if` expressions and logical operators (`and`, `or`, `not`) with zero truthy/falsy coercion (`E3005`, `E3002`).
  - Implemented operator operand typing: arithmetic operations require matching numeric types (`E3002`); string concatenation (`+`) requires two strings; rejected arbitrary mixed-type coercions (`Int + String`, `Int + Float`).
  - Implemented comparison and equality operator typing returning `Bool`.
  - Implemented function semantic validation: parameter validation, function call argument count and type checking (`E3003`), and function return type validation for both expression and block bodies (`E3004`).
  - Implemented Option & Result foundational semantics (`Some`, `None`, `Ok`, `Err`), fallback operator (`??`), and propagation operator (`?`).
  - Implemented pipeline expression validation (`|>`) ensuring pipeline targets are callable and compatible.
- **Diagnostic Extensions**:
  - Added resolution error family `E2xxx` (`E2001`, `E2002`, `E2003`).
  - Added type error family `E3xxx` (`E3001`, `E3002`, `E3003`, `E3004`, `E3005`).
- **Test Suite Expansion**:
  - Added comprehensive unit tests in `tests/unit/resolver/` and `tests/unit/typecheck/`.
  - Added semantic driver execution tests in `tests/compiler/driver.test.ts`.
  - Added semantic fixture verification in `tests/compiler/fixtures.test.ts`.
  - Expanded test suite to 87 passing automated tests.

---

## [0.0.3-s] - 2026-09-30

### Added
- **Compiler Foundation Pipeline**:
  - Connected end-to-end pipeline: `Source -> SourceManager -> Lexer -> Tokens -> Parser -> AST -> Compiler Driver -> Diagnostics`.
- **Lexer & Token Model (`compiler/lexer/`)**:
  - Expanded lexical scanner with full token model according to locked Syntax & Symbol Bible and Operator Matrix.
  - Added scanning for literals: `Int` (decimal, hex `0x`, binary `0b`), `UInt` (`100u`), `Float` (`3.14`), `Bool` (`true`, `false`), `Char` (`'a'`, escape sequences), and `String` (`"..."`).
  - Added range operators (`..`, `..<`), compound assignments (`+=`, `-=`, `*=`, `/=`, `%=`), and expanded keyword recognition (`enum`, `const`, `mut`, `with`, `if`, `else`, `match`, `for`, `while`, `loop`, `break`, `continue`, `pub`, `priv`, `async`, `await`, `pure`, `unsafe`, `self`, `use`).
  - Guaranteed accurate source span preservation across single-line (`//`) and block (`/* ... */`) comments.
  - Enforced strict rejection of banned operators (`++`, `--`, `&&`, `||`, `null`, `===`, `!==`, `::`) with targeted diagnostics and suggestions.
- **Parser Architecture & Precedence Climbing (`compiler/parser/`)**:
  - Implemented Pratt-style precedence climbing adhering to the locked Operator Matrix (Assignment, Pipeline, Option Fallback, Or, And, Equality, Comparison, Range, Additive, Multiplicative, Unary, Postfix, Primary).
  - Implemented bare immutable bindings (`name = expr;`), mutable bindings (`mut name = expr;`), `let` statements, and `const` statements.
  - Implemented function parsing for standard block functions (`fn name(...) -> Type { ... }`) and expression-style functions (`fn name(...) => expr;`).
  - Implemented `if` expressions as both statements and first-class value expressions.
  - Implemented block expressions `{ ... }` with deterministic scoping.
  - Implemented controlled, deterministic error recovery (`synchronize()`) allowing multi-error diagnostic reporting across statements and blocks without cascade crashes.
- **AST Node Hierarchy (`compiler/ast/`)**:
  - Added AST representations for `EnumDecl`, `TypeAliasDecl`, `ConstStmt`, `BindingStmt`, `AssignStmt`, `AssignmentExpr`, `RangeExpr`, `IfExpr`, `BlockExpr`.
  - Guaranteed source span preservation across all AST node kinds.
- **Diagnostics Engine (`compiler/diagnostics/`)**:
  - Integrated diagnostics bag with compiler driver, generating formatted ASCII carets, source line snippets, hints, and suggestions.
- **Test Suite Expansion**:
  - Structured `tests/unit/` into modular directories: `lexer/`, `parser/`, `ast/`, `source/`, `diagnostics/`, `manifest/`.
  - Added fixture verification suite in `tests/compiler/fixtures.test.ts` testing `valid/`, `invalid/`, `diagnostics/`, and `programs/`.
  - Expanded test suite to 61 passing automated tests.

---

## [0.0.2-s] - 2026-09-30

### Added
- **Repository Architecture Foundation**:
  - Established formal subsystem boundaries and decoupled dependency flow (`CLI` -> `Driver` -> `Core` -> `Subsystems` -> `Backend`).
  - Documented strict architectural separation between Compiler, Runtime, Standard Library, and Developer Tooling.
- **Source Management Subsystem (`compiler/source/`)**:
  - Implemented `SourceId`, `SourceFile`, `Span`, `Position`, `LineMap`, and `SourceManager`.
  - Added deterministic $O(\log N)$ binary-search offset-to-line/column coordinate mapping.
  - Enforced zero global mutable source state; instances owned by compilation sessions.
- **Compiler Driver & Session Lifecycle (`compiler/driver/`)**:
  - Implemented `CompilerDriver` orchestrating pipeline stages: `Lex` -> `Parse` -> `Resolve` -> `Typecheck` -> `EffectCheck` -> `ResourceCheck` -> `HIR` -> `MIR` -> `Backend`.
  - Implemented `CompilerContext` managing session lifecycle: `create` -> `configure` -> `load source` -> `compile` -> `collect diagnostics` -> `finish`.
  - Implemented `CompilerConfig` supporting edition, target, profile, optimization levels, and debug flags without hidden environment state.
- **Internal Compiler Error (ICE) Boundary**:
  - Implemented `InternalCompilerError` cleanly distinguishing user code errors from compiler implementation defects.
- **AST Architecture Preparation (`compiler/ast/`)**:
  - Added prepared architectural node types for `ModuleDecl`, `ImportDecl`, `Attribute`, and `Pattern` hierarchies.
- **Intermediate Representation & Backend Contracts**:
  - Formalized `HIRProgram` and `HIRLowering` contracts in `compiler/hir/`.
  - Formalized `MIRModule`, `BasicBlock`, `MIROperation`, and `MIRResourceOp` contracts in `compiler/mir/`.
  - Formalized `BackendEmitter`, `BackendOptions`, and `BackendResult` contracts in `compiler/backend/` consuming MIR rather than raw source.
- **Runtime Boundary Formalization (`runtime/`)**:
  - Defined explicit interface boundaries for `RuntimeContext`, `MemoryService`, `ResourceManager`, `PanicService`, `TaskService`, and `HostAdapter`.
- **Test Architecture Reorganization (`tests/`)**:
  - Structured test suite into `unit/`, `integration/`, `compiler/`, `diagnostics/`, `runtime/`, and `conformance/`.
  - Established `tests/fixtures/` with `valid/`, `invalid/`, `diagnostics/`, and `programs/` fixture suites.
  - Added dedicated unit tests for source management and compiler driver, expanding suite to 43 passing tests.
- **Architecture Documentation**:
  - Added dedicated specifications in `docs/architecture/` (`repository.md`, `compiler.md`, `source-management.md`, `diagnostics.md`, `testing.md`, `runtime-boundary.md`, `backend-boundary.md`).

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
