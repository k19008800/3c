# 3cloud 后台管理角色重构方案

> 版本: v1.0  
> 日期: 2026-06-30  
> 目标: 建立 6 级管理角色体系，梳理/合并/排序后台路由

---

## 一、现状分析

### 1.1 当前权限体系

现有后台所有路由统一使用 `requireRole("super_admin", "admin")`，只有 2 级权限：

| 角色值 | 说明 |
|---|---|
| `super_admin` | 全权限 |
| `admin` | 通用管理（= super_admin 的子集，但实际未做拆分） |

**问题：**

- 无财务、运营、客服、审计等细分角色
- 所有 admin 都能看到/操作所有功能（包括提现、系统配置等敏感项）
- ```admin/users.ts``` 文件达 2600+ 行，掺杂了用户管理、实名审核、API Key 管理等不同职责
- 审计日志在 `admin/system.ts` 中，与系统配置耦合
- 实名审核逻辑在 `admin/users.ts` 中，与用户管理耦合
- 充值审核（recharge-admin）和提现审核（withdraws）是独立的 route 文件，但 finance route 里也有佣金相关操作，边界模糊

### 1.2 现有后台路由全景

**12 个 route 文件 = 约 97 个 API 端点：**

| 文件 | 端点数量 | 核心职责 | 当前权限 |
|---|---|---|---|
| `users.ts` | ~35 | 用户CRUD、实名审核、API Key管理、登录历史、调用统计、用户备注、IP白名单、导入导出、模拟登录、角色变更 | super_admin, admin |
| `vendors.ts` | 5 | 厂商CRUD | super_admin, admin |
| `models.ts` | 4 | 模型CRUD | super_admin, admin |
| `vendor-models.ts` | 5 | 厂商-模型关联CRUD、定价、权重 | super_admin, admin |
| `dashboard.ts` | 5 | 仪表盘统计、健康检查、趋势 | super_admin, admin |
| `logs.ts` | 1 | 调用日志查看 | super_admin, admin |
| `finance.ts` | 9 | 财务工作台、佣金、对账报表、结算 | super_admin, admin |
| `withdraws.ts` | 8 | 提现初审/复审/打款/导出 | super_admin, admin |
| `recharge-admin.ts` | 6 | 充值订单、初审/复审/取消 | super_admin, admin |
| `agents.ts` | 11 | 代理商CRUD、客户绑定、佣金规则、上下级 | super_admin, admin |
| `security.ts` | 15 | 安全配置、安全事件、封禁、熔断 | super_admin, admin |
| `system.ts` | 6 | 系统配置、审计日志、密钥轮换、安全审计 | super_admin, admin |

---

## 二、目标角色定义

### 2.1 角色枚举

| 角色值 | 中文名 | 说明 |
|---|---|---|
| `super_admin` | 超级管理员 | 全权限，无限制 |
| `admin` | 通用管理员 | 日常管理：用户管理、模型管理；不可操作资金和系统配置 |
| `finance_ops` | 财务专员 | 提现复审、对账报表、佣金结算、充值订单操作 |
| `ops` | 运营专员 | 只读：查看用户、模型、调用日志 |
| `support` | 客服专员 | 实名审核、重置密码 |
| `auditor` | 审计员 | 仅审计日志 + 对账报表（只读） |

### 2.2 新增 DB 枚举

```ts
// 现有 userRoleEnum 扩展
export const userRoleEnum = pgEnum("user_role", [
  "super_admin",
  "admin",
  "finance_ops",
  "ops",
  "support",
  "auditor",
  "agent",
  "user",
]);
```

---

## 三、权限矩阵（API 级）

每个端点按 **方法** + **路径模式** 映射到权限。`R` = 只读（GET），`W` = 读写（POST/PATCH/DELETE）。

### 3.1 Dashboard 仪表盘

| 端点 | 方法 | super_admin | admin | finance_ops | ops | support | auditor |
|---|---|---|---|---|---|---|---|
| `/admin/dashboard/stats` | GET | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `/admin/dashboard/recent-activity` | GET | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `/admin/dashboard/health` | GET | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| `/admin/dashboard/trends` | GET | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| `/admin/dashboard/trends/hourly` | GET | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |

### 3.2 User Management 用户管理

