use std::sync::LazyLock;

static CLAUDE_EN: LazyLock<String> = LazyLock::new(|| {
    format!(
        "{}\n\n{}",
        include_str!("default_docs/en/claude-chat.md"),
        include_str!("default_docs/en/common-errors.md")
    )
});
static GPT_IMG_EN: LazyLock<String> = LazyLock::new(|| {
    format!(
        "{}\n\n{}",
        include_str!("default_docs/en/gpt-image.md"),
        include_str!("default_docs/en/common-errors.md")
    )
});
static GOOGLE_IMG_EN: LazyLock<String> = LazyLock::new(|| {
    format!(
        "{}\n\n{}",
        include_str!("default_docs/en/google-image.md"),
        include_str!("default_docs/en/common-errors.md")
    )
});
static VOLC_IMG_EN: LazyLock<String> = LazyLock::new(|| {
    format!(
        "{}\n\n{}",
        include_str!("default_docs/en/volc-image.md"),
        include_str!("default_docs/en/common-errors.md")
    )
});
static KLING_IMG_EN: LazyLock<String> = LazyLock::new(|| {
    format!(
        "{}\n\n{}",
        include_str!("default_docs/en/kling-image.md"),
        include_str!("default_docs/en/common-errors.md")
    )
});
static VOLC_VID_EN: LazyLock<String> = LazyLock::new(|| {
    format!(
        "{}\n\n{}",
        include_str!("default_docs/en/volc-video.md"),
        include_str!("default_docs/en/common-errors.md")
    )
});
static KLING_VID_EN: LazyLock<String> = LazyLock::new(|| {
    format!(
        "{}\n\n{}",
        include_str!("default_docs/en/kling-video.md"),
        include_str!("default_docs/en/common-errors.md")
    )
});

pub struct ArticleTranslation {
    pub lang: &'static str,
    pub title: &'static str,
    pub content: &'static str,
}

pub fn get_category_translations(slug: &str) -> Vec<(&'static str, &'static str)> {
    match slug {
        "quickstart" => vec![
            ("en", "1. Quick Start"),
            ("ja", "1. クイックスタート"),
            ("ko", "1. 빠른 시작"),
            ("vi", "1. Bắt đầu nhanh"),
        ],
        "examples" => vec![
            ("en", "2. Common Call Examples"),
            ("ja", "2. 常用呼び出し例"),
            ("ko", "2. 공통 호출 예시"),
            ("vi", "2. Ví dụ gọi phổ biến"),
        ],
        "openai" => vec![
            ("en", "3. OpenAI Compatible Protocol"),
            ("ja", "3. OpenAI 互換プロトコル"),
            ("ko", "3. OpenAI 호환 프로토콜"),
            ("vi", "3. Giao thức tương thích OpenAI"),
        ],
        "volcengine-ark" => vec![
            ("en", "4. Volcengine Ark Protocol"),
            ("ja", "4. Volcengine Ark プロトコル"),
            ("ko", "4. Volcengine Ark 프로토콜"),
            ("vi", "4. Giao thức Volcengine Ark"),
        ],
        "ali-kling" => vec![
            ("en", "5. Ali DashScope & Kling Protocol"),
            ("ja", "5. Ali DashScope & Kling プロトコル"),
            ("ko", "4. 알리 DashScope & Kling 프로토콜"),
            ("vi", "5. Giao thức Ali DashScope & Kling"),
        ],
        "google-anthropic" => vec![
            ("en", "6. Google & Anthropic Protocol"),
            ("ja", "6. Google & Anthropic プロトコル"),
            ("ko", "6. Google & Anthropic 프로토콜"),
            ("vi", "6. Giao thức Google & Anthropic"),
        ],
        "errors" => vec![
            ("en", "7. Troubleshooting"),
            ("ja", "7. トラブルシューティング"),
            ("ko", "7. 문제 해결"),
            ("vi", "7. Khắc phục sự cố"),
        ],
        "site-api" => vec![
            ("en", "8. Site Functions API"),
            ("ja", "8. サイト機能 API"),
            ("ko", "8. 사이트 기능 API"),
            ("vi", "8. API chức năng trang web"),
        ],
        _ => vec![],
    }
}

