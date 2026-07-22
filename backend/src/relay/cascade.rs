/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

use super::task::{normalize_task_status, poll_task_result};
use crate::error::{AppError, AppResult};
use crate::models::{BillingRule, Channel};
use crate::relay::{forward, response_formatter};
use std::collections::{HashMap, HashSet};

/// 级联增强档位：(billing version, 火山 mid)。模型 Id 含 fast → 极速，否则标准。
pub(crate) fn cascade_enhance_from_model(model_id: &str) -> (&'static str, &'static str) {
    if model_id.to_ascii_lowercase().contains("fast") {
        ("fast", "vve-ft")
    } else {
        ("standard", "vve-sd")
    }
}

pub(crate) fn cascade_is_res(s: &str) -> bool {
    matches!(
        s.trim().to_ascii_lowercase().as_str(),
        "720p" | "1080p" | "2k" | "4k"
    )
}

pub(crate) fn cascade_is_version(s: &str) -> bool {
    matches!(s, "fast" | "standard" | "pro" | "ai")
}

/// 有分辨率计费时返回已启用集合；无则 None
pub(crate) fn cascade_billing_enabled_resolutions(
    rule: &BillingRule,
    cascade_version: &str,
) -> Option<HashSet<String>> {
    let ext: serde_json::Value = serde_json::from_str(&rule.extended_config).unwrap_or_default();
    let mut has_res_billing = false;
    let mut enabled = HashSet::new();

    if let Some(rates) = ext.get("resolution_rates").and_then(|v| v.as_object()) {
        has_res_billing = true;
        for k in rates.keys().filter(|k| cascade_is_res(k)) {
            enabled.insert(k.to_ascii_lowercase());
        }
    }

    if let Some(pt) = ext.get("price_table").and_then(|v| v.as_object()) {
        let disabled: HashSet<String> = ext
            .get("price_table_disabled")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|x| x.as_str().map(|s| s.to_ascii_lowercase()))
                    .collect()
            })
            .unwrap_or_default();
        for key in pt.keys() {
            let lower = key.to_ascii_lowercase();
            let parts: Vec<&str> = lower.split('|').collect();
            let res = match parts.as_slice() {
                [ver, res, ..] if cascade_is_version(ver) && cascade_is_res(res) => {
                    has_res_billing = true;
                    ver.eq_ignore_ascii_case(cascade_version).then_some(*res)
                }
                [attr, res] if !cascade_is_version(attr) && cascade_is_res(res) => {
                    has_res_billing = true;
                    Some(*res)
                }
                _ => None,
            };
            if let Some(res) = res {
                if !disabled.contains(&lower) {
                    enabled.insert(res.to_string());
                }
            }
        }
    }

    if !rule.pricing_tiers.is_empty() && rule.pricing_tiers != "[]" {
        if let Ok(tiers) = serde_json::from_str::<Vec<serde_json::Value>>(&rule.pricing_tiers) {
            for tier in tiers {
                let Some(res) = tier.get("resolution").and_then(|v| v.as_str()) else {
                    continue;
                };
                if !cascade_is_res(res) {
                    continue;
                }
                has_res_billing = true;
                if tier
                    .get("enabled")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true)
                {
                    enabled.insert(res.trim().to_ascii_lowercase());
                }
            }
        }
    }

    has_res_billing.then_some(enabled)
}

/// 格式校验 + 计费启用校验（无分辨率计费则只做格式）
pub(crate) fn cascade_check_resolution(
    db_rule: Option<&BillingRule>,
    cascade_version: &str,
    res_str: &str,
) -> AppResult<()> {
    let key = res_str.trim().to_ascii_lowercase();
    if !cascade_is_res(&key) {
        return Err(AppError::BadRequest(format!(
            "此模型不支持的分辨率: {}",
            res_str
        )));
    }
    let Some(rule) = db_rule else {
        return Ok(());
    };
    let Some(enabled) = cascade_billing_enabled_resolutions(rule, cascade_version) else {
        return Ok(());
    };
    if enabled.contains(&key) {
        return Ok(());
    }
    Err(AppError::BadRequest(format!(
        "当前分辨率 {} 不支持",
        res_str.trim()
    )))
}

/// 目标超分分辨率 → 阶段一座底分辨率
pub(crate) fn cascade_clamp_base_resolution(target: &str) -> &'static str {
    match target {
        "720p" => "480p",
        "1080p" => "720p",
        "2k" | "4k" => "1080p",
        _ => "720p",
    }
}

