use argon2::{password_hash::SaltString, Argon2, PasswordHasher};
use rand::rngs::OsRng;

fn main() {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2.hash_password("123456".as_bytes(), &salt).unwrap();
    println!("{}", hash);
}
