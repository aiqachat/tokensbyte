
### 5. 常见失败返回示例

本平台接口遵循标准的 HTTP 状态码与统一的 JSON 错误响应格式，便于您进行异常处理。以下是常见的失败场景及其排查建议：

:::tabs
=== 400 Bad Request (参数错误 / 模型不存在)
当请求中指定的 `model` 不存在、拼写错误，或者请求体 JSON 格式不规范、缺少必填字段时返回。

*   **HTTP 状态码**: `400`
*   **响应示例**:
    ```json
    {
      "error": {
        "message": "The model does not exist or you do not have access to it.",
        "type": "invalid_request_error",
        "param": "model",
        "code": "model_not_found"
      }
    }
    ```
*   **排查建议**:
    1. 检查请求体中的 `model` 字段值是否正确，参考“开放端点一览表”中的可用模型。
    2. 使用 JSON 校验工具检查请求体格式，确保逗号和括号闭合正确。

=== 401 Unauthorized (API Key 无效 / 未授权)
当 HTTP Header 中的 API 密钥（Token）无效、过期，或格式错误时返回。

*   **HTTP 状态码**: `401`
*   **响应示例**:
    ```json
    {
      "error": {
        "message": "Invalid API Key or authorization header. Please check your credentials.",
        "type": "invalid_request_error",
        "param": null,
        "code": "invalid_api_key"
      }
    }
    ```
*   **排查建议**:
    1. 确认请求 Header 包含 `"Authorization: Bearer sk-xxx"`，注意 `Bearer` 和 Key 之间有且仅有一个空格。
    2. 登录平台管理后台，确认该令牌（API Key）处于启用状态，且未过期或被封禁。

=== 429 Too Many Requests (余额不足 / 频控限制)
当您的账户可用额度（包含充值额度与赠送额度）不足，或者请求超出了设定的每分钟频率限制（RPM/TPM）时返回。

*   **HTTP 状态码**: `429`
*   **响应示例**:
    ```json
    {
      "error": {
        "message": "Your credit balance is insufficient. Please recharge your account.",
        "type": "insufficient_quota",
        "param": null,
        "code": "insufficient_quota"
      }
    }
    ```
*   **排查建议**:
    1. 登录平台个人中心，检查您的账户可用余额是否充足。
    2. 如果是频率超限，请在客户端代码中实现指数退避重试机制，或者联系管理员提升并发限制。
:::
