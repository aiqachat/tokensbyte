# 알리 바이롄 (DashScope) 네이티브 API 설명

게이트웨이는 알리바바 클라우드 바이롄(DashScope) 거대 모델 및 이미지, 비디오 모델 네이티브 API 라우팅과 완전 호환되며, 완전한 상태 추출 및 과금 감사를 지원합니다.

### 1. 완샹 비디오 생성 (Submit Video)
* **경로**: `/api/v1/services/aigc/video-generation/video-synthesis`
* **요청 메서드**: `POST`

#### 요청 예시
```json
{
  "model": "wanx-v1",
  "input": {
    "prompt": "一只金毛寻回犬在金色的秋天落叶中奔跑"
  },
  "parameters": {
    "resolution": "1280*720",
    "duration": 5
  }
} 
```
게이트웨이가 `X-DashScope-Async: enable` 요청 헤더를 자동으로 가로채고 주입하여 비동기 작업의 자동 위임 제출을 구현합니다.

### 2. 완샹 이미지 생성 (Submit Image)
* **경로**: `/api/v1/services/aigc/multimodal-generation/generation`
* **요청 메서드**: `POST`

형식은 비디오와 유사하며, seed, size 등 제공사 고유의 제어 파라미터를 직접 투과 전송(Pass-through)할 수 있도록 지원합니다.

### 3. 비동기 작업 상태 조회
* **경로**: `/api/v1/tasks/{task_id}`
* **요청 메서드**: `GET`

알리 완샹 비디오 및 이미지는 모두 바이롄 통합 비동기 작업 ID를 사용합니다. 네이티브 `task_id`를 사용하여 폴링할 수 있으며, 게이트웨이는 상태가 `succeeded` 또는 `failed`로 변경된 후 해당하는 사용량을 추출하여 과금 차감을 진행합니다.

### 4. 텍스트 임베딩 (Embeddings) 및 리랭크 (Rerank)
* **임베딩 API**: `/compatible-mode/v1/embeddings` (`POST`)
  통이치엔원(Qwen) 공식 임베딩 모델(예: `text-embedding-v4`)을 지원하며, 총 토큰 수에 따라 과금됩니다.
* **문서 리랭크 API (Rerank)**:
  * 호환 경로 (qwen3-rerank 등에 사용): `/compatible-api/v1/reranks`
  * 네이티브 경로 (gte-rerank-v2 등에 사용): `/api/v1/services/rerank/text-rerank/text-rerank`
