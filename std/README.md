# Seira Standard Library Foundation

The Seira standard library adheres strictly to the architectural axiom:
> **Standard Library ≠ Core Language**

## Layout
- `core/`: Primitives, fundamental traits (`Clone`, `Display`). Zero OS dependencies.
- `collections/`: Foundational collections (`List`, `Map`, `Set`).
- `text/`: String slices, formatting, and unicode abstractions.
- `option/`: `Option<T>` (`Some(T)`, `None`) and functional combinators.
- `result/`: `Result<T, E>` (`Ok(T)`, `Err(E)`) error handling.
- `iterator/`: `Iterator<Item>` trait and pipeline transformation primitives.
- `math/`: Core numeric operations and constants (`PI`, `E`).
- `io/`: Formatted console output (`println!`, `print!`). Declares explicit effects (`!`).
- `fs/`: File system abstractions with deterministic `with` scopes. Explicit effects (`!`).
- `net/`: Network sockets and streams. Explicit effects (`!`).
- `time/`: High-resolution clocks, `Instant`, `Duration`, and `sleep!`.

## Status in the Seed Series (0.0.1-s – 0.0.10-s)
Throughout the Seed Series, these modules provide **architectural contracts and type specifications** only.
They establish the layout for the project and will be natively compiled during the Alpha series.
