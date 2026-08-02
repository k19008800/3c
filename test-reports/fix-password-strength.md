# CRIT-4 修复报告: 注册/改密密码强度策略

## 问题描述

注册和修改密码接口无密码复杂度校验，可设置弱口令（如 `123456`）。

## 修复范围

### 1. `services/auth-service/password.ts`

**新增导出**：

- `PASSWORD_REGEX` — 密码强度正则常量
- `PASSWORD_MESSAGE` — 错误提示信息常量
- `validatePasswordStrength(password)` — 校验函数，返回 `{ valid, message }`

**正则规则**：`/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/`

- 至少 8 位
- 至少 1 个小写字母
- 至少 1 个大写字母
- 至少 1 个数字
- 至少 1 个特殊字符

### 2. `schemas/auth.ts`

| Schema | 字段 | 原规则 | 新规则 |
|--------|------|--------|--------|
| `registerSchema` | `password` | `.min(6)` | `.min(8).regex(PASSWORD_REGEX, ...)` |
| `registerSchema` | `confirmPassword` | `.min(6)` | `.min(8)` |
| `resetPasswordConfirmSchema` | `newPassword` | `.min(6)` | `.min(8).regex(PASSWORD_REGEX, ...)` |
| `resetPasswordConfirmSchema` | `confirmPassword` | `.min(6)` | `.min(8)` |
| `changePasswordSchema` | `newPassword` | `.min(6)` | `.min(8).regex(PASSWORD_REGEX, ...)` |

## 验证结果

### 正则测试（Node.js 直接运行确认）

```
输入              | 结果
StrongP@ss1      | ✅ 通过
Abc12345!        | ✅ 通过
aB3#defgh        | ✅ 通过
aB3$eigh         | ✅ 通过（恰好 8 位，包含所有要求类型）
123456           | ❌ 拒绝（太短、无大写/特殊）
Abc123!          | ❌ 拒绝（太短，7 位）
Abcdefgh         | ❌ 拒绝（无数字、无特殊）
abcdef1!         | ❌ 拒绝（无大写）
ABCDEF1!         | ❌ 拒绝（无小写）
```

### TypeScript 编译

`npx tsc --noEmit` 通过，未产生与本次修改相关的新错误。

- ✅ 弱口令注册 → 预期 HTTP 400，Zod 校验失败
- ✅ 强口令注册 → 预期通过 Zod 校验（后端业务逻辑继续）

## 涉及的接口

| 接口 | 方法 | 路径 |
|------|------|------|
| 注册 | POST | `/api/v1/auth/register` |
| 重置密码 | POST | `/api/v1/auth/reset-password` |
| 修改密码 | POST | `/api/v1/auth/change-password`（`changePasswordSchema` 顺带加固） |
| 忘记密码 | POST | `/api/v1/auth/forgot-password`（仅 email，不受影响） |

## 测试方式

```bash
# 弱口令——预期 400
curl.exe -X POST http://localhost:3000/api/v1/auth/register ^
  -H "Content-Type: application/json" ^
  -d '{"email":"test@test.com","password":"123456","nickname":"test"}'

# 强口令——预期通过 Zod 校验（后端业务可能返回其他错误）
curl.exe -X POST http://localhost:3000/api/v1/auth/register ^
  -H "Content-Type: application/json" ^
  -d '{"email":"test@test.com","password":"StrongP@ss1","nickname":"test"}'
```
