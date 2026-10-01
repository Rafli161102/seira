# Seira Standard Library Foundation

The Seira standard library adheres strictly to the architectural axiom:
> **Standard Library ≠ Core Language**

## Layout & Modules (`std/src/`)
- `lib.sr`: Root entry and re-exports for the standard library package.
- `core.sr`: Core contracts and canonical traits (`Eq`, `Ord`, `Hash`, `Display`, `Debug`, `Clone`, `Default`, `Iterator`, `Reader`, `Writer`, `Seekable`, `Flushable`, `Sized`, `Resource`).
- `option.sr`: `Option<T>` (`Some(T)`, `None`) and functional combinators (`is_some`, `is_none`, `unwrap`, `expect`, `unwrap_or`, `unwrap_or_else`, `map`, `and_then`, `or_else`).
- `result.sr`: `Result<T, E>` (`Ok(T)`, `Err(E)`) error handling and combinators (`is_ok`, `is_err`, `unwrap`, `expect`, `unwrap_or`, `unwrap_or_else`, `map`, `map_err`, `and_then`, `or_else`).
- `collections.sr`: Collection traits and contracts (`List`, `Map`, `Set`, `Tuple`).
- `iter.sr`: `Iterator<Item>` trait and pipeline transformation primitives.
- `io.sr`: I/O capabilities, `Reader`, `Writer`, `Seekable`, `Flushable`, `Sized`, and `Resource` abstractions.

## Status in Milestone 0.0.10-s
In milestone **0.0.10-s (I/O & Resource Boundary Foundation v1.0)**:
- Core contracts and canonical trait definitions are fully established and integrated into compiler resolution and typechecking.
- The **Prelude** provides global access to fundamental types (`Option`, `Result`, `Some`, `None`, `Ok`, `Err`), basic traits, memory I/O primitives (`MemoryReader`, `MemoryWriter`, `MemoryStream`), console output (`print`, `println`), and resource acquisition. Heavy subsystems remain outside the Prelude.
- The I/O boundary enforces composable capabilities (`Reader`, `Writer`, `Seekable`, `Flushable`, `Sized`, `Resource`), strict Byte/Text boundaries, encoding foundations (UTF-8, ASCII, UTF-16, UTF-32), first-class `Path`, and deterministic `File` lifecycle.
- In-memory data structures and native codegen will mature during the Development (0.0.11-d+) and Alpha series.
