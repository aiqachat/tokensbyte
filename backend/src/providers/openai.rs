use async_trait::async_trait;
use crate::error::AppResult;
use crate::models::Channel;
use crate::providers::{ChatRequest, ChatResponse, Provider};

pub struct OpenAIProvider;

#[async_trait]
impl Provider for OpenAIProvider {
    fn name(&self) -> &str {
        "openai"
    }

    async fn chat_completions(
        &self,
        client: &reqwest::Client,
        channel: &Channel,
        request: &ChatRequest,
    ) -> AppResult<ChatResponse> {
        let url = format!("{}/v1/chat/completions", channel.base_url.trim_end_matches('/'));
        
        let mut req_body = request.clone();
        req_body.model = channel.resolve_model(&request.model);

        let response = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", channel.api_key))
            .json(&req_body)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(crate::error::AppError::UpstreamError(error_text));
        }

        let chat_response = response.json::<ChatResponse>().await?;
        Ok(chat_response)
    }

    async fn chat_completions_stream(
        &self,
        client: &reqwest::Client,
        channel: &Channel,
        request: &ChatRequest,
    ) -> AppResult<reqwest::Response> {
        let url = format!("{}/v1/chat/completions", channel.base_url.trim_end_matches('/'));
        
        let mut req_body = request.clone();
        req_body.model = channel.resolve_model(&request.model);
        req_body.stream = Some(true);

        let response = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", channel.api_key))
            .json(&req_body)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(crate::error::AppError::UpstreamError(error_text));
        }

        Ok(response)
    }
}
