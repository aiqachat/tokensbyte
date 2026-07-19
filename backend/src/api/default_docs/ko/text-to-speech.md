# 음성 합성 인터페이스 (Text-to-Speech)

음성 합성(TTS)은 입력된 텍스트를 자연스럽고 매끄러운 사람 목소리의 오디오 스트림으로 변환합니다. 게이트웨이 인터페이스는 OpenAI `/v1/audio/speech` 사양과 고도로 호환되며, 볼케인진(Volcengine) 등 고급 음성 모델의 자동 코덱 변환을 지원합니다.

### 1. 음성 합성 인터페이스
* **경로**: `/v1/audio/speech`
* **요청 방식**: `POST`

#### 요청 매개변수 설명
| 매개변수명 | 타입 | 필수 여부 | 설명 |
| :--- | :--- | :--- | :--- |
| `model` | `string` | 예 | 음성 합성 모델명 (예: `tts-1` (OpenAI), `seed-tts-2.0` (볼케인진 대형 음성 모델)) |
| `input` | `string` | 예 | 합성할 텍스트 내용. 최대 길이 제한은 일반적으로 개별 모델 사양에 따라 결정됩니다. |
| `voice` | `string` | 예 | 목소리(음색) 식별자. 볼케인진의 경우 화자 ID(Speaker ID)를 전달해야 합니다 (예: `zh_female_vv_uranus_bigtts`). |
| `response_format` | `string` | 아니오 | 오디오 스트림 반환 형식. 선택 가능 값: `mp3` (기본값), `opus`, `aac`, `flac`, `wav`, `pcm` |
| `speed` | `number` | 아니오 | 말하기 속도 조절 배수 (`0.25` ~ `4.0`, 기본값 `1.0`) |

#### 호출 예시
```bash
curl -X POST https://{{domain}}/v1/audio/speech \
  -H "Authorization: Bearer sk-your_token" \
  -H "Content-Type: application/json" \
  -o output.mp3 \
  -d '{
    "model": "seed-tts-2.0",
    "input": "您好，欢迎使用统一智能语音合成系统，请在下方输入您希望合成的文本内容。",
    "voice": "zh_female_vv_uranus_bigtts",
    "response_format": "mp3"
  }'
```

> [!NOTE]
> 게이트웨이는 본 인터페이스에서 순수 바이너리 오디오 데이터 스트림을 반환합니다(HTTP 바이너리 응답, Content-Type은 `audio/mpeg` 또는 해당 오디오 포맷 타입). 볼케인진 TTS V3의 경우, 게이트웨이가 SSE 이벤트 스트림 내의 Base64 인코딩 데이터를 자동으로 병합 및 디코딩하여 바이너리 스트림으로 반환하므로, 프론트엔드 개발 시 파싱의 부담을 크게 줄여줍니다.
