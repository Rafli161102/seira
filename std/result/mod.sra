// Seira Standard Library: Result
// Module: std::result
// Architectural Foundation for 0.0.1-s Seed

type Result<T, E> =
    | Ok(T)
    | Err(E)

impl<T, E> Result<T, E> {
    fn is_ok(self: Result<T, E>) -> Bool {
        // Core intrinsic logic
    }

    fn is_err(self: Result<T, E>) -> Bool {
        // Core intrinsic logic
    }
}
