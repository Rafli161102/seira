# Seira Compiler Architecture Specification

| Field | Value |
|---|---|
| Specification | Seira 0.0.10-s Compiler Architecture |
| Target Milestone | 0.0.10-s (Seed Series) |
| Architecture Status | **Implemented & Locked** |

---

## 1. Executive Summary

The Seira 0.0.10-s milestone completes the Seed Series front-end compiler pipeline, module system, and standard library I/O boundary. Building upon the syntactic, semantic, module, and contract foundations, the compiler connects the full pipeline end-to-end:

```text
Source Text (.sr)
    ↓
SourceManager & LineMap (SourceId, Spans, Positions)
    ↓
Module System (Discovery, PackageGraph, Seira.toml, Seira.lock, Workspace)
    ↓
Lexer (Left-to-Right scanning, Token stream, Source spans, Unicode code points)
    ↓
Tokens (Keywords, Literals, Operators, Delimiters)
    ↓
Parser (Pratt precedence climbing, Error recovery)
    ↓
AST (Source-aware strongly typed node hierarchy, visibility markers)
    ↓
Name Resolution (Lexical scopes, Symbol binding, Shadowing, Canonical Builtin Traits, Imports, Visibility)
    ↓
Type Analysis & Validation (Static inference, Structural equality, Generics, Traits, Resource checking, No coercions)
    ↓
Semantic Validation (Strict Boolean conditionals, Calls, Returns, Mutability, Option/Result, Pipeline, with statements)
    ↓
Compiler Driver & Diagnostics (Structured errors, Source pointers, Code hints, ICE boundary)
```

In accordance with the 0.0.10-s scope rules, the compiler implements real name resolution, static type validation, module isolation, canonical trait validation, and deterministic resource checking, while preserving clear architectural boundaries for downstream subsystems (`hir`, `mir`, `backend`, full borrow checker, full algebraic effect solver).

---

## 2. Compiler Subsystem Architecture

The Seira compiler is organized into decoupled modules under `compiler/`:

```text
compiler/
├── source/          # SourceManager, SourceFile, Span, Position, LineMap [IMPLEMENTED]
├── lexer/           # Lexical scanner, Token stream, Symbol table [IMPLEMENTED]
├── parser/          # Pratt precedence parser, Error recovery [IMPLEMENTED]
├── ast/             # Abstract Syntax Tree node hierarchy [IMPLEMENTED]
├── module/          # Module discovery, PackageGraph, Lockfile, Workspace [IMPLEMENTED]
├── diagnostics/     # Diagnostics engine, Formatter, ICE [IMPLEMENTED]
├── driver/          # Pipeline orchestrator, CompilerContext [IMPLEMENTED]
├── resolver/        # Lexical scoping, Symbol resolution, Shadowing, Visibility [IMPLEMENTED]
├── typecheck/       # Static type inference, Semantic validator, Cross-module types [IMPLEMENTED]
├── hir/             # High-Level IR [ARCHITECTURAL SKELETON — DEFERRED]
├── mir/             # Mid-Level IR & CFG [ARCHITECTURAL SKELETON — DEFERRED]
└── backend/         # Native LLVM & Wasm emitters [ARCHITECTURAL SKELETON — DEFERRED]
```

---

## 3. Subsystem Implementation Status

