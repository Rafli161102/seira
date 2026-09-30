# Seira Compiler Architecture Specification

| Field | Value |
|---|---|
| Specification | Seira 0.0.4-s Compiler & Language Foundation Architecture |
| Target Milestone | 0.0.4-s (Seed Series) |
| Architecture Status | **Implemented & Locked** |

---

## 1. Executive Summary

The Seira 0.0.4-s release establishes the semantic layer of the Seira compiler foundation. Building upon the syntactic foundation established in 0.0.3-s, the compiler connects the full front-end pipeline end-to-end:

```text
Source Text
    ↓
SourceManager & LineMap (SourceId, Spans, Positions)
    ↓
Lexer (Left-to-Right scanning, Token stream, Source spans)
    ↓
Tokens (Keywords, Literals, Operators, Delimiters)
    ↓
Parser (Pratt precedence climbing, Error recovery)
    ↓
AST (Source-aware strongly typed node hierarchy)
    ↓
Name Resolution (Lexical scopes, Symbol binding, Shadowing, Hoisting)
    ↓
Basic Type Analysis (Deterministic structural types, Static inference, Zero implicit coercions)
    ↓
Semantic Validation (Strict Boolean conditionals, Calls, Returns, Mutability, Option/Result, Pipeline)
    ↓
Compiler Driver & Diagnostics (Structured errors, Source pointers, Code hints)
```

In accordance with the 0.0.4-s scope rules, the compiler implements real name resolution and static type validation, while preserving clear architectural boundaries for downstream subsystems (`hir`, `mir`, `backend`, full borrow checker, full effect solver).

---

## 2. Compiler Subsystem Architecture

The Seira compiler is organized into decoupled modules under `compiler/`:

```text
compiler/
├── source/          # SourceManager, SourceFile, Span, Position, LineMap [IMPLEMENTED]
├── lexer/           # Lexical scanner, Token stream, Symbol table [IMPLEMENTED]
├── parser/          # Pratt precedence parser, Error recovery [IMPLEMENTED]
├── ast/             # Abstract Syntax Tree node hierarchy [IMPLEMENTED]
├── diagnostics/     # Diagnostics engine, Formatter, ICE [IMPLEMENTED]
├── driver/          # Pipeline orchestrator, CompilerContext [IMPLEMENTED]
├── resolver/        # Lexical scoping, Symbol resolution, Shadowing [IMPLEMENTED]
├── typecheck/       # Static type inference, Semantic validator [IMPLEMENTED]
├── hir/             # High-Level IR [ARCHITECTURAL SKELETON — DEFERRED]
├── mir/             # Mid-Level IR & CFG [ARCHITECTURAL SKELETON — DEFERRED]
└── backend/         # Native LLVM & Wasm emitters [ARCHITECTURAL SKELETON — DEFERRED]
```

---

## 3. Subsystem Implementation Status

| Subsystem | Status | Milestone | Implementation Description |
|---|---|---|---|
| `source/` | **IMPLEMENTED** | 0.0.2-s | `SourceManager`, `LineMap` (binary search offset-to-line), `Span` tracking |
| `lexer/` | **IMPLEMENTED** | 0.0.3-s | Left-to-right lexical scanner with full token model, literals, compound operators, and banned token rejection |
| `parser/` | **IMPLEMENTED** | 0.0.3-s | Pratt precedence climbing parser, bare bindings, expression functions, if/block expressions, and `synchronize()` error recovery |
| `ast/` | **IMPLEMENTED** | 0.0.3-s | Source-aware AST preserving exact spans on all declarations, statements, expressions, and patterns |
| `diagnostics/` | **IMPLEMENTED** | 0.0.3-s | Structured diagnostic bags with `E1xxx`–`E9xxx` error families, source snippet formatting, code pointers, suggestions, and ICE crash reporting |
| `driver/` | **IMPLEMENTED** | 0.0.3-s | `CompilerDriver`, `CompilerContext` session lifecycle, `CompilerConfig`, milestone diagnostics |
| `resolver/` | **IMPLEMENTED** | 0.0.4-s | Lexical scope hierarchy (global, module, function, block), predictable shadowing, declaration hoisting, duplicate detection (`E2002`), unresolved reference detection (`E2001`), immutable reassignment rejection (`E2003`) |
| `typecheck/` | **IMPLEMENTED** | 0.0.4-s | Static type inference, structural type equality, explicit type annotation checking (`E3001`), operator typing (`E3002`), function calls & returns (`E3003`, `E3004`), strict Boolean requirements (`E3005`), Option/Result foundations, and pipeline validation |
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
```seira
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
```seira
let val = 10;
let val = 20; // error[E2002]: Duplicate binding 'val' in the same scope.
```

### 4.5 Mutability & Reassignment Checking (E2003)
Seira bindings are immutable by default:
- `mut x = value`: Declares a mutable variable. Reassignment `x = new_value` is permitted if type-compatible.
- `x = value`: Declares an immutable variable. Reassignment `x = new_value` in the same scope produces `E2003`:
```seira
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
```seira
age: Int = 23;
```
If the initializer expression cannot be assigned to the declared type, the compiler raises `E3001`:
```seira
age: Int = "hello"; // error[E3001]: Type mismatch: expected 'Int', but found 'String'.
```

### 5.4 Zero Implicit Coercions
Seira strictly forbids implicit type coercion. No implicit numeric widening, no numeric-to-string coercion:
```seira
x = 10 + "hello"; // error[E3002]: Invalid operands for arithmetic operator '+': 'Int' and 'String'.
y = 10 + 3.14;    // error[E3002]: Invalid operands for arithmetic operator '+': 'Int' and 'Float'.
```
String concatenation using `+` requires both operands to be `String`.

### 5.5 Strict Boolean Semantics — Zero Truthy / Falsy Coercion (E3005)
Conditions in `if` expressions and operands to logical operators (`and`, `or`, `not`) MUST evaluate to `Bool`:
```seira
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
- Emits `E3003` if target parameter count or types do not match.

---

## 6. Diagnostics Engine & Codes

### 6.1 Diagnostic Code Families
- **E1xxx**: Lexical and Syntactic errors.
- **E2xxx**: Name Resolution & Scoping errors:
  - `E2001`: Unresolved identifier reference.
  - `E2002`: Duplicate binding in the same scope.
  - `E2003`: Invalid assignment target (immutable reassignment).
- **E3xxx**: Type System & Semantic errors:
  - `E3001`: Type mismatch.
  - `E3002`: Invalid operand type for operator.
  - `E3003`: Invalid function call arguments / pipeline target.
  - `E3004`: Function return type mismatch.
  - `E3005`: Invalid condition type in `if` expression.
- **E9xxx**: Backend / Build errors (`E9001` reserved milestone error).

---

## 7. Deferred Subsystems & System Boundaries

The following subsystems are intentionally deferred to future milestones and preserve strict boundaries:
- **High-Level IR (HIR)**: AST-to-HIR lowering is deferred (Planned: 0.0.11-d).
- **Mid-Level IR (MIR)**: SSA, control flow graphs, and optimization are deferred (Planned: 0.0.11-d).
- **Borrow Checker & Ownership**: Full borrow checking is deferred (Planned: 0.0.7-s / 0.0.11-d).
- **Full Effect System**: Statically verified algebraic effect propagation is deferred (Planned: 0.0.6-s / 0.0.11-d).
- **Trait System & Generic Specialization**: Trait bounds solver and monomorphization are deferred (Planned: 0.0.8-s / 0.0.11-d).
- **Backend Codegen**: LLVM IR, WebAssembly, and native binary code generation are deferred (Reserved: 0.1.0-alpha).