/// 阶段一响应根字段 resolution=480p 且 ratio∈{16:9,9:16} → MediaKit 居中裁剪角点。
/// 16:9: 864×496→860×484，角点 (2,6)-(862,490)；9:16: 496×864→484×860，角点 (6,2)-(490,862)。
fn cascade_s1_480p_crop_rect(stage1_resp: &serde_json::Value) -> Option<(i64, i64, i64, i64)> {
    let root = |k: &str| {
        stage1_resp
            .get(k)
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
    };
    if !root("resolution")?.eq_ignore_ascii_case("480p") {
        return None;
    }
    match root("ratio")? {
        "16:9" => Some((2, 6, 862, 490)),
        "9:16" => Some((6, 2, 490, 862)),
        _ => None,
    }
}

/// 阶段一 480p + 16:9/9:16：MediaKit 居中裁成标准 480p；不命中或失败则返回原 URL（不阻断超分）。
pub(crate) async fn cascade_ensure_standard_480p_video(
    http_client: &reqwest::Client,
    channel: &Channel,
    enhance_resolved: &forward::ResolvedForward,
    video_url: &str,
    stage1_resp: &serde_json::Value,
) -> String {
    let Some((tlx, tly, brx, bry)) = cascade_s1_480p_crop_rect(stage1_resp) else {
        return video_url.to_string();
    };

    // 仅复用增强渠道鉴权；路径/轮询固定为 MediaKit crop-video
    let crop_resolved = forward::ResolvedForward {
        auth_type: enhance_resolved.auth_type.clone(),
        upstream_path: "/api/v1/tools/crop-video".to_string(),
        poll_path: Some("/api/v1/tasks/${task_id}".to_string()),
        ..Default::default()
    };
    let crop_url =
        forward::build_upstream_url(&channel.base_url, &crop_resolved, "", &channel.api_key);
    let payload = serde_json::json!({
        "video_url": video_url,
        "top_left_x": tlx,
        "top_left_y": tly,
        "bottom_right_x": brx,
        "bottom_right_y": bry,
    });

    let mut attempt = 0u32;
    let crop_task_id = loop {
        attempt += 1;
        let mut body = payload.clone();
        let builder = forward::apply_request_auth(
            http_client
                .post(&crop_url)
                .header("Content-Type", "application/json"),
            &crop_resolved,
            &channel.api_key,
            &mut body,
            &channel.base_url,
        );
        let retry = match builder.send().await {
            Ok(resp) => {
                let status = resp.status().as_u16();
                let text = resp.text().await.unwrap_or_default();
                if status != 200 {
                    matches!(status, 429 | 500 | 503 | 504)
                } else {
                    let post: serde_json::Value =
                        serde_json::from_str(&text).unwrap_or(serde_json::json!({}));
                    if response_formatter::is_upstream_error_response(&post) {
                        false
                    } else {
                        let id = response_formatter::find_id(&post);
                        if id.is_empty() {
                            false
                        } else {
                            break id;
                        }
                    }
                }
            }
            Err(_) => true,
        };
        if retry && attempt < 5 {
            tokio::time::sleep(std::time::Duration::from_secs(10)).await;
            continue;
        }
        return video_url.to_string();
    };

    match poll_task_result(
        http_client,
        channel,
        &crop_resolved,
        &crop_task_id,
        "",
        "视频增强",
        300,
        None,
    )
    .await
    {
        Some((body, status)) if status == "succeeded" => {
            let v: serde_json::Value = serde_json::from_str(&body).unwrap_or(serde_json::json!({}));
            response_formatter::find_urls(&v)
                .into_iter()
                .next()
                .filter(|u| !u.is_empty())
                .unwrap_or_else(|| video_url.to_string())
        }
        _ => video_url.to_string(),
    }
}

/// JSON 指针取非空字符串并规范为小写（级联分辨率共用）
pub(crate) fn cascade_json_str(json: &str, pointer: &str) -> Option<String> {
    serde_json::from_str::<serde_json::Value>(json)
        .ok()
        .and_then(|v| {
            v.pointer(pointer)?
                .as_str()
                .map(|s| s.trim().to_ascii_lowercase())
        })
        .filter(|s| !s.is_empty())
}

/// 级联目标分辨率：plugin_tag.cascade.resolution → 720p
pub(crate) fn cascade_target_resolution(plugin_tag: &str) -> String {
    cascade_json_str(plugin_tag, "/cascade/resolution").unwrap_or_else(|| "720p".into())
}