| 端点 | super_admin | admin | finance_ops | ops | support | auditor |
|---|---|---|---|---|---|---|
| GET 用户列表 | ✅ | ✅ | ❌ | ✅R | ✅R | ❌ |
| GET 用户详情 | ✅ | ✅ | ❌ | ✅R | ✅R | ❌ |
| PATCH 用户 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| DELETE 用户 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| POST 创建用户 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| POST 手动调余额 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| POST 重置密码 | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| POST 变更角色 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| POST 批量禁用/启用 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| POST 模拟登录 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| GET 登录历史 | ✅ | ✅ | ❌ | ✅R | ✅R | ❌ |

### 3.3 Real-name Review 实名审核

| 端点 | super_admin | admin | finance_ops | ops | support | auditor |
|---|---|---|---|---|---|---|
| GET 审核列表 | ✅ | ✅ | ❌ | ✅R | ✅R | ❌ |
| GET 审核详情 | ✅ | ✅ | ❌ | ✅R | ✅R | ❌ |
| POST 审核操作(通过/拒绝) | ✅ | ✅ | ❌ | ❌ | ✅W | ❌ |
| POST 手动确认实名 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

> **注意：** 实名审核现有逻辑在 `admin/users.ts` 中，规划中应拆分到独立的 `admin/reviews.ts`

### 3.4 Model & Vendor 模型/厂商

| 端点 | super_admin | admin | finance_ops | ops | support | auditor |
|---|---|---|---|---|---|---|
| CRUD 厂商 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| CRUD 模型 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| CRUD 厂商-模型关联 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

> admin 可管理模型和厂商，但不可修改定价倍率等系统配置

### 3.5 Finance 财务

| 端点 | super_admin | admin | finance_ops | ops | support | auditor |
|---|---|---|---|---|---|---|
| GET 财务工作台 | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| GET 佣金流水 | ✅ | ❌ | ✅ | ❌ | ❌ | ✅R |
| GET 佣金明细 | ✅ | ❌ | ✅ | ❌ | ❌ | ✅R |
| GET 对账报表 | ✅ | ❌ | ✅ | ❌ | ❌ | ✅R |
| GET 对账CSV导出 | ✅ | ❌ | ✅ | ❌ | ❌ | ✅R |
| POST 批量结算佣金 | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| POST 按条件结算佣金 | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| POST 取消佣金 | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |

### 3.6 Withdraw 提现

| 端点 | super_admin | admin | finance_ops | ops | support | auditor |
|---|---|---|---|---|---|---|
| GET 提现列表 | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| GET 提现统计 | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| GET 提现详情 | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| GET CSV导出 | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| POST 初审 | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| POST 复审 | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| POST 标记打款 | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| POST 批量审核 | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |

> 提现初审/复审是财务专属，admin 不应操作

### 3.7 Recharge 充值审核

| 端点 | super_admin | admin | finance_ops | ops | support | auditor |
|---|---|---|---|---|---|---|
| GET 充值订单列表 | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| GET 订单详情 | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| POST 初审（对公转账） | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| POST 复审 | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| POST 取消订单 | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |

### 3.8 Agent 代理商管理

| 端点 | super_admin | admin | finance_ops | ops | support | auditor |
|---|---|---|---|---|---|---|
| GET 代理商列表 | ✅ | ✅ | ✅ | ✅R | ❌ | ❌ |
| GET 代理商详情 | ✅ | ✅ | ✅ | ✅R | ❌ | ❌ |
| POST 创建代理商 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| PATCH 更新代理商 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| DELETE 删除代理商 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| GET 客户列表 | ✅ | ✅ | ✅ | ✅R | ❌ | ❌ |
| POST 绑定客户 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| CRUD 佣金规则 | ✅ | ✅ | ✅W | ❌ | ❌ | ❌ |
| POST 设置上级代理 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

### 3.9 Logs 调用日志

| 端点 | super_admin | admin | finance_ops | ops | support | auditor |
|---|---|---|---|---|---|---|
| GET 调用日志 | ✅ | ✅ | ❌ | ✅R | ❌ | ❌ |

### 3.10 Security 安全风控

| 端点 | super_admin | admin | finance_ops | ops | support | auditor |
|---|---|---|---|---|---|---|
| GET 安全总览 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| CRUD 安全配置 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| GET 安全事件 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| POST 确认事件 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| CRUD 封禁 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| GET 熔断状态 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| POST 重置熔断 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

### 3.11 System Config 系统配置

| 端点 | super_admin | admin | finance_ops | ops | support | auditor |
|---|---|---|---|---|---|---|
| GET 配置列表 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| PATCH 更新配置 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| GET 审计日志 | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| POST 密钥轮换 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| GET 安全审计 | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| GET 通用统计 | ✅ | ✅ | ❌ | ✅R | ❌ | ❌ |

