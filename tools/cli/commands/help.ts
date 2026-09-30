/**
 * Seira CLI Help Command
 * Categorizes commands by current implementation status (0.0.1-s Seed vs Reserved).
 */

import { SEIRA_VERSION } from './version.ts';

export function runHelp(): void {
  console.log(`Seira ${SEIRA_VERSION} — Seed Foundation
Simple to write. Predictable to run.

USAGE:
    seira <COMMAND> [OPTIONS] [ARGUMENTS]

OPTIONS:
    -v, --version      Print version information and exit
    -h, --help         Print this help message and exit

CORE COMMANDS (Implemented in 0.0.1-s):
    version            Display official Seira version (${SEIRA_VERSION})
    info               Display environment, toolchain, and project status
    check <file.sra>   Validate Seira syntax via Seed lexer and parser
    init               Initialize a new Seira project in the current directory
    new <name>         Create a new Seira project in a new directory

TOOLCHAIN COMMANDS (Reserved / Planned for Future Releases):
    build              Compile Seira package into native or Wasm binary (Planned: Alpha)
    run                Compile and execute a Seira application (Planned: Alpha)
    test               Execute package unit and integration tests (Planned: Alpha)
    fmt                Format Seira source files according to style rules (Planned: Dev)
    doc                Generate documentation from source comments (Planned: Dev)
    clean              Remove build artifacts and intermediate files (Planned: Dev)
    cache              Inspect and manage compiler disk caches (Planned: Dev)
    add <dep>          Add a dependency to Seira.toml (Planned: Dev)
    remove <dep>       Remove a dependency from Seira.toml (Planned: Dev)
    update             Update package dependencies (Planned: Dev)
    fetch              Download package dependencies (Planned: Dev)

DOCUMENTATION:
    https://github.com/Rafli161102/seira
`);
}
