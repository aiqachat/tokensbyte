//! 火山方舟视频素材 URL→素材ID 自动转换模块
//!
//! 当转发规则启用 `asset_convert: true` 时，在请求发送到上游前，
//! 扫描 content 数组中的 image_url/video_url/audio_url，
//! 将网络 URL 通过 CreateAsset API 注册并替换为 `asset://<ASSET_ID>` 格式。
//!
//! 去重策略：同一 URL 在 plugin_assets 中仅创建一条记录，后续请求复用已有 asset_id。

use crate::AppState;

/// content 元素中需要扫描转换的 URL 类型映射
/// (content.type 值, 内部 URL 对象 key, 火山方舟 AssetType)
const URL_TYPE_MAP: &[(&str, &str, &str)] = &[
    ("image_url", "image_url", "Image"),
    ("video_url", "video_url", "Video"),
    ("audio_url", "audio_url", "Audio"),
];

/// 扫描 upstream_body 的 content 数组，将网络 URL 转换为火山方舟素材 ID。
///
/// - 仅处理 http:// 或 https:// 开头的 URL
/// - 已是 asset:// 前缀的跳过
/// - 同一 URL 去重：查到已有 relay_convert 记录则直接复用
/// - 转换失败时静默跳过，保持原始 URL 不变
pub async fn convert_content_urls(
    state: &AppState,
    user_id: &str,
    body: &mut serde_json::Value,
) {
    // 加载 volcengine 审核配置（素材资产管理插件）
    let mut volc_config = match crate::api::plugins::get_volc_config(state, "asset_manager").await {
        Some(vc) => vc,
        None => {
            tracing::debug!("[AssetConvert] 素材资产管理插件未配置审核凭证，跳过素材转换");
            return;
        }
    };

    // 获取 content 数组（可变引用）
    let content_arr = match body.get_mut("content").and_then(|c| c.as_array_mut()) {
        Some(arr) => arr,
        None => return,
    };

    let client = crate::services::volcengine::VolcClient::new(volc_config.clone())
        .with_logger(state.db.clone(), user_id.to_string());

    // 确保有可用的 Group ID，如果没有则尝试自动创建并保存
    if !ensure_group_id(state, &client, &mut volc_config).await {
        return;
    }

    for item in content_arr.iter_mut() {
        let item_type = match item.get("type").and_then(|t| t.as_str()) {
            Some(t) => t.to_string(),
            None => continue,
        };

        // 匹配 URL 类型
        let (url_key, asset_type) = match URL_TYPE_MAP.iter().find(|(t, _, _)| *t == item_type) {
            Some((_, uk, at)) => (*uk, *at),
            None => continue,
        };

        // 提取 URL 值
        let url_val = match item.get(url_key).and_then(|u| u.get("url")).and_then(|u| u.as_str()) {
            Some(u) => u.to_string(),
            None => continue,
        };

        // 仅处理网络 URL，跳过 base64、空值、已转换为 asset:// 的
        if !url_val.starts_with("http://") && !url_val.starts_with("https://") {
            continue;
        }

        // 去重：查询已有的转换记录
        let existing_asset_id: Option<String> = sqlx::query_as::<_, (String,)>(
            &state.db.format_query(
                "SELECT asset_id FROM plugin_assets WHERE file_url = ? AND source = 'relay_convert' AND asset_id IS NOT NULL LIMIT 1"
            )
        )
        .bind(&url_val)
        .fetch_optional(&state.db.pool)
        .await
        .ok()
        .flatten()
        .map(|row| row.0);

        let asset_id = if let Some(aid) = existing_asset_id {
            tracing::info!("[AssetConvert] 复用已有素材: {} -> {}", url_val, aid);
            aid
        } else {
            // 调用 CreateAsset API 注册新素材
            match create_asset(&client, &volc_config, &url_val, asset_type).await {
                Some(aid) => {
                    // 写入 plugin_assets 数据库记录
                    let at_lower = asset_type.to_lowercase();
                    let fname = url_val.rsplit('/').next().unwrap_or("unknown").to_string();
                    let _ = sqlx::query(
                        &state.db.format_query(
                            "INSERT INTO plugin_assets (user_id, asset_type, source, status, file_name, file_url, asset_id, category) \
                             VALUES (?, ?, 'relay_convert', 'approved', ?, ?, ?, '转换素材')"
                        )
                    )
                    .bind(user_id)
                    .bind(&at_lower)
                    .bind(&fname)
                    .bind(&url_val)
                    .bind(&aid)
                    .execute(&state.db.pool)
                    .await;
                    tracing::info!("[AssetConvert] 新素材注册成功: {} -> {}", url_val, aid);
                    aid
                }
                None => {
                    tracing::warn!("[AssetConvert] 素材注册失败，保持原始 URL: {}", url_val);
                    continue;
                }
            }
        };

        // 替换 URL 为 asset://<ASSET_ID> 格式
        let asset_ref = format!("asset://{}", asset_id);
        if let Some(url_obj) = item.get_mut(url_key).and_then(|u| u.as_object_mut()) {
            url_obj.insert("url".to_string(), serde_json::json!(asset_ref));
        }
    }
}

