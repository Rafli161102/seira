// Seira Pipeline & Option Handling Example
// Demonstrating transformation pipeline (|>) and fallback (??)

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