---

## 四、代码重组方案

### 4.1 文件拆分（Merge & Split）

现状 12 个文件 → 目标 11 个文件，按职责域重构：

#### 计划文件结构

```
routes/admin/
├── dashboard.ts          # 仪表盘 + 健康检查（从老 dashboard.ts 提取，不拆分）
├── users.ts              # 用户CRUD + 登录历史 + 调用统计 + 备注 + IP白名单
│                         # （拆分出 reviews.ts 和 api-keys.ts 后缩减）
├── reviews.ts            # ★ NEW: 实名审核管理（从 users.ts 拆分）
├── api-keys.ts           # ★ NEW: API Key 管理（admin 视角，从 users.ts 拆分）
├── models.ts             # 模型管理（不变）
├── vendors.ts            # 厂商管理（不变）
├── vendor-models.ts      # 厂商-模型关联（不变）
├── agents.ts             # 代理商管理（不变，但可合并佣金规则）
├── finance.ts            # 财务全域：财务工作台 + 佣金 + 对账 + 充值 + 提现
│                         # ★ MERGE: 合并 finance.ts + recharge-admin.ts + withdraws.ts
├── security.ts           # 安全风控（不变）
└── system.ts             # 系统配置 + 审计日志（不变）
```

**移除：** `recharge-admin.ts`、`withdraws.ts` → 合并到 `finance.ts`  
**新增：** `reviews.ts`、`api-keys.ts` → 从 `users.ts` 拆分  

#### 合并理由

- **充值审核 + 提现审核 → finance.ts**：本质都是财务操作，与佣金/对账属于同一业务域。财务专员一站式管理
- **实名审核从 users.ts 拆分**：客服专员专属操作，职责独立，文件从 2600 行缩减
- **API Key 管理从 users.ts 拆分**：功能独立，admin 和 support 都可能查看

#### 排序后注册顺序（app.ts）

按业务依赖粒度从粗到细排列：

```ts
// 1. 基础 - 所有人可见
adminDashboardRoutes   // 仪表盘是所有管理员的首页

// 2. 只读运营 - ops/support
adminReviewRoutes      // 实名审核（support 核心）
adminUserRoutes        // 用户管理（ops 只读，support 操作密码）

// 3. 资产管理 - admin
adminModelRoutes       // 模型
adminVendorRoutes      // 厂商
adminVendorModelRoutes // 关联
adminApiKeyRoutes      // API Key
adminAgentRoutes       // 代理商

// 4. 资金操作 - finance_ops
adminFinanceRoutes     // 佣金/对账/充值/提现（核心敏感区）

// 5. 安全审计 - auditor / super_admin
adminSecurityRoutes    // 安全风控
adminSystemRoutes      // 系统配置 + 审计日志
```

### 4.2 权限中间件改造

#### 方案一：基于 role bitset 的高效权限检查（推荐）

