# 深化参考：§11.2 线索管理

> **对应**：[`PRD-业务员支撑.md`](PRD-业务员支撑.md) §11.2
> **关联**：[`ref-11.1-crm.md`](ref-11.1-crm.md)、[`SPEC-§4-管理后台.md`](SPEC-§4-管理后台.md)
> **优先级**：P0 | **状态**：需求文档（待开发）
> **最后更新**：2026-07-30

---

## 概述

业务员通过各种渠道获取潜在客户线索（官网注册、展会、朋友介绍、主动拓客），但目前没有系统化记录，线索跟进全靠 Excel 或微信聊天记录，容易遗漏和丢失。

**核心价值**：系统化管理所有拓客入口，线索全生命周期可追踪，防止线索遗漏和丢失。

---

## 功能模块

### 1. 线索录入

| 录入方式 | 渠道 | 自动/手动 |
|---------|------|-----------|
| 手动录入 | 业务员在后台填写 | 手动 |
| 官网注册 | 用户注册时来源标记为"官网" | 自动（关联用户注册） |
| 展会扫码 | 展会专属二维码 → 填写表单 | 半自动 |
| 批量导入 | 上传 CSV 文件批量导入线索 | 手动（管理员） |
| 公开 API | 开放线索提交接口（对外） | 自动 |

**手动录入表单：**

```
新增线索

  姓名 *        [_____________]
  公司          [_____________]
  电话          [_____________]
  邮箱 *        [_____________]
  微信          [_____________]
  需求描述      [_____________]
  来源          [ ▼ 朋友介绍 ]
  分配给我      ☑
```

### 2. 线索列表

```
线索管理

  [搜索]  [按状态 ▼]  [按来源 ▼]  [按分配人 ▼]  [时间范围 ▼]

  ┌────┬───────┬───────┬───────┬────────┬────────┬────────┐
  │ 姓名 │ 公司   │ 电话   │ 来源   │ 状态    │ 分配人  │ 创建时间 │
  ├────┼───────┼───────┼───────┼────────┼────────┼────────┤
  │ 张三 │ 阿里   │ 138…  │ 展会   │ 已联系  │ 王业务  │ 07-28  │
  │ 李四 │ 腾讯   │ 139…  │ 朋友介绍│ 新线索  │ 王业务  │ 07-27  │
  │ 王五 │ 字节   │ 136…  │ 官网注册│ 已成交  │ 李业务  │ 07-20  │
  └────┴───────┴───────┴───────┴────────┴────────┴────────┘
```

### 3. 线索状态机

```
线索生命周期：

new（新线索）
  ↓ 业务员联系
contacted（已联系）
  ↓ 客户有意向
interested（意向客户）
  ↓ 客户注册/充值
converted（已成交）
  自动关联为名下客户

new → invalid（无效）各阶段均可直接标记为无效

invalid（无效）
  ├── 无效原因: 空号/不感兴趣/已使用竞品/联系不上/其他
```

### 4. 线索分配

| 分配方式 | 说明 |
|---------|------|
| 手动分配 | 管理员/组长选中线索分配给指定业务员 |
| 自动分配 | 按业务员当前线索负载均衡分配（最少线索优先） |
| 自领取 | 线索池中的未分配线索，业务员可自行领取 |
| 来源绑定 | 官网注册 → 自动分配给负责该渠道的业务员 |

### 5. 线索转换

当用户注册时携带推荐码，或注册后系统发现邮箱/手机号匹配到已有线索：

```
用户注册
    ↓
系统检查 leads 表：email 或 phone 匹配
    ↓
匹配到 → 更新 lead：
  ├── linked_user_id = 注册用户 ID
  ├── status = 'converted'
  └── 自动归为名下客户（如线索有 assignedTo）
未匹配 → 新线索（来源 = '官网注册'）
```

### 6. 批量操作

