# 이미지 생성 및 편집 인터페이스

게이트웨이의 이미지 생성 인터페이스는 OpenAI 표준 이미지 생성 사양과 완벽하게 호환됩니다. 시스템 백엔드에는 Dall-E-3, Gemini Imagen, 볼케인진(Volcengine), 텐센트 Hunyuan, 알리바바 Wanxiang, Jimeng AI 등 다양한 주요 이미지 생성 채널이 통합되어 있으며, 각 제공업체 고유의 매개변수를 자동으로 매핑하고 분석합니다.

### 1. 이미지 생성 (Image Generations)
* **경로**: `/v1/images/generations`
* **요청 방식**: `POST`

#### 主要请求参数说明
| 매개변수명 | 타입 | 필수 여부 | 설명 |
| :--- | :--- | :--- | :--- |
| `model` | `string` | 예 | 이미지 생성 모델명 (예: `dall-e-3` (OpenAI), `wanx-v1` (알리바바 Wanxiang), `seedream-5.0-lite` (Jimeng)) |
| `prompt` | `string` | 예 | 이미지를 묘사하는 텍스트 프롬프트 |
| `n` | `integer` | 아니오 | 생성하고자 하는 이미지 수 (기본값 `1`). 게이트웨이가 상류 채널 네이티브의 해당 매개변수로 자동 변환합니다. |
| `size` | `string` | 아니오 | 해상도 (예: `1024x1024`). 시스템이 지원되는 표준 규격으로 해상도를 자동 변환하여 전송합니다. |
| `watermark` | `boolean` | 아니오 | 이미지 워터마크 추가 여부 (볼케인진, 알리바바 Bailian 등 일부 채널 지원) |
| `web_search` | `boolean` | 아니오 | 웹 검색 사용 여부 (OpenAI 호환 불리언, 기본값 `false`). 게이트웨이가 Volcengine Seedream 등에 맞게 자동 변환합니다 |
| `ratio` | `string` | 아니오 | 종횡비 옵션 (예: `16:9`, `3:4`. 주로 Gemini 등 종횡비를 지원하는 이미지 생성 모델에서 사용) |
| `image` | `string` | 아니오 | 이미지 투 이미지(Image-to-Image) 참조 이미지 URL (OpenAI 프로토콜 확장, 인터넷 이미지 링크 입력 가능) |

#### Curl 이미지 생성 호출 예시
```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "dall-e-3",
    "prompt": "一只在太空中漂浮的宇航员猫，写实赛博朋克风格",
    "size": "1024x1024",
    "n": 1
  }'
```

#### 응답 예시 (이미지 URL 직접 반환)
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

### 2. 이미지 편집 (Image Edits)
* **경로**: `/v1/images/edits`
* **요청 방식**: `POST`

원본 이미지, 마스크(Mask) 이미지 및 프롬프트를 업로드하여 영역별 수정이 가능하며, 이미지 국소 부위 삭제 및 재그리기(Inpainting) 기능을 구현할 수 있습니다.
