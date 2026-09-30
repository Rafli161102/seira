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
| `E2xxx` | Name / Resolution | Undeclared identifiers, duplicate definitions, scope violations | **Architectural (0.0.2-s)** |
| `E3xxx` | Type System | Type mismatch, immutable mutation, unhandled `Option`/`Result` | **Architectural (0.0.2-s)** |
| `E4xxx` | Trait / Generics | Unimplemented trait methods, unsatisfied generic constraints | **Reserved** |
| `E5xxx` | Pattern Matching | Non-exhaustive patterns, unreachable match arms | **Reserved** |
| `E6xxx` | Effect System | Calling effectful function (`!`) outside effect context | **Architectural (0.0.2-s)** |
| `E7xxx` | Resource / Ownership | Escaped scoped resource, use-after-move | **Architectural (0.0.2-s)** |
| `E8xxx` | Module / Visibility | Private item access, circular module imports | **Reserved** |
| `E9xxx` | Build / Backend | Unsupported target, missing file, code emission error | **Active (0.0.2-s)** |
| `W1xxx` | Warnings | Unused variables, dead code, deprecations | **Active (0.0.2-s)** |
| `I1xxx` | Information | Milestone notices, compilation progress, hints | **Active (0.0.1-s)** |

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
