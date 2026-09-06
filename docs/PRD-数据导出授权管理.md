# PRD — 数据导出授权管理（Data Export Grant Management）

> 版本：v1.0
> 状态：Draft（待评审）
> 产品角色：3cloud product-agent
> 关联文档：
> - 产品设计原则：`docs/PRODUCT-DESIGN-PRINCIPLES.md`（P1 帮助体系 / P2 一致性 / P3 可逆与安全 / P4 状态可见性）
> - 现有用户端入口：`web-console/src/layouts/ConsoleLayout.tsx`（`PORTAL_NAV` 第 177 行）、`web-console/src/pages/ConsentPage.tsx`
> - 现有用户端 API：`api/src/routes/data-requests.ts`（`/api/v1/me/data-export/*` 五个接口）
> - 现有数据表：`api/src/db/schema/data-requests.ts`（`data_requests` 表）
> - 现有后台合规调取审核：`web-console/src/pages/AdminDataRequestPage.tsx`（`/admin/audit/data-request`，勿混用）
> - 编码规范：`kb/3cloud/coding-standards-api-db-test.md`、`kb/3cloud/coding-standards-control-logic.md`、`kb/3cloud/tech-stack-decision.md`、`kb/3cloud/newapi-migration-guide.md`、`kb/3cloud/development-plan.md`

---

## 1. 需求概述与目标

### 1.1 背景

当前 3cloud 用户端菜单**默认对所有登录用户**展示「数据导出」入口（`web-console/src/layouts/ConsoleLayout.tsx` 第 177 行 `{ to: "/data-export", label: "nav.dataExport", icon: "📦" }`，第 278 行 portal 导航直接 map 渲染、无任何权限过滤）。用户端 `/api/v1/me/data-export/*` 五个接口也仅做 `jwtAuth`（登录鉴权），**没有任何授权限制**——即任何已登录普通用户都可自助申请、下载个人数据导出。

BOSS 决策：**默认去掉用户端「数据导出」菜单**，该能力改为**由后台管理员定向授权**给特定用户开放。后台为此单独开设「数据导出授权管理」功能，被授权的用户在系统管理后台中可见。

### 1.2 痛点

| 痛点 | 现状 | 影响 |
|------|------|------|
| 无授权控制 | 任何登录用户都可见并可提交导出申请 | 数据导出能力无门槛，不符合"定向开放"的运营预期 |
| 与合规调取混淆 | 现有 `/admin/data-requests`（数据调取请求管理）是合规/执法调取审核流程 | 若在既有流程上打补丁会污染合规语义 |
| 缺少授权可见性 | 管理员无法知道"谁被开放了数据导出" | 授权缺乏管理视图，无法审计 |

### 1.3 目标

1. **默认隐藏**：用户端「数据导出」菜单默认不显示；仅被后台管理员授权的用户可见。
2. **后台授权管理**：新增独立「数据导出授权管理」后台页面，按用户逐一启/停，完整列出全部已授权用户，支持搜索筛选、分页、空态。
3. **前后端双重拦截**：前端隐藏菜单 + 后端 `/me/data-export/*` 五个接口做授权鉴权（未授权一律拒绝），杜绝"绕过前端直连后端"。
4. **授权可见性**：被开放用户在系统管理后台可查（授权管理页列表即权威视图）。
5. **合规区分**：与现有后台「数据调取请求管理」（`/admin/audit/data-request`）严格区分，互不混用。
6. **满足产品设计原则 P1**：授权管理页页面级 + 按钮级 `[?]` 帮助体系完整落地。

---

## 2. 功能范围（In / Out）

### 2.1 In（本次范围内）

| 模块 | 说明 |
|------|------|
| 后台「数据导出授权管理」功能 | 新增独立后台页面（路由 + 页面 + API），按用户逐一启/停、列出全部已授权用户、搜索筛选、分页、空态 |
| 用户端菜单隐藏/显示 | `PORTAL_NAV` 中的 `/data-export` 菜单项按授权状态条件渲染 |
| 后端接口授权鉴权 | `/api/v1/me/data-export/*` 五个接口增加"用户是否被授权"校验，未授权一律拒绝 |
| 授权数据模型 | 新增 `data_export_grants` 表（user_id 唯一、enabled、授权人、授权/停用时间等） |
| 后台授权 CRUD API | GET / POST / PUT / DELETE 形式的授权管理接口 |
| 权限点与审计 | 后台授权管理操作需要独立权限点 + 写审计日志 |

