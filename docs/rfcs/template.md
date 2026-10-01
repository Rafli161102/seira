# RFC: [Feature Name]

- **RFC Number**: [0000 - assigned upon acceptance]
- **Author**: [Your Name / GitHub Username]
- **Status**: [Draft / In Review / Accepted / Rejected]
- **Target Release**: [e.g. 0.0.2-s, 0.0.11-d, 0.1.0-alpha]
- **Created**: [YYYY-MM-DD]

---

## 1. Summary

Provide a concise 2–3 sentence overview of the proposed change.

---

## 2. Motivation

- What problem does this solve?
- What use cases does this enable?
- Why is existing Seira syntax or architecture insufficient for this need?

---

## 3. Detailed Design

Explain the design in depth:
- Syntax changes and grammar additions.
- Compiler pipeline impact (Lexer, Parser, Resolver, Typechecker, HIR/MIR, Backend).
- Runtime or memory model impact.
- Standard library impact.
- Concrete code examples written in idiomatic Seira (`.sr`).

```sr
// Example demonstrating the proposed feature
```

---

## 4. Drawbacks & Trade-offs

- Does this introduce cognitive complexity or syntactic ambiguity?
- Does this impact compilation speed or binary footprint?
- What are the potential migration or compatibility costs?

---

## 5. Alternatives Considered

- What other designs were considered?
- Why was this approach selected over alternatives?
- How do other modern languages (Rust, Zig, Swift, Gleam, OCaml) solve this?

---

## 6. Unresolved Questions

List any aspects of the design that remain undetermined and need community consensus during the RFC review window.
