# 系统配置 — 深化参考文档

> **对应章节**：[PRD-README.md §4.8 系统配置精化](../PRD-README.md#48-系统配置精化)
> **状态**：基于现有后端代码（`api/src/db/schema/system.ts`（`systemConfigs`）、`api/src/db/schema/config-versions.ts`（`configVersions`/`configSnapshots`/`configChangeRequests`）、`api/src/services/config-version/`（10 子文件）、`api/src/routes/admin/system.ts`、`api/src/routes/admin/site-settings.ts`）生成
> **粒度**：Schema 字段定义 → API 接口 → 前端组件 Props → 配置审计追踪 → 导入导出 → 交叉引用

---

## 目录

1. [配置体系总览](#1-配置体系总览)
2. [系统配置管理](#2-系统配置管理)
3. [站点设置](#3-站点设置)
4. [配置版本控制](#4-配置版本控制)
5. [配置快照](#5-配置快照)
6. [配置变更审批](#6-配置变更审批)
7. [配置导入导出](#7-配置导入导出)
8. [跨模块数据流](#8-跨模块数据流)

---

## 1. 配置体系总览

### 1.1 配置类型

| 配置类型 | 表/源 | 说明 | 管理页面 |
|---------|-------|------|---------|
| **系统配置** | `system_configs` | Key-Value 配置，JSON 文本存储 | `admin → configs` |
| **站点设置** | `system_configs` (site_* keys) | 站点名称/LOGO/ICP/联系方式 | `admin → site-settings` |
| **登录安全** | `login_security_configs` | 登录限制/锁定阈值 | `admin → security → config` |
| **安全规则** | `security_auto_rules` | 自动规则引擎 | `admin → security → rules` |
| **告警规则** | `monitoring_rules` | 监控告警阈值 | `admin → monitoring → rules` |
| **异常告警规则** | `operation_alert_rules` | 异常操作规则 | `admin → operation-alerts → rules` |
| **邮件模板** | `email_templates` | 邮件模板（中英文） | `admin → email-templates` |
| **操作类型** | `operation_types` | 操作轨迹分类 | `admin → operation-types` |
| **页面内容** | `page_contents` | 公开页面内容 | `admin → page-contents` |

### 1.2 配置变更审计链路

```
管理员修改配置
  → 记录 audit_logs（before/after JSON snapshot）
  → 记录 config_versions（configKey + configType + oldValue + newValue）
  → 可选：创建 configChangeRequests（审批流）
  → 可选：创建 configSnapshots（快照备份）
  → 系统配置更新即时生效（无缓存）
```

---

## 2. 系统配置管理

### 2.1 表结构

```typescript
export const systemConfigs = pgTable("system_configs", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),           // 配置键
  value: text("value").notNull(),                                    // JSON 字符串存储
  description: varchar("description", { length: 500 }),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

### 2.2 内置配置键

**站点基础**：`site_name` / `site_logo_url` / `site_favicon_url` / `site_icp` / `site_icp_link` / `site_police_icp` / `site_copyright` / `site_company_name` / `site_contact_email` / `site_contact_phone` / `site_wechat_qr_url` / `site_footer_html`

**运营**：`kpi_operating_margin_target` / `kpi_user_growth_target` / `alert_failure_rate_threshold` / `alert_revenue_drop_threshold`

**安全**：`login_failure_lockout` / `login_time_restriction` / `geo_block_enabled`

**通知**：`notification_email_enabled` / `notification_webhook_url`

**计费**：`min_recharge_amount` / `default_balance_alert_threshold`

### 2.3 API

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/configs` | 配置列表 | CONFIG_VIEW |
| PATCH | `/api/v1/admin/configs/:key` | 更新配置 | CONFIG_EDIT |

**配置列表 Query**：`group`（前缀过滤，如 `site_`、`kpi_`、`login_`）

**更新配置**：
```json
// PATCH /api/v1/admin/configs/:key
{ "value": "{\"attempts\":5,\"windowMinutes\":5,\"lockMinutes\":15}" }
```

**响应**：
```json
{
  "code": 0,
  "data": {
    "key": "login_failure_lockout",
    "value": { "attempts": 5, "windowMinutes": 5, "lockMinutes": 15 },
    "description": "登录失败锁定配置",
    "updatedAt": "2026-07-28T10:00:00.000Z"
  }
}
```

### 2.4 前端系统配置页面

```
admin → 运维 → 系统配置
├── 分组导航（站点 / 运营 / 安全 / 通知 / 计费 / 其他）
├── 配置列表（卡片或表格）
│   ├── 配置键（带说明 hover）
│   ├── 当前值（JSON 格式化展示）
│   ├── 最后更新时间
│   └── 操作（编辑 + 变更历史）
│
└── 编辑弹窗
    ├── 配置键（只读）
    ├── 当前值（JSON 编辑器或结构化表单）
    ├── 变更原因
    └── 保存（自动记录 audit_logs + config_versions）
```

**SystemConfigListProps**：
```typescript
interface SystemConfigListProps {
  group?: string;            // 配置分组过滤
  onConfigUpdated?: (key: string) => void;
}
```

**SystemConfigEditorProps**：
```typescript
interface SystemConfigEditorProps {
  configKey: string;
  configValue: any;          // 当前值
  configDescription?: string;
  onSave: (key: string, value: string, reason: string) => Promise<void>;
}
```

---

## 3. 站点设置

### 3.1 管理页面

```
admin → 运维 → 站点设置
├── 基本设置
│   ├── 站点名称（文本输入）
│   ├── Logo（图片上传 + 裁剪）
│   ├── Favicon（图片上传）
│   └── 底部版权 HTML（富文本编辑器）
│
├── 备案信息
│   ├── ICP 备案号
│   ├── ICP 备案链接
│   ├── 公安备案号
│   └── 公司名称
│
├── 联系方式
│   ├── 联系邮箱
│   ├── 联系电话
│   └── 微信公众号二维码（图片上传）
│
└── 保存（批量更新全部 system_configs.site_* keys）
```

### 3.2 API

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/site-settings` | 获取全部站点配置 | CONFIG_VIEW |
| PUT | `/api/v1/admin/site-settings` | 批量更新 | CONFIG_EDIT |
| POST | `/api/v1/admin/site-settings/upload` | 上传图片 | CONFIG_EDIT |

**批量更新**：
```json
{
  "site_name": "3Cloud AI",
  "site_icp": "沪ICP备2026XXXXXX号",
  "site_contact_email": "support@3cloud.ai"
}
```

**图片上传**：支持 Logo / Favicon / 二维码等，使用 `sharp` 自动压缩和裁剪。

### 3.3 站点设置 Props

```typescript
interface SiteSettingsProps {
  settings: Record<string, string>;  // site_* 键值对
  onSave: (settings: Record<string, string>) => Promise<void>;
  onUpload: (field: string, file: File) => Promise<string>; // 返回 URL
}
```

---

## 4. 配置版本控制

### 4.1 表结构

```typescript
export const configVersions = pgTable("config_versions", {
  id: serial("id").primaryKey(),
  configKey: varchar("config_key", { length: 100 }).notNull(),
  configType: varchar("config_type", { length: 50 }).notNull().default("system"),
  // system | security | login_security
  oldValue: text("old_value"),
  newValue: text("new_value").notNull(),
  changedBy: integer("changed_by").references(() => users.id),
  changeReason: text("change_reason"),
  ip: varchar("ip", { length: 45 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 索引
config_versions_key_idx            — on(configKey)
config_versions_type_idx           — on(configType)
config_versions_created_at_idx     — on(createdAt)
config_versions_key_type_time_idx  — on(configKey, configType, createdAt DESC)
```

### 4.2 API

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/config-versions` | 版本列表 | CONFIG_VIEW |
| GET | `/api/v1/admin/config-versions/:id` | 版本详情（含 diff） | CONFIG_VIEW |
| GET | `/api/v1/admin/config-versions/diff/:id1/:id2` | 两个版本的对比 | CONFIG_VIEW |

**版本列表**：
```json
{
  "code": 0,
  "data": {
    "list": [
      {
        "id": 100,
        "configKey": "login_failure_lockout",
        "configType": "system",
        "changedBy": 1,
        "changeReason": "降低锁定阈值",
        "createdAt": "2026-07-28T10:00:00.000Z"
      }
    ],
    "total": 500,
    "page": 1,
    "pageSize": 20
  }
}
```

### 4.3 配置 Diff 工具

```typescript
// 深度对比两个配置对象
diffConfigs(oldValue, newValue) → {
  added: string[],             // 新增的键
  removed: string[],           // 删除的键
  changed: { key, old, new }[], // 值变化的键
  unchanged: string[],         // 未变的键
}
```

### 4.4 前端配置版本页面

```
admin → 运维 → 配置版本
├── 版本列表（表格）
│   ├── 配置键
│   ├── 配置类型
│   ├── 变更人
│   ├── 变更原因
│   ├── 变更时间
│   └── 操作（查看详情 / 对比）
│
└── 版本详情弹窗
    ├── 基本信息（键/类型/人/时间/IP）
    ├── 变更原因
    ├── 旧值（JSON 格式化）
    ├── 新值（JSON 格式化，差异高亮）
    └── 变更项对比列表（added/removed/changed）
```

---

## 5. 配置快照

### 5.1 表结构

```typescript
export const configSnapshots = pgTable("config_snapshots", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  configType: varchar("config_type", { length: 50 }).notNull(),
  configData: jsonb("config_data").notNull().$type<Record<string, any>>(),  // 全量配置快照
  createdBy: integer("created_by").references(() => users.id),
  isActive: boolean("is_active").notNull().default(false),                    // 当前活跃快照标记
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

### 5.2 API

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/config-snapshots` | 快照列表 | CONFIG_VIEW |
| POST | `/api/v1/admin/config-snapshots` | 创建快照 | CONFIG_EDIT |
| GET | `/api/v1/admin/config-snapshots/:id` | 快照详情 | CONFIG_VIEW |
| POST | `/api/v1/admin/config-snapshots/:id/restore` | 恢复快照 | CONFIG_EDIT |
| POST | `/api/v1/admin/config-snapshots/:id/activate` | 设为活跃 | CONFIG_EDIT |
| DELETE | `/api/v1/admin/config-snapshots/:id` | 删除快照 | CONFIG_EDIT |

**创建快照**：
```json
{
  "name": "上线前稳定配置",
  "configType": "system",
  "configData": {
    "alert_failure_rate_threshold": 5,
    "min_recharge_amount": 100,
    "default_balance_alert_threshold": 1000
  }
}
```

**恢复快照**：将快照中的 `configData` 批量写回 `system_configs`，并记录审计日志。

### 5.3 前端快照页面

```
admin → 运维 → 配置快照
├── 快照列表（卡片）
│   ├── 快照名称
│   ├── 配置类型
│   ├── 创建人
│   ├── 是否活跃（标记）
│   ├── 创建时间
│   └── 操作（查看/恢复/设活跃/删除）
│
└── 创建快照弹窗
    ├── 快照名称
    ├── 配置类型
    ├── 配置数据（自动获取当前全部配置，可按需编辑）
    └── 描述
```

**ConfigSnapshotCardProps**：
```typescript
interface ConfigSnapshotCardProps {
  id: number;
  name: string;
  description?: string;
  configType: string;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  onView: (id: number) => void;
  onRestore: (id: number) => Promise<void>;
  onActivate: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}
```

---

## 6. 配置变更审批

### 6.1 表结构

```typescript
export const configChangeRequests = pgTable("config_change_requests", {
  id: serial("id").primaryKey(),
  configKey: varchar("config_key", { length: 100 }),
  configType: varchar("config_type", { length: 50 }).notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changes: jsonb("changes").$type<Record<string, any>>(),       // 批量变更
  reason: text("reason"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  // pending | approved | rejected | cancelled
  requestedBy: integer("requested_by").references(() => users.id),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  reviewComment: text("review_comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

### 6.2 API

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/config-change-requests` | 变更请求列表 | CONFIG_VIEW |
| POST | `/api/v1/admin/config-change-requests` | 创建变更请求 | CONFIG_EDIT |
| PATCH | `/api/v1/admin/config-change-requests/:id/review` | 审批 | CONFIG_EDIT |
| PATCH | `/api/v1/admin/config-change-requests/:id/cancel` | 取消 | CONFIG_EDIT |

**创建变更请求**：
```json
{
  "configType": "system",
  "changes": { "alert_failure_rate_threshold": 10, "min_recharge_amount": 500 },
  "reason": "加强收费策略"
}
```

**审批**：
```json
// PATCH .../:id/review
{ "status": "approved", "reviewComment": "同意，请执行" }
// 审批通过 → 自动执行变更 → 记录 audit_logs + config_versions
```

### 6.3 审批流程

```
创建变更请求（operator）
  → status = pending
  → 通知审批人

审批人审查
  → approved:
    → 自动执行变更（批量更新 system_configs）
    → 记录 audit_logs
    → 记录 config_versions
    → status = approved
  → rejected:
    → status = rejected
    → 记录 reviewComment

请求人取消
  → status = cancelled
```

---

## 7. 配置导入导出

### 7.1 导出

**功能**：将当前全部 `system_configs` 导出为 JSON 文件

**API**：`GET /api/v1/admin/configs/export`

**响应**：JSON 文件下载
```json
{
  "exportedAt": "2026-07-28T10:00:00.000Z",
  "exportedBy": 1,
  "configs": {
    "site_name": "3Cloud AI",
    "site_logo_url": "...",
    "min_recharge_amount": 100,
    "login_failure_lockout": { "attempts": 5, "windowMinutes": 5, "lockMinutes": 15 }
  }
}
```

### 7.2 导入

**API**：`POST /api/v1/admin/configs/import`

**请求**：上传 JSON 文件上传或粘贴 JSON 文本

**导入流程**：
```
1. 解析 JSON 文件
2. 对每个配置键：
   a. 取新旧值 diff
   b. 写入 audit_logs（含 before/after）
   c. 写入 config_versions
   d. 更新 system_configs
3. 返回变更摘要（added/changed/unchanged/skipped）
```

**响应**：
```json
{
  "code": 0,
  "data": {
    "added": 2,
    "changed": 5,
    "unchanged": 12,
    "skipped": 1,
    "details": [
      { "key": "site_name", "action": "changed", "old": "OldName", "new": "3Cloud AI" }
    ]
  }
}
```

### 7.3 前端导入导出

```
admin → 运维 → 配置导入导出
├── 导出
│   ├── 导出格式（JSON）
│   └── 导出按钮（下载 JSON 文件）
│
└── 导入
    ├── 上传文件（JSON）
    ├── 导入预览（变更内容列表）
    └── 确认导入
```

---

## 8. 跨模块数据流

### 8.1 配置变更链路

```
管理员更新配置
  → PATCH /api/v1/admin/configs/:key
  → 写入 audit_logs (before/after)
  → 写入 config_versions (configKey/oldValue/newValue/changeReason)
  → 系统配置即时生效
  → 前端通过 React Query 重新拉取

批量导入
  → POST /api/v1/admin/configs/import
  → 逐个键更新 + 审计记录
  → 返回变更摘要

快照恢复
  → POST /api/v1/admin/config-snapshots/:id/restore
  → 批量写入 system_configs
  → 逐个键记录 audit_logs + config_versions
```

### 8.2 依赖模块

| 模块 | 路径 | 说明 |
|------|------|------|
| `system.ts` | `routes/admin/system.ts` | 系统配置 CRUD |
| `site-settings.ts` | `routes/admin/site-settings.ts` | 站点设置+图片上传 |
| `config-version/` | `services/config-version/` | 配置版本/快照/审批 |
| `system.ts` | `db/schema/system.ts` | system_configs + page_contents + email_templates |
| `config-versions.ts` | `db/schema/config-versions.ts` | config_versions + config_snapshots + config_change_requests |

### 8.3 关联文档

| 文档 | 关联内容 |
|------|---------|
| [PRD-README.md §4.8](../PRD-README.md#48-系统配置精化) | 系统配置总纲 |
| [ref-4.6-security.md §7](ref-4.6-security.md#7-安全配置中心) | 安全配置 + login_security_configs |
| [ref-4.5-marketing.md §4](ref-4.5-marketing.md#4-邮件模板) | email_templates 配置 |
| [ref-4.7-monitor-logs.md §6](ref-4.7-monitor-logs.md#6-异常操作告警) | operation_alert_rules 配置 |
| [ref-5.4-alert-rules.md](ref-5.4-alert-rules.md) | monitoring_rules 配置 |

### 8.4 关键约束

1. **配置值 JSON 序列化**：`system_configs.value` 存储 JSON 字符串，读写时序列化/反序列化
2. **site_ 前缀不可随意新增**：`SITE_KEYS` 白名单限制 `site-settings` 可写的键
3. **版本记录不可删除**：`config_versions` 只增不删，保证变更可追溯
4. **快照恢复不覆盖系统键**：只恢复用户自定义键，不修改系统内部标识
5. **导入预览必须展示变更**：导入前展示变更概览，用户确认后才执行
6. **变更审批通过后自动执行**：审批通过不依赖操作员二次确认

---

> **文档版本**：v1.0 — 2026-07-28
> **编写依据**：`api/src/db/schema/system.ts`、`api/src/db/schema/config-versions.ts`、`api/src/services/config-version/`、`api/src/routes/admin/system.ts`、`api/src/routes/admin/site-settings.ts`
> **下一步建议**：配置快照恢复前端组件、配置变更审批通知链路、配置导入导出前端联调
