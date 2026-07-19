use crate::error::AppResult;
use crate::models::SMTPSettings;
use lettre::message::{Mailbox, SinglePart};
use lettre::transport::smtp::authentication::Credentials;
use lettre::{Message, SmtpTransport, Transport};

pub struct EmailService {
    transport: SmtpTransport,
    from_address: String,
    from_name: String,
}

impl EmailService {
    pub fn new(settings: &SMTPSettings) -> Result<Self, crate::error::AppError> {
        let creds = Credentials::new(settings.username.clone(), settings.password.clone());

        let transport = SmtpTransport::relay(&settings.host)
            .map_err(|e| crate::error::AppError::BadRequest(format!("SMTP 服务器配置错误: {}", e)))?
            .port(settings.port)
            .credentials(creds)
            .build();

        Ok(Self {
            transport,
            from_address: settings.from_address.clone(),
            from_name: settings.from_name.clone(),
        })
    }

    pub async fn send_verification_code(
        &self,
        to_email: &str,
        code: &str,
        purpose: &str,
    ) -> AppResult<()> {
        let (action_text, subject_prefix) = match purpose {
            "register" => ("注册账号", "注册验证码"),
            "reset_password" => ("找回密码", "找回密码验证码"),
            "bind_email" | "bind_mobile" => ("绑定 / 换绑账号", "绑定账号验证码"),
            _ => ("安全验证", "安全验证码"),
        };

        let subject = format!("【{}】{}", self.from_name, subject_prefix);

        let html_body = format!(
            r#"<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e8e8e8; border-radius: 8px;">
  <div style="padding: 30px;">
    <h2 style="color: #1677ff; margin: 0 0 24px 0; font-size: 24px; font-weight: 600;">{}</h2>
    <p style="color: #333; font-size: 16px; margin: 0 0 16px 0;">您好！</p>
    <p style="color: #333; font-size: 16px; margin: 0 0 24px 0;">您正在进行<strong>{}</strong>操作，验证码为：</p>
    <div style="background-color: #f5f5f5; padding: 20px; border-radius: 6px; text-align: center; font-size: 36px; font-weight: bold; color: #1677ff; letter-spacing: 8px; margin-bottom: 24px;">
      {}
    </div>
    <p style="color: #666; font-size: 14px; margin: 0 0 12px 0;">验证码有效期为 10 分钟，请勿泄露给他人。</p>
    <div style="border-top: 1px dashed #e8e8e8; margin-top: 24px; padding-top: 16px;">
      <p style="color: #999; font-size: 12px; margin: 0;">如非本人操作，请忽略此邮件。</p>
    </div>
  </div>
</div>"#,
            self.from_name, action_text, code
        );

        let from_mailbox = Mailbox::new(
            if self.from_name.trim().is_empty() {
                None
            } else {
                Some(self.from_name.clone())
            },
            self.from_address.parse().map_err(|e| {
                crate::error::AppError::BadRequest(format!("Invalid From address: {}", e))
            })?,
        );

        let email = Message::builder()
            .from(from_mailbox)
            .to(to_email.parse().unwrap())
            .subject(subject)
            .singlepart(SinglePart::html(html_body))
            .map_err(|e| crate::error::AppError::BadRequest(e.to_string()))?;

        self.transport
            .send(&email)
            .map_err(|e| crate::error::AppError::BadRequest(format!("邮件发送失败: {}", e)))?;

        Ok(())
    }

    /// 发送测试邮件（复用 transport，与验证码发送共用同一套发送逻辑）
    pub async fn send_test_email(&self, to_email: &str) -> AppResult<()> {
        let subject = format!("【{}】系统通知测试", self.from_name);
        let html_body = format!(
            r#"<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e8e8e8; border-radius: 8px;">
  <div style="padding: 30px;">
    <h2 style="color: #28a745; margin: 0 0 24px 0; font-size: 24px; font-weight: 600;">{}</h2>
    <p style="color: #333; font-size: 16px; margin: 0 0 16px 0;">管理员您好！</p>
    <p style="color: #333; font-size: 16px; margin: 0 0 24px 0;">恭喜！您的邮箱通知配置已成功验证。</p>
    <div style="background-color: #f5f5f5; padding: 20px; border-radius: 6px; text-align: center; font-size: 16px; color: #666; margin-bottom: 24px;">
      此邮件由 <strong>{}</strong> 系统自动发送，无需回复。
    </div>
    <div style="border-top: 1px dashed #e8e8e8; margin-top: 24px; padding-top: 16px;">
      <p style="color: #999; font-size: 12px; margin: 0;">如果频繁收到测试邮件，请检查后台配置。</p>
    </div>
  </div>
</div>"#,
            self.from_name, self.from_name
        );

        let from_mailbox = Mailbox::new(
            if self.from_name.trim().is_empty() {
                None
            } else {
                Some(self.from_name.clone())
            },
            self.from_address.parse().map_err(|e| {
                crate::error::AppError::BadRequest(format!("Invalid From address: {}", e))
            })?,
        );

        let email = Message::builder()
            .from(from_mailbox)
            .to(to_email.parse().unwrap())
            .subject(subject)
            .singlepart(SinglePart::html(html_body))
            .map_err(|e| crate::error::AppError::BadRequest(e.to_string()))?;

        self.transport
            .send(&email)
            .map_err(|e| crate::error::AppError::BadRequest(format!("邮件发送失败: {}", e)))?;

        Ok(())
    }

    /// 余额不足提醒邮件（使用可配置模版，变量：{{site_name}} {{balance}} {{threshold}}）
    pub async fn send_low_balance_alert(
        &self,
        to_email: &str,
        balance: &str,
        threshold: &str,
        subject_tpl: &str,
        html_tpl: &str,
    ) -> AppResult<()> {
        let site_name = if self.from_name.trim().is_empty() {
            "TokensByte"
        } else {
            self.from_name.as_str()
        };
        let subject =
            crate::models::render_low_balance_template(subject_tpl, site_name, balance, threshold);
        let html_body =
            crate::models::render_low_balance_template(html_tpl, site_name, balance, threshold);

        let from_mailbox = Mailbox::new(
            if self.from_name.trim().is_empty() {
                None
            } else {
                Some(self.from_name.clone())
            },
            self.from_address.parse().map_err(|e| {
                crate::error::AppError::BadRequest(format!("Invalid From address: {}", e))
            })?,
        );

        let email = Message::builder()
            .from(from_mailbox)
            .to(to_email.parse().map_err(|e| {
                crate::error::AppError::BadRequest(format!("Invalid To address: {}", e))
            })?)
            .subject(subject)
            .singlepart(SinglePart::html(html_body))
            .map_err(|e| crate::error::AppError::BadRequest(e.to_string()))?;

        self.transport
            .send(&email)
            .map_err(|e| crate::error::AppError::BadRequest(format!("邮件发送失败: {}", e)))?;

        Ok(())
    }
}
