# T7 — Admin Users 路由审计报告

> 生成时间: 2026-06-28 09:53 CST
> 文件: `api/src/routes/admin/users.ts`
> 依赖: `api/src/middleware/auth.ts`, `api/src/db/index.ts`

## 端点覆盖

| 端点 | 方法 | preHandler | 状态 |
|------|------|-----------|------|
| `/api/v1/admin/users` | GET | authenticateJWT + requireRole | ✅ |
| `/api/v1/admin/users/:id` | GET | authenticateJWT + requireRole | ✅ |
| `/api/v1/admin/users/:id` | PATCH | authenticateJWT + requireRole | ✅ |
| `/api/v1/admin/users/:id` | DELETE | authenticateJWT + requireRole | ✅ |
| `/api/v1/admin/users/:id/recharge` | POST | authenticateJWT + requireRole | ✅ |
| `/api/v1/admin/users/:id/reset-pwd` | POST | authenticateJWT + requireRole | ✅ |
| `/api/v1/admin/real-name-review` | GET | authenticateJWT + requireRole | ✅ |
| `/api/v1/admin/real-name-review/:id` | POST | authenticateJWT + requireRole | ✅ |

## 管理员权限

- `app.addHook("preHandler", authenticateJWT)` ✅
- `app.addHook("preHandler", requireRole("super_admin", "admin"))` ✅

## 审计日志

审计日志通过 `db.transaction` + `auditLogs` 表实现，覆盖以下操作:
- PATCH: user_update (记录 before/after 快照) ✅
- DELETE: user_disable ✅
- recharge: balance_adjust ✅
- reset-pwd: user_password_reset ✅
- real-name-review: user_update ✅
- cancel order: order_cancel (recharge-admin) ✅

## 字段白名单

PATCH 操作限制更新字段:
```ts
const allowedFields = ["nickname", "status", "role", "discountRate",
  "rpmOverride", "tpmOverride", "userType",
  "disabledUntil", "disabledReason"];
```
✅ 白名单机制防止字段注入

## 软删除

DELETE 操作实际为更新 `status = "deleted"` ✅ (配合 schema 的 deletedAt 字段)

## bcrypt 密码哈希

- SALT_ROUNDS = 12 ✅
- bcrypt.hash(newPassword, SALT_ROUNDS) ✅

## 事务完整性

- PATCH/delete/recharge/reset-pwd: 使用 `db.transaction` ✅
- 表单独更新 + auditLog 插入在同一事务 ✅

## 汇总

| 检查项 | 结果 |
|--------|------|
| 端点全覆盖 | ✅ 8/8 |
| 管理员权限 | ✅ |
| 审计日志 | ✅ 完整覆盖 |
| 字段白名单 | ✅ |
| 事务完整性 | ✅ |
| 密码哈希 | ✅ (bcrypt, 12 rounds) |
| 整体评分 | 95/100 |
