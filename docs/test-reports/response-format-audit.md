# T18 — API 响应格式一致性审计报告

> 生成时间: 2026-06-28 09:53 CST
> 文件: 所有路由文件

## 标准响应格式

项目标准:
- **成功:** `{ code: 0, data: {...}, message: "ok" }`
- **错误:** `{ code: number, data: null, message: string }`

## 路由响应格式检查

### ✅ 统一格式: `{code, data, message}`

以下路由全部使用标准格式:
- `auth.ts` — 7 个端点 ✅
- `api-keys.ts` — 4 个端点 ✅
- `logs.ts` — 3 个端点 ✅
- `models.ts` — 1 个端点 ✅
- `recharge.ts` — 4 个常规端点 ✅
- `team.ts` — 6 个端点 ✅
- `agent.ts` — 5 个端点 ✅
- `admin/users.ts` — 8 个端点 ✅
- `admin/models.ts` — 4 个端点 ✅
- `admin/vendors.ts` — 5 个端点 ✅
- `admin/vendor-models.ts` — 5 个端点 ✅
- `admin/agents.ts` — 5 个端点 ✅
- `admin/recharge-admin.ts` — 4 个端点 ✅
- `admin/system.ts` — 4 个端点 ✅
- `admin/dashboard.ts` — 2 个端点 ✅
- `admin/logs.ts` — 1 个端点 ✅

### ❌ 例外: Proxy 路由

`proxy.ts` 使用的是 **OpenAI 兼容格式**:

```ts
// 成功
{ choices: [...], usage: {...}, model: "..." }

// 错误
{ error: { message, type, code } }
```

这是设计决定 ✅（兼容 OpenAI API 规范）

### ❌ 例外: 支付回调响应

`recharge.ts` 的 `/api/v1/recharge/notify`:

```ts
// 成功
reply.type("text/plain").send("SUCCESS")   // 微信/支付宝要求格式

// 错误
reply.status(err.statusCode).send(err.message)  // 纯文本
```

这是外部系统兼容 ✅

## AppError 使用

- `AppError` 类 (service/auth-service.ts) 用于所有业务错误 ✅
- 路由中统一捕获: `err instanceof AppError` → statusCode + message ✅

## ZodError 处理

通用模式（除 proxy 和 recharge/notify 外）:
```ts
if (err?.name === "ZodError") {
  reply.status(400).send({ code: 400, data: null, message: err.errors?.[0]?.message || "参数校验失败" });
}
```

✅ 所有使用 Zod 的路由都包含此处理

## 错误信息国际化

❌ 所有错误消息为硬编码中文，无法国际化:
- "参数校验失败"
- "邮箱格式不正确"
- "密码至少 6 位"
- ...

## 未捕获异常

所有路由的 catch 末尾使用 `throw err` 将未处理异常转发给 Fastify 默认错误处理器 ✅

## 汇总

| 检查项 | 结果 |
|--------|------|
| 标准格式覆盖率 | ✅ 95% 路由 |
| Proxy 兼容格式 | ✅ 设计决定 |
| 支付回调格式 | ✅ 外部系统要求 |
| AppError 统一 | ✅ |
| ZodError 统一 | ✅ |
| 错误国际化 | ❌ 仅中文 |
| 整体评分 | 90/100 |

**建议修复:**
1. 规划错误消息国际化策略
2. 在 response hook 中统一包装 `{code, data, message}` 格式