| Subsystem | Status | Milestone | Implementation Description |
|---|---|---|---|
| `source/` | **IMPLEMENTED** | 0.0.2-s | `SourceManager`, `LineMap` (binary search offset-to-line), `Span` tracking |
| `lexer/` | **IMPLEMENTED** | 0.0.3-s – 0.0.10-s | Left-to-right lexical scanner with full token model, literals, compound operators, banned token rejection, and Unicode scalar code point support |
| `parser/` | **IMPLEMENTED** | 0.0.3-s / 0.0.8-s | Pratt precedence climbing parser, `pub` modifier, `use`, `import`, aliases, dotted type paths, error recovery |
| `ast/` | **IMPLEMENTED** | 0.0.3-s / 0.0.8-s | Source-aware AST preserving exact spans on all nodes, `UseDecl`, and `isPublic` visibility markers |
| `module/` | **IMPLEMENTED** | 0.0.8-s | Filesystem-as-module-map, deterministic module discovery, `Seira.toml` parser, SHA-256 `Seira.lock`, `ModuleGraph`, `PackageGraph`, `WorkspaceLoader`, cycle detection (`E6008`, `E6012`) |
| `diagnostics/` | **IMPLEMENTED** | 0.0.1-s – 0.0.10-s | Structured diagnostic bags with `E1xxx`–`E9xxx` error families and runtime panics `R0xxx` |
| `driver/` | **IMPLEMENTED** | 0.0.3-s / 0.0.8-s | `CompilerDriver`, single-file compilation, and multi-module package compilation (`compilePackage`) |
| `resolver/` | **IMPLEMENTED** | 0.0.4-s – 0.0.10-s | Lexical scope hierarchy, cross-module symbol resolution, module import, aliases, visibility, and canonical built-in trait registry (`BUILTIN_TRAIT_MAP`) |
| `typecheck/` | **IMPLEMENTED** | 0.0.4-s – 0.0.10-s | Static type inference, generics, trait contracts, resource validation for `with` statements, known built-in method lookup diagnostics, Unit/() equivalence, and Option/Result covariance |
| `hir/` | **ARCHITECTURAL SKELETON** | Planned (0.0.11-d) | Contracts for `HIRProgram`, `HIRModule`, `HIRFunction`, `HIRBlock` |
| `mir/` | **ARCHITECTURAL SKELETON** | Planned (0.0.11-d) | Contracts for `MIRModule`, `BasicBlock`, `MIROperation`, `MIRResourceOp` |
| `backend/` | **ARCHITECTURAL SKELETON** | Reserved (0.1.0-alpha) | Contracts for `BackendEmitter`, `BackendOptions`, `BackendResult` |

---

## 4. Name Resolution & Scope Model

### 4.1 Lexical Scope Hierarchy
The resolver implements a strict lexical scope hierarchy:
- **Global Scope**: Built-in types (`Int`, `UInt`, `Float`, `Bool`, `Char`, `String`, `Byte`, `Unit`, `Option`, `Result`, `List`), built-in I/O (`println`, `print`), and built-in constructors (`Some`, `None`, `Ok`, `Err`, `open_resource`).
- **Module Scope**: Top-level function, struct, enum, and type alias declarations.
- **Function Scope**: Parameters and local bindings within a function.
- **Block Scope**: Block-level statements, `with` statements, and branch bodies.

### 4.2 Two-Pass Resolution & Declaration Hoisting
1. **Pass 1 (Hoisting)**: Discovers all top-level functions, structs, enums, and type aliases in the file before traversing bodies. Enables forward references where function `A` calls function `B` declared later in the source text.
2. **Pass 2 (Traversal)**: Recursively traverses statements and expressions, pushing and popping lexical scopes.

### 4.3 Predictable Lexical Shadowing
An inner lexical scope may declare a variable with the same name as an outer scope variable without error:
```sr
x = 10;
if true {
    x = 20; // Shadows outer x within block scope
    y = x;  // Resolves to inner x (20)
}
z = x;      // Resolves to outer x (10)
```
Shadowing introduces a distinct symbol in the inner scope; it does NOT mutate the outer variable.

### 4.4 Duplicate Declaration Rejection (E2002)
Declaring the same name twice in the *same* lexical scope is prohibited:
```sr
let val = 10;
let val = 20; // error[E2002]: Duplicate binding 'val' in the same scope.
```

