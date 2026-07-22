/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

use anyhow::Result;
use sqlx::{Postgres, Transaction};

pub async fn award_commission(
    db: &crate::db::Database,
    tx: &mut Transaction<'_, Postgres>,
    user_id: &str,
    recharge_id: i64,
    amount: f64,
) -> Result<()> {
    // 1. Get user and their inviter
    let user: Option<(Option<String>,)> =
        sqlx::query_as(&db.format_query("SELECT referred_by FROM users WHERE id = ?"))
            .bind(user_id)
            .fetch_optional(&mut **tx)
            .await?;

    if let Some((Some(referred_by),)) = user {
        // 2. Get inviter and their level
        let inviter: Option<(String, f64)> = sqlx::query_as(
            &db.format_query("SELECT u.id, ul.commission_ratio FROM users u JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?")
        )
        .bind(&referred_by)
        .fetch_optional(&mut **tx)
        .await?;

        if let Some((inviter_id, ratio)) = inviter {
            if ratio > 0.0 {
                let commission_amount = amount * ratio;
                if commission_amount > 0.0 {
                    // 3. Award commission
                    sqlx::query(&db.format_query("UPDATE users SET commission_balance = commission_balance + ?, gift_balance = gift_balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"))
                        .bind(commission_amount)
                        .bind(commission_amount)
                        .bind(&inviter_id)
                        .execute(&mut **tx)
                        .await?;

                    // 4. Record commission
                    sqlx::query(&db.format_query("INSERT INTO commissions (user_id, from_user_id, recharge_id, amount, ratio) VALUES (?, ?, ?, ?, ?)"))
                        .bind(&inviter_id)
                        .bind(user_id)
                        .bind(recharge_id)
                        .bind(commission_amount)
                        .bind(ratio)
                        .execute(&mut **tx)
                        .await?;
                }
            }
        }
    }

    Ok(())
}
