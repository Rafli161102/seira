# Seira Architecture Gap Analysis v1.0

| Field | Value |
|---|---|
| Document | Seira Architecture Gap Analysis v1.0 |
| Baseline Version | 0.0.10-s (I/O & Resource Boundary Foundation v1.0 — Locked) |
| Target Milestone Evaluated | 0.0.11-s (Candidate: HIR & Semantic Lowering Foundation) |
| Author | Antigravity AI Pair Programmer & Seira Core Working Group |
| Status | **OPEN FOR REVIEW** (Not Locked) |
| Date | 2026-10-01 |

---

## 1. Executive Summary

With the successful completion and independent audit of milestone **0.0.10-s (I/O & Resource Boundary Foundation v1.0)**, Seira has established a solid surface language foundation across 10 progressive Seed milestones (`0.0.1-s` through `0.0.10-s`). The current codebase boasts:
- 388 automated tests passing across 16 test suites with 0 failures, 0 skips, and 0 cancellations.
- Strict static type inference, generics, union types, type aliases, and a canonical built-in trait registry (`BUILTIN_TRAIT_MAP`).
- Filesystem-mapped module hierarchy, package manifests (`Seira.toml`), SHA-256 lockfiles (`Seira.lock`), path dependencies, and workspaces.
- First-class deterministic resource scoping via `with` statements executing in strict LIFO order.
- Composable capability traits (`Reader`, `Writer`, `Seekable`, `Flushable`, `Sized`, `Resource`), strict Byte/Text boundaries, and target-independent memory streams.

However, Seira faces an architectural inflection point. To date, program execution has been achieved through an AST-level tree-walking evaluator (`runtime/execution/evaluator.ts`). While this approach was indispensable for proving observable language semantics without premature backend coupling during the Seed Series, it tightly binds runtime execution to raw syntactic AST structures.

This document presents a comprehensive **Architecture Gap Analysis** to answer the strategic question:
> **"Is Seira's compiler foundation ready to transition from surface syntactic processing toward a canonical High-Level Intermediate Representation (HIR), and is HIR the correct next milestone?"**

**Key Finding**:
Yes, establishing **HIR (High-Level Intermediate Representation)** is the technically necessary next step. Moving directly to MIR (Control Flow Graphs), LLVM/WASM backends, or a full borrow checker without HIR is technically blocked because surface AST currently contains desugaring burdens (pipelines `|>`, null-coalescing `??`, Result propagation `?`, `with` blocks) and lacks unified typed semantic bindings. Lowering to HIR will decouple front-end syntax from downstream execution and intermediate representation.

---

## 2. Current Architecture

The Seira repository is structured into modular subsystems adhering to strict architectural boundaries:

```text
seira/
├── compiler/     # Lexical scanning, Pratt parsing, AST, Resolver, TypeChecker, Module loader
├── runtime/      # Value Model v1.0, Tree-walking execution engine, Resource cleanup
├── std/          # Standard library package (std/src/) and foundational contracts
├── tools/        # CLI launcher (bin/sr, bin/seira), manifest tooling, project initializer
├── tests/        # Unit, integration, compiler driver, and runtime conformance test suites
├── examples/     # Reference implementations (.sr)
└── docs/         # Architectural specifications, governance, and RFC guidelines
```

### 2.1 Language Frontend
- **Lexer (`compiler/lexer/`)**: Scans UTF-8 source text left-to-right into strongly-typed `Token` streams. Tracks exact 1-indexed lines, columns, and 0-indexed byte offsets (`Span`). Strictly rejects banned operators (`++`, `--`, `&&`, `||`, `===`, `null`). Handles Unicode scalar code points preserving multi-byte and surrogate emoji integrity.
- **Parser (`compiler/parser/`)**: Pratt precedence climbing parser producing strongly typed AST nodes (`Program`, `FunctionDecl`, `TraitDecl`, `ImplDecl`, `StructDecl`, `TypeAliasDecl`, `WithStmt`, `MatchExpr`, `PipelineExpr`). Preserves source spans on all nodes and enforces visibility markers (`pub`).
- **Resolver (`compiler/resolver/`)**: Lexical scoping hierarchy (Global, Module, Function, Block). Performs declaration hoisting, shadow detection, visibility enforcement (`E6005`), and maintains the unified canonical trait registry (`BUILTIN_TRAIT_MAP`).
- **Type Checker (`compiler/typecheck/`)**: Static type inference, structural type equality (`areTypesEqual`), generic type parameter and argument inference, explicit type annotation compatibility, trait contract verification, and static resource validation for `with` statements (`E3001`).

