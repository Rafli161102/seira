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

## [0.0.7-s] - 2026-09-30

### Added
- **Generic Types & Functions**:
  - Generic parameters on types and structs: `type Box<T> { value: T }`. Generic parameters exist strictly in type context; unknown generic parameter emits `E2001`, duplicate parameter emits `E4001`, and treating a generic parameter as a runtime value emits `E2001`.
  - Generic functions: `fn identity<T>(value: T) -> T { value }`. Generic parameter scope is strictly lexical to the function declaration.
  - Bidirectional generic argument inference (`unifyTypes`): infers type arguments from arguments (e.g. `identity(10)` -> `T = Int`).
  - Explicit generic invocation: `identity<Int>(10)` supported with safe parser lookahead without ambiguity with `<` comparison. Explicit argument count mismatch emits `E4001`.
  - Generic inference failure detection: functions with uninferred generic parameters produce structured diagnostic `E4002`.
- **Type Aliases**:
  - `type UserId = Int`: Transparent structural type equivalence (`UserId ≡ Int`). Does not introduce nominal newtype semantics.
- **Union Types**:
  - `type ID = Int | String`: Discriminated union maintaining a finite set of variants.
  - Static safety: Operations must be valid across all union variants; invalid operations produce structured diagnostic `E3002`.
  - Seamless integration with existing pattern matching (`match`).
- **Function Types & Contextual Lambda Typing**:
  - First-class function type syntax and semantics: `(Int) -> Int`, `(String, Int) -> Bool`.
  - Parameter contravariance and return covariance compatibility checking.
  - Higher-order generic functions: `fn apply<T, R>(f: (T) -> R, value: T) -> R { f(value) }`.
  - Contextual lambda parameter typing: unannotated lambda parameters infer types from contextual function types (e.g. `apply(x => x * 2, 10)` infers `x: Int`).
- **Option<T> & Result<T, E> Generic Integration**:
  - Generic `Option<T>` (`Some(T)` and contextually-typed `None`).
  - Generic `Result<T, E>` (`Ok(T)` and `Err(E)`). Validates both value and error parameters statically.
  - Propagation (`?`) and fallback (`??`) compose cleanly with generic instantiations.
- **Trait Foundation & Static Resolution**:
  - Trait declarations: `trait Printable { fn print() }` defining compile-time contracts.
  - Trait implementations: `impl Target: Trait { fn method() { ... } }` checked statically.
  - Missing trait method raises `E4004`.
  - Trait method signature mismatch raises `E4006`.
  - Duplicate trait implementations for the same Type + Trait pair rejected with `E4005`.
  - Trait constraints: `<T: Printable>` validated statically at call sites; unsatisfied constraints emit `E4003`.
  - Static trait dispatch: resolved deterministically at compile time. Zero runtime dynamic dispatch, vtables, or `dyn Trait`.
- **Pipeline Generic Typing**:
  - Piped expressions (`value |> identity`) infer generic arguments directly from the piped input expression.
- **Diagnostic Extensions (E4xxx Family)**:
  - `E4001`: Duplicate generic parameter / Generic argument count mismatch.
  - `E4002`: Generic inference failure.
  - `E4003`: Trait constraint not satisfied.
  - `E4004`: Trait not found / missing required trait method.
  - `E4005`: Duplicate trait implementation.
  - `E4006`: Trait method signature mismatch.
- **Testing**:
  - Added `tests/unit/typecheck/generics.test.ts` (36 test cases) covering all positive and negative generic, alias, union, function type, and trait semantics.
  - Total test suite expanded to 232 tests with 100% pass rate.

---

## [0.0.6-s] - 2026-09-30

### Added
- **Structured Control Flow**:
  - `if` / `if ... else`: Expression-oriented branching producing compatible values. Strict `Bool` condition required (`E3005`).
  - `while <cond> { ... }`: Evaluates strictly `Bool` condition, executing body deterministically.
  - `for <item> in <collection> { ... }`: Iterable over `List` and `Set` collections. Rejects non-iterable types with `E3007`. Scopes loop variable within iteration body.
  - `loop { ... }`: Unconditional explicit repetition without implicit termination.
  - `break`: Exits the innermost loop. Strictly rejected outside loops during name resolution with structured diagnostic `E2004`.
  - `continue`: Skips remainder of current iteration to next iteration. Strictly rejected outside loops during name resolution with structured diagnostic `E2004`.
  - Nested loops, blocks, and early returns (`return`, `?`) compose cleanly with control flow.
