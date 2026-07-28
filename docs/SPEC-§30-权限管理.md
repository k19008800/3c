# 功能说明书：§30 权限管理

> **对应文档**：[`PRD-用户体系.md`](PRD-用户体系.md)、[`PRD-管理后台.md`](PRD-管理后台.md)
> **状态**：草案（仅需求文档）
> **优先级**：P0（角色管理增强、用户权限一览）、P1（权限变更审计、API Key 细粒度权限）、P2（权限模板、权限自检）

---

## 30.0 总览

### 功能描述

平台已有基于 bitset 的动态角色权限引擎（admin_roles + userRoleAssignments + userPermissionOverrides），支持创建角色、分配角色、权限覆写。但缺乏面向管理员的完整权限管理工具链：权限可视化查看、变更审计追溯、细粒度 API Key 权限控制、白名单 IP/域名约束等。本模块补充这些缺失的能力。

### 子模块清单

| 编号 | 模块 | 优先级 | 核心价值 |
|------|------|--------|---------|
| 30.1 | 角色管理增强 | P0 | 角色创建/编辑/删除、权限树可视化勾选、预设角色 |
| 30.2 | 用户权限一览 | P0 | 查看任意用户的最终有效权限（角色权限+覆写叠加） |
| 30.3 | 权限变更审计 | P1 | 角色分配/权限覆写的变更记录和追溯 |
| 30.4 | API Key 细粒度权限 | P1 | Key 级别模型/IP/域名/每日限额/费用上限 |
| 30.5 | 权限模板与预设 | P1 | 初始化预设角色模板（运营/财务/客服/审计） |
| 30.6 | 权限自检 | P2 | 管理员查看自己当前拥有的权限 |

---

## 30.1 角色管理增强

### 功能描述

在现有 `adminRoles` 动态角色引擎基础上，增强管理后台角色管理页面：权限树可视化勾选、角色详情查看、创建/编辑/删除角色、角色下用户列表。

### 完成能力 / 展示效果

**管理后台 → 设置 → 角色管理：**

```
角色管理

  角色名        标签      用户数  类型      操作
  admin        超级管理员  3      系统内置  [不可编辑]
  operator     运营       8      系统内置  [编辑]
  finance      财务       4      系统内置  [编辑]
  support      客服       6      系统内置  [编辑]
  viewer       只读查看者  12     系统内置  [编辑]
  custom_role  自定义角色  2      自定义    [编辑] [删除]

  [+ 创建角色]
```

**创建/编辑角色弹窗：**

```
编辑角色 — 客服

  角色名称:  [support          ]（英文标识，不可重复）
  角色标签:  [客服              ]
  角色描述:  [处理用户咨询和工单  ]

  权限设置（权限树结构）:
  ┌────────────────────────────────────────────────┐
  │  ☐ 全部权限                                      │
  │  ├── ☑ 📊 数据查看                              │
  │  │   ├── ☑ 查看仪表盘                            │
  │  │   ├── ☑ 查看用户列表                          │
  │  │   ├── ☑ 查看调用日志                          │
  │  │   ├── ☐ 查看财务数据                          │
  │  │   └── ☐ 查看供应商详情                        │
  │  ├── ☑ 👥 用户管理                              │
  │  │   ├── ☑ 查看用户详情                          │
  │  │   ├── ☑ 搜索用户                              │
  │  │   ├── ☐ 创建用户                              │
  │  │   ├── ☐ 禁用/启用用户                         │
  │  │   └── ☐ 删除用户                              │
  │  ├── ☑ 💰 资金操作                              │
  │  │   ├── ☐ 查看用户余额                          │
  │  │   └── ☐ 调整用户余额（需二次确认）             │
  │  ├── ☑ 🎫 工单管理                              │
  │  │   ├── ☑ 查看工单队列                          │
  │  │   ├── ☑ 回复工单                              │
  │  │   ├── ☑ 变更工单状态                          │
  │  │   ├── ☐ 删除工单                              │
  │  │   └── ☐ 工单分配                              │
  │  └── ☐ ⚙️ 系统配置                              │
  │      ├── ☐ 站点设置                              │
  │      ├── ☐ 角色管理                              │
  │      └── ☐ 系统参数                              │
  └────────────────────────────────────────────────┘

  [取消] [保存角色]
```

