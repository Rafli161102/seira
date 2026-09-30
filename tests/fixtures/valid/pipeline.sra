// Valid pipeline expression chaining
fn double(x: Int) -> Int {
    return x * 2;
}

fn increment(x: Int) -> Int {
    return x + 1;
}

fn process(num: Int) -> Int {
    return num |> double |> increment;
}
