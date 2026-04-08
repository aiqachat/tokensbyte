use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use crate::error::{AppError, AppResult};
use crate::models::Channel;
use crate::providers::{ChatRequest, ChatResponse, Provider, Message, Choice, Usage};

pub struct AnthropicProvider;

#[derive(Debug, Serialize, Deserialize)]
struct AnthropicRequest {
    model: String,
    messages: Vec<AnthropicMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    max_tokens: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
struct AnthropicMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct AnthropicResponse {
    id: String,
    model: String,
    content: Vec<AnthropicContent>,
    usage: AnthropicUsage,
}

#[derive(Debug, Deserialize)]
struct AnthropicContent {
    #[serde(rename = "type")]
    content_type: String,
    text: String,
}

#[derive(Debug, Deserialize)]
struct AnthropicUsage {
    input_tokens: i32,
    output_tokens: i32,
}

#[async_trait]
impl Provider for AnthropicProvider {
    fn name(&self) -> &str {
        "anthropic"
    }

    async fn chat_completions(
        &self,
        client: &reqwest::Client,
        channel: &Channel,
        request: &ChatRequest,
    ) -> AppResult<ChatResponse> {
        let (anthropic_req, system_msg) = self.transform_request(channel, request)?;
        
        let url = format!("{}/v1/messages", channel.base_url.trim_end_matches('/'));
        
        let response = client
            .post(&url)
            .header("x-api-key", &channel.api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&anthropic_req)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(AppError::UpstreamError(error_text));
        }

        let ant_resp = response.json::<AnthropicResponse>().await?;
        
        let content = ant_resp.content.iter()
            .filter(|c| c.content_type == "text")
            .map(|c| c.text.clone())
            .collect::<Vec<_>>()
            .join("");

        Ok(ChatResponse {
            id: ant_resp.id,
            object: "chat.completion".to_string(),
            created: chrono::Utc::now().timestamp(),
            model: ant_resp.model,
            choices: vec![Choice {
                index: 0,
                message: Some(Message {
                    role: "assistant".to_string(),
                    content: Some(serde_json::Value::String(content)),
                    name: None,
                    tool_calls: None,
                    tool_call_id: None,
                    extra: Default::default(),
                }),
                delta: None,
                finish_reason: Some("stop".to_string()),
            }],
            usage: Some(Usage {
                prompt_tokens: ant_resp.usage.input_tokens,
                completion_tokens: ant_resp.usage.output_tokens,
                total_tokens: ant_resp.usage.input_tokens + ant_resp.usage.output_tokens,
            }),
        })
    }

    async fn chat_completions_stream(
        &self,
        client: &reqwest::Client,
        channel: &Channel,
        request: &ChatRequest,
    ) -> AppResult<reqwest::Response> {
        let (mut anthropic_req, _) = self.transform_request(channel, request)?;
        anthropic_req.stream = Some(true);

        let url = format!("{}/v1/messages", channel.base_url.trim_end_matches('/'));
        
        let response = client
            .post(&url)
            .header("x-api-key", &channel.api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&anthropic_req)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(AppError::UpstreamError(error_text));
        }

        Ok(response)
    }
}

impl AnthropicProvider {
    fn transform_request(&self, channel: &Channel, request: &ChatRequest) -> AppResult<(AnthropicRequest, Option<String>)> {
        let mut system_msg = None;
        let mut messages = Vec::new();

        for msg in &request.messages {
            if msg.role == "system" {
                if let Some(serde_json::Value::String(s)) = &msg.content {
                    system_msg = Some(s.clone());
                }
            } else {
                let content = match &msg.content {
                    Some(serde_json::Value::String(s)) => s.clone(),
                    Some(v) => v.to_string(),
                    None => "".to_string(),
                };
                messages.push(AnthropicMessage {
                    role: msg.role.clone(),
                    content,
                });
            }
        }

        Ok((AnthropicRequest {
            model: channel.resolve_model(&request.model),
            messages,
            system: system_msg.clone(),
            max_tokens: request.max_tokens.unwrap_or(4096),
            temperature: request.temperature,
            top_p: request.top_p,
            stream: request.stream,
        }, system_msg))
    }
}