```ts
// middleware/auth.ts

// 权限位定义
export const Perm = {
  NONE:        0n,
  // Dashboard
  DASHBOARD_VIEW:  1n << 0n,  // 查看仪表盘
  // Users
  USER_LIST:       1n << 1n,  // 查看用户列表
  USER_VIEW:       1n << 2n,  // 查看用户详情
  USER_EDIT:       1n << 3n,  // 编辑用户
  USER_DELETE:     1n << 4n,  // 删除用户
  USER_CREATE:     1n << 5n,  // 创建用户
  USER_RESET_PWD:  1n << 6n,  // 重置密码
  USER_CHANGE_ROLE:1n << 7n,  // 变更角色
  USER_BALANCE:    1n << 8n,  // 调余额
  USER_IMPERSONATE:1n << 9n,  // 模拟登录
  // Real-name
  REVIEW_LIST:     1n << 10n, // 查看审核列表
  REVIEW_ACTION:   1n << 11n, // 执行审核
  // Models & Vendors
  MODEL_MANAGE:    1n << 12n, // 模型/厂商CRUD
  // Finance
  FINANCE_VIEW:    1n << 13n, // 查看财务数据
  FINANCE_COMMISSION: 1n << 14n, // 佣金结算
  FINANCE_WITHDRAW:   1n << 15n, // 提现审核
  FINANCE_RECHARGE:   1n << 16n, // 充值审核
  // System
  CONFIG_VIEW:     1n << 17n, // 查看系统配置
  CONFIG_EDIT:     1n << 18n, // 修改系统配置
  // Security
  SECURITY_VIEW:   1n << 19n, // 查看安全数据
  SECURITY_ACTION: 1n << 20n, // 执行安全操作
  // Audit
  AUDIT_VIEW:      1n << 21n, // 查看审计日志
  // Agent
  AGENT_LIST:      1n << 22n, // 查看代理商
  AGENT_MANAGE:    1n << 23n, // 管理代理商
  // Logs
  LOG_VIEW:        1n << 24n, // 查看调用日志
  // Ops Read
  OPS_READ:        1n << 25n, // 只读查看（ops 通用）
} as const;

// 角色 -> 权限位映射
const ROLE_PERMISSIONS: Record<string, bigint> = {
  super_admin: ~0n, // 全比特位为 1

  admin:        Perm.USER_LIST | Perm.USER_VIEW | Perm.USER_EDIT | Perm.USER_CREATE |
                Perm.USER_RESET_PWD | Perm.USER_DELETE |
                Perm.REVIEW_LIST | Perm.REVIEW_ACTION |
                Perm.MODEL_MANAGE | Perm.AGENT_LIST | Perm.AGENT_MANAGE |
                Perm.SECURITY_VIEW | Perm.SECURITY_ACTION |
                Perm.CONFIG_VIEW | Perm.LOG_VIEW | Perm.DASHBOARD_VIEW,

  finance_ops:  Perm.FINANCE_VIEW | Perm.FINANCE_COMMISSION |
                Perm.FINANCE_WITHDRAW | Perm.FINANCE_RECHARGE |
                Perm.AGENT_LIST | Perm.DASHBOARD_VIEW,

  ops:          Perm.OPS_READ | Perm.USER_LIST | Perm.USER_VIEW |
                Perm.REVIEW_LIST | Perm.MODEL_MANAGE | Perm.AGENT_LIST |
                Perm.LOG_VIEW | Perm.DASHBOARD_VIEW,

  support:      Perm.USER_LIST | Perm.USER_VIEW | Perm.USER_RESET_PWD |
                Perm.REVIEW_LIST | Perm.REVIEW_ACTION | Perm.LOG_VIEW,

  auditor:      Perm.AUDIT_VIEW | Perm.FINANCE_VIEW,
};

// 使用方式
export function requirePerm(...perms: bigint[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      reply.status(401).send({ code: 401, data: null, message: "未认证" });
      return;
    }
    const rolePerms = ROLE_PERMISSIONS[request.user.role];
    if (!rolePerms) {
      reply.status(403).send({ code: 403, data: null, message: "无权限" });
      return;
    }
    const required = perms.reduce((a, b) => a | b, 0n);
    if ((rolePerms & required) !== required) {
      reply.status(403).send({ code: 403, data: null, message: "无操作权限" });
      return;
    }
  };
}
```

**使用示例（在 route 中）：**

```ts
// finance.ts —— 提现复审端点
app.post("/api/v1/admin/withdraws/:id/second-review", {
  preHandler: [authenticateJWT, requirePerm(Perm.FINANCE_WITHDRAW)]
}, handler);

// users.ts —— 列表端点（ops 可读，admin/support 可读）
app.get("/api/v1/admin/users", {
  preHandler: [authenticateJWT, requirePerm(Perm.USER_LIST)]
}, handler);
```

#### 方案二：简化版 — 直接使用角色数组（改动小，推荐作为第一步）

如果不想引入 bitset，也可以用更直观的角色数组：

```ts
// 在 requireRole 基础上扩展为可传不等角色
export function requireAnyRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      reply.status(401).send({ code: 401, data: null, message: "未认证" });
      return;
    }
    if (!roles.includes(request.user.role)) {
      reply.status(403).send({
        code: 403,
        data: null,
        message: `需要 ${roles.join("/")} 角色权限`,
      });
      return;
    }
  };
}
```

**但这种方法的问题是：** 每个端点需要写一长串角色列表，100 个端点手动维护容易出错。**bitset 方案**将权限定义与路由解耦，更推荐。

### 4.3 审计日志中间件增强

当前审计日志记录在 `log.ts` 中间件中，但不会区分操作者角色。需要增强：

```ts
// middleware/log.ts
export async function auditLog(request: FastifyRequest, reply: FastifyReply) {
  // 后台操作才记录（admin/* 路由）
  if (request.url.startsWith("/api/v1/admin/") && request.user) {
    // 记录操作者角色信息
    request.auditContext = {
      operatorId: request.user.userId,
      operatorRole: request.user.role,
      impersonatorId: request.user.impersonatorId,
    };
  }
}
```