- **Pattern Matching Subsystem (`compiler/ast/`, `compiler/typecheck/`, `runtime/execution/`)**:
  - Executable `match <expr> { ... }` expressions producing values with strict left-to-right arm evaluation.
  - Supported pattern models:
    - Literal patterns: `0 => ...`, `"text" => ...`, `true => ...`
    - Wildcard pattern: `_ => ...`
    - Binding patterns: `x => ...` (receives matched value bound in arm scope)
    - Option patterns: `Some(x) => ...`, `None => ...`
    - Result patterns: `Ok(x) => ...`, `Err(e) => ...`
  - Pattern type compatibility checking: Invalid pattern kinds for the scrutinee type produce `E5002`.
  - Static exhaustiveness validation: Non-exhaustive matches (e.g. missing `None`, `Err`, or wildcard fallback) produce `E5001`.
  - Arm value type compatibility: Incompatible branch/arm types produce `E3001`.
- **Collections & Safe Indexing**:
  - `List<T>`: Homogeneous indexed sequence (`[1, 2, 3]`). Enforces type homogeneity on initialization (`E3001`). Safe indexing (`list[index]`) returns `Option<T>` (`Some(val)` for valid index, `None` for out-of-range index; zero runtime panic or JS `undefined`).
  - `Tuple`: Heterogeneous fixed-arity product type (`(1, "two", true)`). Positional numeric member access (`t.0`, `t.1`) statically validated against tuple arity (`E3006`).
  - `Map<K, V>`: Key-value associative collection (`{"a": 1, "b": 2}`). Index lookup (`map[key]`) returns `Option<V>` (`Some(val)` or `None`; zero runtime panic or JS `undefined`).
  - `Set<T>`: Unordered unique collection (`set[1, 2, 3]`). Operations: `.contains(item)` -> `Bool`, `.insert(item)` -> `Unit`, `.remove(item)` -> `Unit`, `.length` -> `Int`.
  - Structural value equality: `==` compares collections element-by-element by value, never by JS reference identity.
  - Immutable by default; mutable updates require explicit `mut` bindings.
- **Functions, Lambdas, Closures & Higher-Order Functions**:
  - First-class lambda expressions: `x => expr`, `(a, b) => expr`, and block lambdas `{ ... }`.
  - Lexical closures: Lambdas capture lexical bindings from enclosing scopes without mutating outer bindings or leaking JS closure state.
  - Higher-order functions: Functions can be passed as arguments, returned from other functions, stored in variables, and invoked through runtime function values.
- **Option & Result Integration**:
  - Integrated `Some`, `None`, `Ok`, `Err` with pattern matching, indexing, fallback operator (`??`), and propagation operator (`?`).
  - `?` operator immediately propagates `None` or `Err` across expressions, block statements, and variable bindings.
- **Pipeline Composition**:
  - Preserved and verified pipeline expressions `data |> f` and `data |> f(extra)`.
  - Full support for pipelines with function values and lambdas: `data |> (x => x * 2)`, `data |> double`.
- **Diagnostic Extensions**:
  - `E2004`: `break` or `continue` outside loop statement.
  - `E3006`: Tuple index out of bounds or invalid member access.
  - `E3007`: Target of `for` loop is not an iterable collection (`List` or `Set`).
  - `E5001`: Non-exhaustive pattern matching in `match` expression.
  - `E5002`: Pattern kind is invalid for the matched expression type.
- **Testing**:
  - Added `tests/unit/execution/data_control.test.ts` covering all control flow, pattern matching, collections, safe indexing, closures, higher-order functions, and negative diagnostic paths.
  - Total test suite expanded to 196 tests with 100% pass rate.

---

## [0.0.5-s] - 2026-09-30