---

## 3. Current Compiler Pipeline

The sequential pipeline is orchestrated by `CompilerDriver` (`compiler/driver/driver.ts`):

```text
Source Code (.sr / .sra)
  ↓
Module Discovery & Topological Sort (compiler/module/)
  ↓
SourceManager & LineMap (compiler/source/)
  ↓
Lexer (compiler/lexer/) ➔ Token Stream
  ↓
Parser (compiler/parser/) ➔ Abstract Syntax Tree (AST)
  ↓
Resolver (compiler/resolver/) ➔ Scopes, Symbol Tables, Trait Decls
  ↓
TypeChecker (compiler/typecheck/) ➔ Type Validation, Inferred Types
  ↓
[ARCHITECTURAL GAP / BYPASS] 
  ├── Tree-Walking Evaluator (runtime/execution/) [ACTIVE EXECUTION]
  └── HIR Lowering (compiler/hir/) [SKELETON ONLY]
```

### 3.1 Package Compilation vs Single-File Compilation
- **Single-File Mode (`compile`)**: Compiles a standalone script through Lexer, Parser, Resolver, and TypeChecker.
- **Package Mode (`compilePackage`)**: Loads package manifest (`Seira.toml`), resolves path dependencies via `PackageGraph`, discovers modules, computes topological order via `ModuleGraph` detecting cycles (`E6008`, `E6012`), and sequentially resolves and typechecks each module.

---

## 4. Current Runtime Architecture

Execution is currently powered by the Seed Execution Engine (`runtime/execution/`):
- **Seira Value Model v1.0 (`runtime/execution/values.ts`)**: Every value carries an explicit tag (`RuntimeTag`), completely isolating Seira semantics from JavaScript engine coercion. Supports Primitives (`Int` via BigInt, `UInt`, `Float`, `Bool`, `Char`, `String`, `Byte`, `Unit`), Compounds (`Option<T>`, `Result<T, E>`, `List<T>`, `Tuple`, `Map`, `Set`), Closures (`FunctionRuntimeValue`), and I/O types (`Bytes`, `Path`, `File`, `MemoryReader`, `MemoryWriter`, `MemoryStream`).
- **Tree-Walking Evaluator (`runtime/execution/evaluator.ts`)**: Directly traverses the raw AST `Program`. Executes control flow (`if`, `while`, `for`, `loop`, `break`, `continue`), pattern matching (`match`), method calls, and pipelines (`|>`).
- **Deterministic Resource Management**: The `with` statement executes scoped acquisition and guarantees cleanup in strict LIFO order across all exit paths (normal exit, early return, break, continue, and panic).

---

## 5. Current Standard Library Architecture

The standard library is organized as a native Seira package in `std/`:
- **Package Manifest**: `std/Seira.toml` (package `std`, version `0.0.10-s`).
- **Module Root**: `std/src/lib.sr` re-exporting core modules:
  - `core.sr`: Foundational traits (`Eq`, `Ord`, `Hash`, `Display`, `Debug`, `Clone`, `Default`, `Iterator`).
  - `option.sr`: First-class `Option<T>` type and combinators (`map`, `and_then`, `unwrap_or`, `??`).
  - `result.sr`: Deterministic error handling `Result<T, E>` and propagation (`?`).
  - `collections.sr`: Collection contracts for `List`, `Map`, `Set`, `Tuple`.
  - `iter.sr`: Lazy iterator adapters (`map`, `filter`, `take`, `skip`, `enumerate`, `zip`, `fold`, `reduce`).
  - `io.sr`: Composable capability traits (`Reader`, `Writer`, `Seekable`, `Flushable`, `Sized`, `Resource`) and memory streams (`MemoryReader`, `MemoryWriter`, `MemoryStream`).