**权限分组与权限位：**

```
权限按模块分组，每个权限对应一个 bitset 位：

📊 数据查看:
  DASHBOARD_VIEW     — 查看仪表盘
  USER_LIST_VIEW     — 查看用户列表
  USER_DETAIL_VIEW   — 查看用户详情
  LOG_VIEW           — 查看调用日志
  FINANCE_VIEW       — 查看财务数据
  VENDOR_VIEW        — 查看供应商信息

👥 用户管理:
  USER_CREATE        — 创建用户
  USER_EDIT          — 编辑用户
  USER_DISABLE       — 禁用/启用用户
  USER_DELETE        — 删除用户
  USER_ROLE_ASSIGN   — 分配角色
  USER_PERM_OVERRIDE — 权限覆写

💰 资金操作:
  BALANCE_VIEW       — 查看余额
  BALANCE_ADJUST     — 调整余额（二次确认）
  RECHARGE_MANAGE    — 管理充值
  REFUND_PROCESS     — 处理退款
  WITHDRAW_AUDIT     — 审核提现

🎫 工单管理:
  TICKET_VIEW        — 查看工单
  TICKET_REPLY       — 回复工单
  TICKET_STATUS      — 变更状态
  TICKET_ASSIGN      — 分配工单
  TICKET_DELETE      — 删除工单

🏭 供应商管理:
  VENDOR_VIEW        — 查看供应商
  VENDOR_CREATE      — 创建供应商
  VENDOR_EDIT        — 编辑供应商
  VENDOR_DISABLE     — 停用供应商
  MODEL_MANAGE       — 管理模型

⚙️ 系统配置:
  CONFIG_VIEW        — 查看配置
  CONFIG_EDIT        — 编辑配置
  ROLE_MANAGE        — 角色管理
  AUDIT_VIEW         — 查看审计日志
  SYSTEM_BACKUP      — 系统备份
  SYSTEM_UPGRADE     — 系统升级
```

### API 接口

```
// 已有
GET    /api/v1/admin/roles                      — 角色列表
POST   /api/v1/admin/roles                      — 创建角色
PATCH  /api/v1/admin/roles/:id                  — 编辑角色
DELETE /api/v1/admin/roles/:id                  — 删除角色
GET    /api/v1/admin/roles/permissions/list     — 权限位清单
GET    /api/v1/admin/roles/users/:roleId        — 角色下的用户列表

// 新增
GET    /api/v1/admin/roles/stats                — 角色统计（各角色用户数）
```

### 前端组件

```tsx
interface RoleListProps {
  roles: AdminRole[]
  onEdit: (id: number) => void
  onCreate: () => void
  onDelete: (id: number) => void
  stats: Record<number, number>  // roleId -> userCount
}

interface RoleEditorProps {
  role?: AdminRole
  permissionTree: PermissionNode[]
  onSave: (data: RoleFormData) => Promise<void>
  onClose: () => void
}

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
  permissions: string[]  // 选中的权限 key 列表
}
```

### 验收标准

#### □ 流程图一致性校验 — 与对应流程图对比验证流程分支、异常处理、决策节点完全一致

1. 角色管理页显示所有角色列表及用户数
2. 创建角色 → 填写名称/标签 → 权限树勾选 → 保存 → 角色出现
3. 编辑角色 → 权限树显示当前角色的权限 → 修改 → 保存
4. 系统内置角色不可删除、不可改名

---

## 30.2 用户权限一览

### 功能描述

查看任意用户的最终有效权限，展示用户角色权限 + 权限覆写叠加后的结果。

### 完成能力 / 展示效果

**用户详情 → 权限标签页：**

