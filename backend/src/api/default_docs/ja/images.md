# 画像生成・編集インターフェース

ゲートウェイの画像生成インターフェースは、OpenAI標準の画像生成仕様と完全に互換性があります。システムバックエンドには、Dall-E-3、Gemini Imagen、火山方舟（Volcengine）、Tencent Hunyuan（腾讯混元）、Alibaba Wanx（阿里万相）、Jimeng AI（即梦AI）などの主要な画像生成チャネルが統合されており、各プロバイダー固有のパラメータのアライメントと解析を自動的に行います。

### 1. 画像生成 (Image Generations)
* **パス**: `/v1/images/generations`
* **リクエスト方式**: `POST`

#### 主要なリクエストパラメータの説明
| パラメータ名 | タイプ | 必須 | 説明 |
| :--- | :--- | :--- | :--- |
| `model` | `string` | はい | 画像生成モデル名。例：`dall-e-3` (OpenAI), `wanx-v1` (阿里万相), `seedream-5.0-lite` (即梦) |
| `prompt` | `string` | はい | 画像を記述するテキストプロンプト（指示文） |
| `n` | `integer` | いいえ | 生成を希望する画像の枚数（デフォルトは `1`）。ゲートウェイは自動的に上流ネイティブの対応するパラメータに変換します |
| `size` | `string` | いいえ | 解像度（例：`1024x1024`）。システムはサイズを各プロバイダーがサポートする標準仕様に自動変換します |
| `watermark` | `boolean` | いいえ | 画像にウォーターマーク（透かし）を追加するかどうか（火山、阿里百煉などの一部のチャネルでサポート） |
| `web_search` | `boolean` | いいえ | ネット検索を有効にするか（OpenAI 互換の真偽値、デフォルト `false`）。ゲートウェイが火山方舟 Seedream 等向けに自動変換します |
| `ratio` | `string` | いいえ | アスペクト比のオプション（例：`16:9`, `3:4`。主に Gemini などのアスペクト比をサポートする画像生成モデルで使用） |
| `image` | `string` | いいえ | Image-to-Image（イメージからイメージ）の参照画像URL（OpenAIプロトコル拡張、オンラインの画像リンクを渡すことができます） |

#### Curl 画像生成呼び出し例
```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "dall-e-3",
    "prompt": "宇宙空間を漂う宇宙飛行士の猫、リアルなサイバーパンクスタイル",
    "size": "1024x1024",
    "n": 1
  }'
```

#### レスポンス例 (画像のURLを直接返却)
```json
{
  "created": 1719441600,
  "data": [
    {
      "url": "https://example.com/output/img_abc123.png"
    }
  ]
}
```

### 2. 画像編集 (Image Edits)
* **パス**: `/v1/images/edits`
* **リクエスト方式**: `POST`

元の画像、マスク画像（Mask）、およびプロンプトをアップロードして特定の領域を修正し、画像の一部の消去や再描画（インペインティング）機能を実現します。