---

## 6. Current Toolchain Architecture

The developer CLI toolchain is located in `tools/cli/` and exposed via `./bin/sr` (canonical) and `./bin/seira` (alias):
- `sr version` / `sr -v`: Reports version `Seira 0.0.10-s`.
- `sr info` / `sr i`: Reports environment, host platform, active pipeline stages, and project manifest details.
- `sr check` / `sr c`: Typechecks single files or entire packages without executing.
- `sr run` / `sr r`: Typechecks and executes single files or packages via the tree-walking evaluator.
- `sr init` / `sr new`: Generates standard Seira project templates with `Seira.toml` and `src/main.sr`.
- Reserved commands: `build`, `test`, `fmt`, `doc`, `clean`, `cache`, `add`, `remove`, `update`, `fetch` emit explicit diagnostic notices informing the developer of future milestone targets.

---

## 7. Intermediate Representation Status

| Representation | Current Status | Implementation Location | Description |
|---|---|---|---|
| **AST** | **IMPLEMENTED** | `compiler/ast/ast.ts` | Strongly typed, source-aware node hierarchy with exact byte/line/col spans and visibility modifiers. |
| **Resolved AST** | **PARTIAL** | `compiler/resolver/` | Produces `ResolverResult` (`globalScope`, `declaredSymbols`), but does **not** rewrite AST nodes into resolved reference nodes. Nodes remain raw identifier strings. |
| **Typed AST** | **PARTIAL** | `compiler/typecheck/` | Populates `nodeTypes: Map<ASTNode, Type>`, but types are not embedded into AST nodes, and expressions are not annotated. |
| **HIR (High-Level IR)** | **ARCHITECTURAL SKELETON** | `compiler/hir/index.ts` | Minimal stub (`HIRProgram`, `HIRModule`, `HIRFunction`, `HIRBlock`, `HIRStmt`, `HIRExpr`). Lowering returns a dummy object with diagnostic `I1001`. |
| **MIR (Mid-Level IR)** | **ARCHITECTURAL SKELETON** | `compiler/mir/index.ts` | Minimal stub (`BasicBlock`, `MIROperation`, `MIRResourceOp`, `MIRTerminator`). Builder returns an empty module. |

---

## 8. Architecture Gaps

Our audit identifies seven fundamental architectural gaps that currently separate Seira's front-end from lower-level code generation:

### Gap 1: Semantic Disconnect between Front-End and IR (Data Starvation)
`HIRLowering.lower(program: Program, file?: string)` currently takes only the raw `Program` AST. It does **not** accept `ResolverResult` or `TypecheckResult`. Consequently, any lowering pass would be blind to:
- Which lexical scope or module an identifier resolves to.
- What concrete type was inferred for an expression.
- Which specific trait method implementation was resolved for a method call.
- What generic type arguments were bound during function invocation.

### Gap 2: Runtime–AST Coupling & Premature Interpretation
Because there is no intermediate representation between TypeCheck and execution, the `ExecutionEngine` interprets raw AST directly. This forces the runtime to handle:
- Syntactic sugar evaluation (pipelines, coalescing, unwrap operators).
- Dynamic method lookup on known types.
- Scoped resource registration and cleanup inside runtime evaluators rather than through lowered primitives.

### Gap 3: Missing Desugaring Layer
Seira boasts high-efficiency syntax (`x |> f |> g`, `opt ?? default`, `res?`, `with res { ... }`). These constructs currently exist as first-class AST nodes. In a production compiler, such syntactic sugar must be lowered into canonical primitives before control flow analysis or code generation.