```
用户详情 — 张三 (ID: 42)
  [基本信息] [API Key] [调用日志] [权限]

  权限概览
  角色: 客服 (support)
  权限覆写: 无

  有效权限:
  ✅ 📊 数据查看
  │  ✅ 查看仪表盘  ✅ 查看用户列表
  │  ✅ 查看调用日志  ✅ 查看用户详情
  │  ❌ 查看财务数据  ❌ 查看供应商详情
  ✅ 👥 用户管理
  │  ✅ 查看用户详情  ✅ 搜索用户
  │  ❌ 创建用户  ❌ 禁用用户  ❌ 删除用户
  ✅ 💰 资金操作
  │  ✅ 查看用户余额
  │  ❌ 调整余额
  ✅ 🎫 工单管理
  │  ✅ 查看工单  ✅ 回复工单  ✅ 变更状态
  │  ❌ 分配工单  ❌ 删除工单
```

**权限覆写操作：**

```
管理员 → [覆写权限]

  覆写权限 — 张三 (ID: 42)
  基于角色: 客服 (support)

  额外授予:   ☐ 查看财务数据  ☐ 调整余额
  拒绝权限:   ☐ 查看用户余额
  原因: [临时授权查看财务数据完成月报]

  [保存] [清除覆写]
```

### API 接口

```
// 已有
GET    /api/v1/admin/users/:id/permissions           — 用户权限 bitset
PUT    /api/v1/admin/users/:id/permissions           — 权限覆写
DELETE /api/v1/admin/users/:id/permissions           — 清除覆写

// 新增
GET    /api/v1/admin/users/:id/permissions/detail    — 权限详细
  响应: { role, overrides, effective: PermissionGroup[] }
```

### 验收标准

1. 用户详情→权限页展示每项权限的授予/拒绝状态
2. 有覆写时显示覆写详情和原因
3. 管理员可覆写权限 + 清除覆写

---

## 30.3 权限变更审计（P1）

### 功能描述

所有角色和权限操作记录审计日志，可追溯"谁在什么时候改了谁的什么权限"。

### 完成能力 / 展示效果

```
权限变更审计
  筛选: [操作者 ▼] [操作类型 ▼] [时间范围 ▼]

  时间              操作者     操作类型      详情
  2026-07-28 10:23  admin     分配角色      用户 张三 → 客服
  2026-07-28 09:15  admin     修改角色权限   客服: +工单分配
  2026-07-27 18:00  admin     权限覆写       用户 李四: +查看财务
  2026-07-27 15:30  admin     创建角色       自定义: 运营主管
  2026-07-26 14:00  system    清除覆写       用户 张三（已离职）
```

### 操作类型

```
role_created / role_updated / role_deleted
user_role_assigned / user_role_removed
user_perm_override / user_perm_override_cleared
```

### API 接口

```
GET /api/v1/admin/audit-logs?type=role_created,role_updated,...
  // 复用现有 audit-logs 接口，通过操作类型筛选
```

### 验收标准

1. 权限变更审计页展示所有权限相关操作
2. 按操作者/类型/时间筛选
3. 点击详情 → 显示变更前后对比

---

## 30.4 API Key 细粒度权限控制（P1）

### 功能描述

API Key 权限控制增强。在现有模型限制基础上，补充 IP 白名单、域名限制、每日调用额度、费用上限。

### 完成能力 / 展示效果

**创建 Key 弹窗增强：**

```
创建 API Key
  Key 名称: [生产环境 Key]

  模型权限:
  ○ 所有模型
  ● 仅以下模型:  ☑ deepseek-chat  ☑ qwen-plus

  IP 白名单（可选，每行一个 CIDR 或 IP）:
  192.168.1.0/24
  10.0.0.1

  域名限制（可选，每行一个域名）:
  api.myapp.com

  每日限额（可选）:
  每日最多调用: [100000    ] 次
  每日最多 Token: [10000000 ] tokens
  每日最多费用: [100       ] ¥
```

### 权限检查逻辑

```
API 调用时检查流程：
├── 1. Key 是否 active
├── 2. 模型白名单是否允许
├── 3. IP 白名单：来源 IP 是否允许
├── 4. 域名限制：Origin/Referer 是否允许
├── 5. 每日限额：次数/Token/费用未超限
└── 任意不通过 → 403 + 具体错误信息
```

### 数据表扩展

```typescript
// api_keys 表扩展字段
// ipWhitelist: text      — JSON array of IP/CIDR
// domainWhitelist: text  — JSON array of domains
// dailyCallLimit: integer — 每日调用次数上限
// dailyTokenLimit: integer — 每日 Token 上限
// dailyCostLimit: numeric — 每日费用上限
```

