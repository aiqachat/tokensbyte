import re

with open('backend/src/api/team_marketing.rs', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update ReferralUser
content = content.replace(
'''    pub is_active: i64,
    pub created_at: String,
}''',
'''    pub is_active: i64,
    pub created_at: String,
    pub remark: Option<String>,
}''')

# 2. Update my_referrals query
content = content.replace(
'''                      u.balance, u.is_active, u.created_at
               FROM users u''',
'''                      u.balance, u.is_active, u.created_at, u.remark
               FROM users u''')

# 3. Update my_referrals json output
content = content.replace(
'''            "created_at": r.created_at,
            "total_recharge": total_recharge,''',
'''            "created_at": r.created_at,
            "remark": r.remark,
            "total_recharge": total_recharge,''')

# 4. Add update_referral_remark function
new_func = '''
#[derive(Deserialize)]
pub struct UpdateRemarkReq {
    pub remark: Option<String>,
}

async fn update_referral_remark(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Path(user_id): Path<String>,
    Json(payload): Json<UpdateRemarkReq>,
) -> AppResult<Json<serde_json::Value>> {
    let my_id = &claims.sub;

    let my_uid: String = sqlx::query_scalar(
        &state.db.format_query("SELECT uid FROM users WHERE id = ?")
    )
    .bind(my_id)
    .fetch_one(&state.db.pool)
    .await?;

    // Check if the target user was referred by the current user
    let is_my_referral: bool = sqlx::query_scalar(
        &state.db.format_query("SELECT EXISTS(SELECT 1 FROM users WHERE id = ? AND (referred_by = ? OR referred_by = ?))")
    )
    .bind(&user_id)
    .bind(my_id)
    .bind(&my_uid)
    .fetch_one(&state.db.pool)
    .await?;

    if !is_my_referral {
        return Err(AppError::Forbidden("无权操作该用户".to_string()));
    }

    sqlx::query(
        &state.db.format_query("UPDATE users SET remark = ? WHERE id = ?")
    )
    .bind(&payload.remark)
    .bind(&user_id)
    .execute(&state.db.pool)
    .await?;

    Ok(Json(serde_json::json!({ "message": "备注更新成功" })))
}
'''

# Find a good place to insert the new function (e.g., at the end of the file)
content += new_func

# 5. Register the route in router()
content = content.replace(
'''        .route("/referral/:id/level", put(set_referral_user_level))''',
'''        .route("/referral/:id/level", put(set_referral_user_level))
        .route("/referral/:id/remark", put(update_referral_remark))''')

with open('backend/src/api/team_marketing.rs', 'w', encoding='utf-8') as f:
    f.write(content)

print("Backend updated.")
