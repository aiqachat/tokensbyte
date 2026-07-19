# Quick Start & Authentication Guide

Welcome to the Unified API Gateway! This gateway supports both the OpenAI protocol and the native protocols of various LLM providers, providing you with automatic channel routing, protocol translation, and smart billing settlement.

### 1. Base URL
The unified API base URL is:
```bash
https://{{domain}}
```
If you are debugging locally or using a private deployment, you can use the corresponding port address allocated by the system.

### 2. Authentication Methods
The gateway performs strict authentication checks on all API endpoints. You can include your "API Key (Token)" in your requests using any of the following methods:

1. **Standard Authorization Header (Recommended)**
   Add a standard Bearer token to the HTTP request headers:
   ```http
   Authorization: Bearer sk-your_token_string_here
   ```

2. **Google Protocol Compatible Header**
   If your client application uses the Google native protocol, you can use the official API Key header:
   ```http
   X-Goog-Api-Key: sk-your_token_string_here
   ```

3. **URL Query Parameter**
   In some restricted environments or where only simple GET/POST requests are supported, you can append the key directly as a URL query parameter:
   ```bash
   https://{{domain}}/v1/chat/completions?key=sk-your_token_string_here
   ```

> [!IMPORTANT]
> Your API Key (Token) represents your account's credentials and billing source. Please keep it secure. Never hardcode keys in plaintext in client-side code (such as frontend HTML/JS). We recommend routing requests through a backend service or using environment variables to store keys.