pub fn get_article_translations(slug: &str) -> Vec<ArticleTranslation> {
    match slug {
        "auth-guide" => vec![
            ArticleTranslation {
                lang: "en",
                title: "Quick Start & Authentication",
                content: include_str!("default_docs/en/auth-guide.md"),
            },
            ArticleTranslation {
                lang: "ja",
                title: "クイックスタートと認証仕様",
                content: include_str!("default_docs/ja/auth-guide.md"),
            },
            ArticleTranslation {
                lang: "ko",
                title: "빠른 시작 및 인증 설명",
                content: include_str!("default_docs/ko/auth-guide.md"),
            },
            ArticleTranslation {
                lang: "vi",
                title: "Bắt đầu nhanh và Hướng dẫn xác thực",
                content: include_str!("default_docs/vi/auth-guide.md"),
            },
        ],
        "endpoints" => vec![
            ArticleTranslation {
                lang: "en",
                title: "API Endpoints Overview",
                content: include_str!("default_docs/en/endpoints.md"),
            },
            ArticleTranslation {
                lang: "ja",
                title: "公開エンドポイント一覧",
                content: include_str!("default_docs/ja/endpoints.md"),
            },
            ArticleTranslation {
                lang: "ko",
                title: "공개 엔드포인트 목록",
                content: include_str!("default_docs/ko/endpoints.md"),
            },
            ArticleTranslation {
                lang: "vi",
                title: "Danh sách các điểm cuối mở",
                content: include_str!("default_docs/vi/endpoints.md"),
            },
        ],
        "chat-completions" => vec![
            ArticleTranslation {
                lang: "en",
                title: "Chat & Responses (Completions & Responses)",
                content: include_str!("default_docs/en/chat-completions.md"),
            },
            ArticleTranslation {
                lang: "ja",
                title: "チャットと応答 (Completions & Responses)",
                content: include_str!("default_docs/ja/chat-completions.md"),
            },
            ArticleTranslation {
                lang: "ko",
                title: "채팅 및 응답 (Completions & Responses)",
                content: include_str!("default_docs/ko/chat-completions.md"),
            },
            ArticleTranslation {
                lang: "vi",
                title: "Trò chuyện và Phản hồi (Completions & Responses)",
                content: include_str!("default_docs/vi/chat-completions.md"),
            },
        ],
        "images" => vec![
            ArticleTranslation {
                lang: "en",
                title: "Image Generation & Editing (Images)",
                content: include_str!("default_docs/en/images.md"),
            },
            ArticleTranslation {
                lang: "ja",
                title: "画像生成と編集 (Images)",
                content: include_str!("default_docs/ja/images.md"),
            },
            ArticleTranslation {
                lang: "ko",
                title: "이미지 생성 및 편집 (Images)",
                content: include_str!("default_docs/ko/images.md"),
            },
            ArticleTranslation {
                lang: "vi",
                title: "Tạo và chỉnh sửa hình ảnh (Images)",
                content: include_str!("default_docs/vi/images.md"),
            },
        ],
        "video" => vec![
            ArticleTranslation {
                lang: "en",
                title: "Video Generation (Video)",
                content: include_str!("default_docs/en/video.md"),
            },
            ArticleTranslation {
                lang: "ja",
                title: "ビデオ生成 (Video)",
                content: include_str!("default_docs/ja/video.md"),
            },
            ArticleTranslation {
                lang: "ko",
                title: "비디오 생성 인터페이스 (Video)",
                content: include_str!("default_docs/ko/video.md"),
            },
            ArticleTranslation {
                lang: "vi",
                title: "Giao diện tạo video (Video)",
                content: include_str!("default_docs/vi/video.md"),
            },
        ],
        "text-to-speech" => vec![
            ArticleTranslation {
                lang: "en",
                title: "Text-to-Speech (TTS)",
                content: include_str!("default_docs/en/text-to-speech.md"),
            },
            ArticleTranslation {
                lang: "ja",
                title: "音声合成 (Text-to-Speech)",
                content: include_str!("default_docs/ja/text-to-speech.md"),
            },
            ArticleTranslation {
                lang: "ko",
                title: "음성 합성 (Text-to-Speech)",
                content: include_str!("default_docs/ko/text-to-speech.md"),
            },
            ArticleTranslation {
                lang: "vi",
                title: "Tổng hợp giọng nói (Text-to-Speech)",
                content: include_str!("default_docs/vi/text-to-speech.md"),
            },
        ],
        "balance-models" => vec![
            ArticleTranslation {
                lang: "en",
                title: "Quota & Available Models (Info)",
                content: include_str!("default_docs/en/balance-models.md"),
            },
            ArticleTranslation {
                lang: "ja",
                title: "残高と利用可能なモデルの照会 (Info)",
                content: include_str!("default_docs/ja/balance-models.md"),
            },
            ArticleTranslation {
                lang: "ko",
                title: "잔액 및 사용 가능한 모델 조회 (Info)",
                content: include_str!("default_docs/ko/balance-models.md"),
            },
            ArticleTranslation {
                lang: "vi",
                title: "Tra cứu số dư và mô hình khả dụng (Info)",
                content: include_str!("default_docs/vi/balance-models.md"),
            },
        ],
        "volcengine-api" => vec![
            ArticleTranslation {
                lang: "en",
                title: "Volcengine Ark Native API",
                content: include_str!("default_docs/en/volcengine-api.md"),
            },
            ArticleTranslation {
                lang: "ja",
                title: "Volcengine Ark ネイティブ API 接続",
                content: include_str!("default_docs/ja/volcengine-api.md"),
            },
            ArticleTranslation {
                lang: "ko",
                title: "Volcengine Ark 기본 API 접속",
                content: include_str!("default_docs/ko/volcengine-api.md"),
            },
            ArticleTranslation {
                lang: "vi",
                title: "Kết nối API gốc Volcengine Ark",
                content: include_str!("default_docs/vi/volcengine-api.md"),
            },
        ],
        "volcengine-mediakit" => vec![
            ArticleTranslation {
                lang: "en",
                title: "Volcengine MediaKit Enhancement",
                content: include_str!("default_docs/en/volcengine-mediakit.md"),
            },
            ArticleTranslation {
                lang: "ja",
                title: "Volcengine MediaKit メディア処理機能の强化",
                content: include_str!("default_docs/ja/volcengine-mediakit.md"),
            },
            ArticleTranslation {
                lang: "ko",
                title: "Volcengine MediaKit 미디어 처리 향상",
                content: include_str!("default_docs/ko/volcengine-mediakit.md"),
            },
            ArticleTranslation {
                lang: "vi",
                title: "Tăng cường xử lý phương tiện Volcengine MediaKit",
                content: include_str!("default_docs/vi/volcengine-mediakit.md"),
            },
        ],
        "ali-dashscope" => vec![
            ArticleTranslation {
                lang: "en",
                title: "Ali DashScope Native API",
                content: include_str!("default_docs/en/ali-dashscope.md"),
            },
            ArticleTranslation {
                lang: "ja",
                title: "アリ百煉 (DashScope) ネイティブ接続",
                content: include_str!("default_docs/ja/ali-dashscope.md"),
            },
            ArticleTranslation {
                lang: "ko",
                title: "알리 백련 (DashScope) 기본 접속",
                content: include_str!("default_docs/ko/ali-dashscope.md"),
            },
            ArticleTranslation {
                lang: "vi",
                title: "Kết nối gốc Ali DashScope",
                content: include_str!("default_docs/vi/ali-dashscope.md"),
            },
        ],
        "kling-ai" => vec![
            ArticleTranslation {
                lang: "en",
                title: "Kling AI Native Protocol",
                content: include_str!("default_docs/en/kling-ai.md"),
            },
            ArticleTranslation {
                lang: "ja",
                title: "可霊 AI (Kling) ネイティブプロトコル仕様",
                content: include_str!("default_docs/ja/kling-ai.md"),
            },
            ArticleTranslation {
                lang: "ko",
                title: "클링 AI (Kling) 기본 프로토콜 설명",
                content: include_str!("default_docs/ko/kling-ai.md"),
            },
            ArticleTranslation {
                lang: "vi",
                title: "Giao thức gốc Kling AI",
                content: include_str!("default_docs/vi/kling-ai.md"),
            },
        ],
        "google-gemini" => vec![
            ArticleTranslation {
                lang: "en",
                title: "Google Gemini Native API",
                content: include_str!("default_docs/en/google-gemini.md"),
            },
            ArticleTranslation {
                lang: "ja",
                title: "Google Gemini ネイティブ接続",
                content: include_str!("default_docs/ja/google-gemini.md"),
            },
            ArticleTranslation {
                lang: "ko",
                title: "Google Gemini 기본 접속",
                content: include_str!("default_docs/ko/google-gemini.md"),
            },
            ArticleTranslation {
                lang: "vi",
                title: "Kết nối gốc Google Gemini",
                content: include_str!("default_docs/vi/google-gemini.md"),
            },
        ],
        "anthropic-claude" => vec![
            ArticleTranslation {
                lang: "en",
                title: "Anthropic Claude Native API",
                content: include_str!("default_docs/en/anthropic-claude.md"),
            },
            ArticleTranslation {
                lang: "ja",
                title: "Anthropic Claude ネイティブ接続",
                content: include_str!("default_docs/ja/anthropic-claude.md"),
            },
            ArticleTranslation {
                lang: "ko",
                title: "Anthropic Claude 기본 접속",
                content: include_str!("default_docs/ko/anthropic-claude.md"),
            },
            ArticleTranslation {
                lang: "vi",
                title: "Kết nối gốc Anthropic Claude",
                content: include_str!("default_docs/vi/anthropic-claude.md"),
            },
        ],
        "error-codes" => vec![
            ArticleTranslation {
                lang: "en",
                title: "Gateway Error Codes & Troubleshooting",
                content: include_str!("default_docs/en/error-codes.md"),
            },
            ArticleTranslation {
                lang: "ja",
                title: "ゲートウェイの一般的なエラーコードとトラブルシューティング",
                content: include_str!("default_docs/ja/error-codes.md"),
            },
            ArticleTranslation {
                lang: "ko",
                title: "게이트웨이 공통 오류 코드 및 문제 해결",
                content: include_str!("default_docs/ko/error-codes.md"),
            },
            ArticleTranslation {
                lang: "vi",
                title: "Mã lỗi cổng thông tin phổ biến và khắc phục sự cố",
                content: include_str!("default_docs/vi/error-codes.md"),
            },
        ],
        "site-api-overview" => vec![
            ArticleTranslation {
                lang: "en",
                title: "Site API Overview & Authentication",
                content: include_str!("default_docs/en/site-api-overview.md"),
            },
            ArticleTranslation {
                lang: "ja",
                title: "サイト API 概要と認証",
                content: include_str!("default_docs/ja/site-api-overview.md"),
            },
            ArticleTranslation {
                lang: "ko",
                title: "사이트 API 개요 및 인증",
                content: include_str!("default_docs/ko/site-api-overview.md"),
            },
            ArticleTranslation {
                lang: "vi",
                title: "Tổng quan về API Trang web & Xác thực",
                content: include_str!("default_docs/vi/site-api-overview.md"),
            },
        ],
        "site-api-user" => vec![
            ArticleTranslation {
                lang: "en",
                title: "User Profile & Wallet APIs",
                content: include_str!("default_docs/en/site-api-user.md"),
            },
            ArticleTranslation {
                lang: "ja",
                title: "ユーザープロフィールとウォレット API",
                content: include_str!("default_docs/ja/site-api-user.md"),
            },
            ArticleTranslation {
                lang: "ko",
                title: "사용자 프로필 및 지갑 API",
                content: include_str!("default_docs/ko/site-api-user.md"),
            },
            ArticleTranslation {
                lang: "vi",
                title: "Hồ sơ Người dùng & API Ví",
                content: include_str!("default_docs/vi/site-api-user.md"),
            },
        ],
        "site-api-tokens-logs" => vec![
            ArticleTranslation {
                lang: "en",
                title: "API Tokens & Usage Logs APIs",
                content: include_str!("default_docs/en/site-api-tokens-logs.md"),
            },
            ArticleTranslation {
                lang: "ja",
                title: "API トークンと使用ログ API",
                content: include_str!("default_docs/ja/site-api-tokens-logs.md"),
            },
            ArticleTranslation {
                lang: "ko",
                title: "API 토큰 및 사용 로그 API",
                content: include_str!("default_docs/ko/site-api-tokens-logs.md"),
            },
            ArticleTranslation {
                lang: "vi",
                title: "API Quản lý Token & Nhật ký Sử dụng",
                content: include_str!("default_docs/vi/site-api-tokens-logs.md"),
            },
        ],
        "volcengine-assets-guide" => vec![
            ArticleTranslation {
                lang: "en",
                title: "Volcengine Material Library API Integration Guide",
                content: include_str!("default_docs/en/volcengine-assets.md"),
            },
            ArticleTranslation {
                lang: "ja",
                title: "Volcengine Ark 素材ライブラリ API 連携ガイド",
                content: include_str!("default_docs/ja/volcengine-assets.md"),
            },
            ArticleTranslation {
                lang: "ko",
                title: "Volcengine Ark Material Library API Integration Guide",
                content: include_str!("default_docs/ko/volcengine-assets.md"),
            },
            ArticleTranslation {
                lang: "vi",
                title: "Volcengine Ark Material Library API Integration Guide",
                content: include_str!("default_docs/vi/volcengine-assets.md"),
            },
        ],
        "claude-chat" => vec![ArticleTranslation {
            lang: "en",
            title: "Chat Completions Example (Claude/GPT/DeepSeek)",
            content: &*CLAUDE_EN,
        }],
        "gpt-image" => vec![ArticleTranslation {
            lang: "en",
            title: "GPT gpt-image-2 Generation",
            content: &*GPT_IMG_EN,
        }],
        "google-image" => vec![ArticleTranslation {
            lang: "en",
            title: "Google gemini-3.1 Generation",
            content: &*GOOGLE_IMG_EN,
        }],
        "volc-image" => vec![ArticleTranslation {
            lang: "en",
            title: "Volcengine doubao-seedream Generation",
            content: &*VOLC_IMG_EN,
        }],
        "kling-image" => vec![ArticleTranslation {
            lang: "en",
            title: "Kling-v3 Image Generation",
            content: &*KLING_IMG_EN,
        }],
        "volc-video" => vec![ArticleTranslation {
            lang: "en",
            title: "Volcengine Seedance Video Generation",
            content: &*VOLC_VID_EN,
        }],
        "kling-video" => vec![ArticleTranslation {
            lang: "en",
            title: "Kling-v3 Video Generation",
            content: &*KLING_VID_EN,
        }],
        _ => vec![],
    }
}
