use axum::{
    extract::{Path, State, Extension},
    routing::{get, put, post},
    Json, Router,
};
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use serde_json::json;
use crate::{
    error::{AppResult, AppError},
    AppState,
    auth,
};

// ========== Types ==========

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct MarketingTeam {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    #[sqlx(default)]
    pub invite_code: Option<String>,
    #[sqlx(default)]
    pub max_members: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TeamMember {
    pub user_id: String,
    pub username: String,
    pub uid: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TeamWithMembers {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub invite_code: String,
    pub max_members: i64,
    pub leaders: Vec<TeamMember>,
    pub members: Vec<TeamMember>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateTeamRequest {
    pub name: String,
    pub description: Option<String>,
    pub leader_ids: Vec<String>,
    pub member_ids: Vec<String>,
    pub max_members: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTeamRequest {
    pub name: String,
    pub description: Option<String>,
    pub leader_ids: Vec<String>,
    pub member_ids: Vec<String>,
    pub max_members: Option<i64>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ReferralUser {
    pub id: String,
    pub uid: String,
    pub username: String,
    pub email: String,
    pub user_group: String,
    #[sqlx(default)]
    pub level_name: Option<String>,
    pub balance: f64,
    pub is_active: i64,
    pub created_at: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ReferralRecharge {
    pub id: i64,
    pub user_id: String,
    pub amount: f64,
    pub recharge_type: String,
    pub remark: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct JoinTeamRequest {
    pub invite_code: String,
}

// ========== Router ==========

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        // Admin routes
        .route("/teams", get(list_teams).post(create_team))
        .route("/teams/{id}", put(update_team).delete(delete_team))
        .route("/search-users", get(search_users))
        // User routes
        .route("/my-referrals", get(my_referrals))
        .route("/referral/{user_id}/recharges", get(referral_recharges))
        .route("/team-overview", get(team_overview))
        .route("/join", post(join_team))
        .route("/my-team", get(my_team))
}

// ========== Helper ==========

async fn require_admin(state: &AppState, claims: &auth::Claims) -> Result<(), AppError> {
    let role: String = sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
        .bind(&claims.sub)
        .fetch_one(&state.db.pool)
        .await?;
    if role != "admin" {
        return Err(AppError::Unauthorized);
    }
    Ok(())
}

async fn load_team_members(state: &AppState, team_id: i64, table: &str) -> Result<Vec<TeamMember>, sqlx::Error> {
    let query = format!(
        "SELECT t.user_id, u.username, u.uid FROM {} t JOIN users u ON t.user_id = u.id WHERE t.team_id = ?",
        table
    );
    let rows: Vec<(String, String, String)> = sqlx::query_as(&state.db.format_query(&query))
        .bind(team_id)
        .fetch_all(&state.db.pool)
        .await?;

    Ok(rows.into_iter().map(|(user_id, username, uid)| TeamMember { user_id, username, uid }).collect())
}

fn generate_invite_code() -> String {
    (0..8).map(|_| {
        let idx = rand::random::<u8>() % 36;
        if idx < 10 { (b'0' + idx) as char } else { (b'a' + idx - 10) as char }
    }).collect()
}

/// 通用逻辑：根据邀请码将用户加入团队（注册和主动加入都使用此函数）
pub async fn add_user_to_team_by_invite_code(
    state: &AppState,
    user_id: &str,
    invite_code: &str,
) -> Result<Option<String>, AppError> {
    // 查找团队
    let team: Option<(i64, i64)> = sqlx::query_as(
        &state.db.format_query("SELECT id, max_members FROM marketing_teams WHERE invite_code = ?")
    )
    .bind(invite_code)
    .fetch_optional(&state.db.pool)
    .await?;

    let (team_id, max_members) = match team {
        Some(t) => t,
        None => return Ok(None), // 邀请码无效，静默跳过
    };

    // 检查用户是否已在团队中
    let already_member: i64 = sqlx::query_scalar(
        &state.db.format_query("SELECT COUNT(*) FROM marketing_team_members WHERE team_id = ? AND user_id = ?")
    )
    .bind(team_id)
    .bind(user_id)
    .fetch_one(&state.db.pool)
    .await?;

    if already_member > 0 {
        return Ok(Some("already_member".to_string()));
    }

    // 也检查是否已是负责人
    let already_leader: i64 = sqlx::query_scalar(
        &state.db.format_query("SELECT COUNT(*) FROM marketing_team_leaders WHERE team_id = ? AND user_id = ?")
    )
    .bind(team_id)
    .bind(user_id)
    .fetch_one(&state.db.pool)
    .await?;

    if already_leader > 0 {
        return Ok(Some("already_leader".to_string()));
    }

    // 检查团队人数上限
    let current_count: i64 = sqlx::query_scalar(
        &state.db.format_query("SELECT COUNT(*) FROM marketing_team_members WHERE team_id = ?")
    )
    .bind(team_id)
    .fetch_one(&state.db.pool)
    .await?;

    if max_members > 0 && current_count >= max_members {
        return Err(AppError::BadRequest("团队成员已达上限".to_string()));
    }

    // 加入团队
    sqlx::query(
        &state.db.format_query("INSERT INTO marketing_team_members (team_id, user_id) VALUES (?, ?)")
    )
    .bind(team_id)
    .bind(user_id)
    .execute(&state.db.pool)
    .await?;

    Ok(Some("joined".to_string()))
}

// ========== Admin: Team CRUD ==========

/// 管理员：获取所有推广团队
async fn list_teams(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &claims).await?;

    let teams: Vec<MarketingTeam> = sqlx::query_as(
        &state.db.format_query("SELECT * FROM marketing_teams ORDER BY id DESC")
    )
    .fetch_all(&state.db.pool)
    .await?;

    let mut result: Vec<TeamWithMembers> = Vec::new();
    for team in teams {
        let leaders = load_team_members(&state, team.id, "marketing_team_leaders").await?;
        let members = load_team_members(&state, team.id, "marketing_team_members").await?;
        result.push(TeamWithMembers {
            id: team.id,
            name: team.name,
            description: team.description,
            invite_code: team.invite_code.unwrap_or_default(),
            max_members: team.max_members,
            leaders,
            members,
            created_at: team.created_at,
            updated_at: team.updated_at,
        });
    }

    Ok(Json(json!({ "teams": result })))
}

/// 管理员：新建推广团队
async fn create_team(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<CreateTeamRequest>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &claims).await?;

    if payload.name.trim().is_empty() {
        return Err(AppError::BadRequest("团队名称不能为空".to_string()));
    }

    let invite_code = generate_invite_code();
    let max_members = payload.max_members.unwrap_or(10);

    // Insert team
    sqlx::query(
        &state.db.format_query("INSERT INTO marketing_teams (name, description, invite_code, max_members) VALUES (?, ?, ?, ?)")
    )
    .bind(&payload.name)
    .bind(&payload.description)
    .bind(&invite_code)
    .bind(max_members)
    .execute(&state.db.pool)
    .await?;

    // Get last inserted id
    let team_id: i64 = sqlx::query_scalar(
        &state.db.format_query("SELECT id FROM marketing_teams WHERE name = ? ORDER BY id DESC LIMIT 1")
    )
    .bind(&payload.name)
    .fetch_one(&state.db.pool)
    .await?;

    // Insert leaders
    for user_id in &payload.leader_ids {
        sqlx::query(
            &state.db.format_query("INSERT INTO marketing_team_leaders (team_id, user_id) VALUES (?, ?)")
        )
        .bind(team_id)
        .bind(user_id)
        .execute(&state.db.pool)
        .await?;
    }

    // Insert members
    for user_id in &payload.member_ids {
        sqlx::query(
            &state.db.format_query("INSERT INTO marketing_team_members (team_id, user_id) VALUES (?, ?)")
        )
        .bind(team_id)
        .bind(user_id)
        .execute(&state.db.pool)
        .await?;
    }

    Ok(Json(json!({ "message": "团队创建成功", "id": team_id, "invite_code": invite_code })))
}

/// 管理员：编辑推广团队
async fn update_team(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<UpdateTeamRequest>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &claims).await?;

    if payload.name.trim().is_empty() {
        return Err(AppError::BadRequest("团队名称不能为空".to_string()));
    }

    let max_members = payload.max_members.unwrap_or(10);

    // Update team
    sqlx::query(
        &state.db.format_query("UPDATE marketing_teams SET name = ?, description = ?, max_members = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    )
    .bind(&payload.name)
    .bind(&payload.description)
    .bind(max_members)
    .bind(id)
    .execute(&state.db.pool)
    .await?;

    // Replace leaders: delete old, insert new
    sqlx::query(&state.db.format_query("DELETE FROM marketing_team_leaders WHERE team_id = ?"))
        .bind(id)
        .execute(&state.db.pool)
        .await?;

    for user_id in &payload.leader_ids {
        sqlx::query(
            &state.db.format_query("INSERT INTO marketing_team_leaders (team_id, user_id) VALUES (?, ?)")
        )
        .bind(id)
        .bind(user_id)
        .execute(&state.db.pool)
        .await?;
    }

    // Replace members: delete old, insert new
    sqlx::query(&state.db.format_query("DELETE FROM marketing_team_members WHERE team_id = ?"))
        .bind(id)
        .execute(&state.db.pool)
        .await?;

    for user_id in &payload.member_ids {
        sqlx::query(
            &state.db.format_query("INSERT INTO marketing_team_members (team_id, user_id) VALUES (?, ?)")
        )
        .bind(id)
        .bind(user_id)
        .execute(&state.db.pool)
        .await?;
    }

    Ok(Json(json!({ "message": "团队更新成功" })))
}

/// 管理员：删除推广团队
async fn delete_team(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &claims).await?;

    sqlx::query(&state.db.format_query("DELETE FROM marketing_team_leaders WHERE team_id = ?"))
        .bind(id).execute(&state.db.pool).await?;
    sqlx::query(&state.db.format_query("DELETE FROM marketing_team_members WHERE team_id = ?"))
        .bind(id).execute(&state.db.pool).await?;
    sqlx::query(&state.db.format_query("DELETE FROM marketing_teams WHERE id = ?"))
        .bind(id).execute(&state.db.pool).await?;

    Ok(Json(json!({ "message": "团队已删除" })))
}

/// 管理员：搜索用户（用于选择负责人和成员）
async fn search_users(
    State(state): State<Arc<AppState>>,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &claims).await?;

    let keyword = params.get("keyword").cloned().unwrap_or_default();
    let like_pattern = format!("%{}%", keyword);

    let users: Vec<(String, String, String)> = sqlx::query_as(
        &state.db.format_query(
            "SELECT id, username, uid FROM users WHERE role = 'user' AND (username LIKE ? OR uid LIKE ? OR email LIKE ?) ORDER BY created_at DESC LIMIT 50"
        )
    )
    .bind(&like_pattern)
    .bind(&like_pattern)
    .bind(&like_pattern)
    .fetch_all(&state.db.pool)
    .await?;

    let result: Vec<serde_json::Value> = users.into_iter().map(|(id, username, uid)| {
        json!({ "user_id": id, "username": username, "uid": uid })
    }).collect();

    Ok(Json(json!({ "users": result })))
}

// ========== User: Team Join ==========

/// 已登录用户：通过邀请码加入团队
async fn join_team(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<JoinTeamRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let user_id = &claims.sub;
    let code = payload.invite_code.trim();

    if code.is_empty() {
        return Err(AppError::BadRequest("邀请码不能为空".to_string()));
    }

    let result = add_user_to_team_by_invite_code(&state, user_id, code).await?;

    match result.as_deref() {
        Some("joined") => Ok(Json(json!({ "message": "成功加入团队", "status": "joined" }))),
        Some("already_member") => Ok(Json(json!({ "message": "您已是该团队成员", "status": "already_member" }))),
        Some("already_leader") => Ok(Json(json!({ "message": "您已是该团队负责人", "status": "already_leader" }))),
        _ => Err(AppError::BadRequest("无效的邀请码".to_string())),
    }
}

/// 用户端：查看我加入的团队
async fn my_team(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let my_id = &claims.sub;

    // 查询作为成员加入的团队
    let member_teams: Vec<i64> = sqlx::query_scalar(
        &state.db.format_query("SELECT team_id FROM marketing_team_members WHERE user_id = ?")
    )
    .bind(my_id)
    .fetch_all(&state.db.pool)
    .await?;

    // 查询作为负责人的团队
    let leader_teams: Vec<i64> = sqlx::query_scalar(
        &state.db.format_query("SELECT team_id FROM marketing_team_leaders WHERE user_id = ?")
    )
    .bind(my_id)
    .fetch_all(&state.db.pool)
    .await?;

    let mut teams: Vec<serde_json::Value> = Vec::new();

    // 合并所有团队 ID，去重
    let mut all_ids: Vec<i64> = Vec::new();
    for id in &member_teams { if !all_ids.contains(id) { all_ids.push(*id); } }
    for id in &leader_teams { if !all_ids.contains(id) { all_ids.push(*id); } }

    for team_id in &all_ids {
        let team: Option<MarketingTeam> = sqlx::query_as(
            &state.db.format_query("SELECT * FROM marketing_teams WHERE id = ?")
        )
        .bind(team_id)
        .fetch_optional(&state.db.pool)
        .await?;

        let team = match team {
            Some(t) => t,
            None => continue,
        };

        let leaders = load_team_members(&state, *team_id, "marketing_team_leaders").await?;
        let role = if leader_teams.contains(team_id) { "leader" } else { "member" };

        teams.push(json!({
            "id": team.id,
            "name": team.name,
            "description": team.description,
            "invite_code": team.invite_code.unwrap_or_default(),
            "max_members": team.max_members,
            "leaders": leaders,
            "role": role,
        }));
    }

    Ok(Json(json!({ "teams": teams })))
}

// ========== User: Referrals ==========

/// 用户端：获取我推荐的用户列表
async fn my_referrals(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let user_id = &claims.sub;

    // 获取当前用户的 uid，因为 referred_by 可能存的是 id 或 uid
    let my_uid: String = sqlx::query_scalar(
        &state.db.format_query("SELECT uid FROM users WHERE id = ?")
    )
    .bind(user_id)
    .fetch_one(&state.db.pool)
    .await?;

    let referrals: Vec<ReferralUser> = sqlx::query_as(
        &state.db.format_query(
            r#"SELECT u.id, u.uid, u.username, u.email, u.user_group, ul.name as level_name,
                      u.balance, u.is_active, u.created_at
               FROM users u
               LEFT JOIN user_levels ul ON u.user_group = ul.group_key
               WHERE u.referred_by = ? OR u.referred_by = ?
               ORDER BY u.created_at DESC"#
        )
    )
    .bind(user_id)
    .bind(&my_uid)
    .fetch_all(&state.db.pool)
    .await?;

    // For each referral, get their total recharge amount
    let mut result: Vec<serde_json::Value> = Vec::new();
    for r in &referrals {
        let total_recharge: f64 = sqlx::query_scalar(
            &state.db.format_query("SELECT COALESCE(SUM(amount), 0.0) FROM recharge_records WHERE user_id = ?")
        )
        .bind(&r.id)
        .fetch_one(&state.db.pool)
        .await
        .unwrap_or(0.0);

        result.push(json!({
            "id": r.id,
            "uid": r.uid,
            "username": r.username,
            "email": r.email,
            "user_group": r.user_group,
            "level_name": r.level_name,
            "balance": r.balance,
            "is_active": r.is_active,
            "created_at": r.created_at,
            "total_recharge": total_recharge,
        }));
    }

    Ok(Json(json!({ "referrals": result, "total": referrals.len() })))
}

/// 用户端：获取指定下级用户的充值明细
async fn referral_recharges(
    State(state): State<Arc<AppState>>,
    Path(target_user_id): Path<String>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let my_id = &claims.sub;

    // 获取当前用户 uid
    let my_uid: String = sqlx::query_scalar(
        &state.db.format_query("SELECT uid FROM users WHERE id = ?")
    )
    .bind(my_id)
    .fetch_one(&state.db.pool)
    .await?;

    // Verify: target user must be referred by current user, OR current user is a team leader of that user
    let is_referred: i64 = sqlx::query_scalar(
        &state.db.format_query("SELECT COUNT(*) FROM users WHERE id = ? AND (referred_by = ? OR referred_by = ?)")
    )
    .bind(&target_user_id)
    .bind(my_id)
    .bind(&my_uid)
    .fetch_one(&state.db.pool)
    .await?;

    let is_team_leader: i64 = sqlx::query_scalar(
        &state.db.format_query(
            r#"SELECT COUNT(*) FROM marketing_team_leaders tl
               JOIN marketing_team_members tm ON tl.team_id = tm.team_id
               WHERE tl.user_id = ? AND tm.user_id = ?"#
        )
    )
    .bind(my_id)
    .bind(&target_user_id)
    .fetch_one(&state.db.pool)
    .await?;

    if is_referred == 0 && is_team_leader == 0 {
        return Err(AppError::Unauthorized);
    }

    let records: Vec<ReferralRecharge> = sqlx::query_as(
        &state.db.format_query("SELECT * FROM recharge_records WHERE user_id = ? ORDER BY created_at DESC")
    )
    .bind(&target_user_id)
    .fetch_all(&state.db.pool)
    .await?;

    Ok(Json(json!({ "recharges": records })))
}

/// 用户端：团队负责人查看团队推广员的推广数据
async fn team_overview(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let my_id = &claims.sub;

    // Find all teams where current user is a leader
    let team_ids: Vec<i64> = sqlx::query_scalar(
        &state.db.format_query("SELECT team_id FROM marketing_team_leaders WHERE user_id = ?")
    )
    .bind(my_id)
    .fetch_all(&state.db.pool)
    .await?;

    if team_ids.is_empty() {
        return Ok(Json(json!({ "teams": [], "is_leader": false })));
    }

    let mut teams: Vec<serde_json::Value> = Vec::new();

    for team_id in &team_ids {
        let team: Option<MarketingTeam> = sqlx::query_as(
            &state.db.format_query("SELECT * FROM marketing_teams WHERE id = ?")
        )
        .bind(team_id)
        .fetch_optional(&state.db.pool)
        .await?;

        let team = match team {
            Some(t) => t,
            None => continue,
        };

        // Get all members of this team
        let member_ids: Vec<String> = sqlx::query_scalar(
            &state.db.format_query("SELECT user_id FROM marketing_team_members WHERE team_id = ?")
        )
        .bind(team_id)
        .fetch_all(&state.db.pool)
        .await?;

        let mut member_stats: Vec<serde_json::Value> = Vec::new();
        for mid in &member_ids {
            let user_info: Option<(String, String, String)> = sqlx::query_as(
                &state.db.format_query("SELECT id, username, uid FROM users WHERE id = ?")
            )
            .bind(mid)
            .fetch_optional(&state.db.pool)
            .await?;

            let (uid_str, username, uid) = match user_info {
                Some(u) => u,
                None => continue,
            };

            let referred_count: i64 = sqlx::query_scalar(
                &state.db.format_query("SELECT COUNT(*) FROM users WHERE referred_by = ?")
            )
            .bind(&uid_str)
            .fetch_one(&state.db.pool)
            .await?;

            let total_recharge: f64 = sqlx::query_scalar(
                &state.db.format_query(
                    "SELECT COALESCE(SUM(r.amount), 0.0) FROM recharge_records r JOIN users u ON r.user_id = u.id WHERE u.referred_by = ?"
                )
            )
            .bind(&uid_str)
            .fetch_one(&state.db.pool)
            .await
            .unwrap_or(0.0);

            member_stats.push(json!({
                "user_id": uid_str,
                "username": username,
                "uid": uid,
                "referred_count": referred_count,
                "total_recharge_from_referrals": total_recharge,
            }));
        }

        teams.push(json!({
            "id": team.id,
            "name": team.name,
            "description": team.description,
            "invite_code": team.invite_code.unwrap_or_default(),
            "max_members": team.max_members,
            "member_count": member_ids.len(),
            "members": member_stats,
        }));
    }

    Ok(Json(json!({ "teams": teams, "is_leader": true })))
}
