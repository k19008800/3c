# 3cloud API 参考手册

> **最后更新**：2026-07-28
> **版本**：v1.0
> **定位**：面向集成开发者的 API 参考文档，覆盖所有开放端点、认证方式、错误码、限流策略、最佳实践。
> 管理后台 API 请参考各 ref-* 深化文档。

---

## 一、快速开始

### 1.1 基础信息

| 项目 | 值 |
|------|-----|
| Base URL（OpenAI 兼容） | `https://api.unmisa.com/v1` |
| Base URL（Anthropic 兼容） | `https://api.unmisa.com/anthropic` |
| 协议 | HTTPS |
| 格式 | JSON（流式：SSE / Anthropic events） |
| 编码 | UTF-8 |
| 兼容性 | 兼容 OpenAI Chat Completions 与 Anthropic Messages API 格式 |

> **API 域名**：`api.unmisa.com` 是独立对外 API 网关域名（nginx vhost：`deploy/api.unmisa.com.conf`），
> 与官网/控制台（unmisa.com）分离。**该域名可在管理后台配置**：系统设置 → API 服务（`api_domain`，
> 存 `system_config`），门户首页与用户接入引导（API Key 页）实时读取展示。
> OpenAI SDK 用 `https://api.unmisa.com/v1`（SDK 自行拼接 `/chat/completions`），
> Anthropic SDK 用 `https://api.unmisa.com/anthropic`（SDK 自行拼接 `/v1/messages`）。
> 本地开发：`http://localhost:3000`（后端直连）或 `http://localhost:5177`（统一入口代理）。

### 1.2 认证方式

**API Key 认证**（推荐）

```bash
# OpenAI 兼容（Authorization: Bearer）
curl https://api.unmisa.com/v1/chat/completions \
  -H "Authorization: Bearer 3c-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello"}]
  }'

# Anthropic 兼容（x-api-key，Anthropic SDK 风格）
curl https://api.unmisa.com/anthropic/v1/messages \
  -H "x-api-key: 3c-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-chat",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

**SDK 接入示例**

```python
# OpenAI SDK
from openai import OpenAI
client = OpenAI(base_url="https://api.unmisa.com/v1", api_key="3c-xxx")
resp = client.chat.completions.create(model="deepseek-chat", messages=[{"role": "user", "content": "Hi"}])

# Anthropic SDK
from anthropic import Anthropic
client = Anthropic(base_url="https://api.unmisa.com/anthropic", api_key="3c-xxx")
msg = client.messages.create(model="deepseek-chat", max_tokens=1024,
                             messages=[{"role": "user", "content": "Hi"}])