### 2.2 Out（本次范围外，保持现状）

| 模块 | 说明 |
|------|------|
| 现有后台「数据调取请求管理」（`/admin/audit/data-request`，`AdminDataRequestPage.tsx`，`/api/v1/admin/data-requests/*`） | 合规/执法机构数据调取审核流程，**本次不修改、不与授权管理混用** |
| 用户端导出文件生成逻辑 | `gatherUserData` / `writeExportFile` / `data_requests` 表状态机（pending→approved→exported→下载）**保持不变**，仅叠加授权入口校验 |
| 数据删除/注销流程 | `deletion-requests` 等无关，不在本次范围 |
| 导出文件内容、格式、有效期 | 沿用现有 72h TTL 等规则，不改 |

> ⚠️ 明确边界：本次**新增的授权表 `data_export_grants` 与既有的 `data_requests`（导出申请流水）是两个独立数据域**。授权是"能力开关"，申请是"一次导出流水"。授权停用不影响已生成文件的历史记录。

---

## 3. 授权数据模型

### 3.1 表设计：`data_export_grants`

建议新增表 `data_export_grants`，与现有 `data_requests` 表平级。文件建议：`api/src/db/schema/data-export-grants.ts`，并在 `api/src/db/schema/index.ts` 中 re-export。

| 字段 | 类型 | 约束/默认 | 说明 |
|------|------|-----------|------|
| `id` | `serial` | PK | 主键 |
| `user_id` | `integer` | `not null`，`references users.id`，**唯一** | 被授权用户；`uq_data_export_grants_user_id` |
| `enabled` | `boolean` | `not null default true` | 授权开关；true=启用（用户可见+可导出），false=停用 |
| `granted_by` | `integer` | `references users.id`（onDelete set null），nullable | 最近一次授权/启用的操作人 |
| `granted_at` | `timestamp` | `defaultNow`，nullable | 最近一次启用授权的时间 |
| `disabled_by` | `integer` | `references users.id`（onDelete set null），nullable | 最近一次停用的操作人 |
| `disabled_at` | `timestamp` | nullable | 最近一次停用时间 |
| `remark` | `varchar(500)` | nullable | 授权备注（如授权原因、有效场景） |
| `created_at` | `timestamp` | `defaultNow not null` | 记录创建时间（首次授权） |
| `updated_at` | `timestamp` | `defaultNow not null` | 最近更新时间 |

**约束设计（遵循 coding-standards §2.2/§2.6）：**

- `user_id` 唯一索引：`uniqueIndex('uq_data_export_grants_user_id').on(table.userId)` —— 一个用户只允许一条授权记录，启/停通过对同一行 `enabled` 置位实现（满足"按用户逐一开关"）。
- 布尔字段用 `is_` 前缀是规范（`coding-standards §2.1`），此处采用 `enabled` 沿用现有 `data_requests`/`customers` 的 `status` 风格外，`enabled` 更贴合"开关"语义。如严格遵循规范可用 `is_enabled`，两者皆可，**PRD 建议实现统一为 `enabled`（bool）** 并在 backend 落地时与 review-agent 确认命名是否要改为 `is_enabled`。为规避规范冲突，**推荐使用 `is_enabled`**，其余布尔字段不涉及。
- 外键不级联删除（遵循规范 §2.2：已删除资源保留关联记录）——用户被删除时授权记录应保留（或随审计需要）？规范默认"外键不级联删除"，故 `user_id` 不设 `onDelete: cascade`，用户删除后授权记录保留以便审计（可在用户删除时另行处理）。
- 所有时间戳统一 `timestamp(...)`（UTC）。
- `enabled` 上可建普通索引 `idx_data_export_grants_enabled`，供"列出全部已授权用户"过滤。

> 备注：由于后台授权管理页需要"完整列出全部已授权用户名单"，而"已授权"定义 = `enabled = true`，故列表查询应落在 `data_export_grants` 表 join `users` 表取用户信息（email/name），而非全表扫 users。

### 3.2 迁移工作流

遵循 `coding-standards §2.3`：
```
1. 修改 schema 后 pnpm db:generate
2. 人工检查生成的 SQL migration
3. pnpm db:migrate
```
migration SQL 文件需提交 Git。

---

## 4. 用户端规则