### Added
- **Execution Foundation Pipeline (`runtime/execution/`)**:
  - Connected execution pipeline: `Source -> Compiler (Frontend Check) -> Validated AST -> Tree-Walking Evaluator -> RuntimeOutcome`.
  - Architecture deliberately employs tree-walking AST evaluation for 0.0.5-s to establish observable language semantics without premature backend coupling.
- **Seira Value Model v0.1 (`runtime/execution/values.ts`)**:
  - Implemented explicit runtime representations: `Int` (arbitrary-precision BigInt), `UInt`, `Float` (IEEE 754 double), `Bool` (strict true/false, no JS truthiness), `Char`, `String`, `Byte`, `Unit` (`()`), `Option<T>` (`Some`/`None`), `Result<T, E>` (`Ok`/`Err`), `List<T>`, `Function` (closure environment), and `Builtin`.
  - Implemented structural runtime equality (`runtimeValuesEqual`) independent of JavaScript object references.
  - Implemented Seira-idiomatic value formatting (`formatRuntimeValue`).
- **Runtime Outcomes & Panics (`runtime/execution/outcomes.ts`)**:
  - Defined explicit outcome categories: `NormalOutcome`, `ReturnOutcome` (function returns), and `PanicOutcome` (fatal runtime errors).
  - Implemented dedicated runtime diagnostic namespace `R0xxx` (preserving `E5xxx` for Pattern Matching):
    - `R0001`: Division by zero.
    - `R0002`: Unsupported runtime operation.
    - `R0003`: Internal execution state error.
    - `R0004`: Call stack depth exceeded (configurable stack depth limit safeguard).
    - `R0005`: Unsigned integer underflow (`a - b` where `a < b` panics; does not clamp to 0u, wrap, or produce negative UInt).
- **Tree-Walking Evaluator (`runtime/execution/evaluator.ts`)**:
  - Scoped runtime environments (`RuntimeEnvironment`) preserving lexical closure bindings.
  - Top-level function hoisting allowing mutual and forward recursion.
  - Application entry convention: `fn main()` is used as the application entry point when present. Top-level statements are not executed as an additional program body when `main()` is present (preventing dual execution). When `main()` is absent, top-level statements execute normally as scripts. `main` is an application entry convention, not a language keyword or mandatory requirement.
  - Left-to-right deterministic operand evaluation order.
  - Short-circuiting logical operations (`and`, `or`) requiring strict `Bool` operands.
  - Pipeline operator evaluation: `data |> f` ≡ `f(data)`, `data |> f(extra)` ≡ `f(data, extra)`, and chained pipelines.
  - Option fallback operator (`??`) and early propagation operator (`?`).
  - Expression-oriented block semantics where trailing expression statements yield block values.
  - Built-in host I/O primitives: `println`, `print` (full effect system enforcement deferred to Phase 2).
  - Built-in constructors: `Some`, `None`, `Ok`, `Err`.
  - Resource compatibility: `open_resource` and `with` blocks are maintained as Seed-series compatibility mock stubs (production RAII/ownership deferred to Phase 2).
- **Unified Execution Engine Interface (`runtime/execution/engine.ts`)**:
  - `ExecutionEngine.executeSource(source, filePath, config)`: runs source with front-end validation.
  - `ExecutionEngine.executeFile(filePath, config)`: runs file from disk with front-end validation.
  - Returns `ExecutionResult` containing success status, final value, captured output, and diagnostics.
- **Developer Tooling — `seira run` Command (`tools/cli/commands/run.ts`)**:
  - Added `seira run <file.sra>` to CLI: compiles through typechecking and executes the program.
  - Preserves compilation guard: syntax/type errors prevent execution and display formatted compiler diagnostics.
- **Comprehensive Test Suite (`tests/unit/execution/`)**:
  - Added 69 execution unit and integration tests covering value models, environments, arithmetic, UInt underflow, control flow, pipelines, options, entry conventions, and error panics.
  - Updated CLI integration tests with end-to-end `seira run` validation.
  - Test suite now includes 159 automated tests with 100% passing rate.

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
