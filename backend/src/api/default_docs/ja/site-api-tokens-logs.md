# API トークンと使用ログ API

API キー（トークン）を管理し、これらのエンドポイントを介して詳細な使用メトリクスまたはログを取得します。

### 1. API トークン一覧の取得
* **エンドポイント**: `/api/v1/tokens`
* **メソッド**: `GET`
* **レスポンス例**:
```json
{
  "data": [
    {
      "id": 5,
      "name": "Production Key",
      "kid": "usr123987",
      "quota_limit": 1000.0,
      "used_quota": 5.23,
      "is_active": 1,
      "created_at": "2026-06-20T10:00:00Z"
    }
  ],
  "total": 1
}
```

### 2. API トークンの作成
* **エンドポイント**: `/api/v1/tokens`
* **メソッド**: `POST`
* **リクエストパラメータ**:
```json
{
  "name": "New Key",
  "quota_limit": 500.0,
  "allowed_models": ["gpt-4o", "claude-3-5-sonnet-20241022"],
  "allowed_ips": "192.168.1.1,10.0.0.1",
  "rps_limit": 10,
  "rpm_limit": 100
}
```
* **レスポンス例**:
```json
{
  "id": 6,
  "name": "New Key",
  "token_key": "sk-ProjX82...",
  "quota_limit": 500.0,
  "is_active": 1
}
```
*注：実際のシークレットキー（`token_key`）は作成時にのみ返されるか、`/reveal` エンドポイントを介して取得できます。*

### 3. トークンシークレットキーの表示
API トークンの完全なプレーンテキストキーの値を取得します。
* **エンドポイント**: `/api/v1/tokens/{id}/reveal`
* **メソッド**: `POST`
* **レスポンス例**:
```json
{
  "token_key": "sk-your_full_api_key_value_here"
}
```

### 4. API トークンの削除
* **エンドポイント**: `/api/v1/tokens/{id}`
* **メソッド**: `DELETE`

### 5. 使用ログの照会
モデルの実行記録、消費されたトークン、課金の詳細、および応答ステータスを取得します。
* **エンドポイント**: `/api/v1/logs`
* **メソッド**: `GET`
* **クエリパラメータ**:
  * `page`, `per_page` (ページネーション)
  * `model` (例: `gpt-4o`)
  * `status` (`success` または `fail`)
  * `start_date`, `end_date` (`YYYY-MM-DD`)
* **レスポンス例**:
```json
{
  "data": [
    {
      "log_id": "log_xyz123",
      "model": "gpt-4o",
      "prompt_tokens": 15,
      "completion_tokens": 20,
      "cost": 0.0007,
      "status_code": 200,
      "created_at": "2026-06-21T15:20:00Z"
    }
  ],
  "total": 1,
  "total_cost": 0.0007,
  "success_count": 1,
  "fail_count": 0
}
```

### 6. タスクログの照会
バックグラウンドの非同期タスク（ビデオ生成や画質超分など）を照会します。
* **エンドポイント**: `/api/v1/task_logs`
* **メソッド**: `GET`
* **レスポンス例**:
```json
{
  "data": [
    {
      "log_id": "task_abc789",
      "action_type": "视频",
      "status": "success",
      "duration": 5.0,
      "cost": 1.5,
      "created_at": "2026-06-21T16:00:00Z"
    }
  ],
  "total": 1
}
```
* `POST /api/v1/task_logs/{log_id}/sync` を使用してステータスを手動同期するか、`POST /api/v1/task_logs/{log_id}/cancel` を使用して保留中のタスクをキャンセルします。