### 4.1 菜单显隐

- **默认（未授权）**：`PORTAL_NAV` 中 `/data-export` 菜单项不渲染，用户侧边栏不出现「数据导出」。
- **被授权后（enabled=true）**：菜单项渲染，用户可进入 `ConsentPage`（我的数据导出）。
- **实现建议**：`ConsoleLayout.tsx` 增加一个查询（如 `GET /api/v1/me/data-export/grant-status` 或在用户 profile 中附带 `canExport`），对 `PORTAL_NAV` 做条件过滤；或在 `PORTAL_NAV` 定义处给该菜单项打标记，仅当授权才 map 渲染。推荐在页面加载时查询授权状态（可并入 `useAuthStore` 或独立的 `useQuery`），避免在 `PORTAL_NAV` 常量里做条件。

### 4.2 后端接口授权校验

`api/src/routes/data-requests.ts` 中 `/api/v1/me/data-export/*` 五个接口，在 `jwtAuth` 之后增加授权校验：

| 接口 | 方法 | 路径 | 授权校验 |
|------|------|------|----------|
| 提交导出申请 | POST | `/api/v1/me/data-export/request` | 必须已授权且 enabled=true，否则 403 |
| 我的申请列表 | GET | `/api/v1/me/data-export/requests` | 必须已授权且 enabled=true，否则 403 |
| 申请详情 | GET | `/api/v1/me/data-export/:id` | 必须已授权且 enabled=true，否则 403 |
| 撤回申请 | POST | `/api/v1/me/data-export/:id/cancel` | 必须已授权且 enabled=true，否则 403 |
| 下载文件 | GET | `/api/v1/me/data-export/:id/download` | 见下方"停用后的下载取舍" |

### 4.3 停用后的行为定义（关键取舍）

> 原则：**授权是"能力开关"，已生成的导出文件是其历史成果。停用授权 ≠ 撤销历史成果，也不应阻塞已归档申请流的查看。**

| 场景 | 停用后行为 | 说明 |
|------|-----------|------|
| 新增导出申请（request） | **拒绝**（403 `DATA_EXPORT_NOT_GRANTED`） | 未授权不能发起新导出 |
| 查看申请列表 / 详情 | **拒绝**（403） | 与"新发起"一致，停用即回收全部自助能力入口 |
| 撤回 pending 申请 | **拒绝**（403） | 停用后不允许操作申请流 |
| 下载已生成的导出文件 | **允许**（不受停用影响） | 文件在 72h 有效期内的仍可下载；**历史成果不因授权停用而作废** |

**取舍理由（写入本 PRD 供 backend 实现参考）：**
- 停用授权后若禁止下载已生成文件，会使用户在"已付费/已获批的数据成果"上受损，且已生成文件是历史流水，与当前授权状态无关。
- 因此：**停用只拦截"新的能力入口"（request / list / detail / cancel），不拦截 download 已生成文件**。
- 实现提示：`download` 接口不查授权表（或查询但仅当 `row.status === 'exported'` 时放行），仅校验登录、本人、文件状态与有效期。**backend 必须注意：下载接口不要因为授权表查询失败/不存在而误 403**——在授权查询结果缺失时，download 接口对 exported 记录仍应放行。

### 4.4 错误码与响应

未授权（enabled 缺失或 false）时，除 download 外四个接口返回：

```json
// HTTP 403
{
  "code": 403,
  "message": "您暂未被授权使用数据导出功能，请联系管理员",
  "requestId": "550e8400-..."
}
```

错误类型建议新增 `DataExportNotGrantedError`（`ForbiddenError` 子类或独立），统一在授权校验 helper 中抛出。

---

## 5. 后台授权管理页

### 5.1 功能定位

独立的「数据导出授权管理」后台页面，供管理员对"用户自助数据导出能力"做定向授权管理。**与 `/admin/audit/data-request`（合规调取）严格区分**，两者菜单项、路由、API、数据表、页面均独立。

### 5.2 路由建议

| 项 | 建议 |
|----|------|
| 前端路由 | `/admin/config/data-export-grants`（或 `/admin/customers/data-export-grants`） |
| 后端路由 | `/api/v1/admin/data-export-grants/*` |
| 页面组件 | 新增 `web-console/src/pages/AdminDataExportGrantPage.tsx`（**不要复用/混入 `AdminDataRequestPage.tsx`**） |

