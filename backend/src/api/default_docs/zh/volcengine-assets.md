# 火山方舟素材库 API 接入与使用指南

本网关深度兼容火山引擎火山方舟平台（Volcengine Ark）的素材库及素材资产管理能力。开发者可以直接通过网关代理的 `/api` 端点，调用火山原生的素材与素材组管理 API，实现素材资产的上传、查询、更新和删除。

### 官方文档参考
完整参数、限制与最新能力说明请参阅火山方舟官方文档：
* [素材库官方文档](https://console.volcengine.com/ark/region:cn-beijing/docs/82379/2333565?lang=zh)

---

## 1. 基础请求信息

为保障接入的高效与安全，所有素材 API 统一采用 `POST` 方式提交，并通过标准的 JSON 格式与网关通信。

* **基准请求地址 (Base URL)**: `https://{{domain}}/api`
* **请求方式 (HTTP Method)**: `POST`
* **必填请求头部 (HTTP Headers)**:
  * `Content-Type: application/json`
  * `Authorization: Bearer sk-your_api_key_value_here` *(您的平台统一 API 密钥，请在后台令牌管理中生成)*

---

## 2. 公共请求参数 (Query String)

进行素材操作时，必须在请求 URL 的 **Query 参数** 中透传以下控制参数：

| 参数名 | 必填 | 类型 | 说明 |
| :--- | :--- | :--- | :--- |
| `Action` | 是 | `string` | 执行的具体资产操作，可选值见下方“核心 API 接口列表” |
| `Version` | 否 | `string` | 接口版本号，默认为 `2024-01-01` |
| `ns` | 否 | `string` | 插件命名空间，可选 `asset_manager`（国内版素材管理凭证，默认）或 `asset_manager_intl`（国际版素材管理凭证） |

*完整请求 URL 格式示例*：
`POST https://{{domain}}/api?Action=CreateAsset&Version=2024-01-01&ns=asset_manager`

---

## 3. 核心 API 接口列表

### ① 注册/创建素材资产 (CreateAsset)
用于将已存储在云存储（如火山 TOS）上的媒体文件 URL，向火山方舟注册为可用于视频生成等大模型的资产。
* **URL Action**: `CreateAsset`
* **请求体参数 (Request Body - JSON)**:
```json
{
  "AssetType": "video", // 素材类型，必须为 "image" (图片) 或 "video" (视频)
  "URL": "https://your-tos-bucket.tos-cn-beijing.volces.com/path/video.mp4", // 媒体文件的公网可公开直链 URL
  "Name": "我的背景视频素材", // 素材展示名称 (限制在 100 字符内)
  "Description": "用于生成奇幻风格视频的参考底图素材" // 可选，素材描述
}
```
* **响应结果 (Response - JSON)**:
```json
{
  "ResponseMetadata": {
    "RequestId": "20260714101500...",
    "Action": "CreateAsset",
    "Version": "2024-01-01",
    "Service": "ark",
    "Region": "cn-beijing"
  },
  "Result": {
    "Id": "asset-20260714...", // 火山方舟生成的全局唯一素材资产 ID
    "Status": "active" // 状态: active (可用), processing (处理中), failed (失败)
  }
}
```
* **平台特有安全与数据库审计机制**:
  1. **项目隔离隔离**: 网关在转发时，会自动注入或覆盖 `ProjectName` 为系统配置的项目，确保企业资源统一管辖。
  2. **本地回填记录**: 素材创建成功后，网关会**自动在本地数据库建立归属关系**，使该素材归属于您的令牌账户。您可以在系统后台的「我的素材库」直接看到并管理它。

---

### ② 查询素材资产 (GetAsset)
获取单个素材的详细处理状态与详细元数据。
* **URL Action**: `GetAsset`
* **请求体参数 (Request Body - JSON)**:
```json
{
  "Id": "asset-20260714..." // 待查询的素材资产 ID
}
```
* **特殊说明**: 网关实施了严格的数据隔离。非管理员（`admin`）角色仅能查询和调取自己创建的素材资产，否则将返回 `403 Forbidden` 错误。

---

### ③ 删除素材资产 (DeleteAsset)
从火山方舟云端删除特定的素材资产，并同步清理网关本地的归属记录。
* **URL Action**: `DeleteAsset`
* **请求体参数 (Request Body - JSON)**:
```json
{
  "Id": "asset-20260714..." // 待删除的素材资产 ID
}
```
* **响应结果 (Response - JSON)**:
```json
{
  "ResponseMetadata": {
    "RequestId": "20260714102000...",
    "Action": "DeleteAsset",
    "Version": "2024-01-01",
    "Service": "ark",
    "Region": "cn-beijing"
  },
  "Result": {}
}
```
* **特殊说明**: 同样受到用户级所有权验证保护。删除操作会同步彻底地移除网关数据库中的记录并调用火山引擎端执行释放。

---

### ④ 创建素材资产组 (CreateAssetGroup)
火山视频生成模型（例如豆包 Seedance）进行“主体/角色/风格参考”多图生成时，需指定素材组 ID。您可以使用此接口将同类型的多个素材打组管理。
* **URL Action**: `CreateAssetGroup`
* **请求体参数 (Request Body - JSON)**:
```json
{
  "Name": "我的角色参考组", // 素材组名称
  "Description": "用于存放特定人像生成的主体参考图片" // 可选，描述
}
```
* **响应结果 (Response - JSON)**:
```json
{
  "ResponseMetadata": {
    "RequestId": "20260714103000...",
    "Action": "CreateAssetGroup",
    "Version": "2024-01-01",
    "Service": "ark",
    "Region": "cn-beijing"
  },
  "Result": {
    "Id": "group-20260714..." // 火山方舟生成的全局唯一素材资产组 ID
  }
}
```
* **说明**: 创建成功的素材组也会在网关本地进行用户归属校验，保证您只能操作自己创建的资产组。

---

### ⑤ 其他受支持的白名单接口
网关透传并支持火山方舟素材库以下完整的操作：
* `UpdateAsset` (更新素材名称/描述)
* `ListAssets` (列出素材列表)
* `GetAssetGroup` / `UpdateAssetGroup` / `DeleteAssetGroup` / `ListAssetGroups` (素材资产组的查询、修改、删除和列表获取)
