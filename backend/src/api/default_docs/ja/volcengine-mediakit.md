# Volcengine MediaKit メディア処理拡張 API

本プラットフォームは Volcengine AI MediaKit 処理サービスを高度に統合しており、動画画質向上、動画インテリジェントフレーム補間、ディテール修復、およびインテリジェント字幕消去などの高度なメディア編集アルゴリズムを提供します。動画の拡張処理は非常に時間がかかるため、タスクは一律で非同期計算メカニズムを採用しています。

### 公式ドキュメント
パラメータ詳細と機能説明は Volcengine 公式ドキュメントをご参照ください：
* [AI MediaKit 公式ドキュメント](https://docs.volcengine.com/docs/6448/2279230)

### 1. 公開されているメディアエンドポイント一覧
* **動画画質向上 (標準/プロフェッショナル版)**: `/api/v1/tools/enhance-video` (`POST`)
* **動画画質向上 (高速版)**: `/api/v1/tools/enhance-video-fast` (`POST`)
* **動画画質向上 (大規模モデル版)**: `/api/v1/tools/enhance-video-generative` (`POST`)
* **動画字幕消去**: `/api/v1/tools/erase-video-subtitle` (`POST`)
* **タスクステータス確認 (共通)**: `/api/v1/tasks/{task_id}` (`GET`)

### 2. 動画画质向上タスク送信の例
* **パス**: `/api/v1/tools/enhance-video`
* **リクエストメソッド**: `POST`

#### リクエスト Payload 形式
```json
{
  "model": "vve-sd",
  "video_url": "https://example.com/assets/input_video.mp4",
  "mode": "standard",
  "scene": "aigc",
  "resolution": "1080p",
  "fps": 60
}
```
* `model`: メディア処理拡張のプリセットモデル名。例: `vve-sd` (標準版画質向上), `vve-pf` (プロフェッショナル版), `vve-ft` (高速版), `vve-gt` (大規模モデル拡張), `vvs-er` (字幕消去), `vvs-ep` (精細字幕消去)
* `video_url`: 処理対象の元動画のネットワークアドレス (一般公開されている直リンクである必要があります)
* `resolution`: 目標超解像解像度。選択肢: `720p`, `1080p`, `2k`, `4k`
* `fps`: 目標フレームレート（60fps へのフレーム補間をサポート）

#### 送信時のレスポンス
```json
{
  "task_id": "vve_task_1729495831000",
  "status": "pending"
}
```

### 3. 動画タスク結果のポーリング確認
* **パス**: `/api/v1/tasks/vve_task_1729495831000`
* **リクエストメソッド**: `GET`

#### レスポンス例
```json
{
  "task_id": "vve_task_1729495831000",
  "status": "success",
  "result": {
    "video_url": "https://example.com/output/enhanced_video.mp4",
    "duration": 15.5,
    "resolution": "1920x1080",
    "fps": 60
  }
}
```

### 4. メディア課金・控除メカニズム
Volcengine MediaKit メディアタスクの課金は「動画」カテゴリに属し、「時間ベース課金（元/秒）」モデルを採用しています。控除ルールはシステムで設定された「Volcengine MediaKit 公式動画超解像課金」ルールによって決定され、**目標解像度**と**目標フレームレート**に基づいて段階的な価格設定が行われます。非同期タスクの実行が成功（`status = "success"`）した場合に限り、ゲートウェイは実際に処理された動画の時間（`duration`）に基づいてクォータの正確な決済と控除を完了します。