> 备注：现有 `App.tsx` 第 293 行 `/admin/config/compliance` 已是合规法务页（`AdminConsentPage`），为避免语义混淆，**不建议**将授权管理挂在 compliance 下。建议挂在「客户管理」组（用户维度）或「系统设置/运维配置」组。**PRD 推荐：菜单挂在「客户管理」组，label「数据导出授权」，图标 `📦`**，因为授权按用户维度管理。

### 5.3 功能点

| 功能 | 说明 |
|------|------|
| 列出全部已授权用户 | 展示 `enabled=true` 的用户（默认视图）；可切换查看"全部授权记录（含停用）" |
| 按用户启/停 | 对某用户开启/停用授权开关（二次确认） |
| 新建授权 | 搜索用户（按 email/name），对未授权用户添加授权记录 |
| 搜索筛选 | 按用户 email / 姓名 / 授权状态（启用/停用/全部）搜索 |
| 分页 | 遵循规范 §2.4：默认 pageSize=20，max=100 |
| 空态 | 无任何授权记录时显示空态说明（P4 原则），并提供「去授权」引导 |
| 列表列 | 用户 email、姓名、授权状态、授权人、授权时间、停用时间、备注、操作（启用/停用） |

### 5.4 交互规则（遵循 P3 可逆与安全）

- 停用授权 = 权限/状态变更 → **必须二次确认**，并提示"停用后该用户将无法发起新的数据导出，但已生成文件在有效期内仍可下载"。
- 启用授权 = 状态变更 → 二次确认（轻量）。
- 所有授权/停用/新建操作写 `audit_logs`（action 前缀 `data_export_grants.*`），可追溯。

### 5.5 与用户管理的关系

| 维度 | 说明 |
|------|------|
| 数据来源 | 授权记录独立存于 `data_export_grants`，不与 `users` 表的任何字段耦合 |
| 入口 | 可从授权管理页搜索用户；**可选**在用户管理（客户列表）中为已授权用户加标识（本次为非必需增强，见 §6） |
| 关联 | 授权按 `user_id` 唯一绑定，一个用户一条记录 |

---

## 6. 系统管理后台展示被授权用户

BOSS 要求"被开放用户需在系统管理后台展示出来"。**实现形态建议（权威视图）：**

> **授权管理页列表即"被开放用户"的权威展示**。页面完整列出全部已授权用户（含启用/停用），并支持按状态筛选——管理员进入「数据导出授权」即可看到全部被开放用户。

同时提供**可选增强**（本次可做可不做，推荐做，成本低）：
- 在「客户列表」（`/admin/customers`）用户行上增加一个标识徽标（如"数据导出"标签）或列，展示该用户是否已授权数据导出，便于在日常用户管理中一眼看到被开放用户。

> PRD 决策：**以授权管理页为权威，用户管理标注为增强项**。两者读同一数据源 `data_export_grants`。若本次资源有限，可只交付授权管理页列表，用户管理标注列为二期。

---

## 7. [?] 帮助体系（遵循 PRODUCT-DESIGN-PRINCIPLES P1）

### 7.1 页面级帮助

**页面标题旁 `[?]`**（点击弹出帮助弹窗），数据来源定义：

| 页面 | pageKey | 适用角色 | 功能定位 | 核心操作 | 注意事项 | 常见问题 |
|------|---------|---------|---------|---------|---------|---------|
| 数据导出授权管理（`/admin/config/data-export-grants`） | `data-export-grants` | 管理员 / 超级管理员 | 定向授权/停用用户的自助数据导出能力，管理与展示全部被开放用户 | 新建授权、启用/停用、搜索筛选、查看被开放用户名单 | 本页为授权管理，与「数据调取请求管理」无关；停用不影响已生成文件下载；操作写入审计日志 | 用户为何看不到数据导出菜单？（未授权）如何批量开放？（按用户逐一启停）停用后还能下载吗？（有效期内已生成文件仍可下载） |

### 7.2 按钮级帮助对照表

每个操作按钮/入口旁 `[?]`（悬停 Tooltip）：

