/**
 * Seira CLI Help Command
 * Categorizes commands by current implementation status across Seed and Development releases.
 */

import { SEIRA_VERSION } from './version.ts';

export function runHelp(): void {
  console.log(`Seira ${SEIRA_VERSION} — Runtime Map Key References & Collection Safety (Development Series)
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
    fmt, f             Format Seira source files according to style rules (Planned: 0.0.14-d)
    doc                Generate documentation from source comments (Planned: 0.0.14-d)
    clean              Remove build artifacts and intermediate files (Planned: 0.0.14-d)
    cache              Inspect and manage compiler disk caches (Planned: 0.0.14-d)
    add <dep>          Add a dependency to Seira.toml (Planned: 0.0.14-d)
    remove <dep>       Remove a dependency from Seira.toml (Planned: 0.0.14-d)
    update             Update package dependencies (Planned: 0.0.14-d)
    fetch              Download package dependencies (Planned: 0.0.14-d)

DOCUMENTATION:
    https://github.com/Rafli161102/seira
`);
}
