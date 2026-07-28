# 角色与权限体系 — 深化参考文档

> **对应章节**：[PRD-README.md §2.1 角色与权限体系](../PRD-README.md#21-角色与权限体系)
> **状态**：从 [`ref-4.6-security.md §2`](ref-4.6-security.md#2-角色与权限体系) 提取独立为单独文档，便于权限管理专项参考
> **粒度**：Bitset 权限定义 → 角色矩阵 → API 接口 → 前端组件 Props → 权限计算优先级的函数级说明

---

## 1. 权限模型（Bitset）

```typescript
export const Perm = {
  NONE:                  0n,
  DASHBOARD_VIEW:        1n << 0n,
  USER_LIST:             1n << 1n,
  USER_VIEW:             1n << 2n,
  USER_EDIT:             1n << 3n,
  USER_DELETE:            1n << 4n,
  USER_CREATE:            1n << 5n,
  USER_RESET_PWD:         1n << 6n,
  USER_CHANGE_ROLE:       1n << 7n,
  USER_BALANCE:           1n << 8n,
  USER_IMPERSONATE:       1n << 9n,
  REVIEW_LIST:            1n << 10n,
  REVIEW_ACTION:          1n << 11n,
  MODEL_MANAGE:           1n << 12n,
  FINANCE_VIEW:           1n << 13n,
  FINANCE_COMMISSION:     1n << 14n,
  FINANCE_WITHDRAW:       1n << 15n,
  FINANCE_RECHARGE:       1n << 16n,
  CONFIG_VIEW:            1n << 17n,
  CONFIG_EDIT:            1n << 18n,
  SECURITY_VIEW:          1n << 19n,
  SECURITY_ACTION:        1n << 20n,
  AUDIT_VIEW:             1n << 21n,
  AGENT_LIST:             1n << 22n,
  AGENT_MANAGE:           1n << 23n,
  LOG_VIEW:               1n << 24n,
  OPS_READ:               1n << 25n,
  RECONCILIATION_VIEW:    1n << 26n,
  SECURITY_EDIT:          1n << 27n,
  AUDIT_REVIEW:           1n << 28n,
  RECONCILIATION_MANAGE:  1n << 29n,
} as const;
```

## 2. 内置角色权限矩阵

| 角色 | 标识 | 安全权限 | 其他核心权限 |
|------|------|---------|-------------|
| 超级管理员 | `super_admin` | 全部（~0n） | 全部 |
| 管理员 | `admin` | VIEW + ACTION + EDIT, AUDIT_VIEW + REVIEW | 用户/模型/财务/代理/日志 |
| 财务专员 | `finance_ops` | AUDIT_VIEW, LOG_VIEW | 全部财务 + 用户查看 |
| 运维工程师 | `ops` | VIEW + ACTION + EDIT, CONFIG_VIEW + EDIT | 用户查看、模型管理 |
| 客服/审核 | `support` | LOG_VIEW, REVIEW_LIST + ACTION | 用户管理(不含删除/改角色) |
| 审计员 | `auditor` | AUDIT_VIEW + REVIEW, RECONCILIATION_VIEW | 用户查看 |
| 用户 | `user` | 无管理员权限 | 基础用户权限 |

## 3. 权限计算优先级

```
user_permission_overrides（最高优先级）
  → user_role_assignments（中级，覆盖 users.role 默认权限）
  → users.role 内置（最低优先级）
```

支持细粒度的 `grantPerms` / `denyPerms` 覆盖。

## 4. API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/admin/roles` | 角色列表（含权限 bitset 字段）|
| POST | `/api/v1/admin/roles` | 创建角色 |
| POST | `/api/v1/admin/users/:id/permissions` | 权限覆盖（grant/deny）|

## 5. 中间件使用

```typescript
// 路由注册时使用
app.get("/api/v1/admin/users", {
  preHandler: [authenticateJWT, requirePerm(Perm.USER_LIST)],
}, handler);

// requirePerm 实现原理
// 1. 从 request.user 获取 userId
// 2. getUserPermissions(userId) → Redis 缓存（TTL 60s）
// 3. bitset 校验：(perm & requiredPerm) !== 0n
// 4. 不通过 → 403
```

---

> **文档版本**：v1.0 — 2026-07-28（从 ref-4.6-security.md §2 提取独立）
