// Seira Standard Library: Core
// Module: std::core

// Option type representing an optional value
type Option<T> =
    | Some(T)
    | None

// Result type representing either success or an error
type Result<T, E> =
    | Ok(T)
    | Err(E)

// Core clone trait
trait Clone<T> {
    fn clone(self: T) -> T
}

// Core display trait
trait Display<T> {
    fn to_string(self: T) -> String
}