### API 接口

```
// 已有 Key CRUD 扩展字段
POST /api/v1/me/api-keys  — 新增 ipWhitelist/domainWhitelist/dailyCallLimit 等字段

// 新增
GET  /api/v1/me/api-keys/:id/usage-today  — 当日用量
  → { calls, tokens, cost, limits: { calls, tokens, cost } }
```

### 验收标准

1. 用户创建 Key 时设置 IP 白名单 → 白名单外 IP 调用返回 403
2. 设置每日限额 → 超限后返回 429
3. Key 详情页展示当日用量和限额

---

## 30.5 权限模板与预设角色（P1）

### 功能描述

系统初始化时内置 9 个预设角色，开箱即用。

### 预设角色

| 角色 | 权限范围 | 说明 |
|------|---------|------|
| super_admin | 全部权限 | 最高权限，不可编辑 |
| admin | 全部权限（不含角色管理） | 管理员 |
| operator | 数据查看 + 用户管理 + 运营 + 供应商 | 日常运营 |
| finance | 数据查看 + 财务全部 + 退款 + 对账 | 财务 |
| support | 数据查看（不含财务）+ 工单管理 + 查看余额 | 客服 |
| support_leader | 同 support + 工单分配 + 绩效查看 | 客服主管 |
| auditor | 全部查看权限（无操作权限） | 审计 |
| viewer | 全部查看权限（无操作权限） | 只读查看者 |
| vendor | 仅自己供应商数据 | 供应商自助 |

### 实现

```typescript
// seed 数据，系统角色不可删除不可改名
const DEFAULT_ROLES = [
  { name: 'super_admin', label: '超级管理员', isSystem: true, permissions: ALL_PERMS },
  { name: 'admin', label: '管理员', isSystem: true, permissions: ALL_EXCEPT_ROLE_MGMT },
  // ...
];
```

### 验收标准

1. 系统初始化后自动创建 9 个预设角色
2. 系统角色不可删除、不可改名

---

## 30.6 权限自检（P2）

### 功能描述

管理员在后台查看自己拥有的权限列表。

### 完成能力 / 展示效果

```
我的权限 — zhangsan@3cloud.com
  角色: 客服 (support)
  权限覆写: +查看财务数据（临时授权至 2026-08-05）

  有效权限:
  ✅ 📊 数据查看（不含财务）
  ✅ 👥 用户管理（只读）
  ✅ 💰 资金操作（仅查看余额）
  ✅ 🎫 工单管理
  ❌ ⚙️ 系统配置
```

### API 接口

```
GET /api/v1/me/permissions    — 当前用户权限详情
GET /api/v1/me/permissions/check?perm=xxx  — 检查某权限
```

### 验收标准

1. 个人设置中查看自己权限
2. 权限列表按分组展示
3. 有覆写时显示覆写详情


---

### [?] 页面帮助

**页面名称**：功能说明书：§30 权限管理

**适用角色**：视具体功能而定（参见总览中的优先级和适用角色说明）

**功能定位**：该页面提供 功能说明书：§30 权限管理 相关的配置、查询和管理能力。

**核心操作**：
1. 查看列表 / 详情
2. 创建 / 编辑 / 删除条目
3. 筛选 / 搜索 / 导出

**注意事项**：
- 部分操作涉及敏感数据，需二次确认或 2FA 身份验证
- 操作记录会写入操作日志

**常见问题**：
Q: 为什么某些操作不可用？
A: 请检查当前账号的权限角色是否包含对应操作权限。

### [?] 按钮级帮助对照表

| 按钮/操作 | 帮助说明 |
|----------|---------|
| 创建/新增 | 添加一条新记录 |
| 编辑 | 修改已有记录的字段内容 |
| 删除 | 删除选中的记录（不可恢复，需确认） |
| 搜索 | 按关键词搜索匹配的记录 |
| 筛选 | 按选中条件过滤列表 |
| 导出 CSV | 将当前列表数据导出为 CSV 文件 |
| 查看详情 | 查看选中记录的完整信息 |
