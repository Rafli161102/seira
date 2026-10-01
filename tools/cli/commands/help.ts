/**
 * Seira CLI Help Command
 * Categorizes commands by current implementation status (0.0.1-s Seed vs Reserved).
 */

import { SEIRA_VERSION } from './version.ts';

export function runHelp(): void {
  console.log(`Seira ${SEIRA_VERSION} — Standard Library & Core Contract Foundation
Simple to write. Predictable to run.

USAGE:
    sr <COMMAND> [OPTIONS] [ARGUMENTS]
    seira <COMMAND> [OPTIONS] [ARGUMENTS]

OPTIONS:
    -v, --version, v   Print version information and exit
    -h, --help, h      Print this help message and exit

CORE COMMANDS:
    version, v         Display official Seira version (${SEIRA_VERSION})
    info, i            Display environment, toolchain, and project status
    check, c [target]  Validate Seira source file (.sr) or package (Seira.toml)
    run, r [target]    Execute Seira file (.sr) or package via Tree-Walking engine
    init               Initialize a new Seira package (Seira.toml and src/main.sr)
    new <name>         Create a new Seira project in a new directory

TOOLCHAIN COMMANDS (Reserved / Planned for Future Milestones):
    build, b           Compile Seira package (Planned: Alpha)
    test, t            Execute package unit and integration tests (Planned: Alpha)
    fmt, f             Format Seira source files according to style rules (Planned: Dev)
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
