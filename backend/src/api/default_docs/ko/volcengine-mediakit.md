# 볼케인엔진 MediaKit 미디어 처리 강화 API

본 플랫폼은 볼케인엔진 AI MediaKit 처리 서비스와 긴밀히 연동되어 비디오 화질 개선, 비디오 스마트 프레임 보간, 디테일 복원 및 스마트 자막 제거 등 고급 미디어 편집 알고리즘을 제공합니다. 비디오 개선 처리는 시간이 매우 오래 소요되므로 작업은 항상 비동기 계산 메커니즘을 사용합니다.

### 공식 문서
파라미터 세부사항과 기능 설명은 볼케인엔진 공식 문서를 참고하세요:
* [AI MediaKit 공식 문서](https://docs.volcengine.com/docs/6448/2279230)

### 1. 오픈된 미디어 엔드포인트 목록
* **비디오 화질 개선 (표준/프로 버전)**: `/api/v1/tools/enhance-video` (`POST`)
* **비디오 화질 개선 (초고속 버전)**: `/api/v1/tools/enhance-video-fast` (`POST`)
* **비디오 화질 개선 (거대 모델 버전)**: `/api/v1/tools/enhance-video-generative` (`POST`)
* **비디오 자막 제거**: `/api/v1/tools/erase-video-subtitle` (`POST`)
* **작업 상태 조회 (공통)**: `/api/v1/tasks/{task_id}` (`GET`)

### 2. 비디오 화질 개선 작업 제출 예시
* **경로**: `/api/v1/tools/enhance-video`
* **요청 메서드**: `POST`

#### 요청 페이로드(Payload) 형식
```json
{
  "model": "vve-sd",
  "video_url": "https://example.com/assets/input_video.mp4",
  "mode": "standard",
  "scene": "aigc",
  "resolution": "1080p",
  "fps": 60
}
```
* `model`: 미디어 처리 개선 사전 설정 모델 이름. 예: `vve-sd` (표준 버전 화질 개선), `vve-pf` (프로 버전), `vve-ft` (초고속 버전), `vve-gt` (생성형/거대 모델 개선), `vvs-er` (자막 제거), `vvs-ep` (정밀 자막 제거)
* `video_url`: 처리할 원본 비디오의 웹 주소 (공개 액세스가 가능한 다이렉트 링크여야 함)
* `resolution`: 대상 해상도(Super Resolution), 선택 가능: `720p`, `1080p`, `2k`, `4k`
* `fps`: 대상 프레임 레이트 (최대 60 프레임까지 보간 지원)

#### 제출 응답
```json
{
  "task_id": "vve_task_1729495831000",
  "status": "pending"
}
```

### 3. 비디오 작업 결과 폴링 조회
* **경로**: `/api/v1/tasks/vve_task_1729495831000`
* **요청 메서드**: `GET`

#### 응답 예시
```json
{
  "task_id": "vve_task_1729495831000",
  "status": "success",
  "result": {
    "video_url": "https://example.com/output/enhanced_video.mp4",
    "duration": 15.5,
    "resolution": "1920x1080",
    "fps": 60
  }
}
```

### 4. 미디어 과금 및 차감 메커니즘
볼케인엔진 MediaKit 미디어 작업 과금은 '비디오' 대분류에 속하며, '시간 단위 과금 (원/초)' 방식을 채택하고 있습니다. 차감 규칙은 시스템에 설정된 '볼케인엔진 MediaKit 공식 비디오 초고해상도(Super Resolution) 과금' 규칙에 따라 결정되며, **대상 해상도** 및 **대상 프레임 레이트**를 기준으로 계단식 요금이 책정됩니다. 비동기 작업이 성공적으로 실행 완료(`status = "success"`)된 경우에만, 게이트웨이는 실제 처리된 비디오 길이(`duration`)를 기준으로 할당량을 정확하게 계산하여 차감합니다.