/// 从阶段二增强响应提取帧率（result.fps / 顶层 fps）
pub(crate) fn cascade_s2_fps(s2: &serde_json::Value) -> Option<i64> {
    s2.pointer("/result/fps")
        .or_else(|| s2.get("fps"))
        .and_then(|v| {
            v.as_i64()
                .or_else(|| v.as_u64().map(|u| u as i64))
                .or_else(|| v.as_f64().map(|f| f as i64))
        })
        .filter(|&f| f > 0)
}

/// 递归覆写已存在的同名 string / number 字段（不凭空插入）
pub(crate) fn patch_json_fields_by_key(
    value: &mut serde_json::Value,
    str_patches: &[(&str, &str)],
    num_patches: &[(&str, i64)],
) {
    match value {
        serde_json::Value::Object(map) => {
            for &(key, val) in str_patches {
                if map.get(key).is_some_and(|v| v.is_string()) {
                    map.insert(key.to_string(), serde_json::json!(val));
                }
            }
            for &(key, val) in num_patches {
                if map.get(key).is_some_and(|v| v.is_number()) {
                    map.insert(key.to_string(), serde_json::json!(val));
                }
            }
            for (_, child) in map.iter_mut() {
                patch_json_fields_by_key(child, str_patches, num_patches);
            }
        }
        serde_json::Value::Array(arr) => {
            for child in arr.iter_mut() {
                patch_json_fields_by_key(child, str_patches, num_patches);
            }
        }
        _ => {}
    }
}

/// 级联成功对外：S1 官方骨架对齐 S2 产物（URL / 目标分辨率 / 帧率；ratio·duration·usage 保持）
/// 无增强产物 URL 时不改元数据，避免分辨率/帧率与底座视频不一致
pub(crate) fn cascade_s1_with_s2_url(
    s1: &serde_json::Value,
    s2: &serde_json::Value,
    plugin_tag: &str,
) -> serde_json::Value {
    let old_url = response_formatter::find_urls(s1)
        .into_iter()
        .next()
        .unwrap_or_default();
    let new_url = response_formatter::find_urls(s2)
        .into_iter()
        .next()
        .unwrap_or_default();
    let mut out = s1.clone();
    if new_url.is_empty() {
        return out;
    }

    if !old_url.is_empty() {
        replace_exact_url_in_json(&mut out, &old_url, &new_url);
    } else {
        // S1 未解析到旧链时，直接覆写已有 video_url（如 content.video_url）
        patch_json_fields_by_key(&mut out, &[("video_url", new_url.as_str())], &[]);
    }

    let target_res = cascade_target_resolution(plugin_tag);
    let fps = cascade_s2_fps(s2).unwrap_or(60);
    patch_json_fields_by_key(
        &mut out,
        &[("resolution", target_res.as_str())],
        &[("framespersecond", fps), ("fps", fps)],
    );
    out
}

pub(crate) fn replace_exact_url_in_json(
    value: &mut serde_json::Value,
    old_url: &str,
    new_url: &str,
) {
    if old_url.is_empty() || new_url.is_empty() {
        return;
    }
    match value {
        serde_json::Value::Object(map) => {
            for (_, val) in map.iter_mut() {
                replace_exact_url_in_json(val, old_url, new_url);
            }
        }
        serde_json::Value::Array(arr) => {
            for val in arr.iter_mut() {
                replace_exact_url_in_json(val, old_url, new_url);
            }
        }
        serde_json::Value::String(s) => {
            if s == old_url {
                *s = new_url.to_string();
            }
        }
        _ => {}
    }
}

/// 列表/仪表盘/终态落库：去掉 plugin_tag.cascade 中的密钥与上游渠道细节。
/// 返回是否发生了字段删除（无变更则不改写字符串）。
pub(crate) fn cascade_scrub_plugin_tag_for_user(plugin_tag: &mut Option<String>) -> bool {
    let Some(raw) = plugin_tag.as_deref() else {
        return false;
    };
    if !raw.contains("\"cascade\"") {
        return false;
    }
    let Ok(mut v) = serde_json::from_str::<serde_json::Value>(raw) else {
        return false;
    };
    let Some(obj) = v.get_mut("cascade").and_then(|c| c.as_object_mut()) else {
        return false;
    };
    let mut changed = false;
    for key in ["api_key", "base_url", "ch_name", "ch_id", "mid"] {
        if obj.remove(key).is_some() {
            changed = true;
        }
    }
    if changed {
        *plugin_tag = Some(v.to_string());
    }
    changed
}

