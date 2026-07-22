# Alibaba Cloud Model Studio (DashScope) ネイティブ API 説明

ゲートウェイは、Alibaba Cloud Model Studio (DashScope) の大規模言語モデル、および画像・動画モデルのネイティブ API ルーティングと完全に互換性があり、完全なステータス抽出と课金監査をサポートしています。

### 1. Wanx 動画生成 (Submit Video)
* **パス**: `/api/v1/services/aigc/video-generation/video-synthesis`
* **リクエストメソッド**: `POST`

#### 请求示例
```json
{
  "model": "wanx-v1",
  "input": {
    "prompt": "一只金毛寻回犬在金色的秋天落叶中奔跑"
  },
  "parameters": {
    "resolution": "1280*720",
    "duration": 5
  }
} 
```
ゲートウェイは `X-DashScope-Async: enable` リクエストヘッダーを自動的にインターセプトして注入し、非同期タスクの自動ホスト送信を実現します。

### 2. Wanx 画像生成 (Submit Image)
* **パス**: `/api/v1/services/aigc/multimodal-generation/generation`
* **リクエストメソッド**: `POST`

フォーマットは動画と同様で、seed、size などのプロバイダー固有の制御パラメータの直接パススルーをサポートしています。

### 3. 非同期タスクステータス確認
* **パス**: `/api/v1/tasks/{task_id}`
* **リクエストメソッド**: `GET`

Alibaba Wanx 動画・画像はすべて Model Studio 共通の非同期タスク ID を採用しています。ネイティブの `task_id` を使用してポーリングを行うことができ、ゲートウェイはステータスが `succeeded` または `failed` に変更された後、対応する使用量を抽出して課金控除を行います。

### 4. テキスト埋め込み (Embeddings) と Rerank
* **埋め込み API**: `/compatible-mode/v1/embeddings` (`POST`)
  通義千問 (Tongyi Qianwen) 公式埋め込みモデル（例: `text-embedding-v4`）をサポートし、総トークン数に基づいて課金されます。
* **ドキュメントリランク API (Rerank)**:
  * 互換パス（qwen3-rerank など用）: `/compatible-api/v1/reranks`
  * ネイティブパス（gte-rerank-v2 など用）: `/api/v1/services/rerank/text-rerank/text-rerank`