| 操作 | 说明 |
|------|------|
| 批量分配 | 选中多条线索 → 分配给指定业务员 |
| 批量删除 | 选中无效线索 → 批量删除（软删除） |
| 批量导入 | 上传 CSV（姓名/邮箱/电话/公司/需求/来源）→ 预览 → 确认导入 |
| 导出 | 按筛选条件导出线索列表为 CSV |

---

## 数据表 Schema

```typescript
// leads — 线索
export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 50 }).notNull(),
  company: varchar("company", { length: 100 }),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 100 }),
  wechat: varchar("wechat", { length: 50 }),
  requirement: text("requirement"),            // 需求描述
  source: varchar("source", { length: 30 }).notNull(),
  // manual | website | exhibition | referral | social | cold_call | api | other
  status: varchar("status", { length: 20 }).notNull().default("new"),
  // new | contacted | interested | converted | invalid
  invalidReason: varchar("invalid_reason", { length: 100 }),
  // empty | wrong_number | not_interested | competitor | unreachable | other
  assignedTo: integer("assigned_to").references(() => users.id),
  linkedUserId: integer("linked_user_id").references(() => users.id), // 关联的用户（converted后）
  note: text("note"),                          // 内部备注
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 索引
// idx_leads_assigned_status ON (assigned_to, status)
// idx_leads_email ON (email) WHERE email IS NOT NULL
// idx_leads_phone ON (phone) WHERE phone IS NOT NULL
// idx_leads_created ON (created_at)

// lead_activity_log — 线索跟进日志
export const leadActivityLog = pgTable("lead_activity_log", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").notNull().references(() => leads.id),
  action: varchar("action", { length: 30 }).notNull(),
  // created | assigned | contacted | status_changed | noted | converted
  detail: text("detail"),
  operatorId: integer("operator_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

---

## API 接口

### 管理员端

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `POST` | `/api/v1/admin/leads` | 录入线索 | 管理员/业务员 |
| `GET` | `/api/v1/admin/leads?status=&source=&assignee=&search=&page=&limit=` | 线索列表 | agent_mgr 以上 |
| `PATCH` | `/api/v1/admin/leads/:id` | 更新线索 | agent_mgr 以上 |
| `DELETE` | `/api/v1/admin/leads/:id` | 删除线索（软删除） | agent_mgr 以上 |
| `POST` | `/api/v1/admin/leads/:id/assign` | 分配线索 | agent_mgr 以上 |
| `POST` | `/api/v1/admin/leads/batch/assign` | 批量分配 | agent_mgr 以上 |
| `POST` | `/api/v1/admin/leads/batch/delete` | 批量删除 | agent_mgr 以上 |
| `POST` | `/api/v1/admin/leads/import` | 导入 CSV | agent_mgr 以上 |
| `GET` | `/api/v1/admin/leads/export?status=&source=` | 导出线索 CSV | agent_mgr 以上 |
| `GET` | `/api/v1/admin/leads/:id/activity` | 线索跟进日志 | agent_mgr 以上 |
| `GET` | `/api/v1/admin/leads/summary` | 线索概览统计（总数/按状态/按来源） | agent_mgr 以上 |
| `GET` | `/api/v1/admin/leads/pool` | 线索池（未分配的线索） | agent_mgr 以上 |
| `POST` | `/api/v1/admin/leads/pool/claim/:id` | 自领取线索池线索 | 业务员 |

### 业务员端

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `GET` | `/api/v1/agent/leads?status=&page=&limit=` | 我的线索列表 | 业务员 |
| `PATCH` | `/api/v1/agent/leads/:id` | 更新线索状态/信息 | 业务员（仅本人） |
| `POST` | `/api/v1/agent/leads` | 录入线索（自动分配给自己） | 业务员 |
| `POST` | `/api/v1/agent/leads/:id/note` | 添加线索备注 | 业务员（仅本人） |

### 公开端

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `POST` | `/api/v1/public/leads` | 提交线索（对外） | 无需登录（需验证码） |
| `GET` | `/api/v1/public/leads/sources` | 线索来源列表（供前端表单） | 无需登录 |

> 公开线索提交接口需配置验证码（图形验证码或人机验证），防止机器人刷单。

---

## 前端组件 Props

```tsx
// 线索列表
interface LeadListProps {
  leads: Lead[];
  filters: LeadFilters;
  onFilterChange: (filters: Partial<LeadFilters>) => void;
  onSearch: (q: string) => void;
  onLeadClick: (id: number) => void;
  onAssign: (id: number, userId: number) => void;
  onBatchAssign: (ids: number[], userId: number) => void;
  onImport: () => void;
  onExport: (filters: LeadFilters) => void;
  pagination: { page: number; total: number; limit: number };
  assignableUsers: { id: number; name: string }[];
  loading: boolean;
  isAdmin: boolean; // 管理员看到全部，业务员只看自己
}

