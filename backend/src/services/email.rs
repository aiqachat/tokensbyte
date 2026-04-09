use lettre::transport::smtp::authentication::Credentials;
use lettre::{Message, SmtpTransport, Transport};
use crate::models::SMTPSettings;
use crate::error::AppResult;

pub struct EmailService {
    transport: SmtpTransport,
    from_address: String,
    from_name: String,
}

impl EmailService {
    pub fn new(settings: &SMTPSettings) -> Self {
        let creds = Credentials::new(settings.username.clone(), settings.password.clone());

        let transport = SmtpTransport::relay(&settings.host)
            .unwrap()
            .port(settings.port)
            .credentials(creds)
            .build();

        Self {
            transport,
            from_address: settings.from_address.clone(),
            from_name: settings.from_name.clone(),
        }
    }

    pub async fn send_verification_code(&self, to_email: &str, code: &str, purpose: &str) -> AppResult<()> {
        let subject = match purpose {
            "register" => "Verification Code for Registration",
            "reset_password" => "Verification Code for Password Recovery",
            _ => "Verification Code",
        };

        let body = format!(
            "Hello,\n\nYour verification code is: {}\n\nThis code will expire in 10 minutes.\n\nIf you did not request this code, please ignore this email.",
            code
        );

        let email = Message::builder()
            .from(format!("{} <{}>", self.from_name, self.from_address).parse().unwrap())
            .to(to_email.parse().unwrap())
            .subject(subject)
            .body(body)
            .map_err(|e| crate::error::AppError::Internal(e.to_string()))?;

        self.transport.send(&email).map_err(|e| crate::error::AppError::Internal(e.to_string()))?;

        Ok(())
    }
}