### Gap 4: Lack of Monomorphization & Generic Specialization
Generics currently exist as compile-time constraints checked via type substitution in `compiler/typecheck/`. There is no mechanism to specialize generic functions or types for concrete instantiations, which is a mandatory prerequisite for native LLVM or WebAssembly code generation.

### Gap 5: Disconnected Pipeline Stage Declarations
`CompilerStage` in `compiler/driver/stage.ts` defines `EffectCheck` and `ResourceCheck` as separate sequential stages between `Typecheck` and `HIR`. However, `CompilerDriver.compile()` jumps directly from `Typecheck` to `HIR`. Resource checking is currently bundled inside `TypeChecker.checkWithStmt`, while Effect checking is merely an equality check on function type markers.

### Gap 6: Dual Runtime Value Models (Legacy Coexistence)
The repository contains two competing value representations:
1. `runtime/value/index.ts`: The 0.0.2-s skeleton with numeric enum tags (`ValueTag.Int = 2`) and `SeiraValue`.
2. `runtime/execution/values.ts`: The active 0.0.5-s–0.0.10-s engine model with string tags (`RuntimeTag.Int = 'Int'`) and `RuntimeValue`.
The legacy model is still exported in `runtime/index.ts` and used in early tests (`tests/runtime/`), creating architectural confusion.

### Gap 7: Ad-Hoc Trait Method Dispatch
Trait method calls (`cr.read(10)`) on user-defined structs implementing traits are currently checked statically by verifying that methods exist on the implementing struct. However, no trait dictionary or vtable binding is generated. The runtime evaluator searches for properties on the object at runtime rather than following a static dispatch token.

---

## 9. Technical Debt

| Priority | Item | Location | Blocking 0.0.11-s? | Description |
|---|---|---|---|---|
| **P1** | **Semantic Data Starvation in HIR Lowering** | `compiler/hir/index.ts` | **YES (for HIR)** | `HIRLowering.lower` signature only accepts `Program`. Must be redesigned to accept `ResolverResult` and `TypecheckResult` (or `nodeTypes`). |
| **P2** | **Runtime Evaluator Duck-Typing Resource Fallback** | `runtime/execution/evaluator.ts:685` | No (Deferred) | `executeWithStmt` falls back to `typeof (resVal as any).close === 'function'` for non-File/non-Resource instances. |
| **P2** | **Dual Runtime Value Model & Stale Version Header** | `runtime/index.ts`, `runtime/value/` | No | `runtime/index.ts` reports stale `RUNTIME_INFO` (`0.0.7-s`) and exports legacy `SeiraValue` alongside `RuntimeValue`. |
| **P3** | **Stale `run` Entry in Reserved CLI Roadmap** | `tools/cli/commands/reserved.ts:10` | No | `run` is listed as planned for `0.1.0-alpha` in `reserved.ts`, but is already operational in `commands/run.ts`. |
| **P3** | **Legacy Stdlib Directory Residue** | `std/fs/`, `std/net/`, `std/sys/`, `std/time/`, `std/math/`, `std/text/` | No | Unused 0.0.1-s stub directories in `std/` that are unreferenced by `std/src/lib.sr`. |
| **P3** | **Hardcoded Milestone Version in HIR Skeleton** | `compiler/hir/index.ts:76` | No | `lower()` returns `{ version: '0.0.4-s' }`. |

---

## 10. Dependency Graph

```text
Surface Syntax (.sr)
        │
        ▼
   [Lexer & Parser] (Implemented: 0.0.3-s)
        │
        ▼
      [AST] (Implemented: 0.0.3-s)
        │
   ┌────┴──────────────────────────┐
   ▼                               ▼
[Resolver] (0.0.4-s / 0.0.10-s)   [TypeChecker] (0.0.4-s / 0.0.10-s)
   │                               │
   └──────────────┬────────────────┘
                  │  (Symbols & Inferred Types)
                  ▼
         [HIR Lowering] ◄─── MUST OCCUR NEXT (Candidate 0.0.11-s)
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
 [Desugared Semantics]  [Monomorphization Preparation]
        │
        ▼
  [MIR Lowering & CFG] (Planned: Phase 2 Development)
        │
   ┌────┴──────────────────────────┐
   ▼                               ▼
[Borrow & Lifetime Checker]   [Optimizations & SSA]
   │                               │
   └──────────────┬────────────────┘
                  │
                  ▼
        [Backend Code Generation] (Planned: Phase 3 Alpha)
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
 [Native LLVM (x86/ARM)]  [WebAssembly (Wasm/WASI)]
```

