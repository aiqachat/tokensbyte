/// 智能拼接 base URL 与路径后缀，自动消除重复的路径前缀。
///
/// # 规则
/// - base_url 末尾的 `/` 会被自动去除
/// - suffix 开头的 `/` 会被自动去除
/// - 如果 base_url 的路径部分已经是 suffix 的前缀（例如 base="/api", suffix="/api/v3/..."），
///   则自动去重，防止出现 `/api/api/v3/...` 的双重路径
///
/// # 示例
/// ```
/// // base 已带 /api，suffix 也以 /api 开头
/// assert_eq!(join_url("https://api.example.com/api", "/api/v3/chat"), "https://api.example.com/api/v3/chat");
/// // 正常拼接
/// assert_eq!(join_url("https://api.example.com", "/v1/chat"), "https://api.example.com/v1/chat");
/// // 兼容 base 末尾有斜杠
/// assert_eq!(join_url("https://api.example.com/v1/", "chat/completions"), "https://api.example.com/v1/chat/completions");
/// ```
pub fn join_url(base: &str, suffix: &str) -> String {
    let base = base.trim_end_matches('/');
    let suffix = suffix.trim_start_matches('/');

    // 提取 base URL 的路径部分（scheme://host 之后的部分）
    let base_path = extract_url_path(base);

    // 如果 base 存在路径，检查 suffix 是否以该路径开头（即重复）
    if !base_path.is_empty() {
        let base_path_clean = base_path.trim_start_matches('/');
        if !base_path_clean.is_empty() && suffix.starts_with(base_path_clean) {
            // 确保是完整路径段的匹配，后面跟着 '/' 或已到字符串末尾
            let remainder = &suffix[base_path_clean.len()..];
            if remainder.is_empty() || remainder.starts_with('/') {
                // 去掉 suffix 中重复的前缀部分，直接接在 base 后面
                let deduped = remainder.trim_start_matches('/');
                if deduped.is_empty() {
                    return base.to_string();
                }
                return format!("{}/{}", base, deduped);
            }
        }
    }

    format!("{}/{}", base, suffix)
}

/// 从 URL 中提取路径部分（去除 scheme 和 host）
fn extract_url_path(url: &str) -> &str {
    // 去掉 scheme (http:// or https://)
    let without_scheme = if let Some(s) = url.strip_prefix("https://") {
        s
    } else if let Some(s) = url.strip_prefix("http://") {
        s
    } else {
        return "";
    };

    // 路径从第一个 '/' 开始
    if let Some(slash_pos) = without_scheme.find('/') {
        &without_scheme[slash_pos..]
    } else {
        ""
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_join_url_dedup() {
        // 核心场景：base 已带路径前缀，suffix 重复该前缀
        assert_eq!(
            join_url("https://api.artsapi.com/api", "/api/v3/contents/generations/tasks"),
            "https://api.artsapi.com/api/v3/contents/generations/tasks"
        );
        assert_eq!(
            join_url("https://api.example.com/api", "api/v1/chat/completions"),
            "https://api.example.com/api/v1/chat/completions"
        );
    }

    #[test]
    fn test_join_url_normal() {
        // 正常情况：base 没有路径，suffix 随意
        assert_eq!(
            join_url("https://api.example.com", "/v1/chat/completions"),
            "https://api.example.com/v1/chat/completions"
        );
    }

    #[test]
    fn test_join_url_trim_slash() {
        // 去除 base 末尾和 suffix 开头的斜杠
        assert_eq!(
            join_url("https://api.example.com/v1/", "/chat/completions"),
            "https://api.example.com/v1/chat/completions"
        );
    }

    #[test]
    fn test_join_url_no_false_dedup() {
        // 路径前缀相似但不完整匹配（v1 vs v10），不能误去重
        assert_eq!(
            join_url("https://api.example.com/v1", "/v10/chat"),
            "https://api.example.com/v1/v10/chat"
        );
    }
}
