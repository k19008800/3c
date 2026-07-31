# 深化参考：§30 权限管理

> **对应**：[`SPEC-§30-权限管理.md`](SPEC-§30-权限管理.md)
> **关联**：[`ref-4.6-security.md`](ref-4.6-security.md)、[`ref-2.1-roles-permissions.md`](ref-2.1-roles-permissions.md)、[`ref-4.8-system-config.md`](ref-4.8-system-config.md)
> **优先级**：P0（角色管理增强、用户权限一览）、P1（权限变更审计、API Key 细粒度权限）、P2（权限模板、权限自检）
> **状态**：需求文档（待开发）
> **最后更新**：2026-07-31

---

## 概述

平台已有基于 bitset 的动态角色权限引擎（adminRoles + userRoleAssignments + userPermissionOverrides），但缺乏面向管理员的完整权限管理工具链。本模块在现有引擎基础上补全：角色管理可视化、用户权限一览、权限变更审计、API Key 细粒度权限、权限模板、权限自检。

> **权限位定义**：bitset 权限枚举定义位于 [`ref-4.6-security.md`](ref-4.6-security.md) §3（`Perm` 常量），各模块权限位分散定义。本模块提供管理端 UI 操作这些权限，不重新定义底层权限位。

---

## 30.1 角色管理增强

### 数据表结构

```typescript
// admin_roles — 管理员角色（已有）
export const adminRoles = pgTable("admin_roles", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 50 }).notNull().unique(),
  label: varchar("label", { length: 50 }).notNull(),
  description: text("description"),
  permissions: bigint("permissions", { mode: "number" }).notNull().default(0),
    // bitset 权限位
  isSystem: boolean("is_system").default(false),
    // 系统内置角色不可删除/改名
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// user_role_assignments — 用户角色分配（已有）
export const userRoleAssignments = pgTable("user_role_assignments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  roleId: integer("role_id").notNull().references(() => adminRoles.id),
  assignedBy: integer("assigned_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// user_permission_overrides — 用户权限覆写（已有）
export const userPermissionOverrides = pgTable("user_permission_overrides", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  grantPermissions: bigint("grant_permissions", { mode: "number" }).default(0),
    // 额外授予的权限位
  denyPermissions: bigint("deny_permissions", { mode: "number" }).default(0),
    // 拒绝的权限位
  reason: text("reason"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

### 权限位枚举（bitset 位定义）

```typescript
export const Perm = {
  // 📊 数据查看
  DASHBOARD_VIEW: 1 << 0,
  USER_LIST_VIEW: 1 << 1,
  USER_DETAIL_VIEW: 1 << 2,
  LOG_VIEW: 1 << 3,
  FINANCE_VIEW: 1 << 4,
  VENDOR_VIEW: 1 << 5,

  // 👥 用户管理
  USER_CREATE: 1 << 6,
  USER_EDIT: 1 << 7,
  USER_DISABLE: 1 << 8,
  USER_DELETE: 1 << 9,
  USER_ROLE_ASSIGN: 1 << 10,
  USER_PERM_OVERRIDE: 1 << 11,

  // 💰 资金操作
  BALANCE_VIEW: 1 << 12,
  BALANCE_ADJUST: 1 << 13,
  RECHARGE_MANAGE: 1 << 14,
  REFUND_PROCESS: 1 << 15,
  WITHDRAW_AUDIT: 1 << 16,

  // 🎫 工单管理
  TICKET_VIEW: 1 << 17,
  TICKET_REPLY: 1 << 18,
  TICKET_STATUS: 1 << 19,
  TICKET_ASSIGN: 1 << 20,
  TICKET_DELETE: 1 << 21,

  // 🏭 供应商管理
  VENDOR_CREATE: 1 << 22,
  VENDOR_EDIT: 1 << 23,
  VENDOR_DISABLE: 1 << 24,
  MODEL_MANAGE: 1 << 25,

  // ⚙️ 系统配置
  CONFIG_VIEW: 1 << 26,
  CONFIG_EDIT: 1 << 27,
  ROLE_MANAGE: 1 << 28,
  AUDIT_VIEW: 1 << 29,
  SYSTEM_BACKUP: 1 << 30,
  SYSTEM_UPGRADE: 1 << 31,
} as const;
```

> ⚠️ **bitset 容量**：JS 按位运算以 32 位有符号整数处理，超过 2^31 位（bit 31）会出现溢出问题。当前位定义已占用到 bit 31。**若将来需要扩展更多权限位**，需改用 `bigint` 存储模式或分块（多个 bigint 字段）承载，不应继续使用普通 number bitset。

### API 接口

```
GET    /api/v1/admin/roles                      — 角色列表
POST   /api/v1/admin/roles                      — 创建角色
  body: { name, label, description, permissions[] }
