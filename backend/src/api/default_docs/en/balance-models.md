# Balance & Model Query Endpoints

To make it easy for clients to fetch account status and token remaining quota at runtime, the gateway provides the following query-type APIs:

### 1. Query Current Token Quota (Token Balance)
* **Path**: `/v1/balance`
* **Method**: `GET`
* **Authentication**: Requires the corresponding token in the request header `Authorization: Bearer sk-xxx`

#### Response Fields
```json
{
  "remain_balance": 985.42,
  "used_balance": 14.58,
  "unlimited_quota": false
}
```
*Note: When the token is set to an unlimited quota, `remain_balance` returns `-1`, and `unlimited_quota` returns `true`.*

### 2. Query User Account Total Balance (User Balance)
* **Path**: `/v1/user/balance`
* **Method**: `GET`

Fetches the global total balance of the user account associated with the current token (rather than the sub-quota limit of the single token).

### 3. Get Available Models List (Models List)
* **Path**: `/v1/models`
* **Method**: `GET`

Lists all active models open to your account/tier in the current system, making it easy for client-side dropdown menus to render directly.

#### Response Example
```json
{
  "object": "list",
  "data": [
    {
      "id": "gpt-4o",
      "object": "model",
      "created": 1719441600,
      "owned_by": "OpenAI"
    },
    {
      "id": "claude-3-5-sonnet-20241022",
      "object": "model",
      "created": 1719441600,
      "owned_by": "Anthropic"
    }
  ]
}
```
