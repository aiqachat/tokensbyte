
### 5. Common Error Responses

Our API conforms to standard HTTP status codes and unified JSON error formats. Below are common failure scenarios and troubleshooting tips:

:::tabs
=== 400 Bad Request (Invalid Parameters / Model Not Found)
Returned when the requested `model` does not exist, is misspelled, or the request JSON body is malformed or missing required fields.

*   **HTTP Status**: `400`
*   **Response Example**:
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
*   **Troubleshooting**:
    1. Check if the `model` parameter is correct. Refer to the "Endpoints Overview" for available models.
    2. Validate your JSON request body structure to ensure all delimiters are closed.

=== 401 Unauthorized (Invalid API Key)
Returned when the API Key (Token) in the HTTP Header is missing, expired, or invalid.

*   **HTTP Status**: `401`
*   **Response Example**:
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
*   **Troubleshooting**:
    1. Ensure the request header includes `"Authorization: Bearer sk-xxx"`. Note the space between `Bearer` and the key.
    2. Check the developer console to confirm the token is active and has not been disabled or deleted.

=== 429 Too Many Requests (Insufficient Quota / Rate Limit)
Returned when your account credit balance is insufficient to pay for the request, or your request frequency exceeds the Rate Limit (RPM/TPM).

*   **HTTP Status**: `429`
*   **Response Example**:
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
*   **Troubleshooting**:
    1. Log in to the console to check if your account balance is positive.
    2. If you hit a rate limit, implement an exponential backoff retry policy in your application, or contact us to raise limits.
:::
