# Site API Overview & Authentication

Welcome to the TokensByte Platform Site Functions API. In addition to calling LLM providers through unified AI routes, developers can manage API tokens, query user billing/usage logs, and retrieve account settings using our management APIs.

### 1. Base URL
All Site API endpoints are prefixed with:
```bash
https://{{domain}}/api/v1
```
*Note: Public routes and Auth endpoints are also nested under `/api/v1`.*

### 2. Authentication Mechanism
Except for public and registration endpoints, all site management APIs require JSON Web Token (JWT) authentication. Follow these steps to authenticate:

#### Step 1: Login to Obtain JWT Token
* **Endpoint**: `/api/v1/auth/login`
* **Method**: `POST`
* **Request Payload**:
```json
{
  "username": "your_username_or_email",
  "password": "your_password",
  "login_type": "username"
}
```
* `login_type`: Optional. Can be `"username"`, `"email"`, or `"mobile"`. Defaults to `"username"`.

* **Response Payload**:
```json
{
  "token": "eyJhbGciOi...",
  "user": {
    "id": "1",
    "username": "user1",
    "role": "user",
    "email": "user@example.com",
    "is_active": 1
  }
}
```

#### Step 2: Include the JWT Token in Request Headers
For all subsequent API calls, add the returned token to the standard `Authorization` header:
```http
Authorization: Bearer <your_jwt_token_here>
```

> [!IMPORTANT]
> The JWT token is temporary and is designed for interactive frontends or integrations. Do not leak your JWT token. If you need static tokens for API calls to models, use the **API Token** management endpoints instead.
