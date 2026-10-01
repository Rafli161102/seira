# Seira Testing Architecture

| Field | Value |
|---|---|
| Subsystem | `tests/` |
| Specification | Seira 0.0.10-s Testing Architecture |
| Target Milestone | 0.0.10-s (Seed Series) |
| Architecture Status | **Implemented & Locked** |

---

## 1. Test Suite Organization

The test suite is organized into distinct categories by responsibility:

```text
tests/
├── unit/             # Isolated unit tests for individual compiler and toolchain modules
│   ├── source.test.ts    # SourceManager, LineMap, Span, Position tests
│   ├── lexer.test.ts     # Tokenization, symbol locking, banned syntax rejection
│   ├── parser.test.ts    # AST parsing, functions, pipelines, resource blocks
│   └── manifest.test.ts  # Seira.toml parser and schema validator
├── integration/      # End-to-end tooling and CLI command execution
│   └── cli.test.ts       # seira --version, --help, info, check, reserved commands
├── compiler/         # Multi-phase compiler integration and pipeline verification
│   ├── compiler.test.ts  # End-to-end compilation through Parser phase
│   └── driver.test.ts    # CompilerDriver, session lifecycle, ICE tests
├── diagnostics/      # Diagnostic formatting, source pointers, and code families
│   └── diagnostics.test.ts
├── runtime/          # Runtime scopes, panic subsystem, and host adapters
│   └── runtime.test.ts
├── conformance/      # Locked Seira language grammar and conformance rules
│   └── syntax.test.ts
└── fixtures/         # Static .sr source files for automated regression testing
    ├── valid/            # Simple, function, and pipeline valid fixtures
    ├── invalid/          # Syntax violations and banned operator fixtures
    ├── diagnostics/      # Diagnostic emission test fixtures
    └── programs/         # Complete executable program fixtures
```

---

## 2. Test Execution & Automation

Tests are executed with Node.js built-in test runner utilizing native TypeScript type stripping:

```bash
npm test
```

### Invariants:
1. **Zero External Test Framework Dependencies**: Uses `node:test` and `node:assert` for reproducible, deterministic runs.
2. **Sub-Second Execution**: Complete test suite completes in under 1 second.
3. **Cross-Platform Matrix**: Continuously validated across Ubuntu, macOS, and Windows on Node 22 and 24.

---

## 3. Implementation Status

| Test Suite | Tests | Status | Milestone |
|---|---|---|---|
| `tests/unit/source/` | 5 tests | **Active** | 0.0.2-s |
| `tests/unit/lexer/` | 9 tests | **Active** | 0.0.3-s / 0.0.8-s / 0.0.10-s |
| `tests/unit/parser/` | 13 tests | **Active** | 0.0.3-s / 0.0.8-s |
| `tests/unit/ast/` | 3 tests | **Active** | 0.0.3-s / 0.0.8-s |
| `tests/unit/manifest/` | 3 tests | **Active** | 0.0.1-s / 0.0.8-s |
| `tests/unit/cli/` | 6 tests | **Active** | 0.0.8-s |
| `tests/unit/diagnostics/` | 2 tests | **Active** | 0.0.1-s / 0.0.8-s |
| `tests/unit/resolver/` | 11 tests | **Active** | 0.0.4-s / 0.0.8-s / 0.0.10-s |
| `tests/unit/typecheck/` | 48 tests | **Active** | 0.0.4-s / 0.0.7-s / 0.0.8-s / 0.0.10-s |
| `tests/unit/module/` | 26 tests | **Active** | 0.0.8-s |
| `tests/unit/execution/` | 106 tests | **Active** | 0.0.5-s / 0.0.6-s / 0.0.7-s / 0.0.8-s |
| `tests/unit/stdlib/` | 124 tests | **Active** | 0.0.9-s / 0.0.10-s |
| `tests/compiler/` | 16 tests | **Active** | 0.0.2-s / 0.0.8-s |
| `tests/integration/` | 7 tests | **Active** | 0.0.2-s / 0.0.8-s / 0.0.10-s |
| `tests/runtime/` | 8 tests | **Active** | 0.0.1-s / 0.0.5-s |
| `tests/conformance/` | 1 test | **Active** | 0.0.1-s / 0.0.8-s |
| **Total Suite** | **388 tests** | **100% Passing** | **0.0.10-s** |
