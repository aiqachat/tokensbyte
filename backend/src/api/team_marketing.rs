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
    pub max_members: i64,
    #[sqlx(default)]
    pub members_can_set_level: i64,
    #[sqlx(default)]
    pub allowed_level_ids: String,
    #[sqlx(default)]
    pub allowed_member_level_ids: String,
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
    pub members_can_set_level: i64,
    pub allowed_level_ids: Vec<i64>,
    pub allowed_member_level_ids: Vec<i64>,
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
    pub members_can_set_level: Option<i64>,
    pub allowed_level_ids: Option<Vec<i64>>,
    pub allowed_member_level_ids: Option<Vec<i64>>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTeamRequest {
    pub name: String,
    pub description: Option<String>,
    pub leader_ids: Vec<String>,
    pub member_ids: Vec<String>,
    pub max_members: Option<i64>,
    pub members_can_set_level: Option<i64>,
    pub allowed_level_ids: Option<Vec<i64>>,
    pub allowed_member_level_ids: Option<Vec<i64>>,
}

#[derive(Debug, Deserialize)]
pub struct SetUserLevelRequest {
    pub group_key: String,
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
    pub updated_at: String,
    pub remark: Option<String>,
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
        .route("/referral/{user_id}/level", put(set_referral_user_level))
        .route("/referral/{user_id}/remark", put(update_referral_remark))
        .route("/member/{user_id}/level", put(set_member_user_level))
        .route("/allowed-levels", get(get_allowed_levels))
        .route("/allowed-member-levels", get(get_allowed_member_levels))
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
        let level_ids: Vec<i64> = serde_json::from_str(&team.allowed_level_ids).unwrap_or_default();
        let member_level_ids: Vec<i64> = serde_json::from_str(&team.allowed_member_level_ids).unwrap_or_default();
        result.push(TeamWithMembers {
            id: team.id,
            name: team.name,
            description: team.description,
            invite_code: team.invite_code.unwrap_or_default(),
            max_members: team.max_members,
            members_can_set_level: team.members_can_set_level,
            allowed_level_ids: level_ids,
            allowed_member_level_ids: member_level_ids,
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
    let members_can_set_level = payload.members_can_set_level.unwrap_or(0);
    let level_ids_json = serde_json::to_string(&payload.allowed_level_ids.unwrap_or_default()).unwrap_or_else(|_| "[]".to_string());
    let member_level_ids_json = serde_json::to_string(&payload.allowed_member_level_ids.unwrap_or_default()).unwrap_or_else(|_| "[]".to_string());

    // Insert team
    let team_id: i64 = sqlx::query_scalar(
        &state.db.format_query("INSERT INTO marketing_teams (name, description, invite_code, max_members, members_can_set_level, allowed_level_ids, allowed_member_level_ids) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id")
    )
    .bind(&payload.name)
    .bind(&payload.description)
    .bind(&invite_code)
    .bind(max_members)
    .bind(members_can_set_level)
    .bind(&level_ids_json)
    .bind(&member_level_ids_json)
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
    let members_can_set_level = payload.members_can_set_level.unwrap_or(0);
    let level_ids_json = serde_json::to_string(&payload.allowed_level_ids.unwrap_or_default()).unwrap_or_else(|_| "[]".to_string());
    let member_level_ids_json = serde_json::to_string(&payload.allowed_member_level_ids.unwrap_or_default()).unwrap_or_else(|_| "[]".to_string());

    // Update team
    sqlx::query(
        &state.db.format_query("UPDATE marketing_teams SET name = ?, description = ?, max_members = ?, members_can_set_level = ?, allowed_level_ids = ?, allowed_member_level_ids = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    )
    .bind(&payload.name)
    .bind(&payload.description)
    .bind(max_members)
    .bind(members_can_set_level)
    .bind(&level_ids_json)
    .bind(&member_level_ids_json)
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
                      u.balance, u.is_active, u.created_at, u.updated_at, u.remark
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
            "updated_at": r.updated_at,
            "remark": r.remark,
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
            let user_info: Option<(String, String, String, String, Option<String>, f64)> = sqlx::query_as(
                &state.db.format_query("SELECT u.id, u.username, u.uid, u.user_group, ul.name as level_name, u.balance FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?")
            )
            .bind(mid)
            .fetch_optional(&state.db.pool)
            .await?;

            let (uid_str, username, uid, user_group, level_name, member_balance) = match user_info {
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

            // 成员自身的总充值金额
            let member_total_recharge: f64 = sqlx::query_scalar(
                &state.db.format_query("SELECT COALESCE(SUM(amount), 0.0) FROM recharge_records WHERE user_id = ?")
            )
            .bind(mid)
            .fetch_one(&state.db.pool)
            .await
            .unwrap_or(0.0);

            member_stats.push(json!({
                "user_id": uid_str,
                "username": username,
                "uid": uid,
                "user_group": user_group,
                "level_name": level_name,
                "balance": member_balance,
                "total_recharge": member_total_recharge,
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

// ========== Team Leader: Allowed Levels & Set User Level ==========

/// 用户端：获取团队负责人被授权的用户等级列表
async fn get_allowed_levels(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let my_id = &claims.sub;

    // 查询当前用户是负责人的所有团队
    let mut team_ids: Vec<i64> = sqlx::query_scalar(
        &state.db.format_query("SELECT team_id FROM marketing_team_leaders WHERE user_id = ?")
    )
    .bind(my_id)
    .fetch_all(&state.db.pool)
    .await?;

    // 另外加上用户作为成员且被授权设置等级的团队
    let member_team_ids: Vec<i64> = sqlx::query_scalar(
        &state.db.format_query("SELECT m.team_id FROM marketing_team_members m JOIN marketing_teams t ON m.team_id = t.id WHERE m.user_id = ? AND t.members_can_set_level = 1")
    )
    .bind(my_id)
    .fetch_all(&state.db.pool)
    .await?;

    for id in member_team_ids {
        if !team_ids.contains(&id) {
            team_ids.push(id);
        }
    }

    if team_ids.is_empty() {
        return Ok(Json(json!({ "levels": [], "is_leader": false })));
    }

    // 收集所有团队授权的等级 ID（去重）
    let mut all_level_ids: Vec<i64> = Vec::new();
    for tid in &team_ids {
        let allowed_str: String = sqlx::query_scalar(
            &state.db.format_query("SELECT allowed_level_ids FROM marketing_teams WHERE id = ?")
        )
        .bind(tid)
        .fetch_one(&state.db.pool)
        .await
        .unwrap_or_else(|_| "[]".to_string());

        let ids: Vec<i64> = serde_json::from_str(&allowed_str).unwrap_or_default();
        for id in ids {
            if !all_level_ids.contains(&id) {
                all_level_ids.push(id);
            }
        }
    }

    if all_level_ids.is_empty() {
        return Ok(Json(json!({ "levels": [], "is_leader": true })));
    }

    // 查询这些等级的详细信息
    let placeholders: Vec<String> = (1..=all_level_ids.len()).map(|i| format!("${}", i)).collect();
    let query_str = format!("SELECT id, name, group_key, discount, description FROM user_levels WHERE id IN ({})", placeholders.join(","));
    
    let mut query = sqlx::query_as::<_, (i64, String, String, f64, String)>(&query_str);
    for id in &all_level_ids {
        query = query.bind(id);
    }
    let levels: Vec<(i64, String, String, f64, String)> = query
        .fetch_all(&state.db.pool)
        .await?;

    let result: Vec<serde_json::Value> = levels.into_iter().map(|(id, name, group_key, discount, description)| {
        json!({
            "id": id,
            "name": name,
            "group_key": group_key,
            "discount": discount,
            "description": description,
        })
    }).collect();

    Ok(Json(json!({ "levels": result, "is_leader": true })))
}

/// 用户端：团队负责人设置推荐用户的用户等级
async fn set_referral_user_level(
    State(state): State<Arc<AppState>>,
    Path(target_user_id): Path<String>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<SetUserLevelRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let my_id = &claims.sub;

    // 获取当前用户 uid
    let my_uid: String = sqlx::query_scalar(
        &state.db.format_query("SELECT uid FROM users WHERE id = ?")
    )
    .bind(my_id)
    .fetch_one(&state.db.pool)
    .await?;

    // 1. 验证当前用户是至少一个团队的负责人或被授权的成员
    let leader_team_ids: Vec<i64> = sqlx::query_scalar(
        &state.db.format_query("SELECT team_id FROM marketing_team_leaders WHERE user_id = ?")
    )
    .bind(my_id)
    .fetch_all(&state.db.pool)
    .await?;

    let member_team_ids: Vec<i64> = sqlx::query_scalar(
        &state.db.format_query("SELECT m.team_id FROM marketing_team_members m JOIN marketing_teams t ON m.team_id = t.id WHERE m.user_id = ? AND t.members_can_set_level = 1")
    )
    .bind(my_id)
    .fetch_all(&state.db.pool)
    .await?;

    if leader_team_ids.is_empty() && member_team_ids.is_empty() {
        return Err(AppError::Unauthorized);
    }

    let mut all_team_ids = leader_team_ids.clone();
    for id in &member_team_ids {
        if !all_team_ids.contains(id) {
            all_team_ids.push(*id);
        }
    }

    // 2. 验证目标用户是当前用户推荐的，或者是当前用户作为负责人时其团队成员推荐的
    let is_my_referral: i64 = sqlx::query_scalar(
        &state.db.format_query("SELECT COUNT(*) FROM users WHERE id = ? AND (referred_by = ? OR referred_by = ?)")
    )
    .bind(&target_user_id)
    .bind(my_id)
    .bind(&my_uid)
    .fetch_one(&state.db.pool)
    .await?;

    let mut is_authorized_target = is_my_referral > 0;

    if !is_authorized_target {
        // 检查是否为团队成员推荐的用户（仅针对自己是负责人的团队）
        for tid in &leader_team_ids {
            let member_ids: Vec<String> = sqlx::query_scalar(
                &state.db.format_query("SELECT user_id FROM marketing_team_members WHERE team_id = ?")
            )
            .bind(tid)
            .fetch_all(&state.db.pool)
            .await?;

            for mid in &member_ids {
                let mid_uid: String = sqlx::query_scalar(
                    &state.db.format_query("SELECT uid FROM users WHERE id = ?")
                )
                .bind(mid)
                .fetch_optional(&state.db.pool)
                .await?
                .unwrap_or_default();

                let count: i64 = sqlx::query_scalar(
                    &state.db.format_query("SELECT COUNT(*) FROM users WHERE id = ? AND (referred_by = ? OR referred_by = ?)")
                )
                .bind(&target_user_id)
                .bind(mid)
                .bind(&mid_uid)
                .fetch_one(&state.db.pool)
                .await?;

                if count > 0 {
                    is_authorized_target = true;
                    break;
                }
            }
            if is_authorized_target { break; }
        }
    }

    if !is_authorized_target {
        return Err(AppError::BadRequest("目标用户不在您的推荐范围内".to_string()));
    }

    // 3. 验证要设置的等级在团队授权范围内
    // 先通过 group_key 找到等级 ID
    let target_level_id: Option<i64> = sqlx::query_scalar(
        &state.db.format_query("SELECT id FROM user_levels WHERE group_key = ?")
    )
    .bind(&payload.group_key)
    .fetch_optional(&state.db.pool)
    .await?;

    let target_level_id = match target_level_id {
        Some(id) => id,
        None => return Err(AppError::BadRequest("无效的用户等级".to_string())),
    };

    let mut is_authorized = false;
    for tid in &all_team_ids {
        let allowed_str: String = sqlx::query_scalar(
            &state.db.format_query("SELECT allowed_level_ids FROM marketing_teams WHERE id = ?")
        )
        .bind(tid)
        .fetch_one(&state.db.pool)
        .await
        .unwrap_or_else(|_| "[]".to_string());

        let ids: Vec<i64> = serde_json::from_str(&allowed_str).unwrap_or_default();
        if ids.contains(&target_level_id) {
            is_authorized = true;
            break;
        }
    }

    if !is_authorized {
        return Err(AppError::BadRequest("您没有权限分配该用户等级".to_string()));
    }

    // 4. 执行更新
    sqlx::query(
        &state.db.format_query("UPDATE users SET user_group = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    )
    .bind(&payload.group_key)
    .bind(&target_user_id)
    .execute(&state.db.pool)
    .await?;

    // 查询等级名称用于返回
    let level_name: String = sqlx::query_scalar(
        &state.db.format_query("SELECT name FROM user_levels WHERE group_key = ?")
    )
    .bind(&payload.group_key)
    .fetch_one(&state.db.pool)
    .await
    .unwrap_or_else(|_| payload.group_key.clone());

    Ok(Json(json!({ "message": format!("用户等级已设置为: {}", level_name), "level_name": level_name, "group_key": payload.group_key })))
}

/// 用户端：获取团队负责人被授权的团队成员用户等级列表
async fn get_allowed_member_levels(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let my_id = &claims.sub;

    let team_ids: Vec<i64> = sqlx::query_scalar(
        &state.db.format_query("SELECT team_id FROM marketing_team_leaders WHERE user_id = ?")
    )
    .bind(my_id)
    .fetch_all(&state.db.pool)
    .await?;

    if team_ids.is_empty() {
        return Ok(Json(json!({ "levels": [], "is_leader": false })));
    }

    let mut all_level_ids: Vec<i64> = Vec::new();
    for tid in &team_ids {
        let allowed_str: String = sqlx::query_scalar(
            &state.db.format_query("SELECT allowed_member_level_ids FROM marketing_teams WHERE id = ?")
        )
        .bind(tid)
        .fetch_one(&state.db.pool)
        .await
        .unwrap_or_else(|_| "[]".to_string());

        let ids: Vec<i64> = serde_json::from_str(&allowed_str).unwrap_or_default();
        for id in ids {
            if !all_level_ids.contains(&id) {
                all_level_ids.push(id);
            }
        }
    }

    if all_level_ids.is_empty() {
        return Ok(Json(json!({ "levels": [], "is_leader": true })));
    }

    let placeholders: Vec<String> = (1..=all_level_ids.len()).map(|i| format!("${}", i)).collect();
    let query_str = format!("SELECT id, name, group_key, discount, description FROM user_levels WHERE id IN ({})", placeholders.join(","));
    
    let mut query = sqlx::query_as::<_, (i64, String, String, f64, String)>(&query_str);
    for id in &all_level_ids {
        query = query.bind(id);
    }
    let levels: Vec<(i64, String, String, f64, String)> = query
        .fetch_all(&state.db.pool)
        .await?;

    let result: Vec<serde_json::Value> = levels.into_iter().map(|(id, name, group_key, discount, description)| {
        json!({
            "id": id,
            "name": name,
            "group_key": group_key,
            "discount": discount,
            "description": description,
        })
    }).collect();

    Ok(Json(json!({ "levels": result, "is_leader": true })))
}

/// 用户端：团队负责人设置团队成员的用户等级
async fn set_member_user_level(
    State(state): State<Arc<AppState>>,
    Path(target_user_id): Path<String>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<SetUserLevelRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let my_id = &claims.sub;

    // 1. 验证当前用户是至少一个团队的负责人
    let team_ids: Vec<i64> = sqlx::query_scalar(
        &state.db.format_query("SELECT team_id FROM marketing_team_leaders WHERE user_id = ?")
    )
    .bind(my_id)
    .fetch_all(&state.db.pool)
    .await?;

    if team_ids.is_empty() {
        return Err(AppError::Unauthorized);
    }

    // 2. 验证目标用户是当前用户管理的团队的成员
    let mut is_team_member = false;
    for tid in &team_ids {
        let count: i64 = sqlx::query_scalar(
            &state.db.format_query("SELECT COUNT(*) FROM marketing_team_members WHERE team_id = ? AND user_id = ?")
        )
        .bind(tid)
        .bind(&target_user_id)
        .fetch_one(&state.db.pool)
        .await?;

        if count > 0 {
            is_team_member = true;
            break;
        }
    }

    if !is_team_member {
        return Err(AppError::BadRequest("目标用户不是您管理的团队成员".to_string()));
    }

    // 3. 验证要设置的等级在团队 allowed_member_level_ids 范围内
    let target_level_id: Option<i64> = sqlx::query_scalar(
        &state.db.format_query("SELECT id FROM user_levels WHERE group_key = ?")
    )
    .bind(&payload.group_key)
    .fetch_optional(&state.db.pool)
    .await?;

    let target_level_id = match target_level_id {
        Some(id) => id,
        None => return Err(AppError::BadRequest("无效的用户等级".to_string())),
    };

    let mut is_authorized = false;
    for tid in &team_ids {
        let allowed_str: String = sqlx::query_scalar(
            &state.db.format_query("SELECT allowed_member_level_ids FROM marketing_teams WHERE id = ?")
        )
        .bind(tid)
        .fetch_one(&state.db.pool)
        .await
        .unwrap_or_else(|_| "[]".to_string());

        let ids: Vec<i64> = serde_json::from_str(&allowed_str).unwrap_or_default();
        if ids.contains(&target_level_id) {
            is_authorized = true;
            break;
        }
    }

    if !is_authorized {
        return Err(AppError::BadRequest("您没有权限分配该用户等级".to_string()));
    }

    // 4. 执行更新
    sqlx::query(
        &state.db.format_query("UPDATE users SET user_group = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    )
    .bind(&payload.group_key)
    .bind(&target_user_id)
    .execute(&state.db.pool)
    .await?;

    let level_name: String = sqlx::query_scalar(
        &state.db.format_query("SELECT name FROM user_levels WHERE group_key = ?")
    )
    .bind(&payload.group_key)
    .fetch_one(&state.db.pool)
    .await
    .unwrap_or_else(|_| payload.group_key.clone());

    Ok(Json(json!({ "message": format!("成员等级已设置为: {}", level_name), "level_name": level_name, "group_key": payload.group_key })))
}

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