/// 普通用户日志级联字段脱敏：隐藏 stage1/stage2 内部结构，避免泄露超分模型信息。
/// 对三个字段按以下规则处理，非级联日志（无 stage1+stage2 键）不受影响：
/// - upstream_req_content：取 stage1；若 stage2 含 resolution，覆盖 s1 同名字段
/// - response_content：调用 cascade_s1_with_s2_url 合并（URL/分辨率/帧率），再以 s2 实际 resolution 精确覆盖
/// - post_response：只返回 stage1 的 POST 提交 ack
pub(crate) fn cascade_sanitize_for_user(
    upstream_req: &mut Option<String>,
    response: &mut Option<String>,
    post_resp: &mut Option<String>,
    plugin_tag: Option<&str>,
) {
    /// 从 stage2 JSON 中提取 resolution 字符串（顶层或 result.resolution）
    fn s2_resolution(s2: &serde_json::Value) -> Option<String> {
        s2.get("resolution")
            .or_else(|| s2.pointer("/result/resolution"))
            .and_then(|r| r.as_str())
            .map(|s| s.to_string())
    }

    /// 解析 JSON 并检查是否为级联结构，返回 (stage1, stage2)
    fn parse_cascade(s: &str) -> Option<(serde_json::Value, serde_json::Value)> {
        let v: serde_json::Value = serde_json::from_str(s).ok()?;
        let s1 = v.get("stage1")?.clone();
        let s2 = v.get("stage2")?.clone();
        Some((s1, s2))
    }

    // upstream_req_content：取 stage1，用 stage2 的 resolution 覆盖同名字段（如存在）
    if let Some(ref s) = upstream_req.clone() {
        if let Some((mut s1, s2)) = parse_cascade(s) {
            if let Some(res) = s2_resolution(&s2) {
                patch_json_fields_by_key(&mut s1, &[("resolution", res.as_str())], &[]);
            }
            *upstream_req = Some(s1.to_string());
        }
    }

    // response_content：cascade_s1_with_s2_url 合并，再以 s2 实际 resolution 精确覆盖
    if let Some(ref s) = response.clone() {
        if let Some((s1, s2)) = parse_cascade(s) {
            let mut merged = cascade_s1_with_s2_url(&s1, &s2, plugin_tag.unwrap_or(""));
            if let Some(res) = s2_resolution(&s2) {
                patch_json_fields_by_key(&mut merged, &[("resolution", res.as_str())], &[]);
            }
            *response = Some(merged.to_string());
        }
    }

    // post_response：只保留 stage1 的提交 ack
    if let Some(ref s) = post_resp.clone() {
        if let Some((s1, _)) = parse_cascade(s) {
            *post_resp = Some(s1.to_string());
        }
    }
}

/// 从 plugin_tag.cascade 还原阶段二轮询目标（渠道 + 转发配置 + 模型）
pub(crate) fn cascade_stage2_poll_target(
    channel: &Channel,
    resolved: &forward::ResolvedForward,
    plugin_tag: &str,
    stage2_task_id: &str,
) -> (Channel, forward::ResolvedForward, String) {
    let tag_json: serde_json::Value =
        serde_json::from_str(plugin_tag).unwrap_or(serde_json::json!({}));
    let cascade_info = tag_json
        .get("cascade")
        .cloned()
        .unwrap_or(serde_json::json!({}));

    let mut ch = channel.clone();
    ch.id = cascade_info
        .get("ch_id")
        .and_then(|v| v.as_i64())
        .unwrap_or(channel.id);
    ch.name = cascade_info
        .get("ch_name")
        .and_then(|v| v.as_str())
        .unwrap_or(&channel.name)
        .to_string();
    ch.base_url = cascade_info
        .get("base_url")
        .and_then(|v| v.as_str())
        .unwrap_or(&channel.base_url)
        .to_string();
    ch.api_key = cascade_info
        .get("api_key")
        .and_then(|v| v.as_str())
        .unwrap_or(&channel.api_key)
        .to_string();
    ch.rate = cascade_info
        .get("rate")
        .and_then(|v| v.as_f64())
        .unwrap_or(channel.rate);

    let mut res = resolved.clone();
    res.mid = cascade_info
        .get("mid")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    res.auth_type = cascade_info
        .get("auth_type")
        .and_then(|v| v.as_str())
        .unwrap_or(&resolved.auth_type)
        .to_string();
    res.upstream_path = cascade_info
        .get("upstream_path")
        .and_then(|v| v.as_str())
        .unwrap_or(&resolved.upstream_path)
        .to_string();
    res.target_type = cascade_info
        .get("target_type")
        .and_then(|v| v.as_str())
        .unwrap_or(&resolved.target_type)
        .to_string();
    res.poll_path = cascade_info
        .get("poll_path")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let final_model = cascade_info
        .get("final_model")
        .and_then(|v| v.as_str())
        .or_else(|| cascade_info.get("mid").and_then(|v| v.as_str()))
        .unwrap_or("vve-sd")
        .to_string();

    tracing::debug!(
        "[Cascade S2] 轮询目标: stage2_id={}, ch={}, mid={:?}, final_model={}",
        stage2_task_id,
        ch.name,
        res.mid,
        final_model
    );
    (ch, res, final_model)
}