| 页面 | 按钮/操作 | [?] 帮助提示（Tooltip） |
|------|-----------|------------------------|
| 数据导出授权管理 | 新建授权 | 搜索并添加一位用户，授予其自助数据导出能力 |
| 数据导出授权管理 | 启用 | 开启该用户的数据导出能力，用户端将显示「数据导出」菜单 |
| 数据导出授权管理 | 停用 | 停用该用户的数据导出能力，用户端菜单即隐藏；已生成文件在有效期内仍可下载 |
| 数据导出授权管理 | 搜索 | 按用户邮箱或姓名筛选授权记录 |
| 数据导出授权管理 | 状态筛选 | 按启用/停用/全部筛选授权记录 |
| 数据导出授权管理 | 分页 | 浏览更多授权记录 |
| 数据导出授权管理 | 刷新 | 重新加载最新的授权列表 |
| 数据导出授权管理 | 导出列表（可选） | 将当前授权名单导出为文件，便于留档 |

> 落实要求：新增页面自动遵循 P1，无需额外评审；**本 PRD 已包含页面级 + 按钮级帮助定义，backend/front 实现时必须实现 `HelpIcon`（`@3cloud/shared-ui`，`level="page"` 与默认 button 级）**，否则不得验收。

---

## 8. API 契约（独立小节，供 backend-agent 直接引用）

