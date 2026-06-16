#[derive(Debug, Clone)]
pub struct AppConfig {
    pub host: String,
    pub port: u16,
    pub database_url: String,
    pub jwt_secret: String,
    pub encryption_key: String,
    pub admin_username: String,
    pub admin_password: String,
    pub default_user_quota: f64,
    pub register_enabled: bool,
    /// 站点域名（OAuth 回调等场景使用）
    pub base_url: String,
    /// 数据目录路径（存储图标、素材等静态文件）
    pub data_dir: String,
}

impl AppConfig {
    pub fn from_env() -> Self {
        // 优先级 1: 系统环境变量 / .env
        let database_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| {
            // 优先级 2: 默认值
            "postgres://tokensapi:tokensapi@localhost:5432/tokensapi".to_string()
        });

        let data_dir = std::env::var("DATA_DIR").unwrap_or_else(|_| "data".to_string());
        // 确保数据目录存在，以便写入持久化生成的安全凭证文件
        let _ = std::fs::create_dir_all(&data_dir);

        // 1. JWT_SECRET：如缺失环境变量，在数据目录下持久化生成强随机 Key
        let jwt_secret = std::env::var("JWT_SECRET").unwrap_or_else(|_| {
            let secret_file = format!("{}/.jwt_secret", data_dir);
            if let Ok(content) = std::fs::read_to_string(&secret_file) {
                let trimmed = content.trim();
                if !trimmed.is_empty() {
                    return trimmed.to_string();
                }
            }
            let generated: String = (0..32)
                .map(|_| {
                    let r: u8 = rand::random();
                    format!("{:02x}", r)
                })
                .collect();
            if let Err(e) = std::fs::write(&secret_file, &generated) {
                eprintln!("⚠️ [ERROR] Failed to save generated JWT_SECRET to {}: {}", secret_file, e);
            }
            generated
        });
        
        // 2. ENCRYPTION_KEY：如端点未配置，在数据目录下生成并持久化 32 字节 Hex 强密钥
        let encryption_key = std::env::var("ENCRYPTION_KEY").unwrap_or_else(|_| {
            let key_file = format!("{}/.encryption_key", data_dir);
            if let Ok(content) = std::fs::read_to_string(&key_file) {
                let trimmed = content.trim();
                if !trimmed.is_empty() {
                    return trimmed.to_string();
                }
            }
            let generated: String = (0..32)
                .map(|_| {
                    let r: u8 = rand::random();
                    format!("{:02x}", r)
                })
                .collect();
            if let Err(e) = std::fs::write(&key_file, &generated) {
                eprintln!("⚠️ [ERROR] Failed to save generated ENCRYPTION_KEY to {}: {}", key_file, e);
            }
            generated
        });

        // 3. ADMIN_PASSWORD：若缺失环境变量，生成强随机初始密码并高亮提醒用户
        let mut admin_password_generated = false;
        let admin_password = std::env::var("ADMIN_PASSWORD").unwrap_or_else(|_| {
            let pwd_file = format!("{}/.admin_password", data_dir);
            if let Ok(content) = std::fs::read_to_string(&pwd_file) {
                let trimmed = content.trim();
                if !trimmed.is_empty() {
                    return trimmed.to_string();
                }
            }
            
            // 产生高强度 12 位随机初始密码并避开易混淆字符
            let chars = b"abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
            let generated: String = (0..12)
                .map(|_| {
                    let idx = (rand::random::<usize>()) % chars.len();
                    chars[idx] as char
                })
                .collect();
            if let Err(e) = std::fs::write(&pwd_file, &generated) {
                eprintln!("⚠️ [ERROR] Failed to save generated ADMIN_PASSWORD to {}: {}", pwd_file, e);
            }
            admin_password_generated = true;
            generated
        });

        if admin_password_generated {
            // 在控制台上输出高亮安全提示，提醒管理员自动生成的初始密码
            eprintln!("\n==================================================================");
            eprintln!("⚠️  [SECURITY WARNING] ADMIN_PASSWORD environment variable was not set.");
            eprintln!("🚀  A strong random password has been generated for default 'admin' user:");
            eprintln!("👉  [{}]  👈", admin_password);
            eprintln!("📝  Password has been saved to: {}/.admin_password", data_dir);
            eprintln!("🔒  Please log in with this password and change it immediately!");
            eprintln!("==================================================================\n");
        }

        Self {
            host: std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            port: std::env::var("PORT")
                .unwrap_or_else(|_| "3000".to_string())
                .parse()
                .expect("PORT must be a number"),
            database_url,
            jwt_secret,
            encryption_key,
            admin_username: std::env::var("ADMIN_USERNAME")
                .unwrap_or_else(|_| "admin".to_string()),
            admin_password,
            default_user_quota: std::env::var("DEFAULT_USER_QUOTA")
                .unwrap_or_else(|_| "0".to_string())
                .parse()
                .unwrap_or(0.0),
            register_enabled: std::env::var("REGISTER_ENABLED")
                .unwrap_or_else(|_| "true".to_string())
                .parse()
                .unwrap_or(true),
            base_url: std::env::var("BASE_URL")
                .unwrap_or_else(|_| "http://localhost:3000".to_string()),
            data_dir,
        }
    }
}