PATCH  /api/v1/admin/roles/:id                  — 编辑角色
DELETE /api/v1/admin/roles/:id                  — 删除角色
GET    /api/v1/admin/roles/permissions/list     — 权限位清单（分组树）
GET    /api/v1/admin/roles/users/:roleId        — 角色下的用户列表
GET    /api/v1/admin/roles/stats                — 角色统计（各角色用户数）
```

### 前端组件

```tsx
interface PermissionNode {
  group: string
  groupIcon?: string
  permissions: {
    key: string
    label: string
    description?: string
    checked: boolean
  }[]
}

interface RoleFormData {
  name: string
  label: string
  description?: string
  permissions: string[]  // 选中的权限 key
}
```

### 校验规则

| 规则 | 说明 |
|------|------|
| 角色名唯一 | name 字段唯一，创建时校验 |
| 系统角色保护 | isSystem=true 的角色不可删除、不可改名、不可移除全部权限 |
| 不能删除最后一位管理员 | 删除角色前检查是否仍有用户赋予该角色，避免无管理员 |
| 权限归属校验 | 权限 key 必须存在于权限清单，非法 key 拒绝保存 |

---

## 30.2 用户权限一览

### 有效权限计算逻辑

```
用户最终权限 = (角色权限集合) ∪ (覆写授予的权限) − (覆写拒绝的权限)

优先级（从高到低）：
1. 覆写拒绝的权限（denyPermissions）— 最高优先级，强制移除
2. 覆写授予的权限（grantPermissions）
3. 角色分配的权限（adminRoles.permissions）
```

### API 接口

```
GET    /api/v1/admin/users/:id/permissions           — 用户权限 bitset
PUT    /api/v1/admin/users/:id/permissions           — 权限覆写
  body: { grantPermissions[], denyPermissions[], reason }
DELETE /api/v1/admin/users/:id/permissions           — 清除覆写
GET    /api/v1/admin/users/:id/permissions/detail    — 权限详细
  response: {
    role: { id, name, label },
    overrides: { grantPermissions, denyPermissions, reason, createdAt },
    effective: PermissionGroup[]
  }
```

### 前端组件

```tsx
interface UserPermissionViewProps {
  userId: number
  role: { id: number; name: string; label: string }
  overrides?: {
    grantPermissions: string[]
    denyPermissions: string[]
    reason: string
  }
  effective: PermissionGroup[]
}
```

---

## 30.3 权限变更审计（P1）

### 审计事件类型

```
role_created / role_updated / role_deleted
user_role_assigned / user_role_removed
user_perm_override / user_perm_override_cleared
```

### 审计记录结构（复用 operation_logs 或独立表）

```
字段: operator, action, targetType(ticket/user/role), targetId, 
      before, after(JSON 变更前后对比), ip, createdAt
```

### API 接口

```
GET /api/v1/admin/audit-logs?type=role_created,role_updated,...
  params: { type, operatorId?, dateFrom?, dateTo?, page, limit }
