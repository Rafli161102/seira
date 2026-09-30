// Seira Standard Library: Time
// Module: std::time
// Architectural Foundation for 0.0.1-s Seed

struct Duration {
    nanoseconds: Int
}

struct Instant {
    timestamp_nanos: Int
}

fn sleep!(duration: Duration) -> Unit {
    // Intrinsic effectful sleep
}
