# Seira Standard Library

The Seira standard library adheres to the architectural rule:
> **Standard Library ≠ Core Language**

## Layout
- `core/`: Primitives, `Option<T>`, `Result<T, E>`, traits, and fundamental collections. Zero OS dependencies.
- `io/`: Formatted output, file system abstractions, and streams. Declares explicit effects (`!`).
- `sys/`: Host system interrogation, environment, arguments, and process lifecycles.

## Status in 0.0.1-s
The standard library specification and interface contracts are defined here. The implementation will be populated during the Seed and Development series and compiled to native/Wasm during the Alpha series.
