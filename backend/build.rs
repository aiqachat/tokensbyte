use std::env;
use std::fs;
use std::path::Path;
use std::process::Command;

fn main() {
    let out_dir = env::var_os("OUT_DIR").unwrap();
    let dest_path = Path::new(&out_dir).join("git_commits.json");

    // 尝试运行 git log
    // 注意：Docker 构建上下文如果只拷了 backend 目录可能找不到 .git
    let output = Command::new("git")
        .args([
            "log",
            "-10",
            "--format=%H\x1F%h\x1F%an\x1F%cd\x1F%s",
            "--date=format:%Y-%m-%d %H:%M:%S",
        ])
        .output();

    let json_str = match output {
        Ok(out) if out.status.success() => {
            let raw = String::from_utf8_lossy(&out.stdout).to_string();
            let mut commits = vec![];
            for (i, line) in raw.lines().filter(|l| !l.trim().is_empty()).enumerate() {
                let parts: Vec<&str> = line.splitn(5, '\x1F').collect();
                let version = format!("v1.0.{}", 10usize.saturating_sub(i));
                let hash = parts.first().unwrap_or(&"").to_string();
                let short_hash = parts.get(1).unwrap_or(&"").to_string();
                let raw_author = parts.get(2).unwrap_or(&"").to_string();
                let author = if raw_author.chars().count() > 2 {
                    let chars: Vec<char> = raw_author.chars().collect();
                    format!("{}***{}", chars.first().unwrap_or(&'a'), chars.last().unwrap_or(&'z'))
                } else if raw_author.chars().count() == 2 {
                    let chars: Vec<char> = raw_author.chars().collect();
                    format!("{}*", chars.first().unwrap_or(&'a'))
                } else {
                    raw_author
                };
                let date = parts.get(3).unwrap_or(&"").to_string();
                let message = parts.get(4).unwrap_or(&"").replace("\n", " ");
                
                commits.push(serde_json::json!({
                    "index": i,
                    "is_current": i == 0,
                    "version": version,
                    "hash": hash,
                    "short_hash": short_hash,
                    "author": author,
                    "date": date,
                    "message": message
                }));
            }
            if commits.is_empty() {
                serde_json::to_string(&vec![serde_json::json!({
                    "index": 0, "is_current": true, "version": "v1.0.0", "hash": "-", "short_hash": "Release", "author": "TokensByte System", "date": "2026", "message": "生产环境已构建 (无可用的提交记录)"
                })]).unwrap()
            } else {
                serde_json::to_string(&commits).unwrap()
            }
        }
        _ => {
            // 后备数据（Fallback）：如果在构建环境没有任何 git 以及 .git 实体文件时的安全托底方案
            serde_json::to_string(&vec![serde_json::json!({
                "index": 0, "is_current": true, "version": "v1.0.0", "hash": "-", "short_hash": "Release", "author": "TokensByte System", "date": "2026", "message": "生产环境已构建 (Git 未集成)"
            })]).unwrap()
        }
    };

    fs::write(&dest_path, json_str).unwrap();

    // 监测对应更改以触发更新，保障热重载
    if Path::new("../.git/HEAD").exists() {
        println!("cargo:rerun-if-changed=../.git/HEAD");
    } else if Path::new(".git/HEAD").exists() {
        println!("cargo:rerun-if-changed=.git/HEAD");
    } else {
        // 无 git 时不强制重构
    }

    // 自动检测插件文件/目录的存在性，实现代码级别的解耦和优雅降级
    let optional_plugins = vec![
        ("src/api/redemptions.rs", "plugin_redemptions"),
        ("src/models/redemption.rs", "plugin_redemptions_model"),
        ("src/api/finance.rs", "plugin_finance"),
        ("src/api/team_marketing.rs", "plugin_team_marketing"),
        ("src/services/payment", "plugin_payment"),
        ("src/api/pay.rs", "plugin_pay"),
    ];

    for (path_str, cfg_name) in optional_plugins {
        let path = Path::new(path_str);
        // 注册自定义的条件编译配置名，消除新版 rustc 编译时的未识别警告
        println!("cargo:rustc-check-cfg=cfg({})", cfg_name);
        if path.exists() {
            println!("cargo:rustc-cfg={}", cfg_name);
        }
        // 让 cargo 在文件出现或删除时重新运行 build.rs
        println!("cargo:rerun-if-changed={}", path_str);
    }
}
