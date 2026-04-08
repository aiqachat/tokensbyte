use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use crate::error::{AppError, AppResult};
use crate::models::Channel;
use crate::providers::{ChatRequest, ChatResponse, Provider, Message, Choice, Usage};

pub struct GeminiProvider;

#[derive(Debug, Serialize, Deserialize)]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
    #[serde(rename = "generationConfig", skip_serializing_if = "Option::is_none")]
    generation_config: Option<GeminiConfig>,
    #[serde(rename = "systemInstruction", skip_serializing_if = "Option::is_none")]
    system_instruction: Option<GeminiInstruction>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeminiContent {
    role: String,
    parts: Vec<GeminiPart>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeminiPart {
    text: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeminiConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f64>,
    #[serde(rename = "topP", skip_serializing_if = "Option::is_none")]
    top_p: Option<f64>,
    #[serde(rename = "maxOutputTokens", skip_serializing_if = "Option::is_none")]
    max_output_tokens: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeminiInstruction {
    parts: Vec<GeminiPart>,
}

#[derive(Debug, Deserialize)]
struct GeminiResponse {
    candidates: Vec<GeminiCandidate>,
    #[serde(rename = "usageMetadata")]
    usage_metadata: Option<GeminiUsage>,
}

#[derive(Debug, Deserialize)]
struct GeminiCandidate {
    content: GeminiContent,
    #[serde(rename = "finishReason")]
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GeminiUsage {
    #[serde(rename = "promptTokenCount")]
    prompt_token_count: i32,
    #[serde(rename = "candidatesTokenCount")]
    candidates_token_count: i32,
}

#[async_trait]
impl Provider for GeminiProvider {
    fn name(&self) -> &str {
        "google"
    }

    async fn chat_completions(
        &self,
        client: &reqwest::Client,
        channel: &Channel,
        request: &ChatRequest,
    ) -> AppResult<ChatResponse> {
        let (gemini_req, model_name) = self.transform_request(channel, request)?;
        
        let url = format!(
            "{}/v1beta/models/{}:generateContent?key={}",
            channel.base_url.trim_end_matches('/'),
            model_name,
            channel.api_key
        );
        
        let response = client
            .post(&url)
            .json(&gemini_req)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(AppError::UpstreamError(error_text));
        }

        let gem_resp = response.json::<GeminiResponse>().await?;
        
        let candidate = gem_resp.candidates.first().ok_or_else(|| AppError::UpstreamError("No candidates returned".to_string()))?;
        let content = candidate.content.parts.iter().map(|p| p.text.clone()).collect::<Vec<_>>().join("");

        let usage = gem_resp.usage_metadata.map(|u| Usage {
            prompt_tokens: u.prompt_token_count,
            completion_tokens: u.candidates_token_count,
            total_tokens: u.prompt_token_count + u.candidates_token_count,
        });

        Ok(ChatResponse {
            id: uuid::Uuid::new_v4().to_string(),
            object: "chat.completion".to_string(),
            created: chrono::Utc::now().timestamp(),
            model: model_name,
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
                finish_reason: candidate.finish_reason.clone(),
            }],
            usage,
        })
    }

    async fn chat_completions_stream(
        &self,
        client: &reqwest::Client,
        channel: &Channel,
        request: &ChatRequest,
    ) -> AppResult<reqwest::Response> {
        let (gemini_req, model_name) = self.transform_request(channel, request)?;
        
        let url = format!(
            "{}/v1beta/models/{}:streamGenerateContent?key={}&alt=sse",
            channel.base_url.trim_end_matches('/'),
            model_name,
            channel.api_key
        );
        
        let response = client
            .post(&url)
            .json(&gemini_req)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(AppError::UpstreamError(error_text));
        }

        Ok(response)
    }
}

impl GeminiProvider {
    fn transform_request(&self, channel: &Channel, request: &ChatRequest) -> AppResult<(GeminiRequest, String)> {
        let mut contents = Vec::new();
        let mut system_instruction = None;

        for msg in &request.messages {
            if msg.role == "system" {
                let text = match &msg.content {
                    Some(serde_json::Value::String(s)) => s.clone(),
                    _ => continue,
                };
                system_instruction = Some(GeminiInstruction {
                    parts: vec![GeminiPart { text }],
                });
            } else {
                let role = if msg.role == "assistant" { "model" } else { "user" };
                let text = match &msg.content {
                    Some(serde_json::Value::String(s)) => s.clone(),
                    Some(v) => v.to_string(),
                    None => "".to_string(),
                };
                contents.push(GeminiContent {
                    role: role.to_string(),
                    parts: vec![GeminiPart { text }],
                });
            }
        }

        let config = GeminiConfig {
            temperature: request.temperature,
            top_p: request.top_p,
            max_output_tokens: request.max_tokens,
        };

        Ok((GeminiRequest {
            contents,
            generation_config: Some(config),
            system_instruction,
        }, channel.resolve_model(&request.model)))
    }
}
