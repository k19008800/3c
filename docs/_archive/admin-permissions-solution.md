# 3Cloud 后台权限管理方案

> 版本: V1.0 | 日期: 2026-06-30  
> 对应后端: Fastify + Drizzle ORM | 前端: React + TypeScript

---

## 一、现状与问题

### 当前状态

| 维度 | 现状 | 问题 |
|---|---|---|
| 角色 | `super_admin` / `admin` / `agent` / `user` 四种硬编码角色 | 角色颗粒度粗，`admin` 和 `super_admin` 共享全部权限 |
| 后端鉴权 | `requireRole("super_admin", "admin")` 统一 hook，所有 admin 路由无差异 | 无法限制普通 admin 访问财务审批、系统配置等敏感操作 |
| 前端鉴权 | Sidebar 按 `roles` 数组过滤菜单项 | 页面级可访问控制缺失，子按钮/操作无权限保护 |
| 双审机制 | 提现/充值已有 `first_review` / `second_review` 字段 | 硬编码在业务层，与权限系统解耦不够 |
| 扩展性 | 新增角色需修改多处代码 | 无集中的权限定义和管理入口 |

### 核心需求

1. **权限粒度细化**：从"角色级"细化为"操作级"（Permission）
2. **角色权限配置化**：后台可配置角色与权限的关联关系
3. **前后端一致**：前端展示与后端校验共享同一套权限模型
4. **渐进式迁移**：不影响现有业务逻辑，逐步替换
5. **兼容已有数据**：现有 `super_admin` / `admin` 自动映射为新角色

---

## 二、权限模型设计

### 2.1 核心概念

```
Role（角色）           ← 用户属于某个角色
  └── PermissionSet    ← 角色关联一组权限
        └── Permission ← 具体操作权限（resource:action）
              ├── resource: 管理模块（如 user, finance, system）
              └── action:   操作类型（如 read, write, approve）
```

### 2.2 权限定义（Resource:Action）

采用 **Resource:Action** 命名规范，便于理解和扩展。

#### 用户管理
| 权限标识 | 说明 | 关联路由 |
|---|---|---|
| `user:read` | 查看用户列表/详情 | `GET /admin/users`, `GET /admin/users/:id` |
| `user:write` | 编辑用户（角色/状态/实名等） | `PATCH /admin/users/:id` |
| `user:create` | 创建用户 | `POST /admin/users` |
| `user:delete` | 删除/注销用户 | `DELETE /admin/users/:id` |
| `user:recharge` | 余额调整 | `POST /admin/users/:id/recharge` |
| `user:reset-password` | 重置密码 | `POST /admin/users/:id/reset-pwd` |
| `user:impersonate` | 模拟登录用户 | `POST /admin/users/:id/impersonate` |
| `user:export` | 导出用户数据 | `GET /admin/users/export` |
| `user:real-name-review` | 实名审核操作 | `POST /admin/real-name-review/:id` |
| `user:real-name-read` | 查看实名审核记录 | `GET /admin/real-name-review` |

#### 模型 & 厂商管理
| 权限标识 | 说明 | 关联路由 |
|---|---|---|
| `model:read` | 查看模型/厂商/映射列表 | `GET /admin/models`, `GET /admin/vendors` |
| `model:write` | 编辑模型/厂商/映射 | `PATCH /admin/models/:id` |
| `model:create` | 创建模型/厂商/映射 | `POST /admin/models`, `POST /admin/vendors` |
| `model:delete` | 删除模型/厂商/映射 | `DELETE /admin/models/:id` |
| `model:price-edit` | 编辑定价（独立于 model:write） | `PATCH /admin/vendor-models/:id` |
| `model:price-read` | 查看成本价（敏感） | `GET /admin/vendor-models` (含成本价字段) |

#### 订单 & 财务
| 权限标识 | 说明 | 关联路由 |
|---|---|---|
| `recharge:read` | 查看充值订单 | `GET /admin/recharge-orders` |
| `recharge:first-confirm` | 对公转账初审 | `POST /admin/recharge-orders/:id/first-confirm` |
| `recharge:second-confirm` | 对公转账复审 | `POST /admin/recharge-orders/:id/second-confirm` |
| `recharge:cancel` | 取消充值订单 | `POST /admin/recharge-orders/:id/cancel` |
| `finance:read` | 查看财务工作台/佣金流水 | `GET /admin/finance/*` |
| `finance:commission-settle` | 佣金结算操作 | `POST /admin/finance/commissions/settle` |
| `finance:commission-cancel` | 佣金撤销 | `POST /admin/finance/commissions/cancel` |
| `finance:reconciliation` | 对账报表查看 | `GET /admin/finance/reconciliation` |
| `finance:reconciliation-export` | 对账报表导出 | `GET /admin/finance/reconciliation/export` |

