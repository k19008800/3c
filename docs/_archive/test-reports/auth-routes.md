# T1 — Auth 路由审计报告

> 生成时间: 2026-06-28 09:53 CST
> 文件: `api/src/routes/auth.ts`
> 依赖: `api/src/services/auth-service.ts`, `api/src/middleware/auth.ts`, `api/src/schemas.ts`

## 端点覆盖

| 端点 | 方法 | preHandler | Schema 校验 | 错误处理 | 状态 |
|------|------|-----------|-------------|---------|------|
| `/api/v1/auth/register` | POST | 无 | registerSchema | AppError + ZodError | ✅ |
| `/api/v1/auth/login` | POST | 无 | loginSchema | AppError + ZodError | ✅ |
| `/api/v1/auth/refresh` | POST | 无 | refreshSchema | AppError + ZodError + 兜底 | ✅ |
| `/api/v1/auth/verify-email` | POST | authenticateJWT | 手动校验 | AppError | ✅ |
| `/api/v1/auth/resend-verify` | POST | authenticateJWT | 无 | AppError | ✅ |
| `/api/v1/auth/change-password` | POST | authenticateJWT | changePasswordSchema | AppError + ZodError | ✅ |
| `/api/v1/auth/me` | GET | authenticateJWT | 无 | AppError | ✅ |

## Schema 校验

- **registerSchema**: email + password + confirmPassword, refine 一致性 ✅
- **loginSchema**: email + password ✅
- **refreshSchema**: refreshToken min(1) ✅
- **changePasswordSchema**: oldPassword + newPassword min(6) ✅

**注:** verify-email 和 resend-verify 未使用 Zod，手动校验 code 字符串类型。

## 错误处理

所有端点统一错误处理模式：
1. `AppError` → 提取 statusCode + message
2. `ZodError` → 400 + 第一个错误消息
3. 未捕获异常 → Fastify 默认处理 (500)

**问题发现:** ❌ refresh 路由的兜底 `reply.status(401)` 发生在 catch 外，若 `refreshSchema.parse` 前或 `refreshAccessToken` 内的非 AppError/ZodError 异常会被 catch 吞掉但无法触发 return。

## JWT 中间件覆盖

- verify-email, resend-verify, me, change-password 均添加 `authenticateJWT` ✅
- register, login 无中间件，合理 ✅
- refresh 无中间件（使用 refreshToken 本身），合理 ✅

## 响应格式

所有成功响应：`{ code: 0, data: {...}, message: "ok" }`
所有错误响应：`{ code: statusCode, data: null, message: "..." }`

✅ 响应格式统一。

## 审计日志

❌ Auth 路由本身未写入 audit_logs。register/login 在 service 层可能有日志。

## 安全性

- bcrypt 密码哈希 (SALT_ROUNDS=12) ✅
- JWT access + refresh 双 Token 机制 ✅
- registerSchema 中 confirmPassword 字段 refine 校验 ✅

## 汇总

| 检查项 | 结果 |
|--------|------|
| 端点全覆盖 | ✅ 7/7 |
| Zod Schema | ✅ 4/7 使用 Zod |
| 错误处理 | ⚠️ refresh 兜底风险 |
| 响应格式统一 | ✅ |
| JWT 鉴权 | ✅ |
| 审计日志 | ❌ 未记录 |
| 整体评分 | 85/100 |

**建议修复:**
1. refresh 路由增加统一 catch
2. 鉴权操作（change-password）考虑记录 audit log