### 8.1 概览

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/v1/me/data-export/grant-status` | jwtAuth | 查询当前用户的授权状态（前端判断菜单显隐） |
| GET | `/api/v1/admin/data-export-grants` | adminAuth + 权限点 | 授权记录列表（分页 + 搜索 + 状态筛选） |
| POST | `/api/v1/admin/data-export-grants` | adminAuth + 权限点 | 新建授权（对未授权用户） |
| PUT | `/api/v1/admin/data-export-grants/:userId` | adminAuth + 权限点 | 更新授权（启/停 + 备注） |
| DELETE | `/api/v1/admin/data-export-grants/:userId` | adminAuth + 权限点 | 删除授权记录（可选） |

### 8.2 统一响应格式（遵循 coding-standards §1.2）

- 成功：`{ code: 0, message: "ok", data, requestId }`
- 列表：`data: { list: [...], total, page, pageSize }`
- 错误：`{ code, message, requestId }`

### 8.3 请求/响应明细

#### GET `/api/v1/me/data-export/grant-status`

- 鉴权：jwtAuth
- 响应：
```json
{ "code": 0, "message": "ok", "data": { "granted": true, "enabled": true }, "requestId": "..." }
```
- `granted` = 是否有授权记录；`enabled` = 当前是否启用。前端菜单显示条件 = `granted && enabled`。

#### GET `/api/v1/admin/data-export-grants`

- 鉴权：adminAuth + 权限点 `dataExportGrant.view`
- Query（Zod 校验，遵循 §1.3）：`page`(default 1)、`pageSize`(default 20, max 100)、`status`(`'enabled' | 'disabled' | 'all'`)、`search`（email/name 模糊匹配）
- 响应 `data.list` 每项：
```json
{
  "userId": 42,
  "email": "user@example.com",
  "name": "张三",
  "enabled": true,
  "grantedBy": 1,
  "grantedByName": "admin",
  "grantedAt": "2026-08-20T08:00:00Z",
  "disabledAt": null,
  "remark": "VIP 客户定向开放",
  "createdAt": "2026-08-20T08:00:00Z",
  "updatedAt": "2026-08-20T08:00:00Z"
}
```

#### POST `/api/v1/admin/data-export-grants`

- 鉴权：adminAuth + 权限点 `dataExportGrant.edit`
- Body（Zod）：`{ userId: number, enabled?: boolean (default true), remark?: string(≤500) }`
- 校验：用户必须存在（404 if not）；若该用户已有授权记录 → `409` 冲突（"该用户已授权，请使用更新接口"）
- 成功：`201` + 返回授权记录

#### PUT `/api/v1/admin/data-export-grants/:userId`

- 鉴权：adminAuth + 权限点 `dataExportGrant.edit`
- Body：`{ enabled: boolean, remark?: string }`
- 校验：授权记录不存在 → `404`
- 行为：更新 `enabled`；若启用 → 写 `grantedBy`/`grantedAt`；若停用 → 写 `disabledBy`/`disabledAt`
- 成功：`200` + 返回授权记录
- 写 `audit_logs`（action `data_export_grants.update`，details 含 userId/enabled）

#### DELETE `/api/v1/admin/data-export-grants/:userId`（可选）

- 鉴权：adminAuth + 权限点 `dataExportGrant.edit`
- 成功：`204`
- 说明：删除整条授权记录（彻底移除授权）。因 `user_id` 唯一，删除后再授权需走 POST。**建议保留此接口以便清理误配。**

### 8.4 错误码（遵循 coding-standards §1.4）

| 状态码 | 场景 |
|:---:|------|
| 400 | Zod 校验失败、参数不合法 |
| 401 | 未认证 |
| 403 | 无权限（未授权数据导出能力 `DATA_EXPORT_NOT_GRANTED` / 无后台权限点） |
| 404 | 用户或授权记录不存在 |
| 409 | 重复授权（已存在该用户授权记录） |

---

## 9. 权限点

### 9.1 需求

后台管理员对授权管理页的**查看**与**增删改**操作应区分权限，且仅限具备资质的角色执行。

### 9.2 建议权限点

| 权限点 key | 说明 | 拥有角色 |
|-----------|------|---------|
| `dataExportGrant.view` | 查看授权管理页列表、被开放用户名单 | super_admin（`*`）、admin |
| `dataExportGrant.edit` | 新建/启用/停用/删除授权 | super_admin（`*`）、admin |

- 前端：`web-console/src/lib/permissions.ts` 的 `ROLE_PERMS` 增加 `dataExportGrant.view` / `dataExportGrant.edit`；菜单项渲染用 `usePerm("dataExportGrant.view")` 过滤，操作按钮用 `usePerm("dataExportGrant.edit")`。
- 后端：路由 preHandler 在 `adminAuth`（role ∈ admin/super_admin）基础上增加权限点校验（adminAuth 已保证 admin/super_admin，权限点主要区分 super_admin 通配；若 admin 默认也拥有则静态映射赋予即可）。
- 遵循 `coding-standards-control-logic`：权限判定失败返回 403，写审计。

> 说明：现有 adminAuth 已限定 role ∈ {admin, super_admin}，权限点在此之上做更细的查看/编辑区分。默认 super_admin 与 admin 均具备两项权限点即可（保持一致性，不为本次过度设计）。

---

## 10. 验收清单（独立小节，供 test-agent 直接引用）

> 每个条目为可测试、可验证的验收项。测试遵循 `coding-standards §3`（单元 + 集成，Vitest）。

### A. 数据模型与迁移
- [ ] A1. `data_export_grants` 表存在，`user_id` 唯一索引生效（同一用户插入第二条报错）
- [ ] A2. 表包含 `enabled`、`granted_by`、`granted_at`、`disabled_by`、`disabled_at`、`remark`、`created_at`、`updated_at`
- [ ] A3. migration 文件已提交，`pnpm db:generate` + `pnpm db:migrate` 可成功执行
- [ ] A4. 外键引用 `users.id`，删除用户后授权记录不被级联删除（保留用于审计）

### B. 后端接口鉴权
- [ ] B1. 未授权用户调用 `POST /me/data-export/request` → 403 `DATA_EXPORT_NOT_GRANTED`
- [ ] B2. 未授权用户调用 `GET /me/data-export/requests` → 403
- [ ] B3. 未授权用户调用 `GET /me/data-export/:id` → 403
- [ ] B4. 未授权用户调用 `POST /me/data-export/:id/cancel` → 403
- [ ] B5. 已授权（enabled=true）用户调用上述四接口 → 正常（200/201）
- [ ] B6. 授权停用（enabled=false）后：request/list/detail/cancel → 403
- [ ] B7. **下载接口**：授权停用后，已 exported 且未过期的文件仍可下载（200）；未 exported/过期 → 沿用原有 400/410 逻辑（下载不因授权状态 403）
- [ ] B8. 无 token → 401；非 admin 调用 admin 授权接口 → 403

### C. 授权管理 API
- [ ] C1. `POST /admin/data-export-grants` 对未授权用户创建成功 → 201，返回授权记录
- [ ] C2. `POST` 对已授权用户重复创建 → 409
- [ ] C3. `POST` 对不存在用户 → 404
- [ ] C4. `PUT /admin/data-export-grants/:userId` 启用 → `enabled=true` 且写 `grantedAt`
- [ ] C5. `PUT` 停用 → `enabled=false` 且写 `disabledAt`
- [ ] C6. `PUT` 授权记录不存在 → 404
- [ ] C7. `DELETE /admin/data-export-grants/:userId` → 204，删除后 `POST` 可再次创建
- [ ] C8. `GET /admin/data-export-grants` 分页正确（page/pageSize/total），默认 pageSize=20、上限 100
- [ ] C9. `GET` 按 `status` 筛选（enabled/disabled/all）正确
- [ ] C10. `GET` 按 `search`（email/name 模糊）筛选正确
- [ ] C11. 列表返回用户信息（email/name）+ 授权人 + 授权/停用时间 + 备注

### D. 前端（web-console）
- [ ] D1. 未授权用户登录 → 侧边栏**不显示**「数据导出」菜单
- [ ] D2. 授权启用用户登录 → 侧边栏**显示**「数据导出」菜单
- [ ] D3. 授权停用用户登录 → 菜单隐藏（前端以 `grant-status` 接口为准）
- [ ] D4. 直连 URL `/data-export`（未授权）→ 前端路由守卫拦截或页面内请求 403 时给出友好提示（不白屏）
- [ ] D5. 授权管理页：完整列出已授权用户、搜索、筛选、分页、空态均正常
- [ ] D6. 新建授权：搜索用户、提交成功、重复授权提示
- [ ] D7. 启用/停用：有二次确认；操作后列表状态即时刷新

### E. [?] 帮助体系（遵循 P1，测试必查）
- [ ] E1. 授权管理页标题旁有 `[?]` 按钮，点击弹出帮助弹窗
- [ ] E2. 帮助弹窗包含：适用角色、功能定位、核心操作、注意事项、常见问题（与 §7.1 定义一致）
- [ ] E3. 每个操作按钮旁有 `[?]` 图标（新建/启用/停用/搜索等），悬停显示 Tooltip（与 §7.2 定义一致）
- [ ] E4. 帮助文案与 PRD 定义一致

### F. 权限点
- [ ] F1. 无 `dataExportGrant.view` 的角色不可见授权管理菜单、不可访问列表接口
- [ ] F2. 无 `dataExportGrant.edit` 的角色不可执行新建/启停/删除（按钮隐藏 + 接口 403）
- [ ] F3. super_admin / admin 具备权限点，操作正常

### G. 审计
- [ ] G1. 新建授权写 `audit_logs`（action `data_export_grants.create`）
- [ ] G2. 启用/停用写 `audit_logs`（action `data_export_grants.update`，含 userId/enabled）
- [ ] G3. 删除写 `audit_logs`（action `data_export_grants.delete`）
- [ ] G4. 审计记录可追溯（操作人、时间、IP）

### H. 一致性 & 边界
- [ ] H1. 授权管理页与「数据调取请求管理」(`/admin/audit/data-request`) 菜单/路由/页面/API/表完全独立，互不影响
- [ ] H2. 既有 `data_requests` 用户导出流程（除新增授权入口校验）行为不回归——已授权用户提交/列表/详情/撤回/下载全流程正常
- [ ] H3. 授权停用不删除/篡改 `data_requests` 历史记录

> 验收入口：backend 跑 `pnpm test`（单元 + 集成），front 跑构建 + 手测；`--grep "data-export-grant"` / `--grep "data export grant"` 覆盖 B/C 核心。所有 E 项必须通过，否则不验收。

---

## 附：实现落地要点（供 backend/front 参考，非本 PRD 强制）

- **后端**：
  - 新增 `api/src/db/schema/data-export-grants.ts` + `index.ts` re-export + migration。
  - 新增 `api/src/services/compliance/data-export-grant.service.ts`（纯函数，遵循 §1.6）与 `api/src/routes/data-export-grants.ts`。
  - 新增授权校验 helper（如 `assertDataExportGranted(userId)`），在 `data-requests.ts` 五个接口中调用（download 例外，见 §4.3）。
  - `app.ts` 第 258 行附近注册新路由。
- **前端**：
  - `App.tsx` 增加 `/admin/config/data-export-grants` 路由 + 新页面组件。
  - `ConsoleLayout.tsx`：`ADMIN_NAV` 增加菜单项；`PORTAL_NAV` 的 `/data-export` 按授权状态条件渲染。
  - `permissions.ts` 增加权限点。
  - 页面组件使用 `@3cloud/shared-ui` 的 `HelpIcon` 落实 P1 帮助体系。

---

> 最后更新：2026（product-agent）
> 关联：`PRODUCT-DESIGN-PRINCIPLES.md`、`coding-standards-*.md`、`development-plan.md`