#### 提现管理
| 权限标识 | 说明 | 关联路由 |
|---|---|---|
| `withdraw:read` | 查看提现列表 | `GET /admin/withdraws` |
| `withdraw:first-review` | 提现初审 | `POST /admin/withdraws/:id/first-review` |
| `withdraw:second-review` | 提现复审 | `POST /admin/withdraws/:id/second-review` |
| `withdraw:mark-paid` | 标记打款 | `POST /admin/withdraws/:id/mark-paid` |
| `withdraw:export` | 导出提现记录 | `GET /admin/withdraws/export` |
| `withdraw:batch-review` | 批量审核 | `POST /admin/withdraws/batch-review` |

#### 代理商管理
| 权限标识 | 说明 | 关联路由 |
|---|---|---|
| `agent:read` | 查看代理商列表/详情 | `GET /admin/agents` |
| `agent:write` | 编辑代理商信息 | `PATCH /admin/agents/:id` |
| `agent:create` | 创建代理商 | `POST /admin/agents` |
| `agent:disable` | 冻结/解冻代理商 | `POST /admin/agents/:id/toggle-status` |

#### 系统配置
| 权限标识 | 说明 | 关联路由 |
|---|---|---|
| `system:config-read` | 查看系统配置 | `GET /admin/configs` |
| `system:config-write` | 编辑系统配置（含敏感配置） | `PATCH /admin/configs/:key` |
| `system:email-template-read` | 查看邮件模板 | `GET /admin/email-templates` |
| `system:email-template-write` | 编辑邮件模板 | `PATCH /admin/email-templates/:id` |
| `system:page-content-read` | 查看页面内容 | `GET /admin/page-contents` |
| `system:page-content-write` | 编辑页面内容 | `PATCH /admin/page-contents/:slug` |

#### 安全风控
| 权限标识 | 说明 | 关联路由 |
|---|---|---|
| `security:read` | 查看安全概览/事件/配置 | `GET /admin/security/*` |
| `security:write` | 修改安全配置 | `PATCH /admin/security/config/:key` |
| `security:ban` | 封禁/解封 IP 或用户 | `POST /admin/security/bans/*` |
| `security:acknowledge` | 确认安全事件 | `POST /admin/security/events/:id/acknowledge` |

#### 审计日志
| 权限标识 | 说明 | 关联路由 |
|---|---|---|
| `audit:read` | 查看审计日志 | `GET /admin/audit-logs` |
| `audit:export` | 导出审计日志 | `GET /admin/audit-logs/export` |

#### 调用日志（管理端）
| 权限标识 | 说明 | 关联路由 |
|---|---|---|
| `call-log:read` | 查看全部用户调用日志 | `GET /admin/logs` |
| `call-log:export` | 导出调用日志 | `GET /admin/logs/export` |

#### 仪表盘
| 权限标识 | 说明 | 关联路由 |
|---|---|---|
| `dashboard:read` | 查看管理仪表盘 | `GET /admin/dashboard` |
| `dashboard:health-read` | 查看系统健康面板 | `GET /admin/health` |

### 2.3 角色定义

| 角色名 | 标识 | 权限范围 |
|---|---|---|
| 超级管理员 | `super_admin` | 所有权限（通配符 `*:*`） |
| 管理员 | `admin` | 默认：运营类权限（user:read/write, model:read/write/recharge, call-log:read, agent:read/write, dashboard:read, recharge:read, security:read），但不含财务审批、系统配置、提现等敏感操作 |
| 财务专员 | `finance_ops` | finance:*, recharge:*, withdraw:*, commission:*。不包括 model:write、system:config-write 等 |
| 运营专员 | `ops` | user:read, model:read, call-log:read, agent:read, dashboard:read, security:read（只读） |
| 客服专员 | `support` | user:read, user:real-name-review, user:reset-password, audit:read, call-log:read |
| 审计员 | `auditor` | audit:read, audit:export, finance:read, reconciliation:read（只读查看） |
| 代理商 | `agent` | 已有独立页面，不在此次权限体系内 |
| 普通用户 | `user` | 不进入后台 |

> 后续可在后台 UI 中自由组合权限创建新角色。

### 2.4 权限预置包（Seed）

为每个内置角色预设默认权限集，首次部署时写入。

---

## 三、数据库设计

### 3.1 新增表

#### `admin_roles` — 管理角色定义

