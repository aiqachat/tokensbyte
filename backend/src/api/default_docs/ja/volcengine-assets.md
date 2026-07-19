# Volcengine Ark 素材ライブラリ API 連携ガイド

このゲートウェイは、Volcengine Ark の素材ライブラリおよびアセット管理機能と深く互換性があります。開発者は、ゲートウェイの `/api` プロキシエンドポイントを介して、Volcengine のネイティブ素材およびアセットグループ管理 API を直接呼び出し、アセットのアップロード、照会、更新、削除を行うことができます。

### 公式ドキュメント
パラメータ仕様と最新機能については、Volcengine Ark 公式ドキュメントを参照してください：
* [素材ライブラリ公式ドキュメント](https://console.volcengine.com/ark/region:cn-beijing/docs/82379/2333565?lang=zh)

---

## 1. 基本リクエスト情報 (Basic Request Information)

効率性とセキュリティを確保するため、すべてのアセット API は `POST` リクエストを介して送信され、JSON 形式を使用してゲートウェイと通信します。

* **Base URL**: `https://{{domain}}/api`
* **HTTP Method**: `POST`
* **必須 HTTP ヘッダー**:
  * `Content-Type: application/json`
  * `Authorization: Bearer sk-your_api_key_value_here` *(ダッシュボードで生成された API キー)*

---

## 2. 共通クエリパラメータ (Common Query Parameters)

アセット API を呼び出すときは、URL のクエリパラメータで `Action` と `Version` を指定します：

| パラメータ | 必須 | 型 | 説明 |
| :--- | :--- | :--- | :--- |
| `Action` | はい | `string` | 実行するアクション（例：`CreateAsset`）。以下のコア API リストを参照してください。 |
| `Version` | いいえ | `string` | API バージョン。デフォルトは `2024-01-01`。 |
| `ns` | いいえ | `string` | プラグインの名前空間。オプション：`asset_manager`（国内版、デフォルト）または `asset_manager_intl`（国際版）。 |

*リクエスト URL の例*:
`POST https://{{domain}}/api?Action=CreateAsset&Version=2024-01-01&ns=asset_manager`

---

## 3. コア API エンドポイント (Core API Endpoints)

### ① アセットの登録/作成 (CreateAsset)
オブジェクトストレージ (TOS など) に保存されているメディアファイルの URL を Volcengine Ark アセットとして登録します。
* **URL Action**: `CreateAsset`
* **JSON リクエストボディ**:
```json
{
  "AssetType": "video", // アセットタイプ: "image" または "video"
  "URL": "https://your-tos-bucket.tos-cn-beijing.volces.com/path/video.mp4", // 公開アクセス可能なファイルの URL
  "Name": "test_video_asset", // アセット名（最大 100 文字）
  "Description": "This is a background video asset" // オプション、アセットの説明
}
```
* **JSON レスポンス**:
```json
{
  "ResponseMetadata": {
    "RequestId": "20260714101500...",
    "Action": "CreateAsset",
    "Version": "2024-01-01",
    "Service": "ark",
    "Region": "cn-beijing"
  },
  "Result": {
    "Id": "asset-20260714...", // Volcengine によって生成された一意のアセット ID
    "Status": "active" // ステータス: active, processing, failed
  }
}
```
* **ゲートウェイの強化とセキュリティ**:
  1. **プロジェクトの上書き**: ゲートウェイは、アセット管理の統合を確保するため、`ProjectName` をシステム構成のプロジェクト名に自動的に上書きします。
  2. **ローカル所有権のバインド**: 作成に成功すると、ゲートウェイはローカルデータベースでアセットをアカウントに自動的にバインドします。ダッシュボードの「マイアセット」ページで確認および管理できます。

---

### ② アセット情報の取得 (GetAsset)
単一のアセットの詳細なステータスとメタデータを取得します。
* **URL Action**: `GetAsset`
* **JSON リクエストボディ**:
```json
{
  "Id": "asset-20260714..." // アセット ID
}
```
* **注意**: ゲートウェイは厳格なデータ分離を強制します。管理者以外のユーザーは自分が作成したアセットのみをクエリできます。それ以外の場合は `403 Forbidden` エラーが返されます。

---

### ③ アセットの削除 (DeleteAsset)
Volcengine Ark からアセットを削除し、ローカルデータベースの所有権レコードを削除します。
* **URL Action**: `DeleteAsset`
* **JSON リクエストボディ**:
```json
{
  "Id": "asset-20260714..." // 削除するアセットの ID
}
```
* **JSON レスポンス**:
```json
{
  "ResponseMetadata": {
    "RequestId": "20260714102000...",
    "Action": "DeleteAsset",
    "Version": "2024-01-01",
    "Service": "ark",
    "Region": "cn-beijing"
  },
  "Result": {}
}
```
* **注意**: 管理者以外のユーザーは、自分が所有するアセットのみを削除できます。ゲートウェイは所有権を確認し、Volcengine Ark API を呼び出してクラウド上のアセットを削除し、ローカルレコードをクリアします。

---

### ④ アセットグループの作成 (CreateAssetGroup)
Volcengine の動画生成モデル (Seedance など) は、マルチ画像参照および主体参照をサポートしています。同じタイプのアセットをグループ化して管理できます。
* **URL Action**: `CreateAssetGroup`
* **JSON リクエストボディ**:
```json
{
  "Name": "My Reference Group", // グループ名
  "Description": "Reference portraits for video generation" // オプションの説明
}
```
* **JSON レスポンス**:
```json
{
  "ResponseMetadata": {
    "RequestId": "20260714103000...",
    "Action": "CreateAssetGroup",
    "Version": "2024-01-01",
    "Service": "ark",
    "Region": "cn-beijing"
  },
  "Result": {
    "Id": "group-20260714..." // Volcengine によって生成された一意のアセットグループ ID
  }
}
```
* **注意**: 作成されたアセットグループも隔離され、作成者のアカウントにバインドされます。

---

### ⑤ その他のサポートされているアクション
ゲートウェイは、以下の Volcengine Ark アセットアクションを透過的にプロキシし、サポートします：
* `UpdateAsset` (アセットの名前/説明の更新)
* `ListAssets` (アセットの一覧表示)
* `GetAssetGroup` / `UpdateAssetGroup` / `DeleteAssetGroup` / `ListAssetGroups` (アセットグループの CRUD およびリスト表示)
