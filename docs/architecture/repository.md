# Seira Repository Architecture Specification

| Field | Value |
|---|---|
| Specification | Seira 0.0.2-s Repository Architecture |
| Target Milestone | 0.0.2-s (Seed Series) |
| Architecture Status | **Implemented & Locked** |

---

## 1. Overview & Repository Layout

The Seira repository is structured into strictly decoupled top-level directories, each with a single, clear responsibility:

```text
seira/
├── compiler/          # Compiler subsystems, driver, AST, IRs, and diagnostics
├── runtime/           # Execution support layer, memory model, and host adapters
├── std/               # Standard library written in Seira (.sr)
├── tools/             # Developer tooling, CLI dispatcher, and manifest tooling
├── tests/             # Unit, integration, conformance, and fixture test suites
├── examples/          # Canonical example programs (.sr)
├── docs/              # Specifications, architecture, language manual, RFCs
└── .github/           # CI/CD workflows and repository templates
```

### Directory Responsibilities

| Directory | Responsibility | Implementation Status |
|---|---|---|
| `compiler/` | Source management, lexing, parsing, diagnostics, IRs, and compiler orchestration | **Active (0.0.2-s)** / Skeletons where noted |
| `runtime/` | Execution-time services: memory scopes, panic handler, host adapters, effects | **Architectural Foundation** |
| `std/` | Standard library contracts and language modules (`core`, `collections`, `text`, etc.) | **Architectural Foundation** |
| `tools/` | Command-line interface (`seira`), project bootstrap (`init`, `new`), manifest parsing | **Active (0.0.2-s)** |
| `tests/` | Automated test infrastructure, regression verification, and conformance suites | **Active (0.0.2-s)** |
| `examples/` | Demonstrative `.sr` source files validating locked language axioms | **Active (0.0.1-s)** |
| `docs/` | Authoritative language documentation, architecture guides, and RFC system | **Active (0.0.2-s)** |

---

## 2. Dependency Direction

Dependency direction is one-way and strictly enforced to prevent circular coupling:

```text
CLI / Developer Tools
         ↓
  Compiler Driver
         ↓
  Compiler Core
         ↓
Compiler Subsystems (Source, Lexer, Parser, AST, Diagnostics)
         ↓
  Backend Interface
         ↓
Target Implementations (Native LLVM, WebAssembly)
```

### Invariants:
1. **CLI → Compiler Core**: Tooling consumes the `CompilerDriver` as an orchestration consumer.
2. **Compiler Core → Subsystems**: The driver coordinates compilation phases without subsystems depending on the driver.
3. **Runtime is Independent**: `compiler/` does NOT depend on `runtime/`. The runtime is an execution-support layer linked during runtime execution or embedded in backend binaries.
4. **Standard Library is Independent**: `compiler/` does NOT depend on high-level `std/` modules.
5. **No CLI Leaks**: Neither `compiler/`, `runtime/`, nor `std/` may depend on `tools/` or CLI logic.

### Forbidden Dependency Directions:
- `compiler → CLI` (**FORBIDDEN**)
- `compiler → application code` (**FORBIDDEN**)
- `runtime → CLI` (**FORBIDDEN**)
- `std → CLI` (**FORBIDDEN**)
- `compiler → high-level application framework` (**FORBIDDEN**)

---

## 3. Status Labeling Guide

Every subsystem in the Seira codebase is documented using explicit status labels:

- **Implemented**: Operational, tested code performing real production work for the current milestone.
- **Architectural**: Foundational contracts, type hierarchies, and boundaries established for future milestone consumption.
- **Planned**: Scheduled for implementation in an upcoming milestone (Seed, Development, Alpha).
- **Reserved**: Feature or syntax reserved in the language specification for long-term roadmaps.
