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

---

## 边界条件

### 权限计算场景

| # | 场景 | 触发条件 | 预期行为 |
|---|------|---------|---------|
| RBP-001 | 角色嵌套循环引用 | 角色 A 继承角色 B，角色 B 又继承角色 A，形成循环 | 权限解析引擎检测到循环引用，抛出 `RoleCircularReferenceError`，阻止创建/更新操作并返回 400 错误 |
| RBP-002 | 权限递归计算超时 | 角色层级超过 10 层 deep，Bitset 递归合并在 2 秒内未完成 | 熔断递归计算，使用当前已计算的中间结果兜底，记录报警日志 |
| RBP-003 | 角色被引用时删除 | 试图删除一个已被其他用户或角色分配引用的角色 | 返回 409 Conflict，提示该角色仍有 N 个用户/角色正在使用，需先解除引用后再删除 |
| RBP-004 | user_permission_overrides 与角色权限冲突 | grantPerms 授予了某权限但 roles 配置 denyPerms 拒绝同一权限 | grantPerms 优先生效（最高优先级），中间件返回 true 允许操作 |
| RBP-005 | 权限 Bitset 溢出 | 自定义扩展权限超过 64 位（BigInt 限制） | 抛出权限定义错误，在启动时校验总权限位数，超出后阻止服务启动并提示开发人员扩展 Bitset 类型 |

### 异常流程

| 场景 | 恢复策略 |
|------|---------|
| Redis 缓存中权限 Bitset 损坏 | 清除该用户缓存，回源查询数据库重新计算权限 Bitset |
| 用户角色被删除后遗留空分配 | 后台定时任务清理 `user_role_assignments` 中的孤儿记录 |
| 权限中间件 403 误判 | 管理员可以在操作日志中查看拦截详情，手动调整权限覆盖 |
