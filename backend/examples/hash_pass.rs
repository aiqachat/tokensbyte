use tokensbyte_server::auth; fn main() { println!("{}", auth::hash_password("123456").unwrap()); }
