# Seira Compiler Architecture Specification

| Field | Value |
|---|---|
| Specification | Seira 0.0.3-s Compiler Architecture |
| Target Milestone | 0.0.3-s (Seed Series) |
| Architecture Status | **Implemented & Locked** |

---

## 1. Executive Summary

The Seira 0.0.3-s release establishes the real compiler foundation for the Seira programming language. It connects the compiler front-end pipeline end-to-end:

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
Compiler Driver & Diagnostics (Structured errors, Source pointers, Hints)
```

In accordance with the 0.0.3-s scope rules, the compiler stops strictly at AST and diagnostics. Downstream subsystems (`resolver`, `typecheck`, `hir`, `mir`, `backend`) remain honest architectural boundaries.

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
├── resolver/        # Symbol resolution & scoping [ARCHITECTURAL SKELETON — NOT IMPLEMENTED]
├── typecheck/       # Type checker & effect checker [ARCHITECTURAL SKELETON — NOT IMPLEMENTED]
├── hir/             # High-Level IR [ARCHITECTURAL SKELETON — NOT IMPLEMENTED]
├── mir/             # Mid-Level IR & CFG [ARCHITECTURAL SKELETON — NOT IMPLEMENTED]
└── backend/         # Native LLVM & Wasm emitters [ARCHITECTURAL SKELETON — NOT IMPLEMENTED]
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
| `resolver/` | **ARCHITECTURAL SKELETON** | Reserved (0.0.4-s) | Contracts for `SymbolTable`, `SymbolInfo`, `ScopeKind` |
| `typecheck/` | **ARCHITECTURAL SKELETON** | Reserved (0.0.4-s) | Contracts for `Type`, `TypecheckResult`, inference hooks |
| `hir/` | **ARCHITECTURAL SKELETON** | Reserved (0.0.11-d) | Contracts for `HIRProgram`, `HIRModule`, `HIRFunction`, `HIRBlock` |
| `mir/` | **ARCHITECTURAL SKELETON** | Reserved (0.0.11-d) | Contracts for `MIRModule`, `BasicBlock`, `MIROperation`, `MIRResourceOp` |
| `backend/` | **ARCHITECTURAL SKELETON** | Reserved (0.1.0-alpha) | Contracts for `BackendEmitter`, `BackendOptions`, `BackendResult` |

---

## 4. Lexer & Token Model

### 4.1 Token Categories
- **Keywords**: `fn`, `type`, `enum`, `trait`, `impl`, `if`, `else`, `match`, `for`, `while`, `loop`, `break`, `continue`, `const`, `mut`, `pub`, `priv`, `async`, `await`, `pure`, `unsafe`, `with`, `import`, `use`, `as`, `self`, `true`, `false`, `and`, `or`, `not`
- **Literals**:
  - `Int`: Decimal (`42`), Hexadecimal (`0xFF`), Binary (`0b1010`)
  - `UInt`: Unsigned integers with `u` suffix (`100u`, `0xFFu`)
  - `Float`: Floating-point numbers (`3.14159`)
  - `Bool`: Boolean literals (`true`, `false`)
  - `Char`: Single character literals (`'a'`, `'\n'`, `'\t'`, `'\\'`, `'\''`)
  - `String`: Double-quoted strings with escape sequences (`"hello\n"`)
- **Operators**:
  - Arithmetic: `+`, `-`, `*`, `/`, `%`
  - Comparison: `<`, `>`, `<=`, `>=`
  - Equality: `==`, `!=`
  - Assignment & Compound: `=`, `+=`, `-=`, `*=`, `/=`, `%=`
  - Pipeline: `|>`
  - Range: `..` (inclusive/half-open), `..<` (exclusive upper bound)
  - Result / Option: `?` (propagation), `??` (default fallback), `?.` (safe access)
  - Effect: `!` (effectful function marker, effect dispatch)
  - Type & Expression: `:`, `->`, `=>`, `.`
- **Delimiters**: `(`, `)`, `[`, `]`, `{`, `}`, `,`, `:`, `.`, `;`
- **Comments**: Single-line (`// ...`) and block (`/* ... */`), correctly advancing source positions and lines without emitting semantic tokens.
- **End of File**: `EOF` token terminating the stream.

### 4.2 Rejection of Banned Operators
The lexer enforces Seira's locked syntax rules by rejecting banned syntax with helpful diagnostics:
- `++` and `--`: Rejected (`E1002`, `E1003`) with suggestion to use `+= 1` or `-= 1`.
- `&&` and `||`: Rejected (`E1005`, `E1006`) with suggestion to use `and` / `or`.
- `null`: Rejected (`E1007`) with suggestion to use `Option<T>` with `None`.
- `===` and `!==`: Rejected (`E1008`) with suggestion to use `==` / `!=`.
- `::`: Rejected (`E1009`) with suggestion to use `.` for namespace/member access.
- `!x` (as boolean negation): Boolean negation must use `not`.

---

## 5. Parser Architecture

### 5.1 Precedence Climbing (Pratt Parser)
Expressions are parsed using deterministic precedence climbing according to the locked Operator Matrix:

