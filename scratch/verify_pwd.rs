use argon2::{Argon2, PasswordHash, PasswordVerifier};

fn main() {
    let hash = "$argon2id$v=19$m=19456,t=2,p=1$J4zJ8XYindS6BpdQInPHsA$fnCYZnl1X2fhYXK/NcfpFEdVU33JcSoMfjB45uxmVkM";
    let passwords = vec!["123456", "admin"];
    
    let parsed_hash = PasswordHash::new(hash).unwrap();
    
    for pwd in passwords {
        let is_ok = Argon2::default()
            .verify_password(pwd.as_bytes(), &parsed_hash)
            .is_ok();
        println!("Password '{}' match: {}", pwd, is_ok);
    }
}
