# Volcengine MediaKit Media Processing Enhancement API

This platform deeply integrates the Volcengine AI MediaKit processing service, providing advanced media editing algorithms such as video quality enhancement, video intelligent frame interpolation, detail restoration, and intelligent subtitle erasure. Since video enhancement processing is highly time-consuming, all tasks utilize an asynchronous computation mechanism.

### Official Documentation
Please refer to the Volcengine official docs for parameter details and capabilities:
* [AI MediaKit Official Docs](https://docs.volcengine.com/docs/6448/2279230?lang=en)

### 1. Overview of Exposed Media Endpoints
* **Video Quality Enhancement (Standard/Professional Edition)**: `/api/v1/tools/enhance-video` (`POST`)
* **Video Quality Enhancement (Fast Edition)**: `/api/v1/tools/enhance-video-fast` (`POST`)
* **Video Quality Enhancement (Generative Large Model Edition)**: `/api/v1/tools/enhance-video-generative` (`POST`)
* **Video Subtitle Erasure**: `/api/v1/tools/erase-video-subtitle` (`POST`)
* **Task Status Query (General)**: `/api/v1/tasks/{task_id}` (`GET`)

### 2. Video Quality Enhancement Task Submission Example
* **Path**: `/api/v1/tools/enhance-video`
* **Request Method**: `POST`

#### Request Payload Format
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
* `model`: The preset model name for media processing enhancement. For example: `vve-sd` (Standard Video Quality Enhancement), `vve-pf` (Professional Edition), `vve-ft` (Fast Edition), `vve-gt` (Generative Large Model Enhancement), `vvs-er` (Subtitle Erasure), `vvs-ep` (Detailed Subtitle Erasure)
* `video_url`: The network address of the original video to be processed (must be a publicly accessible direct link)
* `resolution`: The target super-resolution. Options: `720p`, `1080p`, `2k`, `4k`
* `fps`: The target frame rate (supports interpolation up to 60 fps)

#### Submission Response
```json
{
  "task_id": "vve_task_1729495831000",
  "status": "pending"
}
```

### 3. Polling for Video Task Results
* **Path**: `/api/v1/tasks/vve_task_1729495831000`
* **Request Method**: `GET`

#### Response Example
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

### 4. Media Billing and Deduction Mechanism
Volcengine MediaKit media tasks belong to the "Video" category and use the "billing by duration (CNY/second)" model. Deduction rules are determined by the "Volcengine MediaKit Official Video Super-Resolution Billing" rules set by the system, with tiered pricing based on the **target resolution** and **target frame rate**. Only when the asynchronous task executes successfully (`status = "success"`) will the gateway accurately settle and deduct the quota based on the actual processed video duration (`duration`).