```sql
CREATE TABLE admin_roles (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(50) NOT NULL UNIQUE,   -- 角色标识: super_admin / admin / finance_ops
  label         VARCHAR(100) NOT NULL,          -- 展示名: 超级管理员 / 管理员 / 财务专员
  description   TEXT,                           -- 角色描述
  is_system     BOOLEAN NOT NULL DEFAULT false,  -- 系统内置角色（不可删除/改名）
  priority      INTEGER NOT NULL DEFAULT 0,     -- 排序权重
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### `admin_permissions` — 权限定义表（用于展示和校验）

```sql
CREATE TABLE admin_permissions (
  id            SERIAL PRIMARY KEY,
  resource      VARCHAR(50) NOT NULL,           -- 资源: user / model / finance / system / agent
  action        VARCHAR(50) NOT NULL,           -- 操作: read / write / approve / create / delete
  label         VARCHAR(100) NOT NULL,          -- 展示名: 查看用户 / 编辑用户
  description   TEXT,                           -- 说明
  group_name    VARCHAR(50),                    -- 分组: 用户管理 / 财务 / 系统
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(resource, action)
);
```

#### `admin_role_permissions` — 角色-权限关联

```sql
CREATE TABLE admin_role_permissions (
  id            SERIAL PRIMARY KEY,
  role_id       INTEGER NOT NULL REFERENCES admin_roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES admin_permissions(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(role_id, permission_id)
);
```

#### `admin_user_roles` — 用户-角色关联（支持多角色）

```sql
CREATE TABLE admin_user_roles (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id       INTEGER NOT NULL REFERENCES admin_roles(id) ON DELETE CASCADE,
  granted_by    INTEGER REFERENCES users(id),  -- 授权人
  granted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, role_id)
);
```

#### `admin_role_permission_cache` — 用户权限缓存（查性能优化）

```sql
CREATE TABLE admin_role_permission_cache (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  permissions   TEXT[] NOT NULL,       -- 权限标识数组: {user:read,user:write,finance:read}
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 3.2 权限缓存策略

- **读路径**: Redis cache（key=`perm:user:{userId}`, TTL=300s）
- **写路径**: 角色/权限变更时，清除相关用户的 Redis 缓存，并异步更新 `admin_role_permission_cache` 表
- **兜底**: Redis 不可用时，走 PG 查询 `admin_user_roles` → `admin_role_permissions` → `admin_permissions`

### 3.3 数据迁移

**现有用户迁移**：

```sql
-- 将现有 role='super_admin' 的用户关联到 super_admin 角色
INSERT INTO admin_user_roles (user_id, role_id, granted_by)
SELECT u.id, r.id, u.id
FROM users u, admin_roles r
WHERE u.role = 'super_admin' AND r.name = 'super_admin';

-- 将现有 role='admin' 的用户关联到 admin 角色
INSERT INTO admin_user_roles (user_id, role_id, granted_by)
SELECT u.id, r.id, u.id
FROM users u, admin_roles r
WHERE u.role = 'admin' AND r.name = 'admin';

-- 移除 users.role 的后台管理意义（保留兼容性字段）
-- users.role 字段不再用于鉴权，仅保留为兼容字段
```

### 3.4 现有 users 表兼容

`users.role` 字段保留不变，作为**信息字段**（向下兼容）。鉴权逻辑改为：
1. 优先查 `admin_user_roles` 获取用户的角色列表
2. 若 `admin_user_roles` 无记录，回退到 `users.role`（兼容旧数据）

---

## 四、后端实现

### 4.1 核心中间件

#### `permission.ts` — 权限中间件

```typescript
// src/middleware/permission.ts

import { FastifyRequest, FastifyReply } from "fastify";
import { getDb } from "../db/index.js";
import { getRedis } from "../redis.js";
import { adminUserRoles, adminRolePermissions, adminPermissions, adminRoles } from "../db/schema.js";
import { eq, inArray, sql } from "drizzle-orm";

/**
 * 获取用户的所有权限标识
 * 缓存策略: Redis -> admin_role_permission_cache -> 实时查询
 */
export async function getUserPermissions(userId: number): Promise<string[]> {
  const redis = getRedis();
  const cacheKey = `perm:user:${userId}`;

  // 1. 查 Redis 缓存
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as string[];
    }
  } catch { /* Redis 不可用时忽略 */ }

  const db = getDb();

  // 2. 查 admin_role_permission_cache 表
  const [cachedRow] = await db
    .select({ permissions: sql<string[]>`permissions` })
    .from(adminRolePermissionCache)
    .where(eq(adminRolePermissionCache.userId, userId))
    .limit(1);

  if (cachedRow && cachedRow.permissions && cachedRow.permissions.length > 0) {
    // 写回 Redis
    await redis.setex(cacheKey, 300, JSON.stringify(cachedRow.permissions));
    return cachedRow.permissions;
  }

  // 3. 实时查询（兜底）
  const rows = await db
    .select({
      resource: adminPermissions.resource,
      action: adminPermissions.action,
    })
    .from(adminUserRoles)
    .innerJoin(adminRolePermissions, eq(adminUserRoles.roleId, adminRolePermissions.roleId))
    .innerJoin(adminPermissions, eq(adminRolePermissions.permissionId, adminPermissions.id))
    .innerJoin(adminRoles, eq(adminUserRoles.roleId, adminRoles.id))
    .where(eq(adminUserRoles.userId, userId));

  const perms = rows.map(r => `${r.resource}:${r.action}`);

  // 写回缓存表 + Redis
  if (rows.length > 0) {
    await db
      .insert(adminRolePermissionCache)
      .values({ userId, permissions: perms as any })
      .onConflictDoUpdate({
        target: adminRolePermissionCache.userId,
        set: { permissions: perms as any, updatedAt: new Date() },
      });

    await redis.setex(cacheKey, 300, JSON.stringify(perms));
  }

  return perms;
}

/**
 * 清除用户权限缓存
 */
export async function clearUserPermissionCache(userId: number) {
  const redis = getRedis();
  await redis.del(`perm:user:${userId}`);
}

/**
 * 权限检查中间件工厂函数
 * @param permission 权限标识，如 "finance:second-review"
 * @returns Fastify preHandler hook
 */
export function requirePermission(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      reply.status(401).send({ code: 401, data: null, message: "未认证" });
      return;
    }

    const userId = request.user.userId;
    const perms = await getUserPermissions(userId);

    // super_admin 通配符
    if (perms.includes("*:*")) return;

    if (!perms.includes(permission)) {
      reply.status(403).send({
        code: 403,
        data: null,
        message: `缺少权限: ${permission}`,
      });
      return;
    }
  };
}

/**
 * 检查多个权限（任一满足即可）
 */
export function requireAnyPermission(...permissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      reply.status(401).send({ code: 401, data: null, message: "未认证" });
      return;
    }

    const userId = request.user.userId;
    const perms = await getUserPermissions(userId);

    if (perms.includes("*:*")) return;

    const hasAny = permissions.some(p => perms.includes(p));
    if (!hasAny) {
      reply.status(403).send({
        code: 403,
        data: null,
        message: `缺少权限: ${permissions.join(" / ")}`,
      });
      return;
    }
  };
}

/**
 * 检查多个权限（全部满足）
 */
export function requireAllPermissions(...permissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      reply.status(401).send({ code: 401, data: null, message: "未认证" });
      return;
    }

    const userId = request.user.userId;
    const perms = await getUserPermissions(userId);

    if (perms.includes("*:*")) return;

    const hasAll = permissions.every(p => perms.includes(p));
    if (!hasAll) {
      reply.status(403).send({
        code: 403,
        data: null,
        message: "缺少必要权限",
      });
      return;
    }
  };
}
```

#### 向后兼容适配

在过渡期，保留 `requireRole` 和 `requirePermission` 双轨运行：

```typescript
/**
 * 兼容中间件：同时检查角色和权限
 * 先查权限系统，失败后回退到 requireRole
 */
export function requireAdminAccess(...adminRoles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      reply.status(401).send({ code: 401, data: null, message: "未认证" });
      return;
    }

    // 尝试权限检查
    const userId = request.user.userId;
    const perms = await getUserPermissions(userId);

    // super_admin 通配
    if (perms.includes("*:*")) return;

    // 如果有权限记录，用新系统
    if (perms.length > 0) {
      // 仍需兼容旧角色兜底
      const db = getDb();
      const row = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (row.length > 0 && adminRoles.includes(row[0].role)) return;

      reply.status(403).send({
        code: 403,
        data: null,
        message: "没有管理员权限",
      });
      return;
    }

    // 回退到旧的 requireRole
    if (!adminRoles.includes(request.user.role)) {
      reply.status(403).send({
        code: 403,
        data: null,
        message: `需要 ${adminRoles.join("/")} 角色`,
      });
      return;
    }
  };
}
```

### 4.2 路由改造示例

**当前写法**：
```typescript
app.addHook("preHandler", authenticateJWT);
app.addHook("preHandler", requireRole("super_admin", "admin"));
```

**改造后**（以 `withdraw` 路由为例）：
```typescript
app.addHook("preHandler", authenticateJWT);

// 读取操作：所有人有 withdraw:read
app.get("/api/v1/admin/withdraws", {
  preHandler: [requireAnyPermission("withdraw:read", "finance:read")]
}, async (request, reply) => { ... });

// 初审操作：需要 withdraw:first-review
app.post("/api/v1/admin/withdraws/:id/first-review", {
  preHandler: [requirePermission("withdraw:first-review")]
}, async (request, reply) => { ... });

// 复审操作：需要 withdraw:second-review
app.post("/api/v1/admin/withdraws/:id/second-review", {
  preHandler: [requirePermission("withdraw:second-review")]
}, async (request, reply) => { ... });

// 标记打款：需要 withdraw:mark-paid
app.post("/api/v1/admin/withdraws/:id/mark-paid", {
  preHandler: [requirePermission("withdraw:mark-paid")]
}, async (request, reply) => { ... });
```

### 4.3 角色/权限管理 API

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/v1/admin/permissions` | `system:config-read` | 获取所有权限定义 |
| GET | `/api/v1/admin/roles` | `system:config-read` | 获取角色列表 |
| POST | `/api/v1/admin/roles` | `system:config-write` | 创建角色 |
| PUT | `/api/v1/admin/roles/:id` | `system:config-write` | 修改角色 |
| DELETE | `/api/v1/admin/roles/:id` | `system:config-write` | 删除角色（非内置） |
| GET | `/api/v1/admin/roles/:id/permissions` | `system:config-read` | 获取角色权限 |
| PUT | `/api/v1/admin/roles/:id/permissions` | `system:config-write` | 设置角色权限 |
| GET | `/api/v1/admin/users/:id/roles` | `user:read` | 获取用户角色 |
| PUT | `/api/v1/admin/users/:id/roles` | `user:write` | 设置用户角色 |
| GET | `/api/v1/admin/me/permissions` | 已认证 | 获取当前用户权限（前端用） |

### 4.4 审计日志增强

`auditActionEnum` 补充权限相关操作：
```
role_create, role_update, role_delete
role_permission_set
user_role_set, user_role_remove
```

---

## 五、前端实现

### 5.1 权限 Hook

```typescript
// src/hooks/use-permissions.tsx

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';

interface PermissionContextType {
  permissions: string[];
  isLoaded: boolean;
  can: (permission: string) => boolean;
  canAny: (...permissions: string[]) => boolean;
  canAll: (...permissions: string[]) => boolean;
  hasRole: (role: string) => boolean;
  roles: string[];
}

const PermissionContext = createContext<PermissionContextType>({
  permissions: [],
  isLoaded: false,
  can: () => false,
  canAny: () => false,
  canAll: () => false,
  hasRole: () => false,
  roles: [],
});

export function PermissionProvider({ children }: { children: React.ReactNode }) {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setIsLoaded(true);
      return;
    }

    // 后端返回当前用户权限列表
    api.get<{ data: { permissions: string[]; roles: string[] } }>('/api/v1/admin/me/permissions')
      .then(res => {
        setPermissions(res.data.data.permissions || []);
        setRoles(res.data.data.roles || []);
      })
      .catch(() => {
        setPermissions([]);
        setRoles([]);
      })
      .finally(() => setIsLoaded(true));
  }, []);

  const can = useCallback((perm: string) => {
    if (permissions.includes('*:*')) return true; // super_admin 通配
    return permissions.includes(perm);
  }, [permissions]);

  const canAny = useCallback((...perms: string[]) => {
    if (permissions.includes('*:*')) return true;
    return perms.some(p => permissions.includes(p));
  }, [permissions]);

  const canAll = useCallback((...perms: string[]) => {
    if (permissions.includes('*:*')) return true;
    return perms.every(p => permissions.includes(p));
  }, [permissions]);

  const hasRole = useCallback((role: string) => {
    return roles.includes(role);
  }, [roles]);

  return (
    <PermissionContext.Provider value={{ permissions, isLoaded, can, canAny, canAll, hasRole, roles }}>
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionContext);
}
```

### 5.2 权限组件

```typescript
// src/components/permissions/Can.tsx

