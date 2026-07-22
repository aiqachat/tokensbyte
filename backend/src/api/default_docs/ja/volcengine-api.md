# Volcengine Ark (火山方舟) ネイティブ API 説明

既存のビジネスシステムがすでに Volcengine Ark (火山方舟) プラットフォームに接続されている場合、コードを OpenAI 形式に再構成する必要はありません。ゲートウェイは同様に、Volcengine のネイティブパスと完全に一致する転送ルートを用意しています。リクエストヘッダーの API キーを、本プラットフォームが割り当てた統一 API キーに置き換えるだけでご使用いただけます。

### 1. ネイティブチャットと対話 (Chat & Responses)
* **対話エンドポイント**: `/api/v3/chat/completions`
* **ネイティブレスポンスエンドポイント**: `/api/v3/responses`
* **リクエストメソッド**: `POST`

Volcengine Ark ネイティブの Request Payload の完全なパススルーをサポートしています。パラメータの仕様については、[Volcengine Ark 公式ドキュメント](https://www.volcengine.com/docs/82379/1298454)をご参照ください。

### 2. ネイティブ画像生成 API (Image Generations)
* **エンドポイント**: `/api/v3/images/generations`
* **リクエストメソッド**: `POST`

Ark のテキストからの画像生成 API と完全に一致しており、画像の縦横比の指定、プロンプトのスマート書き換え、ウォーターマークなどのネイティブパラメータをサポートしています。

### 3. ネイティブ動画生成タスク (Video Studio)
* **タスクの送信**: `/api/v3/contents/generations/tasks` (`POST`)
* **タスクステータス確認**: `/api/v3/contents/generations/tasks/{task_id}` (`GET`)
* **タスクのキャンセル/削除**: `/api/v3/contents/generations/tasks/{task_id}` (`DELETE`)
* **タスク履歴の一覧表示**: `/api/v3/contents/generations/tasks` (`GET`)

### 4. 音声合成 API (TTS)
* **イベントストリームモード (SSE)**: `/api/v3/tts/unidirectional/sse` (`POST`)
* **非ストリーミング HTTP モード**: `/api/v3/tts/unidirectional` (`POST`)

リクエストヘッダーは Volcengine ネイティブの `X-Api-Key: sk-your_token` 形式を使用する必要があり、モデルは `X-Api-Resource-Id` ヘッダーで指定するか、または `model` リクエストボディに記述できます。ゲートウェイは Volcengine 標準 of JSON データ（Base64 エンコードされたオーディオフレームを含む）を返却します。
