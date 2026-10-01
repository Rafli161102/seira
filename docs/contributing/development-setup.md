# Development Setup & Contributor Guide

Welcome to the Seira project! This guide walks you through setting up your local development environment to work on the Seira compiler, runtime, tooling, and documentation.

---

## 1. Prerequisites

Before getting started, ensure you have:
- **Node.js**: Version `22.0.0` or higher (Node `v26+` recommended).
- **npm**: Version `10+` (bundled with Node.js).
- **Git**: Version `2.30+`.

Verify your environment:
```bash
node -v
npm -v
git --version
```

---

## 2. Cloning the Repository

Seira development takes place primarily on the `develop` branch:

```bash
git clone https://github.com/Rafli161102/seira.git
cd seira
git checkout develop
```

Install local development dependencies (for TypeScript verification and linting):
```bash
npm install
```

---

## 3. Running the Seira CLI

The Seira CLI is located at `bin/seira`:

```bash
# Verify version
./bin/seira --version
# Output: Seira 0.0.1-s

# Inspect environment and active project manifest
./bin/seira info

# Validate an example Seira file
./bin/seira check examples/hello_world.sr
```

Optional: You can link the binary to your system PATH using:
```bash
npm link
# Now you can run `seira` directly from any directory:
seira --version
```

---

## 4. Running the Test Suite

Seira prioritizes automated testing. Run the entire test suite with:

```bash
npm test
```

To run a specific test suite:
```bash
node --experimental-strip-types --test tests/lexer/lexer.test.ts
node --experimental-strip-types --test tests/parser/parser.test.ts
node --experimental-strip-types --test tests/cli/cli.test.ts
```

---

## 5. Type-Checking

To verify type safety across the compiler and tooling codebase:
```bash
npm run typecheck
```

---

## 6. Project Layout

When working on changes, adhere strictly to our architectural boundaries:

- `compiler/` - Lexer, Parser, AST definitions, Diagnostics, and intermediate representations.
- `runtime/` - Value representations, memory lifecycle contracts, and effect handling interfaces.
- `std/` - Standard library specifications and code.
- `tools/` - CLI command implementations and `Seira.toml` manifest parser.
- `tests/` - Automated unit, integration, and conformance tests.
- `examples/` - Example `.sr` programs.
- `docs/` - System and language documentation.

---

## 7. Submitting Your Changes

1. Create a topic branch:
   ```bash
   git checkout -b feature/my-feature-name
   ```
2. Write tests covering your changes in `tests/`.
3. Ensure all tests and type checks pass:
   ```bash
   npm test
   npm run typecheck
   ```
4. Commit using standard conventional commit formatting:
   ```bash
   git commit -m "feat(lexer): support hex integer literals"
   ```
5. Push and open a Pull Request targeting the `develop` branch.
