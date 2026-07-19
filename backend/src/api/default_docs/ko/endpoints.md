# 오픈 엔드포인트 목록

시스템은 업계 주요 대형 언어 모델(LLM) 및 미디어 처리 인터페이스를 게이트웨이로 전방위 캡슐화하였으며, 서로 다른 제공업체의 프로토콜에 대응하는 전달 라우팅을 지원합니다. 통합 API 키를 사용하여 게이트웨이를 통해 다음 모든 엔드포인트에 직접 액세스할 수 있습니다:

### 1. OpenAI 프로토콜 라우팅
| 엔드포인트 이름 | 경로 (Path) | 요청 방식 | 프로토콜 유형 |
| :--- | :--- | :--- | :--- |
| OpenAI 채팅 대화 | `/v1/chat/completions` | `POST` | OpenAI 호환 |
| OpenAI 공식 네이티브 패스스루 | `/v1/responses` | `POST` | OpenAI 호환 |
| 이미지 생성 (Text2Image) | `/v1/images/generations` | `POST` | OpenAI 호환 |
| 이미지 편집 (Image Edit) | `/v1/images/edits` | `POST` | OpenAI 호환 |
| 비동기 비디오 작업 제출 | `/v1/video/generations` | `POST` | OpenAI 호환 |
| 비동기 비디오 작업 상태 조회 | `/v1/video/generations/{task_id}` | `GET` | OpenAI 호환 |
| 텍스트 음성 합성 (Text-to-Speech) | `/v1/audio/speech` | `POST` | OpenAI 호환 |
| 토큰 사용 가능 한도 조회 | `/v1/balance` | `GET` | 계정 정보 |
| 계정 총 잔액 조회 | `/v1/user/balance` | `GET` | 계정 정보 |
| 사용 가능한 모델 목록 | `/v1/models` | `GET` | 계정 정보 |

### 2. 볼케인진(Volcengine) 라우팅
| 엔드포인트 이름 | 경로 (Path) | 요청 방식 | 프로토콜 유형 |
| :--- | :--- | :--- | :--- |
| 채팅 대화 (OpenAI 호환) | `/api/v3/chat/completions` | `POST` | 볼케인진(Volcengine) |
| 네이티브 응답 (Responses) | `/api/v3/responses` | `POST` | 볼케인진(Volcengine) |
| 이미지 생성 (Generations) | `/api/v3/images/generations` | `POST` | 볼케인진(Volcengine) |
| 비동기 비디오 작업 제출 | `/api/v3/contents/generations/tasks` | `POST` | 볼케인진(Volcengine) |
| 비동기 비디오 작업 조회 | `/api/v3/contents/generations/tasks/{task_id}` | `GET` | 볼케인진(Volcengine) |
| 비동기 비디오 작업 취소 | `/api/v3/contents/generations/tasks/{task_id}` | `DELETE` | 볼케인진(Volcengine) |
| 음성 합성 (SSE 텍스트 스트림) | `/api/v3/tts/unidirectional/sse` | `POST` | 볼케인진(Volcengine) |
| 음성 합성 (Chunked 바이너리) | `/api/v3/tts/unidirectional` | `POST` | 볼케인진(Volcengine) |
| 비디오 화질 개선 (표준/프로) | `/api/v1/tools/enhance-video` | `POST` | 볼케인진(Volcengine) MediaKit |
| 비디오 화질 개선 (고속 버전) | `/api/v1/tools/enhance-video-fast` | `POST` | 볼케인진(Volcengine) MediaKit |
| 비디오 화질 개선 (대형 모델 버전) | `/api/v1/tools/enhance-video-generative` | `POST` | 볼케인진(Volcengine) MediaKit |
| 비디오 자막 제거 | `/api/v1/tools/erase-video-subtitle` | `POST` | 볼케인진(Volcengine) MediaKit |
| 미디어 작업 상태 조회 | `/api/v1/tasks/{task_id}` | `GET` | 볼케인진(Volcengine) MediaKit |

### 3. 기타 제공업체 네이티브 라우팅
| 제공업체 이름 | 엔드포인트 이름 | 경로 (Path) | 요청 방식 |
| :--- | :--- | :--- | :--- |
| 알리바바 Bailian | Wanxiang 비디오 생성 (제출) | `/api/v1/services/aigc/video-generation/video-synthesis` | `POST` |
| 알리바바 Bailian | Wanxiang 이미지 생성 작업 (제출) | `/api/v1/services/aigc/multimodal-generation/generation` | `POST` |
| 알리바바 Bailian | 비동기 작업 조회 (공통) | `/api/v1/tasks/{task_id}` | `GET` |
| 알리바바 Bailian | 텍스트 임베딩 | `/compatible-mode/v1/embeddings` | `POST` |
| 알리바바 Bailian | 문서 재순위화 (Rerank) | `/compatible-api/v1/reranks` | `POST` |
| Kling AI | 텍스트 기반 비디오 생성 (Kling) | `/v1/videos/text2video` | `POST` |
| Kling AI | 이미지 기반 비디오 생성 (Kling) | `/v1/videos/image2video` | `POST` |
| Kling AI | 작업 상태 조회 (비디오/이미지) | `/v1/videos/{endpoint}/{task_id}` | `GET` |
| Google | Gemini 텍스트 생성 | `/v1beta/models/{model}:generateContent` | `POST` |
| Google | Gemini 스트리밍 텍스트 생성 | `/v1beta/models/{model}:streamGenerateContent` | `POST` |
| Anthropic | Claude 네이티브 메시지 | `/v1/messages` | `POST` |