/// 级联阶段二进行中：对外返回阶段一 POST 提交态（处理中）。
/// 禁止返回 S1 成功产物（含视频 URL）或 S2 增强接口原始响应。
pub(crate) async fn cascade_s2_client_processing(
    pool: &sqlx::PgPool,
    raw_path: &str,
    category: &str,
    stage1_submit: &serde_json::Value,
    task_id: &str,
) -> String {
    let mut s = response_formatter::apply_format(
        pool,
        raw_path,
        category,
        &stage1_submit.to_string(),
        true,
        Some(task_id),
    )
    .await;
    let trimmed = s.trim();
    if trimmed.is_empty() || trimmed == "{}" {
        return serde_json::json!({"id": task_id, "status": "running"}).to_string();
    }
    if let Ok(mut v) = serde_json::from_str::<serde_json::Value>(&s) {
        if let Some(obj) = v.as_object_mut() {
            obj.insert("id".to_string(), serde_json::json!(task_id));
            // 仅官方 /api/：POST ack 常无 status；缺省或终态补 running（OpenAI 已由 apply_format 给出 pending）
            if !response_formatter::is_openai_compatible_path(raw_path) {
                let st = obj.get("status").and_then(|x| x.as_str()).unwrap_or("");
                // 复用全局状态归一化：succeeded/failed（含 success/completed/cancelled 等同义）
                if st.is_empty() || matches!(normalize_task_status(st), "succeeded" | "failed") {
                    obj.insert("status".to_string(), serde_json::json!("running"));
                }
            }
            s = serde_json::to_string(&v).unwrap_or(s);
        }
    }
    s
}

/// 级联落库：stage1 + stage2 原始串 → combined JSON
pub(crate) fn cascade_combine_stages(s1: &serde_json::Value, s2_raw: &str) -> String {
    let s2: serde_json::Value = serde_json::from_str(s2_raw).unwrap_or(serde_json::json!(s2_raw));
    serde_json::json!({ "stage1": s1, "stage2": s2 }).to_string()
}

/// 阶段二成功：stage1 usage × res_mul（返回 / 落库 / 结算共用）
pub(crate) fn apply_cascade_res_mul_to_stage1(
    s1: &mut serde_json::Value,
    res_mul: &HashMap<String, f64>,
    plugin_tag: &str,
) {
    let res = cascade_target_resolution(plugin_tag);
    forward::scale_usage_in_json(s1, forward::lookup_res_mul(res_mul, &res));
}

/// 级联阶段二提交结果：Submitted=已提交超分；InProgress=他处正在裁剪/提交
pub(crate) enum CascadeS2SubmitOutcome {
    Submitted(String),
    InProgress,
}

/// 0=非级联 / 1=阶段一 / 2=阶段二
pub(crate) fn cascade_stage_num(is_cascade: bool, post: &serde_json::Value) -> u8 {
    if !is_cascade {
        0
    } else if post.get("stage2").is_some() {
        2
    } else {
        1
    }
}

/// 进程内互斥：占位成功则持有，Drop 时 remove
pub(crate) struct CascadeS2InflightGuard<'a> {
    map: &'a dashmap::DashMap<i64, ()>,
    id: i64,
}

impl<'a> CascadeS2InflightGuard<'a> {
    pub(crate) fn try_acquire(map: &'a dashmap::DashMap<i64, ()>, id: i64) -> Option<Self> {
        if map.insert(id, ()).is_some() {
            return None;
        }
        Some(Self { map, id })
    }
}

impl Drop for CascadeS2InflightGuard<'_> {
    fn drop(&mut self) {
        self.map.remove(&self.id);
    }
}
