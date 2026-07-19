# Kling AI ネイティブプロトコル説明

Kling AI は、非常に高い水準の動画画質とモーションコントロールにより、広く使用されています。ゲートウェイは Kling 専用のルーティングを用意し、Kling 公式 API と完全に整合させています。 

### 1. 動画モデル API
* **テキストからの動画生成 (Text to Video)**: `/v1/videos/text2video` (`POST`)
* **画像からの動画生成 (Image to Video)**: `/v1/videos/image2video` (`POST`)
* **複数画像からの動画生成 (Multi-Image to Video)**: `/v1/videos/multi-image2video` (`POST`)
* **Omni 動画参照からの動画生成**: `/v1/videos/omni-video` (`POST`)
* **タスクステータス確認**: `/v1/videos/{endpoint}/{task_id}` (`GET`)

*注: ステータス確認 API において、`{endpoint}` はタスク送信時に使用したサービスタイプ（例: `text2video`、`image2video` など）に対応します。*

### 2. 画像モデル API
* **標準テキスト/画像からの画像生成**: `/v1/images/generations` (`POST`)
* **複数画像からの画像生成**: `/v1/images/multi-image2image` (`POST`)
* **Omni 画像生成**: `/v1/images/omni-image` (`POST`)
* **タスクステータス確認**: `/v1/images/{endpoint}/{task_id}` (`GET`)

### 3. Kling 公式ドキュメントの参照
詳細なリクエストペイロード構造（例: `camera_control` カメラ制御、`aspect_ratio` アスペクト比制御、最初/最後のフレーム画像など）については、公式標準をご参照ください。以下のリンクから公式ドキュメントにアクセスできます：
* [Kling OmniVideo 公式仕様](https://klingai.com/document-api/apiReference/model/OmniVideo)
* [Kling OmniImage 公式仕様](https://klingai.com/document-api/apiReference/model/OmniImage)