### 4.5 Mutability & Reassignment Checking (E2003)
Seira bindings are immutable by default:
- `mut x = value`: Declares a mutable variable. Reassignment `x = new_value` is permitted if type-compatible.
- `x = value`: Declares an immutable variable. Reassignment `x = new_value` in the same scope produces `E2003`:
```sr
count = 0;
count = 1; // error[E2003]: Cannot assign to immutable variable 'count'.
```

---

## 5. Type System Foundation & Semantic Validation

### 5.1 Deterministic Type Representation
Types in Seira are represented semantically and compared via structural equality (`areTypesEqual`), completely independent of JavaScript/TypeScript object reference identity:
- **Primitives**: `Int`, `UInt`, `Float`, `Bool`, `Char`, `String`, `Byte`, `Unit`, `Unknown`.
- **Compounds**: `Option<T>`, `Result<T, E>`, `List<T>`, `Tuple (T1, T2, ...)`, `Function (P1, P2, ...) -> R`.
- **Extensible**: `GenericParam`, `TypeAlias`, `Union`, `Custom`.

### 5.2 Static Type Inference
Type inference operates deterministically without implicit guessing:
- `x = 42` $\to$ `Int`
- `u = 42u` $\to$ `UInt`
- `f = 3.14` $\to$ `Float`
- `b = true` $\to$ `Bool`
- `c = 'z'` $\to$ `Char`
- `s = "Seira"` $\to$ `String`

### 5.3 Explicit Type Annotations & Type Compatibility (E3001)
Variable declarations may specify an explicit type:
```sr
age: Int = 23;
```
If the initializer expression cannot be assigned to the declared type, the compiler raises `E3001`:
```sr
age: Int = "hello"; // error[E3001]: Type mismatch: expected 'Int', but found 'String'.
```

### 5.4 Zero Implicit Coercions
Seira strictly forbids implicit type coercion. No implicit numeric widening, no numeric-to-string coercion:
```sr
x = 10 + "hello"; // error[E3002]: Invalid operands for arithmetic operator '+': 'Int' and 'String'.
y = 10 + 3.14;    // error[E3002]: Invalid operands for arithmetic operator '+': 'Int' and 'Float'.
```
String concatenation using `+` requires both operands to be `String`.

### 5.5 Strict Boolean Semantics — Zero Truthy / Falsy Coercion (E3005)
Conditions in `if` expressions and operands to logical operators (`and`, `or`, `not`) MUST evaluate to `Bool`:
```sr
if 1 { ... }       // error[E3005]: If condition must be of type Bool, but found 'Int'.
if "hello" { ... } // error[E3005]: If condition must be of type Bool, but found 'String'.
not 10;            // error[E3002]: Operator 'not' requires a Bool operand, but found 'Int'.
```
JavaScript-style truthiness is strictly forbidden.

### 5.6 Function Semantics & Call Validation
- **Callable Verification**: Validates that target is a callable function.
- **Argument Count**: Calling a function with too few or too many arguments produces `E3003`.
- **Argument Types**: Validates that each argument matches the parameter type (`E3003`).
- **Return Type Validation**: Validates that explicit return statements and trailing expressions evaluate to the declared return type (`E3004`).

### 5.7 Option & Result Foundations
- `Some(value)` constructs `Option<T>`.
- `None` represents absence of value (`Option<Unknown>`). There is NO `null` value in Seira.
- `Ok(value)` and `Err(error)` construct `Result<T, E>`. Result is a value, not an exception.
- Fallback `opt ?? default`: verifies `default` is type-compatible with `opt`'s inner type (`E3002` on mismatch).
- Propagation `opt?`: verifies operand is `Option` or `Result` (`E3002` on non-Option/Result).

### 5.8 Pipeline Operator (`|>`)
Pipelines transform expressions into function calls:
- `data |> f` validates that `f` accepts `data` as its first parameter.
- `data |> f(x, y)` validates that `f` accepts `[data, x, y]`.
- Generic functions in pipelines infer type parameters from the piped value.
- Emits `E3003` if target parameter count or types do not match.