---

## 五、实施路径

### 阶段一：基础设施（1-2 天）

1. **DB 迁移**：扩展 userRoleEnum 加入新角色
   ```ts
   // 2026-07-01-admin-roles.ts
   import { sql } from "drizzle-orm";
   
   export async function up(db: any) {
     await db.execute(sql`
       ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'finance_ops';
       ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'ops';
       ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'support';
       ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'auditor';
     `);
     // 更新已存在的 admin 账号
     // super_admin: admin@3cloud.ai 保持不变
     // 其他 admin 根据业务指定
   }
   ```
2. **更新 schema.ts**：userRoleEnum 加入 4 个新值
3. **创建 bitset 权限表**：在 `middleware/auth.ts` 中实现 `Perm` 和 `requirePerm`
4. **更新 seed-admin.ts**：为每个新角色创建初始账号

### 阶段二：权限标记（2-3 天）

1. 遍历 12 个 route 文件，为每个端点按权限矩阵标记 `requirePerm`
2. 移除旧的 `requireRole("super_admin", "admin")`
3. 注意：部分端点需要分层权限（如用户列表 GET 的权限比 PATCH 宽松）

### 阶段三：文件重组（2-3 天）

1. 从 `users.ts` 拆分实名审核 → `reviews.ts`
2. 从 `users.ts` 拆分 API Key 管理 → `api-keys.ts`
3. 合并 `withdraws.ts` + `recharge-admin.ts` → `finance.ts`
4. 更新 `app.ts` 中的注册顺序和 prefix
5. 统一命名风格（现有路由有的用 `foo-bar` 有的用 `fooBar`）

### 阶段四：端到端验证（1 天）

1. 编写 seed 数据，为 6 个角色各创建一个管理员账号
2. 模拟每个角色登录，验证可访问和不可访问的端点
3. 检查审计日志的正确性（记录了操作者角色）

---

## 六、风险与注意事项

### 6.1 兼容性
- 现有 `admin@3cloud.ai`（super_admin）不受影响
- 如果已有 custom admin 账号，迁移后需为其指定新角色
- 前端需同步适配：不同角色展示不同的菜单/页面

### 6.2 双审（4-eyes principle）
- 提现：初审 → 复审 → 打款，财务专员可完成全部三步骤 → **考虑是否需要两角色分离**
- 充值：初审 → 复审，同理
- 建议：如果平台规模小，财务专员一人负责全部；如果规模大，可设 `finance_ops_1` 和 `finance_ops_2` 分岗
- 但当前角色体系只有 1 个 `finance_ops`，双审流程仍按系统逻辑（不同的人登录操作），**系统层面不做强制**

### 6.3 前端适配
- 后端角色变更后，前端 API 返回 user.role 会多出 4 个新值
- 前端菜单渲染需要根据权限做条件判断（简单方案：后端加 `/api/v1/admin/permissions` 接口返回当前用户的权限列表）
- 建议新增：
  ```ts
  // GET /api/v1/admin/my-permissions
  // 返回当前 admin 可访问的权限列表，前端据此渲染菜单
  app.get("/api/v1/admin/my-permissions", {
    preHandler: [authenticateJWT]
  }, async (request, reply) => {
    const perms = ROLE_PERMISSIONS[request.user!.role];
    // 将 bigint 转为可枚举的权限名数组
    const permNames = Object.entries(Perm)
      .filter(([_, v]) => (perms & v) === v)
      .map(([k]) => k);
    reply.send({ code: 0, data: { role: request.user!.role, permissions: permNames }, message: "ok" });
  });
  ```

### 6.4 超级管理员降级警告
- `super_admin` 只能由另一位 `super_admin` 操作变更角色
- 最后一位 `super_admin` 不能被降级或删除（需加业务校验）

---

## 七、总结

| 指标 | 改造前 | 改造后 |
|---|---|---|
| 管理角色数 | 2（super_admin, admin） | 6 |
| 后台路由文件 | 12 | 11（拆分2个 + 合并2个） |
| 权限粒度 | 文件级 | 端点级 |
| 审计日志 | 记录操作者ID | 记录操作者ID + 角色 + 权限 |
| users.ts 行数 | ~2600 | ~1500（拆分后） |
| 管理账号 seed | 1 个 | 6 个（每角色1个） |

**建议从阶段一开始实施，总工期约 5-7 天。**