async fn create_asset(
    client: &crate::services::volcengine::VolcClient,
    volc_config: &crate::services::volcengine::VolcConfig,
    url: &str,
    asset_type: &str,
) -> Option<String> {
    // 从配置中拿 group_id，由于前置已有 ensure_group_id 所以必有值
    let group_id = volc_config.group_id.clone().unwrap_or_default();

    let req = crate::services::volcengine::CreateAssetRequest {
        group_id,
        url: url.to_string(),
        asset_type: asset_type.to_string(),
        name: None,
        project_name: Some(volc_config.project_name.clone()),
    };

    match client.call_api::<_, crate::services::volcengine::CreateAssetResponse>(
        "ark", "cn-beijing", "CreateAsset", "2024-01-01", req
    ).await {
        Ok(res) => Some(res.id),
        Err(e) => {
            tracing::error!("[AssetConvert] CreateAsset 调用失败: {}", e);
            None
        }
    }
}

/// 自动保证 Group ID 存在，未设置时调用 API 自动生成并持久化
async fn ensure_group_id(
    state: &crate::AppState,
    client: &crate::services::volcengine::VolcClient,
    volc_config: &mut crate::services::volcengine::VolcConfig,
) -> bool {
    // 如果已经有非空的 ID 则直接通过
    if volc_config.group_id.as_ref().map(|s| !s.trim().is_empty()).unwrap_or(false) {
        return true;
    }

    // 调用 API 默认生成一个
    let req = crate::services::volcengine::CreateAssetGroupRequest {
        name: "tokensbyte_auto_generated_group".to_string(),
        description: "由 Tokensbyte 系统自动生成的转换素材专用群组".to_string(),
        group_type: Some("AIGC".to_string()),
        project_name: Some(volc_config.project_name.clone()),
    };

    match client.call_api::<_, crate::services::volcengine::CreateAssetGroupResponse>(
        "ark", "cn-beijing", "CreateAssetGroup", "2024-01-01", req
    ).await {
        Ok(res) => {
            let new_sg_id = res.id;
            tracing::info!("[AssetConvert] 成功自动生成 Ark 素材组 ID: {}", new_sg_id);
            volc_config.group_id = Some(new_sg_id.clone());

            // 存入数据库
            let update_res = sqlx::query(
                &state.db.format_query("UPDATE plugin_configs SET config_value = ?, updated_at = CURRENT_TIMESTAMP WHERE plugin_name = 'asset_manager' AND config_key = 'volc_group_id'")
            )
            .bind(&new_sg_id)
            .execute(&state.db.pool)
            .await;

            if let Ok(r) = update_res {
                if r.rows_affected() == 0 {
                    let _ = sqlx::query(
                        &state.db.format_query("INSERT INTO plugin_configs (plugin_name, config_key, config_value) VALUES ('asset_manager', 'volc_group_id', ?)")
                    )
                    .bind(&new_sg_id)
                    .execute(&state.db.pool)
                    .await;
                }
            }
            true
        }
        Err(e) => {
            tracing::error!("[AssetConvert] 自动生成 Ark 素材组失败，未满足必需属性，拦截执行: {}", e);
            false
        }
    }
}
