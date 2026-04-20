use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};

/// 微信用户信息
#[derive(Debug, Serialize, Deserialize)]
pub struct WechatUserInfo {
    pub openid: String,
    pub unionid: Option<String>,
    pub nickname: Option<String>,
    pub headimgurl: Option<String>,
}

/// 谷歌用户信息
#[derive(Debug, Serialize, Deserialize)]
pub struct GoogleUserInfo {
    pub id: String,
    pub email: Option<String>,
    pub name: Option<String>,
    pub picture: Option<String>,
}

/// OAuth 服务（无状态，纯函数式，低耦合易扩展）
pub struct OAuthService;

impl OAuthService {
    // ======================== 微信 OAuth ========================

    /// 生成微信授权 URL
    pub fn wechat_auth_url(app_id: &str, redirect_uri: &str, state: &str) -> String {
        format!(
            "https://open.weixin.qq.com/connect/qrconnect?appid={}&redirect_uri={}&response_type=code&scope=snsapi_login&state={}#wechat_redirect",
            app_id,
            urlencoding::encode(redirect_uri),
            state,
        )
    }

    /// 微信 code 换取用户信息
    pub async fn wechat_exchange(
        app_id: &str,
        app_secret: &str,
        code: &str,
    ) -> AppResult<WechatUserInfo> {
        let client = reqwest::Client::new();

        // 1. code 换 access_token + openid
        let token_url = format!(
            "https://api.weixin.qq.com/sns/oauth2/access_token?appid={}&secret={}&code={}&grant_type=authorization_code",
            app_id, app_secret, code
        );
        let token_resp: serde_json::Value = client
            .get(&token_url)
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("微信 token 请求失败: {}", e)))?
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("微信 token 解析失败: {}", e)))?;

        if let Some(errcode) = token_resp.get("errcode") {
            let code = errcode.as_i64().unwrap_or(0);
            if code != 0 {
                let msg = token_resp["errmsg"].as_str().unwrap_or("unknown");
                return Err(AppError::Internal(format!("微信授权失败: {}", msg)));
            }
        }

        let access_token = token_resp["access_token"]
            .as_str()
            .ok_or_else(|| AppError::Internal("微信返回缺少 access_token".to_string()))?;
        let openid = token_resp["openid"]
            .as_str()
            .ok_or_else(|| AppError::Internal("微信返回缺少 openid".to_string()))?;
        let unionid = token_resp["unionid"].as_str().map(|s| s.to_string());

        // 2. 获取用户信息
        let info_url = format!(
            "https://api.weixin.qq.com/sns/userinfo?access_token={}&openid={}",
            access_token, openid
        );
        let info_resp: serde_json::Value = client
            .get(&info_url)
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("微信用户信息请求失败: {}", e)))?
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("微信用户信息解析失败: {}", e)))?;

        Ok(WechatUserInfo {
            openid: openid.to_string(),
            unionid: unionid.or_else(|| info_resp["unionid"].as_str().map(|s| s.to_string())),
            nickname: info_resp["nickname"].as_str().map(|s| s.to_string()),
            headimgurl: info_resp["headimgurl"].as_str().map(|s| s.to_string()),
        })
    }

    // ======================== 谷歌 OAuth ========================

    /// 生成谷歌授权 URL
    pub fn google_auth_url(client_id: &str, redirect_uri: &str, state: &str) -> String {
        format!(
            "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope=openid%20email%20profile&state={}&access_type=offline",
            client_id,
            urlencoding::encode(redirect_uri),
            state,
        )
    }

    /// 谷歌 code 换取用户信息
    pub async fn google_exchange(
        client_id: &str,
        client_secret: &str,
        code: &str,
        redirect_uri: &str,
    ) -> AppResult<GoogleUserInfo> {
        let client = reqwest::Client::new();

        // 1. code 换 access_token
        let token_resp: serde_json::Value = client
            .post("https://oauth2.googleapis.com/token")
            .form(&[
                ("code", code),
                ("client_id", client_id),
                ("client_secret", client_secret),
                ("redirect_uri", redirect_uri),
                ("grant_type", "authorization_code"),
            ])
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("谷歌 token 请求失败: {}", e)))?
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("谷歌 token 解析失败: {}", e)))?;

        let access_token = token_resp["access_token"]
            .as_str()
            .ok_or_else(|| {
                let err = token_resp["error_description"]
                    .as_str()
                    .unwrap_or("unknown error");
                AppError::Internal(format!("谷歌授权失败: {}", err))
            })?;

        // 2. 获取用户信息
        let info_resp: serde_json::Value = client
            .get("https://www.googleapis.com/oauth2/v2/userinfo")
            .bearer_auth(access_token)
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("谷歌用户信息请求失败: {}", e)))?
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("谷歌用户信息解析失败: {}", e)))?;

        let id = info_resp["id"]
            .as_str()
            .ok_or_else(|| AppError::Internal("谷歌返回缺少 id".to_string()))?;

        Ok(GoogleUserInfo {
            id: id.to_string(),
            email: info_resp["email"].as_str().map(|s| s.to_string()),
            name: info_resp["name"].as_str().map(|s| s.to_string()),
            picture: info_resp["picture"].as_str().map(|s| s.to_string()),
        })
    }
}
