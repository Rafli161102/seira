# Seira Language Examples

This directory contains introductory and architecture-level code examples demonstrating the syntax, module system, and package model of the **Seira** programming language.

---

## Seira 0.0.8-s Status: Module & Package Foundation

> [!NOTE]
> In release **0.0.8-s (Module & Package Foundation)**, Seira provides canonical `.sr` source extension support and the `sr` CLI tool.
> Seira operates seamlessly in two modes:
> 1. **Single-file mode**: execute standalone source scripts directly (`sr run script.sr`) without requiring a package manifest.
> 2. **Package/Project mode**: compile and execute multi-module projects managed by `Seira.toml` and verified by `Seira.lock`.

---

## Standalone Examples (.sr)

### 1. `single_file.sr` / `hello_world.sr`
Minimal canonical program illustrating standalone single-file execution without a package manifest:
```sr
fn square(x: Int) -> Int {
    x * x
}

fn main() {
    println("Hello from Seira 0.0.8-s!")
    println(square(8))
}
```

Check and run:
```bash
sr check examples/single_file.sr
sr run examples/single_file.sr
```

### 2. `pipeline.sr`
Illustrates function composition via the pipeline operator (`|>`) and Option fallback (`??`):
```sr
fn double(x: Int) -> Int {
    x * 2
}

fn add_bonus(x: Int, bonus: Int) -> Int {
    x + bonus
}

fn compute_score(input: Option<Int>) -> Int {
    input
        ?? 0
        |> double
        |> add_bonus(10)
}

fn main() {
    println(compute_score(Some(5)))
}
```

Check and run:
```bash
sr check examples/pipeline.sr
sr run examples/pipeline.sr
```

### 3. `control_flow.sr`
Illustrates loops, branch expressions, collections, and pattern matching.
```bash
sr check examples/control_flow.sr
sr run examples/control_flow.sr
```

### 4. `generics_and_traits.sr`
Demonstrates generic functions, type aliases, union types, trait contracts (`trait Printable`), trait implementations (`impl Int: Printable`), trait constraints (`<T: Printable>`), and higher-order generic functions (`apply<T, R>`).
```bash
sr check examples/generics_and_traits.sr
sr run examples/generics_and_traits.sr
```

---

## Multi-Module & Package Examples

### 5. `multi_module/`
Demonstrates a multi-module package layout:
```
multi_module/
├── Seira.toml
└── src/
    ├── main.sr       # Entry module (fn main)
    ├── box.sr        # Generic functions across modules
    ├── internal.sr   # Private helpers & public types (pub type User)
    ├── facade.sr     # Public re-export (pub use internal.User)
    └── printable.sr  # Cross-module trait contract (pub trait Printable)
```

Highlights:
- **Filesystem module mapping**: `src/internal.sr` -> module `internal`.
- **Visibility**: default private, exported with `pub`.
- **Import / Use**: `import box`, `use facade.User as AppUser`.
- **Re-export**: `pub use internal.User`.
- **Cross-module traits and generics**: implementations and constraints checked across module boundaries.

Check and run:
```bash
sr check examples/multi_module
sr run examples/multi_module
```

### 6. `path_dep_example/`
Demonstrates path dependency declaration (`[dependencies] shared_lib = { path = "../shared" }`) where `app` depends on `shared_lib`.
```bash
sr run examples/path_dep_example/app
```

### 7. `workspace_example/`
Demonstrates multi-package workspace management:
```
workspace_example/
├── Seira.toml        # [workspace] members = ["app", "shared"]
├── shared/
│   ├── Seira.toml
│   └── src/lib.sr
└── app/
    ├── Seira.toml    # shared = { path = "../shared" }
    └── src/main.sr
```

Run workspace member:
```bash
sr run examples/workspace_example/app
```
