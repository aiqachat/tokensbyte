# Kling AI Native Protocol Guide

Kling AI has gained widespread use due to its extremely high standard of video quality and motion control. The gateway has established dedicated Kling routing, fully aligned with the official Kling API.

### 1. Video Model API
* **Text-to-Video**: `/v1/videos/text2video` (`POST`)
* **Image-to-Video**: `/v1/videos/image2video` (`POST`)
* **Multi-Image-to-Video**: `/v1/videos/multi-image2video` (`POST`)
* **Omni Video Reference-to-Video**: `/v1/videos/omni-video` (`POST`)
* **Query Task Status**: `/v1/videos/{endpoint}/{task_id}` (`GET`)

*Note: In the query interface, `{endpoint}` corresponds to the service type used when submitting the task (such as `text2video`, `image2video`, etc.).*

### 2. Image Model API
* **Standard Text/Image-to-Image**: `/v1/images/generations` (`POST`)
* **Multi-Image-to-Image**: `/v1/images/multi-image2image` (`POST`)
* **Omni Image Generation**: `/v1/images/omni-image` (`POST`)
* **Query Task Status**: `/v1/images/{endpoint}/{task_id}` (`GET`)

### 3. Kling Official Documentation Reference
For detailed request payload structures (such as `camera_control` camera control, `aspect_ratio` ratio control, start/end frame images, etc.), please refer to the official standard. You can jump to the official documentation here:
* [Kling OmniVideo Official Specification](https://klingai.com/document-api/apiReference/model/OmniVideo)
* [Kling OmniImage Official Specification](https://klingai.com/document-api/apiReference/model/OmniImage)