### Subsystem Dependency Evaluation
1. **HIR depends on**: AST, Resolver, TypeChecker. (All three are implemented and stable).
2. **MIR depends on**: HIR. (Cannot build CFG directly from high-level sugar).
3. **Borrow Checking depends on**: MIR. (Modern borrow checking requires a Control Flow Graph of basic blocks and place projections; borrow checking raw AST is notoriously fragile).
4. **Backend (LLVM/WASM) depends on**: MIR. (Code generators consume linear SSA instructions or basic blocks, not nested syntax trees).

---

## 11. HIR Readiness Analysis

### Why HIR MUST Be the Next Milestone
1. **Eliminates Desugaring Complexity**: In Seira, `a |> b(c)` is syntactic sugar for `b(a, c)`. `opt ?? def` is sugar for matching on `Option`. `res?` is sugar for early returning `Err` or unwrapping `Ok`. Lowering these into canonical constructs in HIR dramatically simplifies every subsequent compiler stage.
2. **Binds Semantic Knowledge into Nodes**: An AST expression `foo` is just a string. In HIR, `HIRExpr.Path` carries the resolved `SymbolId` and the exact `Type`. Downstream passes never need to re-query the scope or re-infer types.
3. **Decouples Compilation from AST Changes**: Surface syntax evolution (new syntax sugars, altered keywords) stops at HIR lowering. Backends and optimizers only see stable HIR.

### What HIR Must Represent
- **`HIRProgram` / `HIRModule`**: Module-qualified item tables.
- **`HIRFunction`**: Strongly-typed parameters, return type, effect signature, and body.
- **`HIRBlock` & `HIRStmt`**:
  - `Let`: Immutable and mutable variable declarations with exact types.
  - `Assign`: Reassignment to mutable variables.
  - `With`: Scoped resource binding with explicit setup and teardown hooks.
  - `Expr`: Expression statement.
- **`HIRExpr`**:
  - `Literal`: Typed primitive constants.
  - `Local`: Reference to a resolved local variable by `SymbolId`.
  - `Global`: Reference to a resolved function or module constant.
  - `Call`: Function calls with statically known targets and resolved argument types.
  - `MethodCall`: Method dispatch with resolved trait or concrete implementation tokens.
  - `Construct`: Struct, Tuple, List, Map, Set instantiation.
  - `Branch`: Lowered `if/else` where both branches have compatible types.
  - `Match`: Desugared or canonical pattern deconstruction.
  - `Loop`: Canonical loop construct (normalizing `while`, `for`, and `loop`).
  - `Return`, `Break`, `Continue`.

---

## 12. MIR Readiness Analysis

### Why MIR Should NOT Be Attempted in 0.0.11-s
Mid-Level Intermediate Representation (MIR) introduces Control Flow Graphs (CFG), Basic Blocks, Static Single Assignment (SSA) or explicit places/locals, explicit branch terminators (`Branch`, `CondBranch`, `Return`, `Panic`), and linear instruction sequences.

Attempting to construct MIR directly from Seira's current surface AST would require simultaneously solving:
1. Syntactic desugaring.
2. Semantic type resolution.
3. Control-flow flattening.
4. Temporary variable generation.
5. Exception / early-exit edge wiring.

By introducing HIR first, 0.0.11-s can normalize expressions and desugar constructs into a clean tree, allowing the subsequent milestone (MIR) to focus purely on CFG construction, basic blocks, and linear lowering.

---

## 13. Ownership / Lifetime Dependency Analysis

