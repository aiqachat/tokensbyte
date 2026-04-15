fn main() {
    let file_url = String::from("a/b/c");
    let file_name = String::from("c");
    let mut parts = file_url.split('/');
    let object_key = parts.last().unwrap_or(&file_name);
}
