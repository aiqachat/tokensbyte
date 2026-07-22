/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

use std::sync::Arc;
use std::time::Duration;
use tokio::time::sleep;
use crate::AppState;
use crate::models::Channel;

/// Background task to periodically check channel health
pub async fn start_health_check(state: Arc<AppState>) {
    loop {
        tracing::info!("Starting background health check for all active channels...");
        
        let channels: Vec<Channel> = match sqlx::query_as(&state.db.format_query("SELECT * FROM channels WHERE status = 1"))
            .fetch_all(&state.db.pool)
            .await {
                Ok(c) => c,
                Err(e) => {
                    tracing::error!("Failed to fetch channels for health check: {}", e);
                    sleep(Duration::from_secs(60)).await;
                    continue;
                }
            };

        for channel in channels {
            let state_c = state.clone();
            tokio::spawn(async move {
                let start = std::time::Instant::now();
                
                // For Phase 2, we simulate a check or do a lightweight call
                // Real implementation: call a specific test endpoint
                let success = true; 
                let latency = start.elapsed().as_millis() as i32;

                if let Err(e) = sqlx::query(
                    &state_c.db.format_query("UPDATE channels SET updated_at = CURRENT_TIMESTAMP WHERE id = ?")
                )
                .bind(channel.id)
                .execute(&state_c.db.pool)
                .await {
                    tracing::error!("Failed to update channel {} status: {}", channel.id, e);
                }
            });
        }

        // Wait for 10 minutes before next check
        sleep(Duration::from_secs(600)).await;
    }
}
