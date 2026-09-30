# Seira Governance & Decision Making

## 1. Overview

The Seira programming language is an open-source, community-driven project dedicated to long-term sustainability, technical excellence, and transparent evolution.

This document supplements the root [GOVERNANCE.md](../../GOVERNANCE.md) with operational specifics for project stewardship.

---

## 2. Release Gating & Progression Model

Version progression in Seira is governed strictly by **technical gates**, never arbitrary calendar deadlines.

### The Staged Progression Pipeline
1. **Seed Series (`0.0.1-s` to `0.0.10-s`)**:
   - Focus: Architecture, CLI, core syntax specification, parser, AST, test harnesses, diagnostic foundations.
   - Exit Gate: Parser, AST, and symbol table validated; end-to-end AST validation of core language idioms.
2. **Development Series (`0.0.11-d` to `0.0.30-d`)**:
   - Focus: Type inference, trait solving, effect verification, HIR/MIR design.
   - Exit Gate: Complete static type analysis and effect checking operational.
3. **Alpha Series (`0.1.0-alpha.1` to `0.1.0-alpha.10`)**:
   - Focus: LLVM native code generation, WebAssembly backend emission, initial standard library execution.
   - Exit Gate: Compiles and executes standalone native and Wasm binaries.
4. **Beta Series (`0.1.0-beta.1` to `0.1.0-beta.10`)**:
   - Focus: Optimization passes, bug fixes, conformance testing, performance benchmarks, ecosystem tooling.
   - Exit Gate: Zero known soundness bugs in core type system and codegen.
5. **Release Candidates (`0.1.0-rc.1` ...)**:
   - Focus: ABI stability, API stabilization, documentation completeness.
   - Exit Gate: Unanimous core maintainer approval.
6. **Stable (`1.0.0`)**:
   - Production readiness, long-term backwards compatibility guarantees.

---

## 3. Consensus & RFC Adjudication

For any proposal altering the language specification or standard library:
1. An RFC is submitted to `docs/rfcs/`.
2. A minimum community review window of 14 days is observed.
3. Maintainers evaluate the proposal against Seira's core design tenets:
   - *Is it concise?*
   - *Is it predictable?*
   - *Is it composable?*
   - *Is it efficient?*
   - *Are effects explicit?*
   - *Does it empower progressive control?*
4. Proposals that conflict with locked foundations are rejected unless exceptional justification is provided.
