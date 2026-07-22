# 残高・モデル照会インターフェース

クライアントが実行時にアカウントのステータスやトークンの残高情報を取得しやすくするため、ゲートウェイは以下の照会系APIを提供しています：

### 1. 現在のトークン割当額の照会 (Token Balance)
* **パス**: `/v1/balance`
* **リクエスト方式**: `GET`
* **認証**: リクエストヘッダーに対応するトークンを指定する必要があります `Authorization: Bearer sk-xxx`

#### レスポンスフィールド
```json
{
  "remain_balance": 985.42,
  "used_balance": 14.58,
  "unlimited_quota": false
}
```
*注：トークンが無制限割当（アンリミテッド）に設定されている場合、`remain_balance` は `-1` を返し、`unlimited_quota` は `true` を返します。*

### 2. 所属ユーザーの総アカウント残高の照会 (User Balance)
* **パス**: `/v1/user/balance`
* **リクエスト方式**: `GET`

現在のトークンが属するユーザーアカウントのグローバルな総割当額を取得します（単一トークンのサブ割当制限ではありません）。

### 3. 利用可能なモデル一覧の取得 (Models List)
* **パス**: `/v1/models`
* **リクエスト方式**: `GET`

現在のシステムでお客様のアカウントやレベルに対して開放されている、すべてのアクティブなモデルリストを列挙します。クライアントのドロップダウンメニューのレンダリングに便利です。

#### レスポンス例
```json
{
  "object": "list",
  "data": [
    {
      "id": "gpt-4o",
      "object": "model",
      "created": 1719441600,
      "owned_by": "OpenAI"
    },
    {
      "id": "claude-3-5-sonnet-20241022",
      "object": "model",
      "created": 1719441600,
      "owned_by": "Anthropic"
    }
  ]
}
```
