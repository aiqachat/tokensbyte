# 비디오 생성 인터페이스

AIGC 영역에서 비디오 대형 모델이 급격히 성장함에 따라, 게이트웨이는 표준 OpenAI 프로토콜 프레임워크를 기반으로 `/v1/video/generations` 인터페이스를 확장하였습니다. 이를 통해 볼케인진(Volcengine), 알리바바 Bailian Wanxiang, Kling AI, Jimeng AI, Bytefor 등 주요 비디오 생성 엔진에 바로 사용할 수 있는 통합 호출 경로를 제공합니다. 비디오 모델은 대부분 비동기 연산 방식으로 작동하므로, 호출 프로세스는 **작업 제출**과 **폴링을 통한 결과 조회**의 두 단계로 나뉩니다.

### 1. 비디오 작업 제출
* **경로**: `/v1/video/generations`
* **요청 방식**: `POST`

#### 핵심 매개변수 설명
| 매개변수명 | 타입 | 필수 여부 | 설명 |
| :--- | :--- | :--- | :--- |
| `model` | `string` | 예 | 비디오 생성 모델 이름 (예: `doubao-seedance-2-0`, `kling-v3-omni`, `wanx-v1`) |
| `prompt` | `string` | 예 | 비디오의 움직임과 화면을 묘사하는 프롬프트 텍스트 |
| `negative_prompt` | `string` | 아니오 | 부정적 프롬프트, 원치 않는 화면 요소를 배제하는 데 사용 |
| `images` / `image_urls` | `array` | 아니오 | 참조용 베이스 이미지 URL 또는 base64 배열 (`image_urls`와 `images`는 완전히 동일하게 작동). 1장은 첫 프레임, 2장은 첫/마지막 프레임, 3장 이상은 멀티 이미지 참조로 사용 가능 (Kling, Volcengine 등) |
| `videos` | `array` | 아니오 | 참조용 비디오 링크 배열, 비디오-투-비디오 또는 비디오 제어용 (예: Kling Omni 비디오 참조/Bytefor 비디오 참조) |
| `audios` | `array` | 아니오 | 참조용 오디오 링크 배열, 배경음악 또는 참조 오디오 제공용 (예: Volcengine, Bytefor 등) |
| `resolution` | `string` | 아니오 | 목표 해상도 (예: `1080p`, `720p`, `480p`). 시스템이 자동으로 변환하여 제조사 사양에 맞춥니다 (예: Kling `1080p`는 `pro` 모드로, `720p`는 `std` 모드로 자동 매핑) |
| `ratio` | `string` | 아니오 | 가로세로 비율 옵션 (예: `16:9`, `9:16`, `4:3`, `3:4`, `1:1`). 시스템이 자동으로 제조사 매개변수로 변환합니다 |
| `duration` | `integer` | 아니오 | 생성할 비디오 길이 (초) (예: `5` 또는 `10`). 즉몽(Jimeng) AI에서는 자동으로 `121` 또는 `241` 프레임으로 변환됩니다 |
| `generate_audio` | `boolean` | 아니오 | 비디오 배경음/나레이션 오디오의 동시 생성 여부 (기본값 `false`) |
| `watermark` | `boolean` | 아니오 | 생성된 비디오에 워터마크 표시 여부 (Volcengine, Alibaba 등 일부 채널 지원) |
| `web_search` | `boolean` | 아니오 | 웹 검색 사용 여부 (OpenAI 호환 불리언, 기본값 `false`). 게이트웨이가 Volcengine Seedance 등에 맞게 자동 변환합니다 |
| `seed` | `integer` | 아니오 | 난수 시드 (비디오 생성의 일관성을 제어하기 위해 사용) |

#### 작업 제출 예시
```bash
curl -X POST https://{{domain}}/v1/video/generations \
  -H "Authorization: Bearer sk-your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kling-v3-omni",
    "prompt": "推开欧式古典大门，展现在眼前的是一片奇幻的云海城堡，航拍视角，4k 级细节",
    "resolution": "1080p",
    "duration": 5
  }'
```

#### 제출 응답 (Task ID 획득)
```json
{
  "id": "video_task_abc123xyz789",
  "task_id": "video_task_abc123xyz789",
  "status": "pending",
  "message": "Task submitted successfully"
}
```

### 2. 폴링을 통한 작업 결과 획득
* **경로**: `/v1/video/generations/{task_id}` 또는 `/v1/tasks/{task_id}`
* **요청 방식**: `GET`

#### 조회 응답 예시 (생성 성공)
```json
{
  "id": "video_task_abc123xyz789",
  "task_id": "video_task_abc123xyz789",
  "status": "completed",
  "data": [
    {
      "url": "https://example.com/output/generated_video.mp4"
    }
  ]
}
```
