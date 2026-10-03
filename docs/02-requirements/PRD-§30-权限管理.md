# §30 权限管理

- 品牌：浩寅云
- 代码基线：git HEAD `91f62d3`（2026-10-03）
- 权威源：`api/src/middleware/{auth,require-perm}.ts`、`api/src/routes/{admin-permissions,admin-roles,admin-customers}.ts`、ADR-0024/0017
- 状态图例：✅ 已实现 / 🟡 部分实现 / ❌ 未实现（规划中）

## 30.1 功能清单

| 编号 | 能力 | 代码落点 | 状态 | 差距说明 |
|---|---|---|---|---|
| 30.1 | 角色枚举（user / admin / super_admin / finance / sales / agent） | `middleware/auth.ts` bitset + ADR-0024 | ✅ | 角色与权限点优先级遵循 ADR-0024 |
| 30.2 | 权限点（requirePerm）细粒度鉴权 | `middleware/require-perm.ts` | ✅ | finance.topup / finance.adjust / finance.refund / finance.reconciliation / supplier.pricing / sys.config 等已广泛挂接 |
| 30.3 | 角色与权限管理后台 | `admin-permissions.ts` + admin-roles/admin-permissions 页面 | ✅ | |
| 30.4 | 用户视角 impersonate | `admin-customers.ts`：impersonate/exit + operation-logs | ✅ | 带 impersonateBy token 与留痕；资金操作互斥 |
| 30.5 | 权限点映射变更（ADR-0017） | — | ✅ | 已固化到 ADR |
| 30.6 | 权限模板（批量按模板授角色） | — | ❌ | 无模板表/端点 |
| 30.7 | 代理身份 requireAgent 域隔离 | `agent.ts` preHandler | ✅ | `/agent/*` 独立鉴权域 |
| 30.8 | vendor 身份 vendorAuth 域隔离 | `vendor.ts` preHandler | ✅ | Step 4 上线，`/vendor/*` 第三鉴权域 |

## 30.2 关键架构

- 三域鉴权隔离：用户 JWT（`/me/*`）、代理 JWT（`/agent/*`）、vendor 独立登录（`/vendor/*`）、管理端 adminAuth（`/admin/*`）；权限点在 admin 域内再做资源级控制（职责分离：创建人≠审批人）。
- 越权统一返回 403 `PERMISSION_DENIED`，不用 200 掩盖。

## 30.3 未实现项

| 优先级 | 事项 |
|---|---|
| P2 | 权限模板与批量授权 |
| P2 | 权限点使用情况看板（哪些端点挂了哪些 perm） |