### 5.9 Generic Types & Functions
- Type declarations accept generic parameters: `type Box<T> { value: T }`. Generic parameters exist exclusively in type context and duplicate parameters are rejected (`E4001`).
- Generic functions: `fn identity<T>(value: T) -> T`. Generic parameters are lexically scoped to the function.
- Generic argument inference: arguments infer generic parameters via structural unification (`unifyTypes`). Uninferred parameters emit `E4002`.
- Explicit type arguments: `identity<Int>(10)` validated with safe parser lookahead.

### 5.10 Type Aliases & Union Types
- Type aliases: `type UserId = Int` establishes transparent structural equivalence (`UserId ≡ Int`). Does not introduce nominal newtypes.
- Union types: `type ID = Int | String` maintains a finite set of variants. Operations must be statically valid across all variants (`E3002`).

### 5.11 Trait Foundation & Static Resolution
- Trait declarations: `trait Printable { fn print() }` defines compile-time contracts.
- Trait implementations: `impl User: Printable { fn print() { ... } }` verified statically for completeness (`E4004`) and signature matching (`E4006`). Duplicate implementations are rejected (`E4005`).
- Trait constraints: `<T: Printable>` validated at call sites statically (`E4003`).
- Static trait resolution: methods resolve statically at compile time; zero runtime dynamic dispatch, vtables, or `dyn Trait`.

---

## 6. Diagnostics Engine & Codes

### 6.1 Diagnostic Code Families
- **E1xxx**: Lexical and Syntactic errors.
- **E2xxx**: Name Resolution & Scoping errors:
  - `E2001`: Unresolved identifier reference (or generic parameter used as runtime value).
  - `E2002`: Duplicate binding in the same scope.
  - `E2003`: Invalid assignment target (immutable reassignment).
  - `E2004`: Loop control statement (`break`/`continue`) outside loop.
- **E3xxx**: Type System & Semantic errors:
  - `E3001`: Type mismatch.
  - `E3002`: Invalid operand type for operator (including invalid union operations).
  - `E3003`: Invalid function call arguments / pipeline target.
  - `E3004`: Function return type mismatch.
  - `E3005`: Invalid condition type in `if` expression.
  - `E3006`: Tuple index out of bounds or invalid member access.
  - `E3007`: Target of `for` loop is not an iterable collection.
- **E4xxx**: Trait and Generic errors:
  - `E4001`: Generic argument mismatch or duplicate generic parameter.
  - `E4002`: Generic inference failure.
  - `E4003`: Trait constraint not satisfied.
  - `E4004`: Trait not found or missing required trait method.
  - `E4005`: Duplicate trait implementation.
  - `E4006`: Trait method signature mismatch.
- **E5xxx**: Pattern matching errors (`E5001` non-exhaustive match, `E5002` invalid pattern kind).
- **E9xxx**: Backend / Build errors (`E9001` reserved milestone error).
- **R0xxx**: Dedicated Runtime Panics (division by zero, unsupported op, internal state, recursion limit, UInt underflow).

---

## 7. Deferred Subsystems & System Boundaries

The following subsystems are intentionally deferred to future milestones and preserve strict boundaries:
- **High-Level IR (HIR)**: AST-to-HIR lowering is deferred (Planned: 0.0.11-d).
- **Mid-Level IR (MIR)**: SSA, control flow graphs, and optimization are deferred (Planned: 0.0.11-d).
- **Borrow Checker & Ownership**: Full borrow checking is deferred (Planned: Phase 2).
- **Full Effect System**: Statically verified algebraic effect propagation is deferred (Planned: Phase 2).
- **Advanced Trait Features & Monomorphization**: Dynamic trait objects (`dyn Trait`), vtables, associated types, specialization, and backend monomorphization are deferred.
- **Backend Codegen**: LLVM IR, WebAssembly, and native binary code generation are deferred (Reserved: 0.1.0-alpha).
