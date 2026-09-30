# Seira Diagnostics Architecture

| Field | Value |
|---|---|
| Subsystem | `compiler/diagnostics/` |
| Specification | Seira 0.0.2-s Diagnostics Architecture |
| Target Milestone | 0.0.2-s (Seed Series) |
| Architecture Status | **Implemented & Locked** |

---

## 1. Overview

The Seira diagnostics subsystem produces human-friendly, actionable diagnostic reports.

Every diagnostic message includes:
- **Severity**: Error, Warning, or Info
- **Code**: Unique stable identifier categorized into code families
- **Primary Span**: Location of the defect with line and column coordinates
- **Code Snippet & Carets**: Visual representation of the offending source line
- **Secondary Spans**: Optional related source locations (e.g. earlier declaration, matching delimiter)
- **Help**: Explanation of the rule or idiom
- **Suggestions**: Actionable fix recommendations
- **Notes**: Additional context or links

---

## 2. Diagnostic Code Families

| Code Range | Category | Description | Status |
|---|---|---|---|
| `E1xxx` | Syntax / Lexical / Parse | Grammar violations, banned tokens (`++`, `&&`), unclosed delimiters | **Active (0.0.1-s)** |
| `E2xxx` | Name / Resolution | Undeclared identifiers, duplicate definitions, loop control violations | **Active (0.0.4-s / 0.0.6-s)** |
| `E3xxx` | Type System | Type mismatch, operator types, collection indexing, iteration targets | **Active (0.0.4-s / 0.0.6-s / 0.0.7-s)** |
| `E4xxx` | Trait / Generics | Generic argument mismatch, inference failure, unsatisfied trait constraints, invalid trait implementations | **Active (0.0.7-s)** |
| `E5xxx` | Pattern Matching | Non-exhaustive patterns, invalid pattern kinds | **Active (0.0.6-s)** |
| `E6xxx` | Module / Package | Module not found, symbol not found, duplicate module/decl, private access, cycles | **Active (0.0.8-s)** |
| `E7xxx` | Resource / Ownership | Escaped scoped resource, use-after-move | **Architectural (0.0.2-s)** |
| `E8xxx` | Effect / Concurrency | Calling effectful function (`!`) outside effect context | **Architectural (0.0.2-s)** |
| `E9xxx` | Build / Backend | Unsupported target, missing file, code emission error | **Active (0.0.2-s)** |
| `W1xxx` | Warnings | Unused variables, dead code, deprecations | **Active (0.0.2-s)** |
| `I1xxx` | Information | Milestone notices, compilation progress, hints | **Active (0.0.1-s)** |

### Active Compiler Diagnostic Codes:

#### Syntax / Lexical (`E1xxx`):
- `E1001`: Unexpected token or character
- `E1002`: Banned operator (`++`, `--`, `&&`, `||`, `null`, `===`)
- `E1003`: Unclosed delimiter
- `E1004`: Parse syntax error / expected token

#### Name Resolution (`E2xxx`):
- `E2001`: Unresolved identifier reference / generic parameter used as value
- `E2002`: Duplicate binding declared in the same lexical scope
- `E2003`: Reassignment to immutable binding
- `E2004`: `break` or `continue` outside loop statement

#### Type Analysis (`E3xxx`):
- `E3001`: Type mismatch between expected and actual expression types
- `E3002`: Operator type incompatibility / invalid operation on union type
- `E3003`: Function call argument count or type mismatch
- `E3004`: Function return type mismatch
- `E3005`: Condition expression in `if` or `while` is not strictly `Bool`
- `E3006`: Tuple index out of range or invalid numeric member access
- `E3007`: Iteration target of `for` loop is not an iterable collection (`List` or `Set`)

#### Trait & Generic Foundation (`E4xxx`):
- `E4001`: Duplicate generic parameter / Generic argument count mismatch
- `E4002`: Generic type inference failure (requires explicit type arguments)
- `E4003`: Trait constraint not satisfied at call site
- `E4004`: Trait not found / missing trait method implementation / undeclared method in trait
- `E4005`: Duplicate trait implementation for the same Type and Trait pair
- `E4006`: Method signature mismatch in trait implementation

#### Pattern Matching (`E5xxx`):
- `E5001`: Non-exhaustive pattern matching in `match` expression
- `E5002`: Pattern kind is invalid for the matched expression type

#### Module & Package Foundation (`E6xxx`):
- `E6001`: Module not found
- `E6002`: Symbol not found in module
- `E6003`: Duplicate module identity or declaration
- `E6004`: Duplicate declaration across imported symbols or local scope
- `E6005`: Private symbol access (symbol is not marked `pub`)
- `E6006`: Invalid import declaration (e.g. wildcard import `import *`)
- `E6007`: Invalid use declaration (e.g. wildcard import `use *`)
- `E6008`: Cyclic module dependency detected
- `E6009`: Package not found (dependency path not found or missing package)
- `E6010`: Invalid package manifest (`Seira.toml`)
- `E6011`: Invalid dependency declaration in manifest
- `E6012`: Cyclic package dependency detected
- `E6013`: Invalid module path (path traversal outside package boundary)
- `E6014`: Duplicate package name in dependencies or workspace
- `E6015`: Invalid re-export (`pub use` of private or non-existent symbol)

### Runtime Diagnostic Code Family (0.0.5-s+)

Runtime diagnostics represent unrecoverable runtime errors (panics) triggered during execution:

| Code Range | Category | Description | Status |
|---|---|---|---|
| `R0xxx` | Runtime Panics | Unrecoverable runtime errors (division by zero, underflow, stack overflow) | **Active (0.0.5-s)** |

#### Locked Runtime Diagnostic Codes:
- `R0001`: Division by zero
- `R0002`: Unsupported runtime operation
- `R0003`: Internal execution state error
- `R0004`: Call stack depth exceeded
- `R0005`: Unsigned integer underflow

---

## 3. Internal Compiler Error (ICE) Boundary

Seira maintains a strict boundary separating invalid user source from compiler implementation bugs:

- **Invalid User Source**: Handled gracefully via `DiagnosticBag` with codes `E1xxx`–`E9xxx`. Compilation halts cleanly with formatted diagnostics.
- **Compiler Implementation Defect**: Throws `InternalCompilerError` (`ICE`), generating an automated crash report with phase information, source context, and issue submission links.

```text
User Error:      error[E1002]: Increment operator '++' is not permitted in Seira.
Compiler Crash:  internal compiler error: invariant failure in [Typecheck] (in main.sra)
```

---

## 4. Implementation Status

| Component | Status | Milestone |
|---|---|---|
| `DiagnosticBag` | **Implemented** | 0.0.1-s |
| `formatDiagnostic` | **Implemented** | 0.0.1-s |
| `SecondarySpan` | **Implemented** | 0.0.2-s |
| `Suggestion` | **Implemented** | 0.0.2-s |
| `InternalCompilerError` | **Implemented** | 0.0.2-s |
