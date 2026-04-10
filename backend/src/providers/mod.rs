pub mod openai;
pub mod anthropic;
pub mod google;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use crate::models::Channel;
use crate::error::AppResult;

/// Unified chat completion request (OpenAI-compatible format)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<Message>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub presence_penalty: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frequency_penalty: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub n: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<String>,
    /// Extra fields for passthrough
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

impl ChatRequest {
    pub fn estimate_prompt_tokens(&self) -> i32 {
        let mut total_chars = 0;
        for msg in &self.messages {
            if let Some(content) = &msg.content {
                if let Some(s) = content.as_str() {
                    total_chars += s.len();
                } else if let Some(arr) = content.as_array() {
                    for part in arr {
                        if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                            total_chars += text.len();
                        } else if let Some(text) = part.as_str() {
                            total_chars += text.len();
                        }
                    }
                }
            }
        }
        (total_chars as f64 / 4.0).ceil() as i32
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

/// Unified chat completion response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatResponse {
    pub id: String,
    pub object: String,
    pub created: i64,
    pub model: String,
    pub choices: Vec<Choice>,
    pub usage: Option<Usage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Choice {
    pub index: i32,
    pub message: Option<Message>,
    pub delta: Option<Message>,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Usage {
    pub prompt_tokens: i32,
    pub completion_tokens: i32,
    pub total_tokens: i32,
}

/// Stream chunk (SSE data line)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamChunk {
    pub id: String,
    pub object: String,
    pub created: i64,
    pub model: String,
    pub choices: Vec<Choice>,
    pub usage: Option<Usage>,
}

/// Provider trait - implement for each upstream provider
#[async_trait]
pub trait Provider: Send + Sync {
    fn name(&self) -> &str;

    /// Send a non-streaming completion request
    async fn chat_completions(
        &self,
        client: &reqwest::Client,
        channel: &Channel,
        request: &ChatRequest,
    ) -> AppResult<ChatResponse>;

    /// Send a streaming completion request, returning raw response for SSE forwarding
    async fn chat_completions_stream(
        &self,
        client: &reqwest::Client,
        channel: &Channel,
        request: &ChatRequest,
    ) -> AppResult<reqwest::Response>;
}

/// Get provider implementation by type name
pub fn get_provider(provider_type: &str) -> Box<dyn Provider> {
    match provider_type {
        "openai" | "deepseek" | "groq" | "together" | "siliconflow" | "openrouter" | "custom" => {
            Box::new(openai::OpenAIProvider)
        }
        "anthropic" => Box::new(anthropic::AnthropicProvider),
        "google" => Box::new(google::GeminiProvider),
        _ => Box::new(openai::OpenAIProvider), // Default to OpenAI-compatible
    }
}
