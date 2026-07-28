# 开放 API 平台设计 — 深化参考文档

> **对应章节**：PRD-README.md 扩展 — 开放 API 平台
> **状态**：新功能深化 ✅ | **版本**：v1.0 | **最后更新**：2026-07-28
> **定位**：为第三方开发者/合作伙伴提供标准化的 OpenAPI 接口，实现自助接入、鉴权、调用、监控全流程，同时建立 Admin API Key 的完整管理体系。
> **设计原则**：开放 API 与内部 API 同源、权限隔离、限流独立、文档自动生成。
> **粒度**：Admin API Key 管理体系 → 三方应用注册 → OpenAPI 规范 → Rate Limit 策略 → 鉴权流程 → API → 组件 → 配置 → 边界 → 验收

---

## 目录

1. [整体架构](#1-整体架构)
2. [Admin API Key 管理体系](#2-admin-api-key-管理体系)
3. [三方应用注册](#3-三方应用注册)
4. [鉴权与认证流程](#4-鉴权与认证流程)
5. [Rate Limit 策略](#5-rate-limit-策略)
6. [OpenAPI 3.0 规范](#6-openapi-30-规范)
7. [开放 API 接口清单](#7-开放-api-接口清单)
8. [数据表结构](#8-数据表结构)
9. [API 接口规格](#9-api-接口规格)
10. [前端组件 Props](#10-前端组件-props)
11. [运营配置项](#11-运营配置项)
12. [边界条件](#12-边界条件)
13. [验收标准](#13-验收标准)
14. [交叉引用](#14-交叉引用)

---

## 1. 整体架构

### 1.1 分层架构

```
┌────────────────────────────────────────────────────────┐
│  第三方应用 / 合作伙伴                                  │
│  (curl / SDK / Postman / 客户系统)                     │
└──────────────────────┬─────────────────────────────────┘
                       │
                 X-Api-Key header
                       ▼
┌────────────────────────────────────────────────────────┐
│  API Gateway / 开放API入口                              │
│                                                          │
│  POST https://api.unmisa.com/open/v1/*                  │
│  POST https://api.unmisa.com/chat/completions           │
│                                                          │
│  ┌──────────────────────────────────────────┐          │
│  │ 鉴权层                                      │          │
│  │ ├─ Admin API Key 验证 (X-Admin-Key)      │          │
│  │ ├─ API Key 验证 (Authorization: Bearer)  │          │
│  │ └─ 三方应用 Token 验证 (X-App-Token)     │          │
│  └──────────────────────┬───────────────────┘          │
│                         │                                │
│  ┌──────────────────────▼───────────────────┐          │
│  │ Rate Limit 层                               │          │
│  │ ├─ 全局限流 (QPS 1000)                    │          │
│  │ ├─ 管理员 Key 限流 (QPS 200)              │          │
│  │ └─ 三方应用限流 (QPS 50) / 用户级限流      │          │
│  └──────────────────────┬───────────────────┘          │
│                         │                                │
│  ┌──────────────────────▼───────────────────┐          │
│  │ 路由层                                       │          │
│  │ ├─ /open/v1/* → 开放 API 处理器            │          │
│  │ ├─ /chat/completions → 模型代理             │          │
│  │ └─ /admin/* → 管理 API 处理器（需 JWT）     │          │
│  └──────────────────────┬───────────────────┘          │
│                         │                                │
│  ┌──────────────────────▼───────────────────┐          │
│  │ 业务层                                       │          │
│  │ ├─ 账户查询 / 消费明细 / Key 管理          │          │
│  │ └─ 对账 / 报告 / 通知                      │          │
│  └───────────────────────────────────────────┘          │
└──────────────────────────────────────────────────────────┘
```

### 1.2 路由前缀划分

| 前缀 | 鉴权方式 | 使用者 | 说明 |
|------|---------|--------|------|
| `/api/v1/admin/*` | JWT + 角色权限 | 运营后台管理员 | 内部管理 API |
| `/api/v1/admin/*` | X-Admin-Key (可选) | 自动化脚本/CI | Admin Key 替代 JWT |
| `/open/v1/*` | X-Api-Key (三方应用) | 第三方开发者 | 开放 API |
| `/chat/completions` | Authorization: Bearer (用户 Key) | 终端用户 | 模型调用代理 |
| `/api/v1/public/*` | 无鉴权 | 公开访问 | 公开统计/健康检查 |

---

## 2. Admin API Key 管理体系

### 2.1 现状与增强

**现状**（已有实现）：
- `admin_api_keys` 表：name / keyHash / keyPrefix / permissions / status / expiresAt
- `admin_key_usage_logs` 表：keyId / method / path / ip / statusCode / durationMs
- `authenticateAdminKey` 中间件：SHA-256 验证 + 权限检查 + 使用日志
- 权限模型：`module:action` 格式（`*:*` 全权限 / `module:*` 模块通配）

**增强设计**：

| 增强项 | 说明 | 优先级 |
|--------|------|--------|
| Key 生成规范 | 统一前缀 `3c_admin_` + 随机密钥格式 | P0 |
| 到期自动禁用 | cron 检查过期 Key，自动标记 disabled | P0 |
| 使用监控 | 30 天使用统计 / 异常使用检测 | P1 |
| 批量权限编辑 | 支持勾选模块 + 操作组合 | P1 |
| 审计关联 | 每次操作写入 audit_logs | P1 |
| 速率限制 | Admin Key 级别 QPS 控制 | P1 |

### 2.2 Key 格式规范

```
格式: 3c_admin_{prefix}_{random}

示例: 3c_admin_finance_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6

- prefix: 4-8 位小写字母（描述用途，如 finance、ops、cicd）
- random: 40 位字母数字混合（熵 > 200bit）
- 存储: 只存 SHA-256 hash + 前 10 位 visible prefix
- 创建时: 明文 Key 只在创建时返回一次（页面提示复制）
```

### 2.3 权限模型

```
格式: <module>:<action>

模块列表:
  users, finance, vendors, models, agents,
  security, system, audit, stats

操作列表:
  read, write, delete

通配:
  *:*           — 全权限
  finance:*     — 财务模块全部操作
  users:read    — 只读用户信息

预置权限模板:
  ├─ 只读审计 (audit:read, users:read, stats:*)
  ├─ 财务专员 (finance:*)
  ├─ 运营专员 (users:read, agents:read, stats:*)
  └─ 超级管理 (*:*)
```

### 2.4 Key 生命周期

```
创建 (active)
  │
  ├─ 到期 (expiresAt) → expired
  │     ├─ cron 自动标记
  │     └─ 到期前 7 天/1 天站内通知创建人
  │
  ├─ 手动禁用 → disabled
  │     └─ 可重新启用 → active
  │
  └─ 删除 → 物理删除
```

---

## 3. 三方应用注册

### 3.1 应用注册流程

```
开发者 → 登录管理后台 → 应用管理 → 创建应用
    │
    ├─ Step 1: 填写应用名称、描述、回调 URL（可选）
    ├─ Step 2: 勾选 API 权限范围（按模块选择）
    ├─ Step 3: 设置 IP 白名单（可选）
    ├─ Step 4: 提交 → 生成 App ID + App Secret
    └─ Step 5: 保存 Secret（仅展示一次）

流程图:
  注册 → 审核（可选）→ 获取 App Key → 调用 API
```

### 3.2 应用 SDK

```
支持语言:
  ├─ TypeScript/JavaScript: @3cloud/api-sdk
  ├─ Python: 3cloud-api-sdk
  ├─ curl 示例（文档提供）
  └─ Postman 集合（一键导入）

SDK 核心方法:
  ├─ 鉴权（自动获取/刷新 Token）
  ├─ 账户查询（余额、消费）
  ├─ Key 管理（创建/列出/删除）
  ├─ 调用统计（时段/模型维度）
  └─ 错误处理（automatic retry）
```

---

## 4. 鉴权与认证流程

### 4.1 鉴权方式对比

| 鉴权方式 | Header | 适用场景 | 状态 |
|---------|--------|---------|------|
| JWT (Bearer) | `Authorization: Bearer <jwt>` | 管理后台 Web | ✅ 已有 |
| Admin API Key | `X-Admin-Key: <key>` | 自动化脚本/CI | ✅ 已有 |
| 用户 API Key | `Authorization: Bearer <key>` | 模型调用 | ✅ 已有 |
| 三方应用 Token | `X-App-Token: <token>` | 第三方开发者 | 新增 |
| IP 白名单 | — | 高安全场景 | 新增 |

### 4.2 Admin API Key 鉴权流程（已有）

```
请求 → authenticateAdminKey 中间件
    │
    ├─ 检查 X-Admin-Key header
    │   ├─ 无 → 跳过（降级到 JWT）
    │   └─ 有 → 继续
    │
    ├─ SHA-256 hash 查询 admin_api_keys
    │   ├─ 未找到 → 401
    │   ├─ status=disabled → 403
    │   └─ expiresAt < now → 403
    │
    ├─ 权限检查（module:action 匹配）
    │   ├─ 无权限 → 403 + 日志记录
    │   └─ 有权限 → 继续
    │
    ├─ 记录使用日志（异步）
    ├─ 更新 lastUsedAt（异步）
    └─ 注入 request.adminKey → 继续处理
```

### 4.3 三方应用鉴权流程（新增）

```
请求 → authenticateAppToken 中间件
    │
    ├─ 检查 X-App-Token header
    │   └─ 无 → 401
    │
    ├─ 查询 third_party_apps 表
    │   ├─ appKey 匹配
    │   ├─ status=active
    │   ├─ IP 在白名单中（如配置）
    │   └─ expiresAt 未过期
    │
    ├─ 检查 QPS（Redis 滑动窗口）
    │   └─ 超限 → 429
    │
    └─ 注入 request.appContext → 继续处理
```

### 4.4 Token 生成与续期

```
短期 Token:
  ├─ 有效期: 24 小时
  ├─ 用 App Secret 签名 (HMAC-SHA256)
  └─ 过期后通过 App ID + App Secret 重新获取

续期 API:
  POST /open/v1/auth/token
  Headers:
    X-App-Id: <appId>
    X-App-Secret: <appSecret>
  Response:
    token: string
    expiresIn: number (秒)
    tokenType: "Bearer"

SDK 自动处理:
  ├─ 自动缓存 Token
  └─ 过期前 5 分钟自动续期
```

---

## 5. Rate Limit 策略

### 5.1 限流层级

```
限流层级（从高到低）:
  ┌─ Level 0: 全局兜底
  │    全局 QPS: 1000 (所有请求加起来)
  │    全局 TPM: 10,000,000 (10M Token/min)
  │
  ├─ Level 1: API Key 级别（模型调用用户）
  │    个人用户: RPM=60,  TPM=100,000
  │    企业用户: RPM=300, TPM=500,000
  │
  ├─ Level 2: Admin API Key 级别（管理操作）
  │    默认:     RPM=200
  │    *:* 权限: RPM=500
  │
  └─ Level 3: 三方应用级别（开放 API）
       基础套餐: RPM=50
       高级套餐: RPM=200
       企业套餐: RPM=1000 (需审批)
```

### 5.2 限流维度

| 维度 | 说明 | 实现 |
|------|------|------|
| QPS (每秒请求数) | 1 秒窗口，精确控制 | Redis + Lua 脚本 |
| RPM (每分钟请求数) | 1 分钟滑动窗口 | Redis Sorted Set |
| TPM (每分钟 Token 数) | 模型调用专用 | Redis Sorted Set |
| 并发数 (Concurrency) | 同时处理中的请求数 | Redis Counter |
| 每日请求数 (Daily) | 24 小时窗口 | Redis + TTL |

### 5.3 限流响应

```
成功:
  200/201 正常响应

超限:
  429 Too Many Requests
  {
    "code": 429,
    "data": null,
    "message": "请求频率超限，请稍后重试",
    "retryAfter": 5
  }

Headers:
  X-RateLimit-Limit: 200
  X-RateLimit-Remaining: 15
  X-RateLimit-Reset: 1701234567
  Retry-After: 5
```

### 5.4 限流配置管理

```typescript
// system_configs 中的限流配置
interface RateLimitConfig {
  // 全局
  globalQps: number;          // 1000
  globalTpm: number;          // 10000000

  // Admin API Key
  adminKeyDefaultRpm: number; // 200
  adminKeySuperRpm: number;   // 500

  // 三方应用套餐
  appPlanBasicRpm: number;    // 50
  appPlanAdvancedRpm: number; // 200
  appPlanEnterpriseRpm: number; // 1000

  // 用户（模型调用，已有）
  personalRpm: number;        // 60
  personalTpm: number;        // 100000
  enterpriseRpm: number;      // 300
  enterpriseTpm: number;      // 500000
}
```

### 5.5 限流实现增强

基于已有 `rate-limit.ts` 中间件，增加：

```typescript
// 新增的限流中间件
export async function rateLimitOpenApi(request: FastifyRequest, reply: FastifyReply) {
  const redis = getRedis();
  const windowSeconds = 60;
  const now = Date.now();

  // 区分身份
  const identity = request.adminKey
    ? `admin:${request.adminKey.id}`
    : request.appContext
    ? `app:${request.appContext.appId}`
    : `unknown:${request.ip}`;

  // 滑动窗口 RPM 检查
  const rpmKey = `rl:open:rpm:${identity}`;
  await redis.zRemRangeByScore(rpmKey, 0, now - windowSeconds * 1000);
  const count = await redis.zCard(rpmKey);

  const limit = getLimitForIdentity(request); // 根据身份获取限流值
  if (count >= limit) {
    const oldest = await redis.zRange(rpmKey, 0, 0, { withScores: true });
    const retryAfter = oldest.length > 0
      ? Math.ceil((oldest[0].score - now + windowSeconds * 1000) / 1000)
      : windowSeconds;

    reply.status(429).header("Retry-After", retryAfter).send({
      code: 429,
      data: null,
      message: "请求频率超限，请稍后重试",
      retryAfter,
    });
    return;
  }

  await redis.zAdd(rpmKey, { score: now, value: `${now}:${randomId()}` });
  await redis.expire(rpmKey, windowSeconds + 10);

  // 设置响应头
  reply.header("X-RateLimit-Limit", limit);
  reply.header("X-RateLimit-Remaining", limit - count - 1);
  reply.header("X-RateLimit-Reset", Math.ceil((now + windowSeconds * 1000) / 1000));
}
```

---

## 6. OpenAPI 3.0 规范

### 6.1 规范生成方案

```
方案: 通过 fastify-swagger 插件自动生成 OpenAPI 3.0 规范
  └─ 在路由定义中增加 schema 声明
  └─ 自动合并为 openapi.json
  └─ 提供公开端点: GET /open/v1/openapi.json
  └─ 集成 Swagger UI: GET /open/v1/docs

路由声明示例:
  app.get("/open/v1/account/balance", {
    schema: {
      tags: ["账户"],
      summary: "查询账户余额",
      security: [{ ApiKeyAuth: [] }],
      response: {
        200: {
          type: "object",
          properties: {
            code: { type: "integer" },
            data: {
              type: "object",
              properties: {
                balance: { type: "integer", description: "余额(分)" },
                currency: { type: "string" }
              }
            }
          }
        }
      }
    }
  }, handler);
```

### 6.2 规范版本管理

```
openapi.json 版本:
  └─ 跟随 API 版本: /open/v1/openapi.json
  └─ 每次部署自动重新生成
  └─ 历史版本保留: /open/v1/openapi.v1.2.json

变更管理:
  └─ 向后兼容变更: 新增字段/端点 → 小版本号增加
  └─ 非向后兼容变更: 新版本路由 /open/v2/* → 大版本号增加
  └─ 废弃端点: 保留但标记 deprecated，至少维护 6 个月
```

### 6.3 API 文档站点

```
URL: https://api.unmisa.com/open/v1/docs

├─ 页面: Swagger UI（或 Scalar 更美观的替代）
├─ 内容:
│   ├─ 所有开放 API 端点列表
│   ├─ 请求/响应 Schema
│   ├─ 错误码说明
│   ├─ Rate Limit 说明
│   ├─ 鉴权方式说明
│   └─ Try it out（在线调试）
```

---

## 7. 开放 API 接口清单

### 7.1 账户管理

| 方法 | 路径 | 说明 | 鉴权 | 限流 |
|------|------|------|------|------|
| GET | `/open/v1/account/profile` | 账户信息 | App Token | 基础 |
| GET | `/open/v1/account/balance` | 余额查询 | App Token | 基础 |
| GET | `/open/v1/account/consumption` | 消费汇总 | App Token | 基础 |
| GET | `/open/v1/account/consumption/detail` | 消费明细 | App Token | 基础 |

### 7.2 API Key 管理

| 方法 | 路径 | 说明 | 鉴权 | 限流 |
|------|------|------|------|------|
| GET | `/open/v1/keys` | Key 列表 | App Token | 基础 |
| POST | `/open/v1/keys` | 创建 Key | App Token | 基础 |
| DELETE | `/open/v1/keys/:id` | 删除 Key | App Token | 基础 |
| PATCH | `/open/v1/keys/:id` | 更新 Key (名称/状态) | App Token | 基础 |
| GET | `/open/v1/keys/:id/stats` | Key 调用统计 | App Token | 基础 |

### 7.3 模型与供应商

| 方法 | 路径 | 说明 | 鉴权 | 限流 |
|------|------|------|------|------|
| GET | `/open/v1/models` | 可用模型列表 | App Token | 基础 |
| GET | `/open/v1/models/:id` | 模型详情 | App Token | 基础 |
| GET | `/open/v1/models/:id/pricing` | 模型定价 | App Token | 基础 |

### 7.4 消费与账单

| 方法 | 路径 | 说明 | 鉴权 | 限流 |
|------|------|------|------|------|
| GET | `/open/v1/bills` | 账单列表 | App Token | 基础 |
| GET | `/open/v1/bills/:id` | 账单详情 | App Token | 基础 |
| GET | `/open/v1/bills/:id/download` | 下载账单 PDF | App Token | 基础 |

### 7.5 调用统计

| 方法 | 路径 | 说明 | 鉴权 | 限流 |
|------|------|------|------|------|
| GET | `/open/v1/stats/summary` | 调用汇总 | App Token | 基础 |
| GET | `/open/v1/stats/trends` | 调用趋势 | App Token | 基础 |
| GET | `/open/v1/stats/model-distribution` | 模型分布 | App Token | 基础 |
| GET | `/open/v1/stats/error-analysis` | 错误分析 | App Token | 基础 |

### 7.6 通知与告警（可选）

| 方法 | 路径 | 说明 | 鉴权 | 限流 |
|------|------|------|------|------|
| GET | `/open/v1/notifications` | 通知列表 | App Token | 基础 |
| PATCH | `/open/v1/notifications/:id/read` | 标记已读 | App Token | 基础 |
| POST | `/open/v1/notifications/webhook` | 配置 Webhook 回调 | App Token | 高级 |

### 7.7 认证

| 方法 | 路径 | 说明 | 鉴权 | 限流 |
|------|------|------|------|------|
| POST | `/open/v1/auth/token` | 获取 Token | App ID + Secret | RPM 10 |
| POST | `/open/v1/auth/refresh` | 刷新 Token | App Token | RPM 10 |

### 7.8 公开接口（无需鉴权）

| 方法 | 路径 | 说明 | 限流 |
|------|------|------|------|
| GET | `/open/v1/openapi.json` | OpenAPI 规范 | RPM 60 |
| GET | `/open/v1/docs` | API 文档页面 | RPM 60 |
| GET | `/api/v1/public/stats` | 公开统计 | RPM 30 |

---

## 8. 数据表结构

### 8.1 `admin_api_keys` — 管理 API Key（已有，增强）

```typescript
export const adminApiKeys = pgTable("admin_api_keys", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: varchar("description", { length: 512 }),         // 新增
  keyHash: varchar("key_hash", { length: 64 }).notNull().unique(),
  keyPrefix: varchar("key_prefix", { length: 10 }).notNull(),
  permissions: jsonb("permissions").notNull().default([]),
  status: adminApiKeyStatusEnum("status").notNull().default("active"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  hashIdx: uniqueIndex("admin_api_keys_hash_idx").on(table.keyHash),
  statusIdx: index("admin_api_keys_status_idx").on(table.status),
}));
```

### 8.2 `admin_key_usage_logs` — 管理 Key 使用日志（已有）

> 见 admin.ts

### 8.3 `third_party_apps` — 三方应用（新增）

```typescript
export const thirdPartyApps = pgTable("third_party_apps", {
  id: serial("id").primaryKey(),
  appName: varchar("app_name", { length: 128 }).notNull(),
  appDescription: varchar("app_description", { length: 1024 }),
  appId: varchar("app_id", { length: 32 }).notNull().unique(),   // 3c_app_xxxxxxxx
  appSecretHash: varchar("app_secret_hash", { length: 64 }).notNull(),
  status: varchar("status", { length: 12 }).notNull().default("pending"),
    // pending | active | suspended | revoked
  plan: varchar("plan", { length: 16 }).notNull().default("basic"),
    // basic | advanced | enterprise
  permissions: jsonb("permissions").notNull().default([]),       // module:action 格式
  ipWhitelist: varchar("ip_whitelist", { length: 1024 }).array(), // IP 白名单
  webhookUrl: varchar("webhook_url", { length: 512 }),           // 回调通知
  ownerId: integer("owner_id").notNull().references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  appIdIdx: uniqueIndex("tp_apps_app_id_idx").on(table.appId),
  ownerIdx: index("tp_apps_owner_idx").on(table.ownerId),
  statusIdx: index("tp_apps_status_idx").on(table.status),
}));
```

### 8.4 `third_party_app_tokens` — 应用 Token（新增）

```typescript
export const thirdPartyAppTokens = pgTable("third_party_app_tokens", {
  id: serial("id").primaryKey(),
  appId: integer("app_id").notNull().references(() => thirdPartyApps.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => ({
  tokenHashIdx: uniqueIndex("tp_app_tokens_hash_idx").on(table.tokenHash),
  appIdIdx: index("tp_app_tokens_app_id_idx").on(table.appId),
}));
```

### 8.5 `third_party_app_usage_logs` — 应用使用日志（新增）

```typescript
export const thirdPartyAppUsageLogs = pgTable("third_party_app_usage_logs", {
  id: serial("id").primaryKey(),
  appId: integer("app_id").notNull().references(() => thirdPartyApps.id, { onDelete: "cascade" }),
  method: varchar("method", { length: 10 }).notNull(),
  path: varchar("path", { length: 500 }).notNull(),
  ip: varchar("ip", { length: 45 }),
  statusCode: integer("status_code"),
  durationMs: integer("duration_ms"),
  qpsConsumed: integer("qps_consumed").default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tpAppUsageAppIdIdx: index("tp_app_usage_app_id_idx").on(table.appId),
  tpAppUsageCreatedAtIdx: index("tp_app_usage_created_at_idx").on(table.appId, table.createdAt.desc()),
}));
```

### 8.6 ER 关系

```
admin_api_keys 1 ── N admin_key_usage_logs
users          1 ── N third_party_apps
third_party_apps 1 ── N third_party_app_tokens
third_party_apps 1 ── N third_party_app_usage_logs
```

---

## 9. API 接口规格

### 9.1 Admin API Key 管理

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/api-keys` | 管理 Key 列表 | system:read |
| GET | `/api/v1/admin/api-keys/:id` | Key 详情 | system:read |
| POST | `/api/v1/admin/api-keys` | 创建 Key | system:write |
| PATCH | `/api/v1/admin/api-keys/:id` | 更新 Key | system:write |
| DELETE | `/api/v1/admin/api-keys/:id` | 删除 Key | system:delete |
| POST | `/api/v1/admin/api-keys/:id/regenerate` | 重新生成 Key | system:write |
| GET | `/api/v1/admin/api-keys/:id/usage-logs` | 使用日志 | system:read |
| GET | `/api/v1/admin/api-keys/:id/usage-stats` | 使用统计 | system:read |

**POST /admin/api-keys 请求体**：

```typescript
{
  name: string;               // Key 名称
  description?: string;       // 描述
  permissions: string[];      // ["users:read", "finance:*"]
  expiresAt?: string;         // ISO 时间，不传=永不过期
}
```

**POST /admin/api-keys 响应**：

```typescript
{
  code: 0;
  data: {
    id: number;
    name: string;
    keyPrefix: string;         // 前缀
    plainKey: string;          // ⚠️ 创建时唯一返回
    permissions: string[];
    expiresAt?: string;
    createdAt: string;
  };
  message: "ok";
}
```

### 9.2 三方应用管理

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/third-party-apps` | 应用列表 | system:read |
| GET | `/api/v1/admin/third-party-apps/:id` | 应用详情 | system:read |
| POST | `/api/v1/admin/third-party-apps` | 创建应用 | system:write |
| PATCH | `/api/v1/admin/third-party-apps/:id` | 更新应用 | system:write |
| DELETE | `/api/v1/admin/third-party-apps/:id` | 删除应用 | system:delete |
| PATCH | `/api/v1/admin/third-party-apps/:id/status` | 变更状态 | system:write |
| GET | `/api/v1/admin/third-party-apps/:id/usage-stats` | 使用统计 | system:read |
| POST | `/api/v1/admin/third-party-apps/:id/regenerate-secret` | 重生成 Secret | system:write |

### 9.3 开发者自助（前端页面调用）

| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| GET | `/api/v1/user/apps` | 我的应用列表 | JWT |
| POST | `/api/v1/user/apps` | 创建应用 | JWT |
| PATCH | `/api/v1/user/apps/:id` | 更新应用 | JWT |
| DELETE | `/api/v1/user/apps/:id` | 删除应用 | JWT |
| POST | `/api/v1/user/apps/:id/regenerate-secret` | 重生成 Secret | JWT |
| GET | `/api/v1/user/apps/:id/usage-logs` | 使用日志 | JWT |

### 9.4 开放 API

| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| GET | `/open/v1/account/profile` | 账户信息 | App Token |
| GET | `/open/v1/account/balance` | 余额查询 | App Token |
| GET | `/open/v1/account/consumption` | 消费汇总 | App Token |
| GET | `/open/v1/account/consumption/detail` | 消费明细 | App Token |
| GET | `/open/v1/keys` | Key 列表 | App Token |
| POST | `/open/v1/keys` | 创建 Key | App Token |
| DELETE | `/open/v1/keys/:id` | 删除 Key | App Token |
| PATCH | `/open/v1/keys/:id` | 更新 Key | App Token |
| GET | `/open/v1/keys/:id/stats` | Key 统计 | App Token |
| GET | `/open/v1/models` | 模型列表 | App Token |
| GET | `/open/v1/models/:id` | 模型详情 | App Token |
| GET | `/open/v1/models/:id/pricing` | 模型定价 | App Token |
| GET | `/open/v1/bills` | 账单列表 | App Token |
| GET | `/open/v1/bills/:id` | 账单详情 | App Token |
| GET | `/open/v1/bills/:id/download` | 下载 PDF | App Token |
| GET | `/open/v1/stats/summary` | 调用汇总 | App Token |
| GET | `/open/v1/stats/trends` | 调用趋势 | App Token |
| GET | `/open/v1/stats/model-distribution` | 模型分布 | App Token |
| GET | `/open/v1/stats/error-analysis` | 错误分析 | App Token |
| POST | `/open/v1/auth/token` | 获取 Token | App ID + Secret |
| POST | `/open/v1/auth/refresh` | 刷新 Token | App Token |
| GET | `/open/v1/openapi.json` | OpenAPI 规范 | 公开 |
| GET | `/open/v1/docs` | API 文档 | 公开 |

### 9.5 统一响应格式

```
成功:
  {
    code: 0,
    data: { ... },
    message: "ok"
  }

错误:
  {
    code: 400,     // HTTP Status Code
    data: null,
    message: "无效的请求参数",
    errorCode: "INVALID_PARAM"   // 业务错误码
  }
```

### 9.6 错误码表

| HTTP | errorCode | 说明 |
|------|-----------|------|
| 400 | `INVALID_PARAM` | 请求参数错误 |
| 401 | `UNAUTHORIZED` | 未认证 |
| 401 | `INVALID_TOKEN` | Token 无效/已过期 |
| 403 | `FORBIDDEN` | 权限不足 |
| 403 | `IP_NOT_ALLOWED` | IP 不在白名单 |
| 403 | `APP_SUSPENDED` | 应用已被暂停 |
| 404 | `NOT_FOUND` | 资源不存在 |
| 409 | `CONFLICT` | 资源冲突（如同名 Key）|
| 429 | `RATE_LIMIT_EXCEEDED` | 请求频率超限 |
| 500 | `INTERNAL_ERROR` | 服务内部错误 |
| 502 | `UPSTREAM_ERROR` | 上游供应商错误 |
| 503 | `SERVICE_UNAVAILABLE` | 服务暂不可用 |

---

## 10. 前端组件 Props

### 10.1 AdminApiKeyList — 管理 API Key 列表页

```typescript
interface AdminApiKeyListProps {
  // 路由页面，无外部 props
}

// 内部子组件
interface AdminApiKeyCardProps {
  id: number;
  name: string;
  description?: string;
  keyPrefix: string;
  permissions: string[];
  status: string;
  expiresAt?: string;
  lastUsedAt?: string;
  usageCount: number;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  onRegenerate: (id: number) => void;
  onToggleStatus: (id: number, currentStatus: string) => void;
}

interface AdminApiKeyCreateFormProps {
  onSubmit: (data: CreateAdminKeyRequest) => Promise<{ plainKey: string }>;
  onCancel: () => void;
}

interface AdminApiKeyCreatedDialogProps {
  plainKey: string;
  onClose: () => void;
  // ⚠️ 仅展示一次，需用户手动复制
}
```

### 10.2 AdminApiKeyUsagePanel — Key 使用统计面板

```typescript
interface AdminApiKeyUsagePanelProps {
  keyId: number;
}

interface ApiKeyUsageChartProps {
  data: {
    date: string;
    requestCount: number;
    errorCount: number;
    avgDuration: number;
  }[];
}
```

### 10.3 ThirdPartyAppManager — 三方应用管理页

```typescript
interface ThirdPartyAppManagerProps {
  view: "admin" | "user";          // 管理后台视角 vs 开发者视角
}

interface AppCardProps {
  id: number;
  appName: string;
  appId: string;
  status: string;
  plan: string;
  permissions: string[];
  lastUsedAt?: string;
  usageQuota: { used: number; limit: number };  // QPS 使用情况
  onView: (id: number) => void;
  onEdit: (id: number) => void;
  onRegenerateSecret: (id: number) => void;
}

interface AppDetailProps {
  appId: number;
  onBack: () => void;
}

interface AppCreateFormProps {
  onSubmit: (data: CreateAppRequest) => Promise<{ appId: string; appSecret: string }>;
  onCancel: () => void;
}

interface AppCreatedDialogProps {
  appId: string;
  appSecret: string;
  onClose: () => void;
}
```

### 10.4 OpenApiDocPage — API 文档页

```typescript
interface OpenApiDocPageProps {
  // 嵌入 Swagger UI / Scalar 的容器页面
  specUrl: string;    // "/open/v1/openapi.json"
}
```

### 10.5 DeveloperConsole — 开发者控制台

```typescript
interface DeveloperConsoleProps {
  userId: number;
  // 开发者自己的应用管理、Key 管理、消费查看
}

interface ApiTestPlaygroundProps {
  specUrl: string;
  // 内嵌的 API 在线调试工具
}
```

---

## 11. 运营配置项

| 配置项 | 路径 | 类型 | 默认值 | 说明 |
|-------|------|------|--------|------|
| Admin Key 启用 | `site_configs.admin_api_key.enabled` | boolean | true | 是否允许 X-Admin-Key 鉴权 |
| 三方应用启用 | `site_configs.third_party_apps.enabled` | boolean | true | 是否允许三方应用注册 |
| 开放 API 启用 | `site_configs.open_api.enabled` | boolean | true | 开放 API 开关 |
| 全局 QPS | `site_configs.rate_limit.global_qps` | int | 1000 | 所有请求全局限流 |
| Admin Key 默认 RPM | `site_configs.rate_limit.admin_key_default_rpm` | int | 200 | — |
| Admin Key 超级 RPM | `site_configs.rate_limit.admin_key_super_rpm` | int | 500 | *:* 权限 Key |
| 应用基础套餐 RPM | `site_configs.rate_limit.app_plan_basic_rpm` | int | 50 | — |
| 应用高级套餐 RPM | `site_configs.rate_limit.app_plan_advanced_rpm` | int | 200 | — |
| 应用企业套餐 RPM | `site_configs.rate_limit.app_plan_enterprise_rpm` | int | 1000 | — |
| 应用注册审核 | `site_configs.third_party_apps.require_approval` | boolean | false | 注册后是否需要审核 |
| 应用 Token 有效期 | `site_configs.third_party_apps.token_expire_hours` | int | 24 | Token 时效 |
| Admin Key 到期提醒 | `site_configs.admin_api_key.expiry_notify_days` | int[] | [7, 1] | 到期前提醒天数 |

---

## 12. 边界条件

### 12.1 鉴权边界

| # | 边界场景 | 处理策略 |
|---|---------|---------|
| B1 | X-Admin-Key 和 JWT 同时存在 | Admin Key 优先，跳过 JWT |
| B2 | Admin Key hash 碰撞 | SHA-256 + unique 约束，理论不可能 |
| B3 | 创建 Key 时忘记复制明文 | 不可找回，只能重新生成 |
| B4 | Token 在边缘时间过期 | 客户端提前 5 分钟续期，过期后返回 401 |
| B5 | 三方应用 IP 变动 | 未在白名单内返回 403+IP_NOT_ALLOWED |

### 12.2 限流边界

| # | 边界场景 | 处理策略 |
|---|---------|---------|
| B6 | Redis 宕机导致限流失效 | 降级为本地内存限流（不精确但兜底）|
| B7 | 分布式环境中限流计数器不一致 | Redis 中心化存储，一致性由 Redis 保证 |
| B8 | 短时突增流量 | 限流后返回 429，Retry-After 头部指示等待时间 |
| B9 | 限流阈值过低 | 运营可在 system_configs 调整，实时生效 |

### 12.3 开放 API 边界

| # | 边界场景 | 处理策略 |
|---|---------|---------|
| B10 | 请求非开放 API 路径（如 /admin）| 三应用 Token 无权限访问，返回 403 |
| B11 | OpenAPI 规范与实现不同步 | 构建时自动生成，CI 检查差异 |
| B12 | SDK 版本落后于 API | 保持向后兼容，废弃端点前发布迁移指南 |
| B13 | 并发创建同名应用 | 应用名称+所有者唯一：uk_app_name_owner |

### 12.4 数据边界

| # | 边界场景 | 处理策略 |
|---|---------|---------|
| B14 | admin_key_usage_logs 表增长过快 | TTL 保留 90 天，定期归档 |
| B15 | 三方应用数量过多 | 每用户上限 20 个（system_configs 配置）|
| B16 | 应用 Secret 泄密 | 可随时重新生成，旧 Secret 立即失效 |

---

## 13. 验收标准

### 13.1 Admin API Key

| # | 验收项 | 通过标准 |
|---|-------|---------|
| AC1 | 创建 Admin Key | 返回明文 Key（仅一次），权限配置正常 |
| AC2 | 鉴权验证 | X-Admin-Key 鉴权通过，无 Key 降级 JWT |
| AC3 | 权限检查 | 无权限操作返回 403 + 具体权限名 |
| AC4 | Key 禁用/启用 | 禁用后立即失效，启用后恢复 |
| AC5 | Key 过期自动禁用 | cron 检测到期 Key 并标记 disabled |
| AC6 | 使用日志 | 每次请求记录 method/path/ip/statusCode |
| AC7 | 重新生成 | 新 Key 生效，旧 Key 立即失效 |

### 13.2 三方应用

| # | 验收项 | 通过标准 |
|---|-------|---------|
| AC8 | 应用注册 | 创建成功，返回 App ID + Secret |
| AC9 | Token 获取 | App ID+Secret 换取 Token 正常 |
| AC10 | Token 续期 | 续期后新 Token 有效，旧 Token 过期 |
| AC11 | 开放 API 调用 | Token 鉴权通过，返回正确数据 |
| AC12 | IP 白名单 | 白名单外 IP 返回 403 |
| AC13 | 应用暂停/恢复 | 暂停后 Token 失效，恢复后正常 |

### 13.3 Rate Limit

| # | 验收项 | 通过标准 |
|---|-------|---------|
| AC14 | Admin Key 限流 | 超限返回 429 + Retry-After |
| AC15 | 应用限流 | 不同套餐正确限流 |
| AC16 | 全局限流 | 全局 QPS 超限后全量限流 |
| AC17 | 限流恢复 | Retry-After 后请求恢复正常 |

### 13.4 OpenAPI 文档

| # | 验收项 | 通过标准 |
|---|-------|---------|
| AC18 | 规范生成 | `/open/v1/openapi.json` 格式正确 |
| AC19 | 文档站点 | `/open/v1/docs` 正常展示 |
| AC20 | Try it out | 在线调试功能正常 |
| AC21 | 版本管理 | 历史版本可访问 |

---

## 14. 交叉引用

| 关联模块 | 文档 | 关系 |
|---------|------|------|
| 鉴权中间件 | `middleware/adminKeyAuth.ts` | Admin Key 鉴权实现 |
| 鉴权中间件 | `middleware/rate-limit.ts` | 现有限流中间件 |
| 鉴权中间件 | `middleware/api-key-auth.ts` | 用户 API Key 鉴权 |
| 鉴权中间件 | `middleware/auth.ts` | JWT 鉴权 |
| 系统配置 | `ref-4.8-system-config.md` | 限流/API 配置项存储 |
| 审计日志 | `ref-4.13-operation-timeline.md` | Admin Key 操作写入审计 |
| 安全风控 | `ref-4.6-security.md` | IP 白名单 + 异常使用检测 |
| 用户管理 | `ref-2.1-roles-permissions.md` | 权限模型复用 |
| 监控日志 | `ref-4.7-monitor-logs.md` | 调用日志与错误分析 |