Seira's memory philosophy is:
> **Automatic for values. Explicit for mutation. Deterministic for resources. Optimized by compiler.**

### Should a Full Borrow Checker Come Before HIR?
**No.**
1. **Values have Value Semantics**: In Seira, values are immutable by default and behave with mathematical value semantics. Structural copying or persistent sharing is semantic, not physical.
2. **Deterministic Resources are Syntactically Bounded**: Active resources are bounded by the `with` block (`with res { ... }`). Static resource validation is already enforced in `compiler/typecheck/` (rejecting non-resources, unwrapped Results).
3. **Borrow Checking Requires CFG (MIR)**: A true borrow checker (such as Rust's NLL / Polonius) cannot operate reliably on a high-level recursive AST. It requires basic blocks, statement-level point liveness, and place projections.
4. **Conclusion**: Introducing lifetime annotations or borrow checking before HIR and MIR would be premature and counter to Seira's design principles.

---

## 14. Effect System Dependency Analysis

Seira's effect philosophy is:
> **The outside world is an Effect. Effects are inferred; declared with `!` when explicit.**

### Current State vs Future Needs
- **Current State**: Function declarations carry `isEffectful` (`fn write!()`). Function types carry `isEffectful` (`(Int) ->! Unit`). Typechecker ensures pure and effectful function types do not unify silently.
- **HIR Requirement**: HIR functions and expressions must preserve effect annotations (`isEffectful: boolean`). This allows future algebraic effect checkers to track which HIR operations invoke host side effects without needing to inspect AST tokens.
- **Conclusion**: HIR does not require the entire algebraic effect algebra to be complete; it only needs to preserve effect boundaries faithfully.

---

## 15. Backend Dependency Analysis

### Why LLVM / WASM Codegen Must Remain Deferred
1. **Backends Consume Linear IR / CFG**: Native machine code emitters (LLVM IR) and WebAssembly binary encoders expect basic blocks with branches, jumps, and phi-nodes/locals. Translating a high-level nested AST directly into LLVM IR produces unmaintainable, buggy code generation with complex cleanup paths.
2. **Missing ABI & Object Layout**: The memory layout of Seira structs, tagged unions, closures, and strings at the machine level has not yet been formalized.
3. **Conclusion**: Backend code generation must wait until MIR provides a linear CFG and explicit memory/drop operations.

---

## 16. Future Feature Dependency Matrix

| Feature / Subsystem | Direct Prerequisites | Current State | Blocking Layer | Recommended Timing |
|---|---|---|---|---|
| **High-Level IR (HIR)** | AST, Resolver, TypeChecker | Skeleton | None (Ready!) | **0.0.11-s** |
| **Desugaring Pass** | HIR Architecture | Implicit in Runtime | HIR | **0.0.11-s** |
| **Control Flow Graph (MIR)** | HIR | Skeleton | HIR | 0.0.12-d / Phase 2 |
| **CFG-based Drop Insertion** | MIR, Deterministic Scopes | Skeleton | MIR | Phase 2 Development |
| **Monomorphization Engine** | HIR, Type System | Partial (Inference only) | HIR | Phase 2 Development |
| **Compile-Time Const Eval** | HIR | Missing | HIR | Phase 2 Development |
| **Algebraic Effect Solver** | HIR, Diagnostic Bag | Architectural | HIR | Phase 2 Development |
| **LLVM Native Codegen** | MIR, Target ABI, LLVM Bindings | Skeleton | MIR | 0.1.0-alpha (Phase 3) |
| **WebAssembly Codegen** | MIR, WASI Adapter | Skeleton | MIR | 0.1.0-alpha (Phase 3) |
| **Static Borrow Checker** | MIR, Liveness Analyzer | Designed | MIR | Phase 2 / Phase 3 |
| **Integrated Formatter (`fmt`)** | Lexer, AST, SourceManager | Reserved | AST Formatter | Phase 2 Development |
| **Language Server (LSP)** | SourceManager, Resolver, TypeChecker | Missing | None (Frontend ready) | Phase 2 Development |

---

## 17. Candidate 0.0.11-s Scope Proposal

Based on the architectural dependency analysis, we propose the following scope for the next milestone:

### Milestone Title:
**Seira 0.0.11-s — High-Level Intermediate Representation (HIR) & Semantic Lowering Foundation v1.0**

### Primary Objectives:
1. **Formalize HIR Data Structures (`compiler/hir/`)**:
   - Define canonical `HIRProgram`, `HIRModule`, `HIRFunction`, `HIRBlock`, `HIRStmt`, and `HIRExpr`.
   - Ensure every HIR expression carries its resolved `Type` and source `Span`.
   - Ensure identifier references use resolved `SymbolId` instead of raw strings.
2. **Implement AST-to-HIR Lowering Engine (`HIRLowering`)**:
   - Refactor `HIRLowering.lower` to accept `Program`, `ResolverResult`, and `TypecheckResult`.
   - Implement lowering for functions, variable bindings, literals, arithmetic/logical expressions, and control flow.
3. **Canonical Desugaring**:
   - Lower pipelines (`a |> b`) into canonical nested calls `b(a)`.
   - Lower null-coalescing (`opt ?? default`) into explicit `match` on `Option`.
   - Lower Result/Option propagation (`expr?`) into canonical early-exit branches.
   - Lower `with` statements into explicit resource initialization and cleanup wrappers.
4. **Compiler Pipeline Integration**:
   - Update `CompilerDriver.compile()` to execute HIR lowering when `stopAfter >= CompilerStage.HIR`.
   - Add CLI debug/inspection command (e.g. `sr check --emit-hir` or diagnostic inspector).
5. **Technical Debt Cleanups (Non-breaking)**:
   - Synchronize `tools/cli/commands/reserved.ts` to remove stale `run` reservation.
   - Update `runtime/index.ts` version reference to `0.0.10-s`.
6. **Comprehensive Automated Test Coverage**:
   - Unit tests under `tests/unit/hir/` asserting correct lowering, type preservation, desugaring equivalence, and span tracking.

---

## 18. Non-Goals for 0.0.11-s

To prevent scope creep and maintain engineering discipline, the following are strictly **NON-GOALS** for 0.0.11-s:
- **NO MIR construction**: Basic blocks, SSA, and CFG terminators are deferred to a subsequent milestone.
- **NO LLVM or WebAssembly emission**: Machine code generation remains reserved for Phase 3 Alpha.
- **NO Tree-Walking Evaluator rewrite**: The runtime engine will continue executing validated AST during 0.0.11-s; switching the evaluator to execute HIR or bytecode will be evaluated separately.
- **NO Full Borrow Checker**: Static ownership borrow checking remains deferred until MIR.
- **NO Network or Package Registry additions**: CLI package manager commands (`add`, `update`) remain reserved.

---

## 19. Risks & Mitigations

| Risk | Impact | Mitigation Strategy |
|---|---|---|
| **Semantic Drift during Desugaring** | Lowered HIR might execute differently from AST evaluator. | Write differential tests asserting that AST evaluation and HIR desugaring produce identical outcomes. |
| **Diagnostic Span Degradation** | Lowered synthetic expressions might lose error coordinate pointers. | Require all synthetic HIR nodes to inherit the primary `Span` of the originating AST sugar node. |
| **Type Inconsistency** | Synthetic nodes created during desugaring might lack valid types. | The lowering engine must synthesize well-typed expressions using `TypeChecker`'s known types. |

---

## 20. Recommendation

### Recommendation Status: **OPEN FOR REVIEW**

We recommend that the project adopt:
> **Milestone 0.0.11-s: High-Level Intermediate Representation (HIR) & Semantic Lowering Foundation v1.0**

This proposal establishes the missing structural bridge between Seira's expressive surface language and all future backend, optimization, and code generation targets.

This analysis document is submitted for human maintainer and community review. No code implementation shall commence until the design specification for 0.0.11-s is reviewed and explicitly **LOCKED**.