```

### 验收标准

| # | 用例 | 预期 |
|---|------|------|
| 30.3-1 | 管理员修改角色权限 | 审计记录操作者、变更前后权限对比 |
| 30.3-2 | 按类型筛选 | 只看"分配角色"操作 |
| 30.3-3 | 权限变更详情 | 展示变更前后具体权限位差异 |

---

## 30.4 API Key 细粒度权限控制（P1）

> ⚠️ **边界声明**：本模块定位为**管理侧全局管控**（全局默认权限、强制覆盖、权限模板）。用户侧自服务 Key 权限配置在 **§20.4**（`SPEC-§20-用户端安全与预算增强.md`），两端共用同一套数据表，冲突时取更严格的一方生效。

### api_keys 表扩展字段

```typescript
// 在现有 api_keys 表基础扩展
export const apiKeys = pgTable("api_keys", {
  // ...现有字段
  ipWhitelist: text("ip_whitelist"),        // JSON array of IP/CIDR
  domainWhitelist: text("domain_whitelist"), // JSON array of domains
  dailyCallLimit: integer("daily_call_limit"),
  dailyTokenLimit: bigint("daily_token_limit", { mode: "number" }),
  dailyCostLimit: numeric("daily_cost_limit", { precision: 20, scale: 4 }),
});
```

### 权限检查逻辑（API 网关执行）

```
API 调用 → 获取 Key →
├── 1. Key 状态 active?
├── 2. 模型白名单是否允许该模型
├── 3. IP 白名单（若配置）: 来源 IP 匹配?
├── 4. 域名限制（若配置）: Origin/Referer 匹配?
├── 5. 每日限额: calls/tokens/cost 未超限
└── 任一不通过 → 403 + 具体错误码 + 详细信息
```

### 管理侧强制策略

| 策略类型 | 说明 |
|---------|------|
| 全局默认 IP 白名单 | 管理员设置全局强制 IP 范围 |
| 全局默认限额 | 所有新建 Key 继承的默认调用/Token/费用上限 |
| 强制覆盖 | 管理侧设置的最高限制，用户 Key 配置不能超过该上限 |

### API 接口

```
GET  /api/v1/me/api-keys/:id/usage-today    — 当日用量
  → { calls, tokens, cost, limits: { calls, tokens, cost } }
```

---

## 30.5 权限模板与预设角色（P1）

### 预设角色模板

| 模板名 | 包含权限 | 适用对象 |
|--------|---------|---------|
| operator 运营 | DASHBOARD_VIEW, USER_LIST_VIEW, FINANCE_VIEW, VENDOR_VIEW, TICKET_* | 一线运营 |
| finance 财务 | FINANCE_VIEW, BALANCE_VIEW, BALANCE_ADJUST, RECHARGE_MANAGE, WITHDRAW_AUDIT, REFUND_PROCESS | 财务岗 |
| support 客服 | USER_DETAIL_VIEW, LOG_VIEW, TICKET_* | 客服岗 |
| auditor 审计 | AUDIT_VIEW, LOG_VIEW | 审计岗 |
| viewer 只读 | DASHBOARD_VIEW, USER_LIST_VIEW | 只读查看 |

### API 接口

```
GET    /api/v1/admin/roles/templates            — 预设模板列表
POST   /api/v1/admin/roles/from-template        — 基于模板创建角色
  body: { template, name, label, overrides[] }
```

---

## 30.6 权限自检（P2）

### 功能描述

管理员查看自己当前实际拥有的权限，快速确认能否执行某项操作。

### API 接口

```
GET /api/v1/admin/me/permissions        — 我的有效权限
GET /api/v1/admin/me/permissions/check?perm=USER_DISABLE  — 检查某项权限
```

---

## 边界条件

| # | 场景 | 处理方式 |
|---|------|---------|
| PERM-001 | bitset 权限位超过 32 位溢出 | 改用 bigint 模式或分块存储（预留扩展设计） |
| PERM-002 | 删除被分配的角色 | 先检查是否仍有用户持有该角色，有则阻止并提示 |
| PERM-003 | 移除最后一位系统管理员角色 | 禁止移除，保证平台永远有管理入口 |
| PERM-004 | 权限覆写与角色权限冲突 | 按 deny > grant > role 优先级计算有效权限 |
| PERM-005 | 用户同时多角色 | 有效权限 = 所有角色权限并集，再叠加覆写逻辑 |
| PERM-006 | API Key IP 白名单为空 | 表示不限制来源 IP（全部允许） |
| PERM-007 | 用户侧与管理侧 Key 限额冲突 | 取更严格一方生效（收紧策略优先） |
| PERM-008 | 用户被禁用时权限变更审计 | 仍记录审计，但用户无法登录执行操作 |
| PERM-009 | 权限变更实时性 | 权限变更后需 1 分钟内对所有已登录会话生效（会话令牌校验） |
| PERM-010 | 角色改名冲突 | 唯一性校验，系统内置角色 name 不可改 |

---

## 上下游关系

```
§30 权限管理:
  ├── 权限位定义: ref-4.6-security.md §3 (Perm 常量)
  ├── bitset 权限引擎: adminRoles + userRoleAssignments + userPermissionOverrides
  ├── 用户侧 Key 权限: SPEC-§20-用户端安全与预算增强.md §20.4
  ├── 审计: §30.3 → operation_logs 审计服务 → ref-4.6-security
  ├── 预设角色: §30.5 → 通知服务 → 权限模板
  └── 管理面板: 管理后台 → 设置 → 角色管理
```
