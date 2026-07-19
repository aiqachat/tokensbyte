# API Tokens & Usage Logs APIs

Manage your API keys (Tokens) and retrieve detailed usage metrics or logs via these endpoints.

### 1. Retrieve API Tokens List
* **Endpoint**: `/api/v1/tokens`
* **Method**: `GET`
* **Response Example**:
```json
{
  "data": [
    {
      "id": 5,
      "name": "Production Key",
      "kid": "usr123987",
      "quota_limit": 1000.0,
      "used_quota": 5.23,
      "is_active": 1,
      "created_at": "2026-06-20T10:00:00Z"
    }
  ],
  "total": 1
}
```

### 2. Create API Token
* **Endpoint**: `/api/v1/tokens`
* **Method**: `POST`
* **Request Payload**:
```json
{
  "name": "New Key",
  "quota_limit": 500.0,
  "allowed_models": ["gpt-4o", "claude-3-5-sonnet-20241022"],
  "allowed_ips": "192.168.1.1,10.0.0.1",
  "rps_limit": 10,
  "rpm_limit": 100
}
```
* **Response Example**:
```json
{
  "id": 6,
  "name": "New Key",
  "token_key": "sk-ProjX82...",
  "quota_limit": 500.0,
  "is_active": 1
}
```
*Note: The actual secret key (`token_key`) is returned only once upon creation, or can be fetched via the `/reveal` endpoint.*

### 3. Reveal Token Secret Key
Retrieve the full plain-text key value of an API token.
* **Endpoint**: `/api/v1/tokens/{id}/reveal`
* **Method**: `POST`
* **Response Example**:
```json
{
  "token_key": "sk-your_full_api_key_value_here"
}
```

### 4. Delete API Token
* **Endpoint**: `/api/v1/tokens/{id}`
* **Method**: `DELETE`

### 5. Query Usage Logs
Retrieve model execution records, tokens consumed, billing details, and response status.
* **Endpoint**: `/api/v1/logs`
* **Method**: `GET`
* **Query Parameters**:
  * `page`, `per_page` (Pagination)
  * `model` (e.g. `gpt-4o`)
  * `status` (`success` or `fail`)
  * `start_date`, `end_date` (`YYYY-MM-DD`)
* **Response Example**:
```json
{
  "data": [
    {
      "log_id": "log_xyz123",
      "model": "gpt-4o",
      "prompt_tokens": 15,
      "completion_tokens": 20,
      "cost": 0.0007,
      "status_code": 200,
      "created_at": "2026-06-21T15:20:00Z"
    }
  ],
  "total": 1,
  "total_cost": 0.0007,
  "success_count": 1,
  "fail_count": 0
}
```

### 6. Query Task Logs
Query background asynchronous tasks (e.g., video generation or MediaKit enhancement).
* **Endpoint**: `/api/v1/task_logs`
* **Method**: `GET`
* **Response Example**:
```json
{
  "data": [
    {
      "log_id": "task_abc789",
      "action_type": "视频",
      "status": "success",
      "duration": 5.0,
      "cost": 1.5,
      "created_at": "2026-06-21T16:00:00Z"
    }
  ],
  "total": 1
}
```
* Use `POST /api/v1/task_logs/{log_id}/sync` to force status sync, or `POST /api/v1/task_logs/{log_id}/cancel` to cancel a pending task.
