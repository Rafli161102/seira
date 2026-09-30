// Seira 0.0.6-s — Data & Control Foundation Example
// Demonstrates control flow, collections, pattern matching, and lambdas

fn describe_number(n: Int) -> String {
    match n {
        0 => "zero"
        1 => "one"
        _ => "many"
    }
}

fn main() {
    numbers = [1, 2, 3, 4, 5]
    mut total = 0

    for n in numbers {
        total = total + n
    }

    first = numbers[0]
    first_desc = match first {
        Some(x) => describe_number(x)
        None => "empty"
    }

    double = x => x * 2
    doubled_total = double(total)

    println("Total:")
    println(total)
    println("First element:")
    println(first_desc)
    println("Doubled total:")
    println(doubled_total)
}
