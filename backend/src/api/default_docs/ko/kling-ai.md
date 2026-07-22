# 클링 AI (Kling) 네이티브 프로토콜 설명

클링 AI(Kling)는 매우 높은 수준의 비디오 화질과 동작 제어 성능으로 널리 사용되고 있습니다. 게이트웨이는 전용 Kling 라우트를 개설하여 클링 공식 API와 완전히 동기화했습니다. 

### 1. 비디오 모델 API
* **텍스트 기반 비디오 생성**: `/v1/videos/text2video` (`POST`)
* **이미지 기반 비디오 생성**: `/v1/videos/image2video` (`POST`)
* **다중 이미지 기반 비디오 생성**: `/v1/videos/multi-image2video` (`POST`)
* **Omni 비디오 참조 비디오 생성**: `/v1/videos/omni-video` (`POST`)
* **작업 상태 조회**: `/v1/videos/{endpoint}/{task_id}` (`GET`)

*주의: 조회 API에서 `{endpoint}`는 작업을 제출할 때 사용한 서비스 유형(예: `text2video`, `image2video` 등)에 해당합니다.*

### 2. 이미지 모델 API
* **표준 텍스트/이미지 기반 이미지 생성**: `/v1/images/generations` (`POST`)
* **다중 이미지 기반 이미지 생성**: `/v1/images/multi-image2image` (`POST`)
* **Omni 이미지 생성**: `/v1/images/omni-image` (`POST`)
* **작업 상태 조회**: `/v1/images/{endpoint}/{task_id}` (`GET`)

### 3. 클링 공식 문서 참고
자세한 요청 페이로드 구조(예: 카메라 제어 `camera_control`, 비율 제어 `aspect_ratio`, 첫 프레임 및 마지막 프레임 이미지 등)는 공식 표준을 참고하시기 바랍니다. 아래 링크를 통해 공식 문서 설명으로 이동할 수 있습니다:
* [클링 OmniVideo 공식 규격](https://klingai.com/document-api/apiReference/model/OmniVideo)
* [클링 OmniImage 공식 규격](https://klingai.com/document-api/apiReference/model/OmniImage)
