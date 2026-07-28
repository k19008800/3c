# 开放 API 平台 — 设计文档

> **对应章节**：运营版 PRD 新增模块 — 开放 API 平台
> **状态**：完整设计 ✅ | **版本**：v1.0 | **最后更新**：2026-07-28
> **定位**：面向第三方开发者/合作伙伴的开放 API 体系，提供标准化的管理接口、文档门户、限流策略和鉴权机制。
> **设计原则**：复用现有 `adminApiKeys` 鉴权体系，在开放 API 和内部 API 之间建立清晰的边界和治理规则。
> **粒度**：数据模型 → API 网关 → 鉴权 → 限流 → OpenAPI 规范 → 文档门户 → 代码生成 → API → 组件 → 配置 → 边界 → 验收

---

## 目录

1. [设计目标与范围](#1-设计目标与范围)
2. [架构总览](#2-架构总览)
3. [Admin API Key 管理体系](#3-admin-api-key-管理体系)
4. [API 鉴权与安全](#4-api-鉴权与安全)
5. [Rate Limit 策略](#5-rate-limit-策略)
6. [OpenAPI 3.0 规范](#6-openapi-30-规范)
7. [API 文档门户](#7-api-文档门户)
8. [开放 API 端点清单](#8-开放-api-端点清单)
9. [API 版本管理](#9-api-版本管理)
10. [SDK/代码生成](#10-sdk代码生成)
11. [数据表结构](#11-数据表结构)
12. [API 接口规格](#12-api-接口规格)
13. [前端组件 Props](#13-前端组件-props)
14. [运营配置项](#14-运营配置项)
15. [边界条件](#15-边界条件)
16. [验收标准](#16-验收标准)
17. [交叉引用](#17-交叉引用)

---

## 1. 设计目标与范围

### 1.1 目标

| # | 目标 | 说明 |
|---|------|------|
| 1 | 对外提供标准化管理 API | 第三方开发者可通过 API 管理用户、查询财务、操作供应商等 |
| 2 | 完善的鉴权与权限体系 | 基于 Admin API Key 的细粒度权限控制，支持 RBAC |
| 3 | 多级限流策略 | 按 Key 级别、操作级别、全局级别多维限流 |
| 4 | 自动化 API 文档生成 | 基于 OpenAPI 3.0 规范的文档门户，支持在线调试 |
| 5 | 使用审计与监控 | 记录所有 API 调用，支持用量分析、异常检测 |

### 1.2 范围

| 包含 | 不包含 |
|------|--------|
| Admin API Key 完整生命周期管理 | 用户端 API Key 管理（已有独立体系）|
| 开放 API 端点定义与版本管理 | 供应商 API 代理转发（已有路由系统）|
| Rate Limit 策略（Key 级别 + 操作级别） | 模型调用计费（已有计费系统）|
| OpenAPI 3.0 规范自动生成 | 第三方 OAuth/SSO 集成 |
| 文档门户（在线调试 + 代码示例） | API 市场 / 应用商店 |
| API 使用统计与审计日志 | 多语言 SDK 生成（仅设计规范） |

---

## 2. 架构总览

### 2.1 逻辑分层

```
┌─────────────────────────────────────────────────────────────────────┐
│                          第三方开发者 / 合作伙伴                      │
│                      (X-Admin-Key header)                           │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────────┐
│                         API 网关层                                    │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  1. 解析 X-Admin-Key → 查找 adminApiKeys 表 (SHA-256)       │    │
│  │  2. 检查 Key 状态 (active/disabled/expired)                 │    │
│  │  3. 检查请求路径 → 推断模块+操作 → 权限校验                  │    │
│  │  4. Rate Limit 检查 (Key 级别 → 操作级别 → 全局级别)         │    │
│  │  5. 记录使用日志 (异步, 不阻塞响应)                          │    │
│  └─────────────────────────────────────────────────────────────┘    │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────────┐
│                     API 路由层 (Fastify)                             │
│                                                                       │
│  /api/v1/admin/users         内部管理路由 (JWT + Admin Key 混合)      │
│  /api/v1/admin/finance       内部管理路由 (JWT + Admin Key 混合)      │
│  /api/v2/users               ⭐ 开放 API 路由 (Admin Key 专属)        │
│  /api/v2/finance/revenue     ⭐ 开放 API 路由 (Admin Key 专属)        │
│  ...                                                                  │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────────┐
│                     后端服务层 (现有 services/)                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 路由策略

```
内部 API 和开放 API 的区分：

内部 API  (/api/v1/admin/*)
  └─ 用于管理后台前端页面调用
  └─ 鉴权：JWT (优先) 或 Admin Key (备用)
  └─ 响应格式：{ code, data, message } 三元组
  └─ 适合：管理后台页面

开放 API  (/api/v2/*)
  └─ 用于第三方开发者/合作伙伴集成
  └─ 鉴权：Admin Key 唯一
  └─ 响应格式：遵循 RESTful 规范 + 标准 HTTP 状态码
  └─ 适合：自动化脚本、CI/CD 集成、第三方系统对接
```

### 2.3 开放 API 前缀规范

```
/api/v2/{module}/{resource}[/{id}][/{sub-resource}]

示例:
  /api/v2/users                    — 用户列表
  /api/v2/users/{id}               — 用户详情
  /api/v2/finance/revenue           — 收入查询
  /api/v2/vendors/health            — 供应商健康
  /api/v2/agents/{id}/commission    — 代理佣金
```

---

## 3. Admin API Key 管理体系

### 3.1 Key 生命周期

```
创建 (admin)
  │
  ├─ 生成 Key 字符串: ak_{prefix}_{random64}
  │   ├─ keyHash = SHA-256(fullKeyString)  → 存储
  │   └─ keyPrefix = "ak_{prefix}"         → 存储（用于展示识别）
  │
  ├─ 初始状态: active
  │
  ├─ 使用中:
  │   ├─ 每次调用更新 lastUsedAt
  │   └─ 记录 adminKeyUsageLogs
  │
  ├─ 禁用 (admin):
  │   ├─ status → disabled
  │   └─ 已发放的 Key 立即失效
  │
  ├─ 过期:
  │   ├─ expiresAt 到达后自动 status → expired
  │   └─ 定时任务每日扫描过期 Key
  │
  └─ 删除 (admin):
      └─ 物理删除 + 级联删除使用日志
```

### 3.2 Key 生成规则

```typescript
// Key 格式: ak_{prefix}_{base64url(32 bytes random)}
// 示例: ak_prod_8F3kL9mX2pQ7rV5wY1nB4cH6jA0sD2gE

function generateAdminKey(prefix: string = "admin"): {
  rawKey: string;       // 完整 Key (仅创建时展示一次)
  keyHash: string;      // SHA-256 哈希 (存储)
  keyPrefix: string;    // 前缀 (展示用)
} {
  const randomBytes = crypto.randomBytes(32);
  const randomPart = randomBytes.toString("base64url"); // 43 chars
  const rawKey = `ak_${prefix}_${randomPart}`;          // ~50 chars
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  return { rawKey, keyHash, keyPrefix: `ak_${prefix}` };
}
```

### 3.3 权限模型

```
权限格式: {module}:{action}
  模块: users | finance | vendors | models | agents | security | system | audit | stats
  操作: read | write | delete

特殊权限:
  *:*           — 全部权限（超级管理员）
  {module}:*    — 模块全部权限

实践:
  创建 Key 时选择预定义角色或自定义权限组合
  预定义角色:
    └─ 管理员:  *:*
    └─ 财务:    finance:read, finance:write, audit:read
    └─ 运营:    users:read, vendors:read, stats:read, audit:read
    └─ 只读:    *:read
```

### 3.4 Key 管理功能

| 功能 | 说明 |
|------|------|
| 创建 Key | 设置名称、权限、过期时间 → 生成并展示一次 rawKey |
| 列表 | 展示所有 Key（名称、前缀、状态、过期时间、最后使用） |
| 编辑 | 修改名称、权限、过期时间 |
| 禁用/启用 | 切换 status（active ↔ disabled）|
| 删除 | 物理删除 Key 及其使用日志 |
| 查看详情 | 展示 Key 信息 + 使用统计（近 7 天调用量、成功率）|

---

## 4. API 鉴权与安全

### 4.1 鉴权流程

```
请求 → X-Admin-Key header
    │
    ├─ header 存在 → Admin Key 鉴权
    │   ├─ SHA-256(rawKey) → 查找 adminApiKeys
    │   ├─ 未找到 → 401 "无效的管理 API Key"
    │   ├─ status = disabled → 403 "Key 已被禁用"
    │   ├─ expiresAt < now → 403 "Key 已过期"
    │   ├─ 权限不足 → 403 "权限不足"
    │   └─ 通过 → 注入 request.adminKey → 继续
    │
    └─ header 不存在 → 降级到 JWT 鉴权（仅内部 API 适用）
        └─ 开放 API (/api/v2/*) 必须带 Admin Key
```

### 4.2 安全措施

| 安全措施 | 实现 |
|---------|------|
| Key 存储 | 仅存储 SHA-256 哈希，不存储明文 |
| Key 展示 | 创建时仅展示一次 rawKey，之后不可恢复 |
| 传输加密 | 强制 HTTPS（生产环境）|
| 请求限流 | 多级限流（见第 5 节）|
| IP 白名单 | 可选配置 Key 级别 IP 白名单 |
| 审计日志 | 记录每次 API 调用的方法、路径、IP、状态码、耗时 |
| 敏感操作确认 | 影响范围大的操作（DELETE、批量操作）需要二次确认 |

### 4.3 IP 白名单（可选）

```typescript
// adminApiKeys 表新增字段（可选）
ipWhitelist: varchar("ip_whitelist", { length: 500 }).array();
// 格式: ["192.168.1.0/24", "10.0.0.1"]
// 空数组 = 不限制 IP

// 鉴权中间件中检查
if (keyRecord.ipWhitelist && keyRecord.ipWhitelist.length > 0) {
  const allowed = keyRecord.ipWhitelist.some(cidr => ipInRange(request.ip, cidr));
  if (!allowed) {
    reply.status(403).send({ code: 403, message: "IP 不在白名单中" });
    return;
  }
}
```

---

## 5. Rate Limit 策略

### 5.1 限流层级

```
开放 API 限流分为 3 层：

Layer 1: Key 级别限流
  └─ 每个 Admin Key 独立的 RPM/TPM 限制
  └─ 配置: adminApiKeys 表 rateLimitRpm / rateLimitTpm
  └─ 默认: RPM=300, TPM=500000

Layer 2: 操作级别限流
  └─ 按操作类型限流（如 GET /api/v2/finance 高速，POST 低速）
  └─ 配置: site_configs 中按模块配置
  └─ 默认: read=1000 RPM, write=100 RPM, delete=30 RPM

Layer 3: 全局级别限流（兜底）
  └─ 所有开放 API 共享的全局配额
  └─ 配置: site_configs 全局配置
  └─ 默认: 5000 RPM
```

### 5.2 限流算法

```typescript
// 基于 Redis 滑动窗口 (与现有 rate-limit.ts 一致)
// 复用现有实现，新增 Admin Key 级别限流维度

interface RateLimitCheck {
  key: string;           // 限流 Key
  maxRpm: number;        // 每分钟最大请求数
  maxTpm: number;        // 每分钟最大 Token 数（如果适用）
  windowMs: number;      // 窗口大小 (默认 60000ms)
}

// 限流判定顺序
// 1. Key 级别限流 → 超限则 429
// 2. 操作级别限流 → 超限则 429
// 3. 全局级别限流 → 超限则 429

// 429 响应
{
  "code": 429,
  "message": "请求过于频繁，请稍后重试",
  "retryAfter": 35,       // 建议等待秒数
  "limit": 300,           // 当前限制
  "remaining": 0,         // 剩余配额
  "reset": 1706174400     // 窗口重置时间戳
}
```

### 5.3 限流配置

```typescript
// site_configs 中的开放 API 限流配置
interface OpenApiRateLimitConfig {
  // Key 级别默认值
  keyDefault: {
    rpm: number;           // 默认 300
    tpm: number;           // 默认 500000
  };
  // 操作级别
  operation: {
    read: { rpm: number; };     // 默认 1000
    write: { rpm: number; };    // 默认 100
    delete: { rpm: number; };   // 默认 30
  };
  // 全局兜底
  global: {
    rpm: number;           // 默认 5000
  };
}
```

### 5.4 限流响应头

所有开放 API 响应包含限流信息头：

```
X-RateLimit-Limit: 300          # 当前限制
X-RateLimit-Remaining: 287      # 剩余配额
X-RateLimit-Reset: 1706174400   # 窗口重置时间
Retry-After: 35                 # 仅 429 时返回
```

---

## 6. OpenAPI 3.0 规范

### 6.1 规范生成策略

```
生成方式: 代码注释 + 运行时反射 → OpenAPI 3.0 JSON
  └─ 不引入 swagger-jsdoc 等依赖
  └─ 在路由注册时收集元数据（路径、方法、参数、响应）
  └─ 提供 GET /api/openapi.json 端点实时生成

生成时机:
  └─ 开发: 每次启动时生成
  └─ 生产: 缓存到 Redis，TTL 3600s
  └─ 手动刷新: POST /api/openapi/refresh (仅 super_admin)
```

### 6.2 路由元数据注册

```typescript
// 路由注册时附带元数据
interface RouteMeta {
  summary: string;              // 接口摘要
  description?: string;         // 详细说明
  tags: string[];               // 标签（用于分组）
  operationId?: string;         // 唯一操作 ID
  parameters?: RouteParam[];    // 路径/查询参数
  requestBody?: {               // 请求体
    contentType: string;
    schema: Record<string, any>;
  };
  responses: {                  // 响应
    [statusCode: string]: {
      description: string;
      contentType?: string;
      schema?: Record<string, any>;
    };
  };
  deprecated?: boolean;
  security?: { adminKey: string[] }[];  // 鉴权要求
}

// 注册示例
server.get("/api/v2/users", {
  meta: {
    openapi: {
      summary: "获取用户列表",
      description: "分页查询用户列表，支持按状态、等级、注册时间筛选",
      tags: ["users"],
      operationId: "listUsers",
      parameters: [
        { name: "page", in: "query", schema: { type: "integer", default: 1 } },
        { name: "pageSize", in: "query", schema: { type: "integer", default: 20 } },
        { name: "status", in: "query", schema: { type: "string", enum: ["active", "disabled"] } },
      ],
      responses: {
        "200": {
          description: "用户列表",
          schema: {
            type: "object",
            properties: {
              data: { type: "array", items: { $ref: "#/components/schemas/User" } },
              total: { type: "integer" },
              page: { type: "integer" },
              pageSize: { type: "integer" },
            },
          },
        },
      },
    },
  },
  handler: listUsersHandler,
});
```

### 6.3 OpenAPI 3.0 输出结构

```json
{
  "openapi": "3.0.3",
  "info": {
    "title": "3cloud Open API",
    "description": "3cloud AI Token 聚合平台开放 API",
    "version": "2.0.0",
    "contact": {
      "name": "3cloud Support",
      "email": "support@3cloud.ai",
      "url": "https://unmisa.com"
    }
  },
  "servers": [
    { "url": "https://api.unmisa.com", "description": "Production" },
    { "url": "https://staging.api.unmisa.com", "description": "Staging" }
  ],
  "paths": { ... },
  "components": {
    "securitySchemes": {
      "adminKey": {
        "type": "apiKey",
        "in": "header",
        "name": "X-Admin-Key",
        "description": "管理 API Key，在管理后台创建"
      }
    },
    "schemas": {
      "User": { ... },
      "FinanceRecord": { ... },
      "VendorHealth": { ... },
      "ErrorResponse": {
        "type": "object",
        "properties": {
          "code": { "type": "integer" },
          "message": { "type": "string" },
          "details": { "type": "object" }
        }
      }
    }
  },
  "security": [
    { "adminKey": [] }
  ],
  "tags": [
    { "name": "users", "description": "用户管理" },
    { "name": "finance", "description": "财务管理" },
    { "name": "vendors", "description": "供应商管理" },
    { "name": "agents", "description": "代理商管理" },
    { "name": "system", "description": "系统管理" }
  ]
}
```

### 6.4 通用 Schema 定义

```typescript
// 分页响应
components.schemas.PaginatedResponse = {
  type: "object",
  properties: {
    data: { type: "array" },
    pagination: {
      type: "object",
      properties: {
        page: { type: "integer", example: 1 },
        pageSize: { type: "integer", example: 20 },
        total: { type: "integer", example: 156 },
        totalPages: { type: "integer", example: 8 },
      },
    },
  },
};

// 错误响应
components.schemas.ErrorResponse = {
  type: "object",
  properties: {
    code: { type: "integer", example: 400 },
    message: { type: "string", example: "参数错误" },
    details: { type: "object", nullable: true },
  },
};
```

---

## 7. API 文档门户

### 7.1 门户页面

```
页面路径: /api/docs
  └─ 静态页面，基于 Swagger UI 或 ReDoc
  └─ 从 GET /api/openapi.json 加载 OpenAPI 规范
  └─ 支持在线调试（输入 Admin Key → 直接调用 API）
  └─ 支持下载 OpenAPI JSON（供导入 Postman 等工具）

页面布局:
  ┌─ Header ──────────────────────────────────┐
  │  🚀 3cloud Open API   [v2.0.0]            │
  │  [输入 Admin Key] [调试开关]               │
  ├────────────────────────────────────────────┤
  │                                            │
  │  ┌ 用户管理                                │
  │  │  GET /api/v2/users                      │
  │  │  GET /api/v2/users/{id}                 │
  │  │  ⋮                                     │
  │  ┌ 财务管理                                │
  │  │  GET /api/v2/finance/revenue            │
  │  │  GET /api/v2/finance/cost-analysis      │
  │  │  ⋮                                     │
  │  ┌ 供应商管理                              │
  │  │  GET /api/v2/vendors                    │
  │  │  GET /api/v2/vendors/{id}/health        │
  │  │  ⋮                                     │
  │                                            │
  └────────────────────────────────────────────┘
```

### 7.2 代码示例生成

每个端点自动生成多语言代码示例：

```javascript
// JavaScript (fetch)
const response = await fetch("https://api.unmisa.com/api/v2/users?page=1&pageSize=20", {
  headers: {
    "X-Admin-Key": "ak_prod_8F3kL9mX2pQ7rV5wY1nB4cH6jA0sD2gE",
    "Content-Type": "application/json",
  },
});
const data = await response.json();
```

```python
# Python (requests)
import requests
headers = {"X-Admin-Key": "ak_prod_8F3kL9mX2pQ7rV5wY1nB4cH6jA0sD2gE"}
response = requests.get("https://api.unmisa.com/api/v2/users", params={"page": 1, "pageSize": 20}, headers=headers)
data = response.json()
```

```bash
# cURL
curl -H "X-Admin-Key: ak_prod_..." "https://api.unmisa.com/api/v2/users?page=1&pageSize=20"
```

---

## 8. 开放 API 端点清单

### 8.1 用户管理

| 方法 | 路径 | 说明 | 权限 | 限流 |
|------|------|------|------|------|
| GET | `/api/v2/users` | 用户列表 | users:read | read |
| GET | `/api/v2/users/{id}` | 用户详情 | users:read | read |
| GET | `/api/v2/users/{id}/usage` | 用户用量统计 | users:read | read |
| PATCH | `/api/v2/users/{id}` | 更新用户信息 | users:write | write |
| GET | `/api/v2/users/stats` | 用户统计概览 | users:read | read |

### 8.2 财务管理

| 方法 | 路径 | 说明 | 权限 | 限流 |
|------|------|------|------|------|
| GET | `/api/v2/finance/revenue` | 收入明细 | finance:read | read |
| GET | `/api/v2/finance/cost-analysis` | 成本分析 | finance:read | read |
| GET | `/api/v2/finance/reports` | 财务报表列表 | finance:read | read |
| GET | `/api/v2/finance/reports/{id}` | 报表详情 | finance:read | read |
| GET | `/api/v2/finance/reports/{id}/download` | 下载报表 | finance:read | read |

### 8.3 供应商管理

| 方法 | 路径 | 说明 | 权限 | 限流 |
|------|------|------|------|------|
| GET | `/api/v2/vendors` | 供应商列表 | vendors:read | read |
| GET | `/api/v2/vendors/{id}` | 供应商详情 | vendors:read | read |
| GET | `/api/v2/vendors/{id}/health` | 供应商健康 | vendors:read | read |
| GET | `/api/v2/vendors/models` | 所有模型列表 | vendors:read | read |
| POST | `/api/v2/vendors/{id}/test` | 测试供应商连通 | vendors:write | write |

### 8.4 代理商管理

| 方法 | 路径 | 说明 | 权限 | 限流 |
|------|------|------|------|------|
| GET | `/api/v2/agents` | 代理列表 | agents:read | read |
| GET | `/api/v2/agents/{id}` | 代理详情 | agents:read | read |
| GET | `/api/v2/agents/{id}/commission` | 佣金明细 | agents:read | read |
| GET | `/api/v2/agents/{id}/clients` | 代理客户列表 | agents:read | read |

### 8.5 系统管理

| 方法 | 路径 | 说明 | 权限 | 限流 |
|------|------|------|------|------|
| GET | `/api/v2/system/health` | 系统健康状态 | system:read | read |
| GET | `/api/v2/system/stats` | 系统统计概览 | system:read | read |
| GET | `/api/v2/system/logs` | 操作日志 | audit:read | read |
| GET | `/api/v2/system/config` | 系统配置（只读） | system:read | read |

### 8.6 开放 API 通用端点

| 方法 | 路径 | 说明 | 鉴权 | 限流 |
|------|------|------|------|------|
| GET | `/api/v2/me` | 当前 Key 信息 | Admin Key | read |
| GET | `/api/v2/usage` | 当前 Key 使用统计 | Admin Key | read |
| GET | `/api/openapi.json` | OpenAPI 规范 JSON | 无需鉴权 | — |
| GET | `/api/docs` | 文档门户页 | 无需鉴权 | — |

---

## 9. API 版本管理

### 9.1 版本策略

```
当前版本: v2

版本号在 URL 中: /api/v2/{resource}
  └─ 主版本号变更 = 向后不兼容

版本生命周期:
  v1 (deprecated) — 仅内部使用，不对外开放
  v2 (current)    — 当前开放版本
  v3 (future)     — 下一个主版本（未发布）

版本兼容性:
  └─ 小版本（v2.1 → v2.2）: 只增不减，不删不改
  └─ 大版本（v2 → v3）: 可删除/修改字段
  └─ 废弃版本保留至少 6 个月
```

### 9.2 版本迁移

```
版本迁移流程:
  1. 新版本发布后，旧版本标记为 deprecated
  2. 旧版本响应头增加 Sunset header
  3. 文档门户展示旧版本废弃提示
  4. 废弃 6 个月后删除旧版本路由

响应头:
  Sunset: Sat, 28 Jan 2027 00:00:00 GMT
  Deprecation: true
```

---

## 10. SDK/代码生成

### 10.1 设计规范

```
SDK 生成策略:
  └─ 基于 OpenAPI 3.0 规范生成
  └─ 不内置 SDK 生成器，提供规范供社区工具使用
  └─ 官方推荐工具: openapi-generator, orval, kiota

支持的 SDK 类型:
  └─ TypeScript / JavaScript (fetch)
  └─ Python (requests)
  └─ Go (net/http)
  └─ Java (okhttp3)
  └─ cURL 脚本

SDK 特性:
  └─ 自动处理鉴权头
  └─ 自动重试（429 时）
  └─ 类型定义（TS/Python 等强类型语言）
  └─ 错误处理封装
```

### 10.2 SDK 使用示例

```typescript
// 3cloud SDK (TypeScript)
import { createClient } from "@3cloud/sdk";

const client = createClient({
  apiKey: "ak_prod_...",
  baseUrl: "https://api.unmisa.com",
});

// 自动鉴权 + 类型安全
const users = await client.users.list({ page: 1, pageSize: 20 });
console.log(users.data);

const revenue = await client.finance.getRevenue({ period: "this_month" });
console.log(revenue.total);
```

---

## 11. 数据表结构

### 11.1 `admin_api_keys` — 管理 API Key

```typescript
export const adminApiKeys = pgTable(
  "admin_api_keys",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    description: varchar("description", { length: 256 }),
    keyHash: varchar("key_hash", { length: 64 }).notNull().unique(),  // SHA-256
    keyPrefix: varchar("key_prefix", { length: 10 }).notNull(),
    permissions: jsonb("permissions").notNull().default("[]"),
    status: adminApiKeyStatusEnum("status").notNull().default("active"),
    // active | disabled | expired

    // 限流 (Key 级别)
    rateLimitRpm: integer("rate_limit_rpm").default(300),
    rateLimitTpm: integer("rate_limit_tpm").default(500000),

    // 安全
    ipWhitelist: varchar("ip_whitelist", { length: 500 }).array(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),

    // 统计
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    totalCalls: integer("total_calls").notNull().default(0),

    // 审计
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    hashIdx: uniqueIndex("admin_api_keys_hash_idx").on(table.keyHash),
    statusIdx: index("admin_api_keys_status_idx").on(table.status),
    expiresIdx: index("admin_api_keys_expires_idx").on(table.expiresAt),
  })
);
```

**新增字段**（相对于现有实现）：

| 字段 | 说明 | 原因 |
|------|------|------|
| `description` | Key 描述 | 便于管理 |
| `rateLimitRpm` | Key 级别 RPM 限制 | 精细限流 |
| `rateLimitTpm` | Key 级别 TPM 限制 | 精细限流 |
| `ipWhitelist` | IP 白名单 | 安全增强 |
| `totalCalls` | 累计调用数 | 统计优化 |

### 11.2 `admin_key_usage_logs` — 使用日志

```typescript
export const adminKeyUsageLogs = pgTable(
  "admin_key_usage_logs",
  {
    id: serial("id").primaryKey(),
    keyId: integer("key_id").notNull().references(() => adminApiKeys.id, { onDelete: "cascade" }),
    method: varchar("method", { length: 10 }).notNull(),
    path: varchar("path", { length: 500 }).notNull(),
    ip: varchar("ip", { length: 45 }),
    userAgent: varchar("user_agent", { length: 256 }),
    statusCode: integer("status_code"),
    durationMs: integer("duration_ms"),
    requestBody: text("request_body"),                     // 仅记录敏感操作时
    responseBody: text("response_body"),                   // 仅记录错误时
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    keyIdIdx: index("admin_key_usage_logs_key_id_idx").on(table.keyId),
    keyCreatedAtIdx: index("admin_key_usage_logs_key_created_at_idx").on(table.keyId, table.createdAt.desc()),
    createdAtIdx: index("admin_key_usage_logs_created_at_idx").on(table.createdAt.desc()),
  })
);
```

**新增字段**：

| 字段 | 说明 | 原因 |
|------|------|------|
| `userAgent` | 客户端标识 | 使用分析 |
| `requestBody` | 请求体（仅敏感操作） | 审计追溯 |
| `responseBody` | 响应体（仅错误时） | 错误排查 |

### 11.3 `api_doc_versions` — API 文档版本

```typescript
export const apiDocVersions = pgTable("api_doc_versions", {
  id: serial("id").primaryKey(),
  version: varchar("version", { length: 10 }).notNull(),   // "v2"
  status: varchar("status", { length: 16 }).notNull(),     // current | deprecated | sunset
  openapiSpec: jsonb("openapi_spec").notNull(),            // 完整 OpenAPI 规范
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  deprecatedAt: timestamp("deprecated_at", { withTimezone: true }),
  sunsetAt: timestamp("sunset_at", { withTimezone: true }),
  publishedBy: integer("published_by").references(() => users.id),
});
```

---

## 12. API 接口规格

### 12.1 Admin API Key 管理

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/api-keys` | Key 列表 | system:read |
| POST | `/api/v1/admin/api-keys` | 创建 Key | system:write |
| GET | `/api/v1/admin/api-keys/{id}` | Key 详情 | system:read |
| PATCH | `/api/v1/admin/api-keys/{id}` | 编辑 Key | system:write |
| DELETE | `/api/v1/admin/api-keys/{id}` | 删除 Key | system:delete |
| POST | `/api/v1/admin/api-keys/{id}/toggle` | 禁用/启用 | system:write |
| GET | `/api/v1/admin/api-keys/{id}/usage` | Key 使用统计 | system:read |
| GET | `/api/v1/admin/api-keys/permissions` | 权限清单 | system:read |

**POST /api/v1/admin/api-keys 请求体**：

```typescript
interface CreateAdminApiKeyRequest {
  name: string;
  description?: string;
  permissions: string[];                    // ["users:read", "finance:read"]
  rateLimitRpm?: number;                    // 默认 300
  rateLimitTpm?: number;                    // 默认 500000
  ipWhitelist?: string[];                   // 可选
  expiresAt?: string;                       // ISO 8601, 可选
}
```

**POST 响应**：

```typescript
interface CreateAdminApiKeyResponse {
  id: number;
  name: string;
  keyPrefix: string;
  rawKey: string;                           // ⚠️ 仅在此处展示一次
  permissions: string[];
  rateLimitRpm: number;
  rateLimitTpm: number;
  expiresAt?: string;
  createdAt: string;
}
```

### 12.2 开放 API 端点

见第 8 节端点清单。所有端点统一响应格式：

```typescript
// 成功响应
{
  "data": T,                                  // 具体数据
  "pagination"?: {                            // 分页查询时
    "page": 1,
    "pageSize": 20,
    "total": 156,
    "totalPages": 8
  }
}

// 错误响应
{
  "code": 400,                                // HTTP 状态码
  "message": "参数错误",
  "details": {                                // 可选，错误详情
    "field": "pageSize",
    "reason": "不能超过 100"
  }
}
```

### 12.3 文档门户 API

| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| GET | `/api/openapi.json` | 获取 OpenAPI 规范 | 无 |
| POST | `/api/openapi/refresh` | 刷新 OpenAPI 缓存 | super_admin |
| GET | `/api/v2/me` | 当前 Key 信息 | Admin Key |
| GET | `/api/v2/usage` | 当前 Key 使用统计 | Admin Key |

---

## 13. 前端组件 Props

### 13.1 AdminApiKeyList — 管理 API Key 列表页

```typescript
interface AdminApiKeyListProps {
  // 路由页面，无外部 props
}

interface AdminApiKeyCardProps {
  id: number;
  name: string;
  keyPrefix: string;
  status: "active" | "disabled" | "expired";
  permissions: string[];
  lastUsedAt?: string;
  expiresAt?: string;
  totalCalls: number;
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
  onEdit: (id: number) => void;
}
```

### 13.2 AdminApiKeyCreate — 创建 Key 弹窗

```typescript
interface AdminApiKeyCreateProps {
  visible: boolean;
  onClose: () => void;
  onCreated: (key: { id: number; rawKey: string }) => void;
}

interface AdminApiKeyCreatedModalProps {
  keyName: string;
  rawKey: string;
  onClose: () => void;
  onCopy: () => void;
}
```

### 13.3 AdminApiKeyEditForm — 编辑 Key 表单

```typescript
interface AdminApiKeyEditFormProps {
  keyId: number;
  initialData: {
    name: string;
    description?: string;
    permissions: string[];
    rateLimitRpm: number;
    rateLimitTpm: number;
    ipWhitelist: string[];
    expiresAt?: string;
  };
  onSave: (data: Partial<CreateAdminApiKeyRequest>) => Promise<void>;
  onCancel: () => void;
}
```

### 13.4 AdminApiKeyUsageChart — 使用统计图表

```typescript
interface AdminApiKeyUsageChartProps {
  keyId: number;
  period?: "7d" | "30d" | "90d";
}

// 展示: 调用量趋势图 + 成功率 + 平均耗时
// 使用 Recharts 折线图
```

### 13.5 ApiDocPortal — 文档门户

```typescript
interface ApiDocPortalProps {
  // 静态页面，无外部 props
  // 基于 Swagger UI 或 ReDoc 嵌入
}
```

### 13.6 PermissionSelector — 权限选择器

```typescript
interface PermissionSelectorProps {
  value: string[];
  onChange: (permissions: string[]) => void;
  maxSelections?: number;
}

interface PermissionTreeNode {
  module: string;
  label: string;
  permissions: {
    action: string;
    label: string;
    description: string;
  }[];
}
```

---

## 14. 运营配置项

### 14.1 开放 API 全局配置

| 配置项 | 路径 | 类型 | 默认值 | 说明 |
|-------|------|------|--------|------|
| 开放 API 启用 | `site_configs.open_api.enabled` | boolean | true | 全局开关 |
| 当前版本 | `site_configs.open_api.current_version` | string | "v2" | — |
| 文档门户启用 | `site_configs.open_api.docs_enabled` | boolean | true | — |
| 在线调试启用 | `site_configs.open_api.try_it_enabled` | boolean | true | 文档门户中调试功能 |

### 14.2 限流配置

| 配置项 | 路径 | 类型 | 默认值 | 说明 |
|-------|------|------|--------|------|
| Key 默认 RPM | `site_configs.open_api.rate_limit.key_default.rpm` | int | 300 | — |
| Key 默认 TPM | `site_configs.open_api.rate_limit.key_default.tpm` | int | 500000 | — |
| Read 操作限流 | `site_configs.open_api.rate_limit.operation.read.rpm` | int | 1000 | — |
| Write 操作限流 | `site_configs.open_api.rate_limit.operation.write.rpm` | int | 100 | — |
| Delete 操作限流 | `site_configs.open_api.rate_limit.operation.delete.rpm` | int | 30 | — |
| 全局 RPM | `site_configs.open_api.rate_limit.global.rpm` | int | 5000 | — |

### 14.3 审计配置

| 配置项 | 路径 | 类型 | 默认值 | 说明 |
|-------|------|------|--------|------|
| 日志保留天数 | `site_configs.open_api.audit.retention_days` | int | 90 | — |
| 敏感操作记录 body | `site_configs.open_api.audit.log_body_sensitive_ops` | boolean | true | DELETE/PATCH 操作记录 body |
| 错误记录响应 | `site_configs.open_api.audit.log_error_response` | boolean | true | status >= 400 时记录响应 |

---

## 15. 边界条件

### 15.1 鉴权边界

| # | 边界场景 | 处理策略 |
|---|---------|---------|
| B1 | X-Admin-Key header 格式错误 | 401，不暴露具体原因（防止暴力枚举）|
| B2 | 同时携带 JWT 和 Admin Key | Admin Key 优先，JWT 被忽略 |
| B3 | Key 刚刚被禁用，但有正在处理的请求 | 中间件检查状态，已处理的请求正常完成 |
| B4 | Key 在过期时间边界（秒级） | 精确到毫秒比较，过期即刻拒绝 |
| B5 | 权限格式错误（如 unknown_module:read） | 视为无权限，返回 403 |

### 15.2 限流边界

| # | 边界场景 | 处理策略 |
|---|---------|---------|
| B6 | 三层限流同时触发 | 先返回最高的限制级别，响应头展示当前层 |
| B7 | Redis 不可用 | 降级到内存滑动窗口，精度降低但不阻断 |
| B8 | 批量操作请求 | 按单次请求计，不按内部操作计数 |
| B9 | 限流配置为 0 或负数 | 视为不限制，记录警告日志 |

### 15.3 数据边界

| # | 边界场景 | 处理策略 |
|---|---------|---------|
| B10 | 创建 Key 时 IP 白名单格式错误 | 校验失败，返回错误列表 |
| B11 | 权限列表超过 50 项 | 限制最大 50 项，超出拒绝 |
| B12 | 使用日志表数据量过大 | 按 createdAt 分区保留 90 天，自动清理 |
| B13 | 同时创建大量 Key 的并发 | 乐观锁，keyHash 唯一约束防止重复 |

### 15.4 文档门户边界

| # | 边界场景 | 处理策略 |
|---|---------|---------|
| B14 | OpenAPI 规范生成失败 | 返回缓存版本，无缓存则返回 503 |
| B15 | 文档门户中传递的 Admin Key 被日志记录 | 脱敏处理（仅记录前 10 位）|
| B16 | 长时间未使用的 Key 自动过期 | 定时任务：超过 180 天未使用 → status = expired |
| B17 | 跨域请求 | 开放 API 支持 CORS（允许所有来源）|

---

## 16. 验收标准

### 16.1 Admin Key 管理

| # | 验收项 | 通过标准 |
|---|-------|---------|
| AC1 | 创建 Key | 输入名称/权限/过期时间 → 生成 Key，展示一次 rawKey |
| AC2 | 创建后 rawKey 不可恢复 | 关闭弹窗后无法再次查看 rawKey |
| AC3 | 编辑 Key | 修改名称/权限/限流/过期时间 → 保存生效 |
| AC4 | 禁用/启用 | 切换后立即生效，被禁用的 Key 调用返回 403 |
| AC5 | 删除 Key | 删除后 Key 不可用，使用日志保留 |
| AC6 | 列表展示 | 展示所有 Key 的状态、最后使用时间、总调用次数 |

### 16.2 鉴权

| # | 验收项 | 通过标准 |
|---|-------|---------|
| AC7 | 有效的 Key 调用 | 正常返回数据 |
| AC8 | 无效 Key | 返回 401 |
| AC9 | 已禁用 Key | 返回 403 |
| AC10 | 过期 Key | 返回 403 |
| AC11 | 权限不足 | 返回 403 + 指明所需权限 |
| AC12 | IP 白名单生效 | 白名单外的 IP 返回 403 |

### 16.3 限流

| # | 验收项 | 通过标准 |
|---|-------|---------|
| AC13 | Key 级别限流 | 超限后返回 429 + 限流头信息 |
| AC14 | 操作级别限流 | 不同操作类型限流正确 |
| AC15 | 全局限流 | 所有 Key 共享限流不超限 |
| AC16 | 限流响应头 | 每次响应包含 X-RateLimit-* 头 |
| AC17 | Redis 不可用时降级 | 不限流但记录警告 |

### 16.4 文档门户

| # | 验收项 | 通过标准 |
|---|-------|---------|
| AC18 | OpenAPI 规范 | `/api/openapi.json` 返回完整规范，Swagger UI 可加载 |
| AC19 | 在线调试 | 输入 Admin Key 后可直接调用 API |
| AC20 | 代码示例 | 每个端点展示 JS/Python/cURL 示例 |
| AC21 | 版本管理 | 显示当前版本，废弃版本有标记 |

### 16.5 审计日志

| # | 验收项 | 通过标准 |
|---|-------|---------|
| AC22 | 使用日志 | 每次 API 调用记录方法/路径/IP/状态码/耗时 |
| AC23 | 敏感操作记录 | DELETE/PATCH 操作记录请求 body |
| AC24 | 日志查询 | 可按 Key/时间/状态码筛选 |

---

## 17. 交叉引用

| 关联模块 | 文档 | 关系 |
|---------|------|------|
| 鉴权中间件 | `api/src/middleware/adminKeyAuth.ts` | 现有 Admin Key 鉴权实现，本设计在此基础上扩展 |
| 限流中间件 | `api/src/middleware/rate-limit.ts` | 扩展为三层限流 |
| 权限体系 | `ref-2.1-roles-permissions.md` | 复用 Bitset 权限矩阵 |
| 系统配置 | `ref-4.8-system-config.md` | 开放 API 配置存储在 site_configs |
| 安全风控 | `ref-4.6-security.md` | IP 白名单 + 审计日志 |
| 操作日志 | `ref-4.13-operation-timeline.md` | 管理面的操作日志记录 |
| 供应商管理 | `ref-4.3-vendor-model.md` | 供应商开放 API 数据源 |
| 财务管理 | `ref-4.4-finance.md` | 财务开放 API 数据源 |
| 用户管理 | — | 用户开放 API 数据源 |
| 监控日志 | `ref-4.7-monitor-logs.md` | 使用日志监控告警 |