import { usePermissions } from '@/hooks/use-permissions';

interface CanProps {
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/** 基于权限的条件渲染 */
export function Can({ permission, children, fallback = null }: CanProps) {
  const { can } = usePermissions();
  return can(permission) ? <>{children}</> : <>{fallback}</>;
}

interface CanAnyProps {
  permissions: string[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/** 任意权限满足 */
export function CanAny({ permissions, children, fallback = null }: CanAnyProps) {
  const { canAny } = usePermissions();
  return canAny(...permissions) ? <>{children}</> : <>{fallback}</>;
}
```

### 5.3 Sidebar 权限化

改造 `Sidebar.tsx`，不再只靠 `roles` 字段，而是结合权限：

```typescript
// 在 sidebar 中使用
const { can } = usePermissions();

// 仪表盘
{ can('dashboard:read') && <SidebarItem ... /> }

// 用户管理
{ can('user:read') && <SidebarItem ... /> }

// 财务管理（条件细化）
{ canAny('finance:read', 'recharge:read', 'withdraw:read') && (
  <SidebarGroup label="财务管理">
    {can('finance:read') && <SidebarItem to="/admin/finance/dashboard" label="财务工作台" />}
    {can('recharge:read') && <SidebarItem to="/admin/recharge-orders" label="充值订单" />}
    {can('withdraw:read') && <SidebarItem to="/admin/withdraws" label="提现管理" />}
  </SidebarGroup>
)}
```

### 5.4 页面级权限保护

```typescript
// src/components/permissions/RequirePermission.tsx

import { Navigate } from 'react-router-dom';
import { usePermissions } from '@/hooks/use-permissions';

/** 页面路由守卫 */
export function RequirePermission({ permission, children }: { permission: string; children: React.ReactNode }) {
  const { can, isLoaded } = usePermissions();
  
  if (!isLoaded) return <div>加载中...</div>;
  if (!can(permission)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
```

### 5.5 页面内操作按钮隐藏

```tsx
// 例：提现管理页，仅 second-review 权限可见的复审按钮
import { Can } from '@/components/permissions/Can';

<Can permission="withdraw:second-review">
  <Button onClick={() => handleSecondReview(row.id)}>复审</Button>
</Can>

<Can permission="withdraw:mark-paid">
  <Button onClick={() => handleMarkPaid(row.id)}>标记打款</Button>
</Can>
```

### 5.6 角色管理页面

新增管理页面：`/admin/roles`

| 功能 | 说明 |
|---|---|
| 角色列表 | 展示所有角色，含角色名、描述、关联用户数 |
| 创建角色 | 输入角色名、描述，选择权限集 |
| 编辑角色 | 修改角色权限集 |
| 删除角色 | 仅非系统内置角色可删除 |
| 用户角色分配 | 在用户详情页中，多选角色分配 |

---

## 六、种子数据

### 6.1 权限种子数据

```typescript
// src/db/seed-permissions.ts

export const DEFAULT_PERMISSIONS = [
  // 用户管理
  { resource: 'user', action: 'read', label: '查看用户', group: '用户管理' },
  { resource: 'user', action: 'write', label: '编辑用户', group: '用户管理' },
  { resource: 'user', action: 'create', label: '创建用户', group: '用户管理' },
  { resource: 'user', action: 'delete', label: '删除用户', group: '用户管理' },
  { resource: 'user', action: 'recharge', label: '余额调整', group: '用户管理' },
  { resource: 'user', action: 'reset-password', label: '重置密码', group: '用户管理' },
  { resource: 'user', action: 'impersonate', label: '模拟登录', group: '用户管理' },
  { resource: 'user', action: 'export', label: '导出用户', group: '用户管理' },
  { resource: 'user', action: 'real-name-review', label: '实名审核', group: '用户管理' },
  { resource: 'user', action: 'real-name-read', label: '实名查看', group: '用户管理' },
  // 模型管理
  { resource: 'model', action: 'read', label: '查看模型', group: '模型管理' },
  { resource: 'model', action: 'write', label: '编辑模型', group: '模型管理' },
  { resource: 'model', action: 'create', label: '创建模型', group: '模型管理' },
  { resource: 'model', action: 'delete', label: '删除模型', group: '模型管理' },
  { resource: 'model', action: 'price-edit', label: '编辑定价', group: '模型管理' },
  { resource: 'model', action: 'price-read', label: '查看成本价', group: '模型管理' },
  // 充值
  { resource: 'recharge', action: 'read', label: '查看充值订单', group: '充值管理' },
  { resource: 'recharge', action: 'first-confirm', label: '充值初审', group: '充值管理' },
  { resource: 'recharge', action: 'second-confirm', label: '充值复审', group: '充值管理' },
  { resource: 'recharge', action: 'cancel', label: '取消订单', group: '充值管理' },
  // 财务
  { resource: 'finance', action: 'read', label: '查看财务工作台', group: '财务管理' },
  { resource: 'finance', action: 'commission-settle', label: '佣金结算', group: '财务管理' },
  { resource: 'finance', action: 'commission-cancel', label: '佣金撤销', group: '财务管理' },
  { resource: 'finance', action: 'reconciliation', label: '对账报表', group: '财务管理' },
  { resource: 'finance', action: 'reconciliation-export', label: '导出对账', group: '财务管理' },
  // 提现
  { resource: 'withdraw', action: 'read', label: '查看提现', group: '提现管理' },
  { resource: 'withdraw', action: 'first-review', label: '提现初审', group: '提现管理' },
  { resource: 'withdraw', action: 'second-review', label: '提现复审', group: '提现管理' },
  { resource: 'withdraw', action: 'mark-paid', label: '标记打款', group: '提现管理' },
  { resource: 'withdraw', action: 'export', label: '导出提现', group: '提现管理' },
  { resource: 'withdraw', action: 'batch-review', label: '批量审核', group: '提现管理' },
  // 代理商
  { resource: 'agent', action: 'read', label: '查看代理商', group: '代理商管理' },
  { resource: 'agent', action: 'write', label: '编辑代理商', group: '代理商管理' },
  { resource: 'agent', action: 'create', label: '创建代理商', group: '代理商管理' },
  { resource: 'agent', action: 'disable', label: '冻结/解冻', group: '代理商管理' },
  // 系统
  { resource: 'system', action: 'config-read', label: '查看配置', group: '系统管理' },
  { resource: 'system', action: 'config-write', label: '编辑配置', group: '系统管理' },
  { resource: 'system', action: 'email-template-read', label: '查看邮件模板', group: '系统管理' },
  { resource: 'system', action: 'email-template-write', label: '编辑邮件模板', group: '系统管理' },
  { resource: 'system', action: 'page-content-read', label: '查看页面', group: '系统管理' },
  { resource: 'system', action: 'page-content-write', label: '编辑页面', group: '系统管理' },
  // 安全
  { resource: 'security', action: 'read', label: '查看安全', group: '安全管理' },
  { resource: 'security', action: 'write', label: '编辑安全配置', group: '安全管理' },
  { resource: 'security', action: 'ban', label: '封禁操作', group: '安全管理' },
  { resource: 'security', action: 'acknowledge', label: '确认事件', group: '安全管理' },
  // 审计
  { resource: 'audit', action: 'read', label: '查看审计日志', group: '审计管理' },
  { resource: 'audit', action: 'export', label: '导出审计日志', group: '审计管理' },
  // 调用日志
  { resource: 'call-log', action: 'read', label: '查看调用日志', group: '调用日志' },
  { resource: 'call-log', action: 'export', label: '导出调用日志', group: '调用日志' },
  // 仪表盘
  { resource: 'dashboard', action: 'read', label: '查看仪表盘', group: '仪表盘' },
  { resource: 'dashboard', action: 'health-read', label: '系统健康面板', group: '仪表盘' },
  // 权限管理（只给 super_admin）
  { resource: 'permission', action: 'manage', label: '权限管理', group: '系统管理' },
];
```

### 6.2 内置角色-权限映射

| 角色 | 权限集合 |
|---|---|
| `super_admin` | `*:*`（通配符，不逐个分配） |
| `admin` | user:read, user:write, user:recharge, user:real-name-review, model:read, model:write, model:create, model:price-edit, recharge:read, finance:read, finance:reconciliation, agent:read, agent:write, agent:create, call-log:read, dashboard:read, security:read, audit:read, system:config-read |
| `finance_ops` | finance:*, recharge:*, withdraw:*, commission:* |
| `ops` | user:read, model:read, call-log:read, agent:read, dashboard:read, security:read, audit:read |
| `support` | user:read, user:real-name-review, user:reset-password, audit:read, call-log:read |
| `auditor` | audit:read, audit:export, finance:read, finance:reconciliation |

---

## 七、开发实施计划

### 总体路线：三阶段迭代

### Phase 1（核心基建）— 2-3 天

| 序号 | 任务 | 产出 | 负责人 |
|---|---|---|---|
| 1.1 | 新增数据库表（迁移脚本） | 新增 4 张表 + 缓存表 | 后端 |
| 1.2 | 权限种子数据脚本 | `seed-permissions.ts`，预置 50+ 权限 + 6 个内置角色 | 后端 |
| 1.3 | 现有用户迁移脚本 | 将 `users.role` 数据迁移到 `admin_user_roles` | 后端 |
| 1.4 | `permission.ts` 中间件 | `requirePermission` / `requireAnyPermission` / `requireAllPermissions` | 后端 |
| 1.5 | 角色/权限管理 API | CRUD 角色、设置权限、获取用户权限 | 后端 |
| 1.6 | `GET /admin/me/permissions` | 供前端调用的当前用户权限端点 | 后端 |
| 1.7 | 权限管理后台页面 | /admin/roles — 角色列表、创建、编辑权限、用户分配 | 全栈 |

### Phase 2（路由改造）— 2-3 天

| 序号 | 任务 | 产出 | 负责人 |
|---|---|---|---|
| 2.1 | 用户管理路由权限细化 | `user:read` / `user:write` / `user:recharge` / `user:real-name-review` | 后端 |
| 2.2 | 模型管理路由权限细化 | `model:read` / `model:write` / `model:price-edit` / `model:price-read` | 后端 |
| 2.3 | 充值/财务路由权限细化 | `recharge:*` / `finance:*` / `withdraw:*` | 后端 |
| 2.4 | 代理商/安全/系统路由权限细化 | 各模块分拆 read/write/approve 级别 | 后端 |
| 2.5 | 仪表盘/调用日志路由权限细化 | `dashboard:read` / `call-log:read` | 后端 |
| 2.6 | 统一 `requireRole` 替换为 `requirePermission` | 全部 admin 路由替换 | 后端 |

### Phase 3（前端权限化）— 2-3 天

| 序号 | 任务 | 产出 | 负责人 |
|---|---|---|---|
| 3.1 | `usePermissions` hook | 加载用户权限列表，提供 `can()` / `canAny()` / `canAll()` | 前端 |
| 3.2 | `PermissionProvider` | 包裹应用，初始化权限加载 | 前端 |
| 3.3 | `Can` / `CanAny` 组件 | 条件渲染权限控制组件 | 前端 |
| 3.4 | `RequirePermission` 路由守卫 | 页面级权限保护 | 前端 |
| 3.5 | Sidebar 权限化改造 | 菜单项按 `can()` 动态过滤 | 前端 |
| 3.6 | 各管理页面操作按钮权限化 | 隐藏无权限的操作按钮 | 前端 |
| 3.7 | 用户详情页角色分配 UI | 多选角色、显示已有角色 | 前端 |
| 3.8 | 权限管理页完善 | 界面交互打磨 | 前端 |

### Phase 4（测试 & 上线）— 1-2 天

| 序号 | 任务 | 产出 | 负责人 |
|---|---|---|---|
| 4.1 | 全量 admin 路由权限回归测试 | 各角色按预期有/无权限 | QA |
| 4.2 | 性能测试（权限缓存） | 确认 Redis 缓存命中 | QA |
| 4.3 | 生产环境部署 | 迁移 + 种子数据 | 运维 |
| 4.4 | 权限管理文档 | 内部 wiki，说明各角色权限 | 后端 |
| 4.5 | 遗留权限清理 | 移除 `requireRole` 兼容代码 | 后端 |

---

## 八、安全考量

### 8.1 防绕过

- **后端是唯一可信的权限边界**：前端所有权限控制仅为 UX 优化，后端必须做完整校验
- **`requirePermission` 必须写在每个敏感路由上**：不可依赖前端传参来控制权限
- **超级管理员通配符**：`*:*` 仅在 `admin_roles.name='super_admin'` 时可用，从代码层面禁止手动插入

### 8.2 缓存安全

- 权限变更时，必须立即清除受影响用户的 Redis + PG 缓存
- TTL 设 5 分钟，兼顾性能与时效
- Redis 不可用时，自动降级为 PG 实时查询

### 8.3 审计追踪

- 角色创建/修改/删除 → 写入 `audit_logs`
- 用户角色分配变更 → 写入 `audit_logs` + `user_role_history`
- 权限集修改 → 记录变更前后快照

---

## 九、附录

### A. 迁移回退方案

如需回退到旧的 `requireRole` 模式：
1. 保留 `users.role` 字段的兼容赋值
2. 在中间件中加 feature flag：`USE_NEW_PERMISSION_SYSTEM`
3. 环境变量 `PERMISSION_SYSTEM=legacy|new` 切换
4. `adminRolePermissionCache` 表可作为纯缓存，不影响业务数据

### B. 扩展性

- 新增资源/操作时，只需在 `admin_permissions` 表插入新记录
- 新增角色时，只需在 `admin_roles` 表插入 + 关联权限
- 第三方集成（OAuth、API Token 管理后台）同理扩展

### C. 与现有双审机制的关系

现状中的 `first_review` / `second_review` 双审机制，本质是**工作流**而非纯权限控制。本方案只解决"谁能看到/执行"的问题。双审的业务逻辑（同一人不能同时初审复审）仍需在业务层实现，可利用本系统的 `requirePermission` + 当前用户 ID 检查来辅助：
```typescript
// 提现复审时检查不是同一个人
app.post("/api/v1/admin/withdraws/:id/second-review", {
  preHandler: [requirePermission("withdraw:second-review")]
}, async (request, reply) => {
  const order = await db.select().from(withdrawOrders).where(eq(withdrawOrders.id, id)).limit(1);
  if (order[0].firstAuditorId === request.user!.userId) {
    reply.status(400).send({ code: 400, data: null, message: "初审与复审不能为同一人" });
    return;
  }
  // ...
});
```