1. **Assignment** (Right-associative): `=`, `+=`, `-=`, `*=`, `/=`, `%=`
2. **Pipeline** (Left-associative): `|>`
3. **Option Fallback** (Left-associative): `??`
4. **Logical Or** (Left-associative): `or`
5. **Logical And** (Left-associative): `and`
6. **Equality** (Left-associative): `==`, `!=`
7. **Comparison** (Left-associative): `<`, `>`, `<=`, `>=`
8. **Range** (Non-associative): `..`, `..<`
9. **Additive** (Left-associative): `+`, `-`
10. **Multiplicative** (Left-associative): `*`, `/`, `%`
11. **Unary** (Prefix): `not`, `-`, `+`
12. **Postfix**: Call `(...)`, Member Access `.`, Nullable Access `?.`, Option Propagation `?`
13. **Primary**: Literals, Identifiers, Grouping `(...)`, If Expressions, Block Expressions

### 5.2 Supported Syntax Constructs
- **Bindings**:
  - `name = expression;` (immutable bare binding)
  - `mut name = expression;` (mutable bare binding)
  - `let [mut] name[: Type] = expression;` (statement binding)
  - `const name[: Type] = expression;` (constant binding)
- **Functions**:
  - Standard block: `fn name(param: Type) -> ReturnType { ... }`
  - Expression-style: `fn add(a, b) => a + b;`
  - Effectful: `fn log!(msg: String) { ... }`
- **Expressions**:
  - Pipeline chaining: `value |> step1 |> step2`
  - Option fallback: `opt ?? fallback`
  - Option propagation: `fetch()?`
  - Range expressions: `0..10`, `0..<10`
  - If expressions: `if condition { val1 } else { val2 }`
  - Block expressions: `{ stmt; expr }`
- **Declarations**:
  - `struct Name { field: Type }`
  - `enum Name { Variant1, Variant2 }`
  - `type Alias = TargetType`
  - `with resource as handle { ... }`

### 5.3 Error Recovery
The parser implements controlled, deterministic error recovery via `synchronize()`. When a syntactic error occurs inside a statement or block:
1. An `E1011` or specific error diagnostic with source span is recorded in `DiagnosticsBag`.
2. A `ParseError` is thrown internally.
3. The enclosing block catches `ParseError` and calls `synchronize()`, skipping tokens until reaching a semicolon or a keyword starting the next statement (`fn`, `let`, `const`, `mut`, `if`, `while`, `return`, `with`, `struct`, `enum`, `type`).
4. Parsing resumes cleanly, enabling reporting of multiple diagnostics in a single invocation.

---

## 6. AST Foundation

Every AST node implements the `ASTNode` interface and retains a complete `Span`:
```ts
export interface Span {
  start: number;
  end: number;
  sourceId?: number;
  line?: number;
  column?: number;
}
```

Key node categories:
- **Program**: Root node containing top-level `Decl` items.
- **Declarations**: `FunctionDecl`, `StructDecl`, `EnumDecl`, `TypeAliasDecl`, `ImportDecl`.
- **Statements**: `BindingStmt`, `LetStmt`, `ConstStmt`, `AssignStmt`, `ExprStmt`, `ReturnStmt`, `WithStmt`.
- **Expressions**: `LiteralExpr`, `IdentifierExpr`, `BinaryExpr`, `UnaryExpr`, `CallExpr`, `MemberAccessExpr`, `PipelineExpr`, `RangeExpr`, `IfExpr`, `BlockExpr`, `GroupExpr`.

---

## 7. Diagnostics Quality & Formatting

Diagnostics follow compiler industry best practices:
```text
error[E1002]: Increment operator '++' is not permitted in Seira.
  --> tests/fixtures/invalid/banned_operators.sra:4:6
  |
4 |     x++;
  |      ^^
  = help: Use 'x += 1' or 'x = x + 1' instead.
```

- **Deterministic**: Always identical output for identical source input.
- **Source-Aware**: Points directly to line and column with an ASCII carets (`^`) snippet.
- **Help & Suggestions**: Explains the intended idiomatic alternative.
- **No Stack Traces**: Compiler errors do not expose internal execution traces.

---

## 8. Compiler Driver & CLI Integration

The CLI (`bin/seira`) invokes the `CompilerDriver` via `compileSource()` / `createDefaultDriver()`. The CLI does NOT perform lexing or parsing directly.

Session lifecycle:
1. `CompilerContext` is initialized with `CompilerConfig`.
2. Source files are registered in `SourceManager`.
3. `CompilerDriver.run()` executes pipeline stages (`Source` $\to$ `Lex` $\to$ `Parse`).
4. Output AST and diagnostics are packaged in `DriverResult`.

---

## 9. Intentionally Unimplemented Subsystems (Boundaries)

The following stages are explicitly **NOT** implemented in 0.0.3-s:
- **Resolver**: Name resolution, import graphs, and variable scoping (Reserved: 0.0.4-s).
- **Type Checker**: HM type inference, trait validation, effect checking, ownership checking (Reserved: 0.0.4-s).
- **HIR / MIR**: Desugaring, control flow graphs, SSA conversion (Reserved: 0.0.11-d).
- **Backend**: LLVM IR emission, WebAssembly binary generation (Reserved: 0.1.0-alpha).
- **Runtime Execution**: Compiled machine code execution (Reserved: 0.1.0-alpha).
