// Seira Pipeline & Option Handling Example
// Demonstrating transformation pipeline (|>) and fallback (??)

fn compute_score(input: Option<Int>) -> Int {
    input
        ?? 0
        |> double
        |> add_bonus(10)
}