```

**Anthropic 兼容支持范围**：`system` 参数（string/内容块）、文本/image（base64/url）内容块、
`tool_use`/`tool_result`（映射 OpenAI tool_calls/tool 消息）、`tools`（input_schema）、
`stop_sequences`、流式（message_start → content_block_delta → message_delta → message_stop 事件序列）。
请求经网关翻译后转发真实上游（OpenAI 兼容通道），统一记账/扣费/留痕，与 OpenAI 入口完全一致。

**JWT 认证**（用户端 Web 会话）

```
Header: Authorization: Bearer <jwt_token>
Access Token 有效期: 2 小时
Refresh Token 有效期: 7 天
```

---

## 二、模型 & 对话

### 2.1 列出可用模型

```
GET /api/v1/models
```

**响应**

```json
{
  "data": [
    {
      "id": "gpt-4o",
      "object": "model",
      "created": 1700000000,
      "owned_by": "openai",
      "type": "chat",
      "permissions": []
    }
  ]
}
```

### 2.2 对话补全

```
POST /api/v1/chat/completions
```

**请求体**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `model` | string | ✅ | 模型名称（同 List Models 返回的 id）|
| `messages` | array | ✅ | 消息列表，格式同 OpenAI |
| `temperature` | number | 否 | 0-2，默认 1.0 |
| `max_tokens` | integer | 否 | 最大输出 Token 数 |
| `stream` | boolean | 否 | 是否流式输出，默认 false |
| `top_p` | number | 否 | 0-1，默认 1.0 |
| `frequency_penalty` | number | 否 | -2 到 2，默认 0 |
| `presence_penalty` | number | 否 | -2 到 2，默认 0 |

**非流式响应**

```json
{
  "id": "chatcmpl-3c-xxxxxxxx",
  "object": "chat.completion",
  "created": 1700000000,
  "model": "gpt-4o",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "Hello! How can I help you today?"
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 10,
    "total_tokens": 20
  }
}
```

**流式响应（SSE）**

```
data: {"id":"chatcmpl-3c-xxx","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}
data: {"id":"chatcmpl-3c-xxx","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}
data: {"id":"chatcmpl-3c-xxx","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}
data: [DONE]
```

### 2.3 Embedding

```
POST /api/v1/embeddings
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `model` | string | ✅ | embedding 模型名称 |
| `input` | string / array | ✅ | 输入文本或文本数组 |
| `encoding_format` | string | 否 | `float` 或 `base64`，默认 `float` |

---

## 三、用户管理

### 3.1 获取当前用户信息

```
GET /api/v1/me
```

### 3.2 更新用户信息

```
PUT /api/v1/me
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `nickname` | string | 否 | 昵称 |
| `phone` | string | 否 | 手机号 |
| `theme` | string | 否 | `light` / `dark` / `system` |

### 3.3 修改密码

```
POST /api/v1/me/password
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `old_password` | string | ✅ | 当前密码 |
| `new_password` | string | ✅ | 新密码（8-128 位） |

### 3.4 实名认证提交

```
POST /api/v1/me/real-name
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `real_name` | string | ✅ | 真实姓名 |
| `id_number` | string | ✅ | 身份证号 |
| `id_front_image` | string | 否 | 身份证正面图片 URL |
| `id_back_image` | string | 否 | 身份证背面图片 URL |
| `company_name` | string | 否 | 企业名称（企业认证） |
| `company_reg_number` | string | 否 | 统一社会信用代码 |

---

## 四、API Key 管理

### 4.1 列出 API Key

```
GET /api/v1/api-keys
```

### 4.2 创建 API Key

```
POST /api/v1/api-keys
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | ✅ | Key 名称 |
| `rpm_limit` | integer | 否 | 每分钟请求数限制 |
| `tpm_limit` | integer | 否 | 每分钟 Token 限制 |
| `expires_at` | string | 否 | 过期时间 ISO 8601 |
| `allowed_ips` | array | 否 | IP 白名单 |

**响应**

```json
{
  "id": 1,
  "name": "默认 Key",
  "key": "sk-3c-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",  // 仅创建时返回明文
  "key_prefix": "sk-3c-a1b2",
  "status": "active",
  "rpm_limit": 50,
  "tpm_limit": 300000,
  "expires_at": null,
  "allowed_ips": null,
  "created_at": "2026-07-28T10:00:00Z"
}
```

### 4.3 删除 API Key

```
DELETE /api/v1/api-keys/:id
```

### 4.4 更新 API Key

```
PUT /api/v1/api-keys/:id
```

---

## 五、余额 & 充值

### 5.1 查询余额

```
GET /api/v1/me/balance
```

**响应**

```json
{
  "balance": 234.50,
  "total_recharge": 1000.00,
  "total_consumption": 765.50,
  "currency": "CNY"
}
```

### 5.2 创建充值订单

```
POST /api/v1/recharge
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `amount` | number | ✅ | 充值金额（¥） |
| `pay_channel` | string | ✅ | `wechat_scan` / `wechat_jsapi` / `alipay_scan` / `alipay_jsapi` / `bank_transfer` |

**响应**

```json
{
  "order_no": "R20260728001",
  "amount": 100.00,
  "pay_url": "https://pay.example.com/qrcode/xxx",
  "expire_at": "2026-07-28T10:30:00Z"
}
```

### 5.3 余额变动流水

```
GET /api/v1/me/balance-logs
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `page` | integer | 否 | 页码，默认 1 |
| `page_size` | integer | 否 | 每页条数，默认 20 |
| `type` | string | 否 | 筛选类型，如 `recharge` / `consumption` |
| `start_date` | string | 否 | 开始日期 |
| `end_date` | string | 否 | 结束日期 |

---

## 六、调用日志

### 6.1 查询调用记录

```
GET /api/v1/me/call-logs
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `page` | integer | 否 | 页码 |
| `page_size` | integer | 否 | 每页条数 |
| `model` | string | 否 | 筛选模型 |
| `status` | string | 否 | 筛选状态 |
| `start_date` | string | 否 | 开始日期 |
| `end_date` | string | 否 | 结束日期 |
| `sort_by` | string | 否 | 排序字段，默认 `created_at` |
| `sort_order` | string | 否 | `asc` / `desc`，默认 `desc` |

**响应**

```json
{
  "data": [{
    "id": 1000001,
    "model": "gpt-4o",
    "prompt_tokens": 234,
    "completion_tokens": 56,
    "total_tokens": 290,
    "cost": 0.012,
    "duration_ms": 1234,
    "status": "success",
    "created_at": "2026-07-28T10:00:00Z"
  }],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 1523,
    "total_pages": 77
  }
}
```

---

## 七、通知

### 7.1 获取通知列表

```
GET /api/v1/notifications
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `page` | integer | 否 | 页码 |
| `page_size` | integer | 否 | 每页条数，默认 20 |
| `unread_only` | boolean | 否 | 仅未读，默认 false |

### 7.2 标记已读

```
POST /api/v1/notifications/:id/read
```

### 7.3 全部标记已读

```
POST /api/v1/notifications/read-all
```

### 7.4 通知订阅配置

```
GET /api/v1/me/notification-settings
PUT /api/v1/me/notification-settings
```

---

## 八、2FA

### 8.1 开启 2FA

```
POST /api/v1/me/2fa/enable
```

**响应**

```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "qr_code_url": "otpauth://totp/3cloud:user@example.com?secret=xxx&issuer=3cloud",
  "backup_codes": ["xxxx-xxxx", "yyyy-yyyy", ...]
}
```

### 8.2 验证 2FA

```
POST /api/v1/me/2fa/verify
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `code` | string | ✅ | TOTP 6 位验证码 |

### 8.3 关闭 2FA

```
POST /api/v1/me/2fa/disable
```

---

## 九、错误码

### 9.1 标准错误响应

```json
{
  "error": {
    "code": "error_code",
    "message": "人类可读的错误描述",
    "details": {}
  }
}
```

### 9.2 错误码列表

| 错误码 | HTTP 状态码 | 含义 | 处理方式 |
|--------|------------|------|---------|
| `invalid_api_key` | 401 | API Key 不存在 | 检查请求头 Authorization 是否正确 |
| `key_disabled` | 403 | API Key 已被禁用 | 在控制台启用该 Key |
| `key_expired` | 403 | API Key 已过期 | 在控制台续期或创建新 Key |
| `insufficient_balance` | 402 | 余额不足 | 充值后重试 |
| `rate_limit_exceeded` | 429 | 请求频率超限 | 降低请求频率，参考 retry_after |
| `model_not_found` | 404 | 模型不存在 | 检查请求中的 model 参数 |
| `model_unavailable` | 503 | 模型暂时不可用 | 稍后重试或切换到其他模型 |
| `content_filtered` | 400 | 请求命中内容过滤 | 修改请求内容 |
| `ip_not_allowed` | 403 | IP 不在白名单 | 检查 IP 白名单设置 |
| `authentication_required` | 401 | 需要登录 | 使用有效 JWT 或 API Key |
| `invalid_parameters` | 400 | 请求参数错误 | 检查请求体格式 |
| `internal_error` | 500 | 服务器内部错误 | 联系管理员 |
| `service_unavailable` | 503 | 服务暂不可用 | 稍后重试 |

### 9.3 限流错误详情

命中限流时，返回详细的限制信息：

```json
{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "请求频率超限，请稍后重试",
    "limit_type": "user_qps",
    "limit_value": 100,
    "current_value": 156,
    "retry_after": 30
  }
}
```

---

## 十、限流策略

| 级别 | 限制维度 | 默认值 | 说明 |
|------|---------|-------|------|
| L1 全局 | 全系统 QPS | 10000 | 不可超越 |
| L1 全局 | 全系统 TPM | 60000000 | 不可超越 |
| L2 用户 | 用户 QPS | 100 | 管理员可调整 |
| L2 用户 | 用户 TPM | 600000 | 管理员可调整 |
| L3 Key | Key QPS | 50 | 用户可自行调整 |
| L3 Key | Key TPM | 300000 | 用户可自行调整 |
| L4 模型 | 模型 QPS | 2000 | 管理员可调整 |

> 建议：客户端实现指数退避（Exponential Backoff）处理 429 响应

---

## 十一、WebSocket 实时推送

### 11.1 连接

```
wss://api.unmisa.com/ws?token=<jwt_token>
```

### 11.2 事件类型

| 事件类型 | 推送时机 | 接收方 |
|---------|---------|--------|
| `notification` | 新通知到达 | 所有在线用户 |
| `balance_change` | 余额变动 | 该用户 |
| `key_event` | API Key 状态变更 | 该用户 |
| `alert` | 实时告警 | 管理员 |
| `system_announcement` | 系统公告 | 全部在线用户 |

---

## 十二、最佳实践

### 12.1 错误重试

```python
import time
import requests

def call_with_retry(url, headers, body, max_retries=3):
    for attempt in range(max_retries):
        resp = requests.post(url, headers=headers, json=body)
        if resp.status_code == 429:
            retry_after = resp.json()["error"].get("retry_after", 30)
            time.sleep(retry_after)
            continue
        if resp.status_code >= 500:
            time.sleep(2 ** attempt)  # 指数退避
            continue
        return resp
    raise Exception("Max retries exceeded")
```

### 12.2 流式请求

```python
import requests

def stream_chat(url, headers, body):
    body["stream"] = True
    with requests.post(url, headers=headers, json=body, stream=True) as r:
        for line in r.iter_lines():
            if line:
                data = line.decode("utf-8").removeprefix("data: ")
                if data == "[DONE]":
                    break
                yield json.loads(data)
```

### 12.3 连接池管理

- 建议使用 HTTP 连接池（如 `requests.Session` 或 `aiohttp.ClientSession`）
- 建议连接池大小：10-50 个连接
- 避免每次请求都创建新连接

### 12.4 安全建议

1. **API Key 保密**：不要在客户端代码、Git 仓库、公共页面暴露 API Key
2. **IP 白名单**：为 Key 设置 IP 白名单限制
3. **定期轮换**：定期创建新 Key 并废弃旧 Key
4. **监控用量**：设置用量告警，避免意外超支
5. **使用 HTTPS**：始终使用 HTTPS 协议

---

## 十三、版本与兼容性

| 日期 | 版本 | 变更说明 |
|------|------|---------|
| 2026-07-28 | v1.0 | 初始版本，兼容 OpenAI API 格式 |
| 未来 | v2.0 | 计划新增流式优化、批量推理、函数调用增强 |

**兼容性保证**：
- 现有端点不会在未通知的情况下移除
- 新的 API 版本会提供 `v2/` 前缀
- 旧版本 API 至少保持 6 个月可用