with open('backend/src/api/team_marketing.rs', 'r', encoding='utf-8') as f:
    content = f.read()

conflict = """<<<<<<< HEAD
    let team_id: i64 = sqlx::query_scalar(
        &state.db.format_query("INSERT INTO marketing_teams (name, description, invite_code, max_members, allowed_level_ids, allowed_member_level_ids) VALUES (?, ?, ?, ?, ?, ?) RETURNING id")
=======
    sqlx::query(
        &state.db.format_query("INSERT INTO marketing_teams (name, description, invite_code, max_members, members_can_set_level, allowed_level_ids, allowed_member_level_ids) VALUES (?, ?, ?, ?, ?, ?, ?)")
>>>>>>> 1c462a0 (feat: 优化高级营销UI，支持移动端卡片布局及备注修改)"""

resolved = """    let team_id: i64 = sqlx::query_scalar(
        &state.db.format_query("INSERT INTO marketing_teams (name, description, invite_code, max_members, members_can_set_level, allowed_level_ids, allowed_member_level_ids) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id")"""

content = content.replace(conflict, resolved)

with open('backend/src/api/team_marketing.rs', 'w', encoding='utf-8') as f:
    f.write(content)