// 线索录入表单
interface LeadFormProps {
  onSubmit: (lead: Partial<Lead>) => Promise<void>;
  onCancel: () => void;
  initial?: Partial<Lead>;
}

// 线索详情
interface LeadDetailProps {
  lead: Lead;
  activityLog: LeadActivity[];
  onUpdateStatus: (status: string, reason?: string) => Promise<void>;
  onAssign: (userId: number) => Promise<void>;
  onAddNote: (note: string) => Promise<void>;
  isAdmin: boolean;
}
```

---

## 边界条件

| 场景 | 处理方式 |
|------|---------|
| 线索邮箱/电话已存在 | 提示"该线索已存在（ID: xxx）"，禁止重复录入 |
| 线索用户已注册 | 检查 email/phone → 自动标记 converted + 关联 linkedUserId |
| 线索池超时未认领 | 超过 48 小时未分配的线索 → 系统自动重新分配 |
| 批量导入 CSV 格式错误 | 预览阶段提示错误行号，允许跳过错误行 |
| 公开接口刷单 | 验证码 + IP 限流（每 IP 每小时 10 次） |
| 线索分配后不跟进 | 3 天无操作的已分配线索 → 提醒分配人或退回线索池 |

---

## 验收标准

1. 管理员/业务员可手动录入线索，填写必要信息
2. 线索列表支持状态/来源/分配人多维筛选 + 搜索
3. 线索状态流转正常（new → contacted → interested → converted）
4. 线索分配：管理员手动分配 / 业务员自领取
5. 线索转换：用户注册时自动匹配已有线索 → 标记 converted + 关联名下客户
6. 批量导入 CSV → 预览 → 确认 → 导入成功
7. 导出线索 CSV 格式正确
8. 线索详情页显示基本信息、活动日志、可变更状态
9. 公开线索提交接口有验证码防护

---

## 关联模块

| 模块 | 关联方式 |
|------|---------|
| §11.1 CRM | 线索转换后自动归为名下客户，线索数据流入 CRM |
| §11.4 商机 | 意向线索可创建商机 |
| §11.8 团队协作 | 线索分配与转移依赖团队管理 |

---

### [?] 页面帮助
**页面名称**：线索管理
**核心操作**：录入/导入线索、分配线索、跟进线索、转换成交
**注意事项**：管理员可见全部线索；业务员仅可见分配给自己的线索；线索转换后自动成为名下客户

### [?] 按钮级帮助对照表
| 按钮/操作 | 帮助说明 |
|----------|---------|
| 新增线索 | 手动录入潜在客户信息 |
| 导入线索 | 上传 CSV 文件批量导入线索 |
| 导出线索 | 按当前筛选条件导出线索列表 |
| 分配 | 将线索分配给指定业务员跟进 |
| 自领取 | 从线索池中领取未分配的线索 |
| 标记无效 | 标记线索为无效，需填写无效原因 |
| 匹配客户 | 将线索关联到已有平台用户 |