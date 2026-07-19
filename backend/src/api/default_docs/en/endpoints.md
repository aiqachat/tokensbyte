# List of Available Endpoints

The system has fully wrapped the gateway interfaces for industry-leading large language models and media processing APIs, providing corresponding routing paths for the protocols of various providers. You can use your unified API Key to access all of the following endpoints directly through the gateway:

### 1. OpenAI Protocol Routes
| Endpoint Name | Path | HTTP Method | Protocol Type |
| :--- | :--- | :--- | :--- |
| OpenAI Chat Completions | `/v1/chat/completions` | `POST` | OpenAI Compatible |
| OpenAI Official Native Passthrough | `/v1/responses` | `POST` | OpenAI Compatible |
| Image Generation (Text2Image) | `/v1/images/generations` | `POST` | OpenAI Compatible |
| Image Editing (Image Edit) | `/v1/images/edits` | `POST` | OpenAI Compatible |
| Async Video Task Submission | `/v1/video/generations` | `POST` | OpenAI Compatible |
| Async Video Task Status Query | `/v1/video/generations/{task_id}` | `GET` | OpenAI Compatible |
| Text-to-Speech (TTS) | `/v1/audio/speech` | `POST` | OpenAI Compatible |
| Token Balance Query | `/v1/balance` | `GET` | Account Info |
| Total Account Balance Query | `/v1/user/balance` | `GET` | Account Info |
| Available Models List | `/v1/models` | `GET` | Account Info |

### 2. Volcengine Ark (Volcengine) Routes
| Endpoint Name | Path | HTTP Method | Protocol Type |
| :--- | :--- | :--- | :--- |
| Chat Completions (OpenAI Compatible) | `/api/v3/chat/completions` | `POST` | Volcengine Ark |
| Native Response (Responses) | `/api/v3/responses` | `POST` | Volcengine Ark |
| Image Generation (Generations) | `/api/v3/images/generations` | `POST` | Volcengine Ark |
| Async Video Task Submission | `/api/v3/contents/generations/tasks` | `POST` | Volcengine Ark |
| Async Video Task Query | `/api/v3/contents/generations/tasks/{task_id}` | `GET` | Volcengine Ark |
| Async Video Task Cancellation | `/api/v3/contents/generations/tasks/{task_id}` | `DELETE` | Volcengine Ark |
| Speech Synthesis (SSE Text Stream) | `/api/v3/tts/unidirectional/sse` | `POST` | Volcengine Ark |
| Speech Synthesis (Chunked Binary) | `/api/v3/tts/unidirectional` | `POST` | Volcengine Ark |
| Video Quality Enhancement (Standard/Pro) | `/api/v1/tools/enhance-video` | `POST` | Volcengine MediaKit |
| Video Quality Enhancement (Lite) | `/api/v1/tools/enhance-video-fast` | `POST` | Volcengine MediaKit |
| Video Quality Enhancement (Generative LLM) | `/api/v1/tools/enhance-video-generative` | `POST` | Volcengine MediaKit |
| Video Subtitle Erasure | `/api/v1/tools/erase-video-subtitle` | `POST` | Volcengine MediaKit |
| Media Task Status Query | `/api/v1/tasks/{task_id}` | `GET` | Volcengine MediaKit |

### 3. Other Provider Native Routes
| Provider | Endpoint Name | Path | HTTP Method |
| :--- | :--- | :--- | :--- |
| Alibaba Bailian | Wanxiang Video Generation (Submit) | `/api/v1/services/aigc/video-generation/video-synthesis` | `POST` |
| Alibaba Bailian | Wanxiang Image Generation Task (Submit) | `/api/v1/services/aigc/multimodal-generation/generation` | `POST` |
| Alibaba Bailian | Async Task Query (Generic) | `/api/v1/tasks/{task_id}` | `GET` |
| Alibaba Bailian | Text Embeddings | `/compatible-mode/v1/embeddings` | `POST` |
| Alibaba Bailian | Document Reranking (Rerank) | `/compatible-api/v1/reranks` | `POST` |
| Kling AI | Text-to-Video (Kling) | `/v1/videos/text2video` | `POST` |
| Kling AI | Image-to-Video (Kling) | `/v1/videos/image2video` | `POST` |
| Kling AI | Task Status Query (Video/Image) | `/v1/videos/{endpoint}/{task_id}` | `GET` |
| Google | Gemini Text Generation | `/v1beta/models/{model}:generateContent` | `POST` |
| Google | Gemini Stream Text Generation | `/v1beta/models/{model}:streamGenerateContent` | `POST` |
| Anthropic | Claude Native Messages | `/v1/messages` | `POST` |
