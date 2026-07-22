# 公開エンドポイント一覧

システムは、業界の主要な大規模モデルおよびメディア処理インターフェースに対して、ゲートウェイのカプセル化を全面的に行い、プロバイダーごとのプロトコルに応じた転送ルーティングを構築しています。統一APIキーを使用して、ゲートウェイ経由で以下のすべてのエンドポイントに直接アクセスできます：

### 1. OpenAI プロトコルルーティング
| エンドポイント名 | パス (Path) | リクエスト方式 | プロトコルタイプ |
| :--- | :--- | :--- | :--- |
| OpenAI チャット対話 | `/v1/chat/completions` | `POST` | OpenAI 互換 |
| OpenAI 公式ネイティブ透過送信 | `/v1/responses` | `POST` | OpenAI 互換 |
| 画像生成 (Text2Image) | `/v1/images/generations` | `POST` | OpenAI 互換 |
| 画像編集 (Image Edit) | `/v1/images/edits` | `POST` | OpenAI 互換 |
| 非同期ビデオタスク送信 | `/v1/video/generations` | `POST` | OpenAI 互換 |
| 非同期ビデオタスクステータス確認 | `/v1/video/generations/{task_id}` | `GET` | OpenAI 互換 |
| テキスト音声合成 (Text-to-Speech) | `/v1/audio/speech` | `POST` | OpenAI 互換 |
| トークン利用可能残高照会 | `/v1/balance` | `GET` | アカウント情報 |
| アカウント総残高照会 | `/v1/user/balance` | `GET` | アカウント情報 |
| 利用可能モデル一覧 | `/v1/models` | `GET` | アカウント情報 |

### 2. 火山方舟 (Volcengine) ルーティング
| エンドポイント名 | パス (Path) | リクエスト方式 | プロトコルタイプ |
| :--- | :--- | :--- | :--- |
| チャット対話 (OpenAI 互換) | `/api/v3/chat/completions` | `POST` | 火山方舟 |
| ネイティブレスポンス (Responses) | `/api/v3/responses` | `POST` | 火山方舟 |
| 画像生成 (Generations) | `/api/v3/images/generations` | `POST` | 火山方舟 |
| 非同期ビデオタスク送信 | `/api/v3/contents/generations/tasks` | `POST` | 火山方舟 |
| 非同期ビデオタスク照会 | `/api/v3/contents/generations/tasks/{task_id}` | `GET` | 火山方舟 |
| 非同期ビデオタスクキャンセル | `/api/v3/contents/generations/tasks/{task_id}` | `DELETE` | 火山方舟 |
| 音声合成 (SSE テキストストリーム) | `/api/v3/tts/unidirectional/sse` | `POST` | 火山方舟 |
| 音声合成 (Chunked バイナリ) | `/api/v3/tts/unidirectional` | `POST` | 火山方舟 |
| ビデオ画質向上 (標準/プロ) | `/api/v1/tools/enhance-video` | `POST` | 火山 MediaKit |
| ビデオ画質向上 (高速版) | `/api/v1/tools/enhance-video-fast` | `POST` | 火山 MediaKit |
| ビデオ画質向上 (大規模モデル版) | `/api/v1/tools/enhance-video-generative` | `POST` | 火山 MediaKit |
| ビデオ字幕消去 | `/api/v1/tools/erase-video-subtitle` | `POST` | 火山 MediaKit |
| メディアタスクステータス照会 | `/api/v1/tasks/{task_id}` | `GET` | 火山 MediaKit |

### 3. その他プロバイダーのネイティブルーティング
| プロバイダー名 | エンドポイント名 | パス (Path) | リクエスト方式 |
| :--- | :--- | :--- | :--- |
| 阿里百煉 | 万相ビデオ生成 (送信) | `/api/v1/services/aigc/video-generation/video-synthesis` | `POST` |
| 阿里百炼 | 万相画像生成タスク (送信) | `/api/v1/services/aigc/multimodal-generation/generation` | `POST` |
| 阿里百炼 | 非同期タスク照会 (汎用) | `/api/v1/tasks/{task_id}` | `GET` |
| 阿里百炼 | テキストベクトル化 | `/compatible-mode/v1/embeddings` | `POST` |
| 阿里百炼 | ドキュメントリランク (Rerank) | `/compatible-api/v1/reranks` | `POST` |
| 可灵 AI | テキスト動画生成 (Kling) | `/v1/videos/text2video` | `POST` |
| 可灵 AI | 画像動画生成 (Kling) | `/v1/videos/image2video` | `POST` |
| 可灵 AI | タスクステータス照会 (動画/画像) | `/v1/videos/{endpoint}/{task_id}` | `GET` |
| Google | Gemini テキスト生成 | `/v1beta/models/{model}:generateContent` | `POST` |
| Google | Gemini ストリーミングテキスト生成 | `/v1beta/models/{model}:streamGenerateContent` | `POST` |
| Anthropic | Claude ネイティブメッセージ | `/v1/messages` | `POST` |
