// Seira 0.0.4-s Valid Semantic Basics
// Verifies name resolution, type inference, functions, and expressions

fn add(a: Int, b: Int) -> Int {
    a + b
}

fn compute(flag: Bool, factor: Int) -> Int {
    base = 10
    if flag {
        base + factor
    } else {
        base - factor
    }
}

fn main() {
    mut counter = 0
    counter = 1
    sum = add(counter, 41)
    result = compute(true, sum)
    println("Semantic check completed")
}
