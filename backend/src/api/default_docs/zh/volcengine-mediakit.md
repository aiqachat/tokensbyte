# 火山 MediaKit 媒体处理增强接口

本平台深度集成了火山引擎 AI MediaKit 处理服务，提供视频画质增强、视频智能插帧、细节修复及智能字幕擦除等高级媒体编辑算法。由于视频增强处理非常耗时，任务一律采用异步计算机制。

### 官方文档参考
参数细节与能力说明请以火山引擎官方文档为准：
* [AI MediaKit 官方文档](https://docs.volcengine.com/docs/6448/2279230?lang=zh)

### 1. 开放的媒体端点一览
* **视频画质增强 (标准/专业版)**: `/api/v1/tools/enhance-video` (`POST`)
* **视频画质增强 (极速版)**: `/api/v1/tools/enhance-video-fast` (`POST`)
* **视频画质增强 (大模型版)**: `/api/v1/tools/enhance-video-generative` (`POST`)
* **视频字幕擦除**: `/api/v1/tools/erase-video-subtitle` (`POST`)
* **任务状态查询 (通用)**: `/api/v1/tasks/{task_id}` (`GET`)

### 2. 视频画质增强提交任务示例
* **路径**: `/api/v1/tools/enhance-video`
* **请求方式**: `POST`

#### 请求 Payload 格式
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
* `model`: 媒体处理增强预置模型名。例如：`vve-sd` (标准版画质增强), `vve-pf` (专业版), `vve-ft` (极速版), `vve-gt` (大模型增强), `vvs-er` (字幕擦除), `vvs-ep` (精细字幕擦除)
* `video_url`: 待处理的原视频网络地址 (需为可公开访问的直链)
* `resolution`: 目标超分分辨率，可选：`720p`, `1080p`, `2k`, `4k`
* `fps`: 目标帧率（支持插帧到 60 帧）

#### 提交返回
```json
{
  "task_id": "vve_task_1729495831000",
  "status": "pending"
}
```

### 3. 轮询查询视频任务结果
* **路径**: `/api/v1/tasks/vve_task_1729495831000`
* **请求方式**: `GET`

#### 响应示例
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

### 4. 媒体计费与扣费机制
火山 MediaKit 媒体任务计费归属于「视频」大类，采用「按时长计费 (元/秒)」的模式。扣减规则由系统设定的「火山 MediaKit 官方视频超分计费」计费规则决定，根据**目标分辨率**和**目标帧率**进行阶梯定价。当且仅当异步任务执行成功（`status = "success"`）时，网关将根据实际处理得到的视频时长（`duration`）完成配额精确结算扣减。