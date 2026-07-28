# 运营数据日报/周报自动推送 — 深化参考文档

> **对应章节**：[PRD-README.md §4.9 报告与测试](../PRD-README.md#49-报告与测试精化) — 深化模块
> **状态**：新功能。在已有自定义报表引擎基础上新增定时推送能力。
> **定位**：运营数据日报/周报定时生成 PDF 并通过邮件/站内信自动推送给指定人员，减少人工拉数据成本。
> **粒度**：数据模型 → 报告模板 → 定时调度 → API → 组件 Props

---

## 目录

1. [数据表结构](#1-数据表结构)
2. [报告模板](#2-报告模板)
3. [推送配置](#3-推送配置)
4. [报告生成引擎](#4-报告生成引擎)
5. [报告查看与回溯](#5-报告查看与回溯)
6. [API 接口规格](#6-api-接口规格)
7. [前端组件 Props](#7-前端组件-props)

---

## 1. 数据表结构

### 1.1 `report_schedules` — 报告定时调度

```typescript
export const reportSchedules = pgTable("report_schedules", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  type: varchar("type", { length: 16 }).notNull(), // daily | weekly | monthly | custom
  templateId: integer("template_id").notNull().references(() => reportTemplates.id),
  
  // 调度配置
  cronExpression: varchar("cron_expression", { length: 64 }),
  // daily: "0 9 * * *" (每天9点)
  // weekly: "0 9 * * MON" (每周一9点)  
  // monthly: "0 9 1 * *" (每月1号9点)
  timezone: varchar("timezone", { length: 32 }).default("Asia/Shanghai"),
  
  // 数据范围配置
  dataConfig: jsonb("data_config").$type<ReportDataConfig>().notNull(),
  
  // 推送配置
  recipients: jsonb("recipients").$type<Recipient[]>(),      // 收件人列表
  pushChannels: jsonb("push_channels").$type<string[]>(),   // email | site_notification
  pushMessage: varchar("push_message", { length: 256 }),    // 推送消息模板
  
  // 状态
  isEnabled: boolean("is_enabled").notNull().default(true),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastReportId: integer("last_report_id").references(() => reportHistory.id),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

interface ReportDataConfig {
  timeRange: "yesterday" | "last_7_days" | "last_30_days" | "this_month" | "last_month";
  sections: string[];    // ["kpi_summary", "user_growth", "revenue", "agent_performance", "ticket_stats", "alert_summary"]
  includeCharts?: boolean;
  compareLastPeriod?: boolean; // 环比对比
}
```

### 1.2 `report_templates` — 报告模板

```typescript
export const reportTemplates = pgTable("report_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  description: varchar("description", { length: 512 }),
  type: varchar("type", { length: 16 }).notNull(), // system | custom
  content: jsonb("content").$type<ReportTemplateContent>().notNull(),
  thumbnail: varchar("thumbnail", { length: 512 }), // 缩略图URL
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

interface ReportTemplateContent {
  title: string;                     // "3cloud 运营日报 {date}"
  header: {
    logo?: string;
    subtitle?: string;
  };
  sections: TemplateSection[];
  footer: {
    text: string;                    // "本报告由 3cloud 运营平台自动生成"
    generationTime: boolean;
  };
  styling: {
    primaryColor: string;            // "#3B82F6"
    fontFamily: string;
    pageSize: "A4" | "LETTER";
    orientation: "portrait" | "landscape";
  };
}

interface TemplateSection {
  id: string;                        // "kpi_summary"
  title: string;                     // "核心指标概览"
  type: "kpi_cards" | "chart" | "table" | "text";
  order: number;
  config: Record<string, any>;       // 图表配置/列定义等
}
```

### 1.3 `report_history` — 报告生成历史

```typescript
export const reportHistory = pgTable("report_history", {
  id: serial("id").primaryKey(),
  scheduleId: integer("schedule_id").references(() => reportSchedules.id),
  templateId: integer("template_id").notNull().references(() => reportTemplates.id),
  title: varchar("title", { length: 256 }).notNull(),
  type: varchar("type", { length: 16 }).notNull(),
  
  // 报告数据
  dataRange: jsonb("data_range").$type<{ from: string; to: string }>(),
  dataSnapshot: jsonb("data_snapshot").$type<ReportData>(),  // 生成时的完整数据快照
  fileUrl: varchar("file_url", { length: 1024 }),             // PDF文件URL
  fileSize: integer("file_size"),                              // 字节
  
  // 状态
  status: varchar("status", { length: 16 }).notNull().default("generating"), // generating | completed | failed
  errorMessage: text("error_message"),
  generationDurationMs: integer("generation_duration_ms"),
  
  // 推送状态
  pushStatus: jsonb("push_status").$type<PushStatus[]>(),     // 各推送渠道结果
  readBy: jsonb("read_by").$type<number[]>(),                  // 已读用户ID列表
  
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
});

interface PushStatus {
  channel: string;        // email | site_notification
  recipientId: number;
  status: "pending" | "sent" | "failed";
  sentAt?: string;
  errorMessage?: string;
}
```

---

## 2. 报告模板

### 2.1 系统预置模板

**日报模板（daily_report）**：

| 章节 | 类型 | 内容 |
|------|------|------|
| 核心指标概览 | kpi_cards | DAU/日调用量/日营收/新增用户/失败率/平均延迟 |
| 营收趋势 | chart | 近7天每日营收柱状图 + 环比 |
| 用户增长 | chart | 近7天每日新增用户折线图 |
| 模型调用分布 | table | Top 10 模型：调用量/Token消耗/费用 |
| 告警汇总 | text | 过去24h的告警事件列表和状态 |
| 待处理事项 | text | 待处理工单数/待审核提现/待审核实名 |

**周报模板（weekly_report）**：

| 章节 | 类型 | 内容 |
|------|------|------|
| 核心指标趋势 | kpi_cards | 周维度 DAU/调用量/营收/新增/留存/毛利率 |
| 营收与成本分析 | chart | 本周每日营收+成本双轴图 |
| 用户生命周期 | chart | 新注册/活跃/沉睡/流失分布饼图 |
| 模型消费 Top 10 | table | 本周各模型消费排行 |
| 代理商业绩 | table | Top 10 代理：客户数/业绩/佣金 |
| 工单效率 | chart | 工单创建vs解决/平均响应时间/SLA达标率 |
| 安全事件 | text | 本周安全事件汇总+风险趋势 |
| 下周预测 | text | 基于历史数据的下周营收/调用量预估 |

**月报模板（monthly_report）**：

| 章节 | 类型 | 内容 |
|------|------|------|
| 月度核心指标 | kpi_cards | MRR/月调用量/毛利率/7日留存/ARPUS |
| 月度营收趋势 | chart | 每日营收折线图+月累计 |
| 供应商健康 | chart | 各供应商可用率/响应延迟/调用占比 |
| 代理月度业绩 | table | 月度代理业绩排名 |
| 用户分层变化 | chart | 用户分层占比变化（与上月对比） |
| 月度财务摘要 | text | 充值总额/退款总额/毛利/对账差异 |

### 2.2 自定义模板

运营人员可从系统模板复制后自定义，操作：

```
① 选择"基于系统模板创建"或"从零创建"
② 拖拽章节目录排序
③ 每个章节单独配置数据范围、图表类型、展示方式
④ 配置页眉页脚风格（色系/Logo）
⑤ 预览 → 保存模板
```

---

## 3. 推送配置

### 3.1 收件人管理

| 维度 | 说明 |
|------|------|
| 按角色 | 如"所有 admin + finance 角色" |
| 按用户 | 手动选择指定用户 |
| 按邮箱 | 手动输入外部邮箱（非平台用户也可接收） |
| 按分群 | 选择已有分群（关联 user_segments） |

### 3.2 推送渠道

| 渠道 | 说明 | 前提条件 | 内容丰富度 |
|------|------|---------|-----------|
| 站内通知 | 平台内消息推送 | 收件人是平台用户 | 摘要+链接（点击进入报告详情页） |
| 邮件 | SMTP发送 | 已配置邮件服务 | 摘要+PDF附件+在线查看链接 |
| 企业微信 | 企业微信机器人 | 已配置Webhook | 摘要+报告链接 |
| Webhook | 自定义回调 | 配置接收URL | JSON格式报告数据 |

### 3.3 推送时间

| 报告类型 | 建议推送时间 | 数据截止点 |
|---------|------------|----------|
| 日报 | 每日 09:00 | 昨日 23:59:59 |
| 周报 | 每周一 09:00 | 上周日 23:59:59 |
| 月报 | 每月 1 日 09:00 | 上月末 23:59:59 |

---

## 4. 报告生成引擎

### 4.1 生成流程

```
① Cron 触发器 → schedule 到达执行时间
② 创建 report_history 记录 (status=generating)
③ 根据 dataConfig 查询各数据源
④ 将数据填充到模板各章节
⑤ 调用 PDF 生成服务（puppeteer HTML→PDF 或 pdfkit）
⑥ 上传 PDF 到文件存储 → 更新 fileUrl
⑦ 更新 status=completed
⑧ 触发推送：按 pushChannels × recipients 发送
⑨ 记录 pushStatus
⑩ 轮询：检测 readBy，汇总阅读率
```

### 4.2 PDF 生成参数

| 参数 | 日报 | 周报 | 月报 |
|------|------|------|------|
| 页面大小 | A4 | A4 | A4 |
| 方向 | 纵向 | 纵向 | 横向 |
| 预计页数 | 3-5 页 | 5-8 页 | 8-12 页 |
| 图表渲染 | SVG/Canvas→PNG | 同 | 同 |
| 文件大小 | < 2MB | < 3MB | < 5MB |

### 4.3 异常处理

| 场景 | 处理 |
|------|------|
| 数据源查询失败 | 对应章节显示"数据获取失败"，不影响其他章节生成 |
| PDF 生成失败 | status=failed + errorMessage，重试 3 次 |
| 邮件发送失败 | pushStatus 标记 failed，不重试（避免重复发送） |
| 全部失败 | 记录 error，通知 super_admin |

---

## 5. 报告查看与回溯

### 5.1 报告列表页

**路径**：`/admin/reports/schedules`

展示所有定时调度+最近一次报告状态。

### 5.2 报告详情页

**路径**：`/admin/reports/:id`

- 内嵌 PDF 预览（iframe 或 PDF.js）
- 下方展示数据快照摘要（关键指标当时值）
- 显示推送结果：每个收件人的发送状态和阅读状态
- "重新生成"按钮：手动触发补充生成
- "分享"按钮：复制在线查看链接

### 5.3 报告对比

选择两个报告进行对比（如本周 vs 上周周报）：

```
┌─ 报告对比 ───────────────────────────────────┐
│ 2026-W30 周报  vs  2026-W29 周报            │
│                                               │
│ DAU:      1,234  vs  1,102  (+12.0%)         │
│ 周营收:   ¥89,450  vs  ¥78,200  (+14.4%)     │
│ 新增用户:   345  vs    289  (+19.4%)          │
│ 毛利率:   32.5%  vs  31.2%  (+1.3pp)         │
│ 工单解决:  89%   vs   92%   (-3pp)           │
└───────────────────────────────────────────────┘
```

---

## 6. API 接口规格

### 6.1 定时调度管理

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/report-schedules` | 调度列表 | USER_VIEW |
| POST | `/api/v1/admin/report-schedules` | 创建调度 | USER_EDIT |
| GET | `/api/v1/admin/report-schedules/:id` | 调度详情 | USER_VIEW |
| PATCH | `/api/v1/admin/report-schedules/:id` | 编辑调度 | USER_EDIT |
| DELETE | `/api/v1/admin/report-schedules/:id` | 删除调度 | USER_EDIT |
| PATCH | `/api/v1/admin/report-schedules/:id/toggle` | 启用/停用 | USER_EDIT |
| POST | `/api/v1/admin/report-schedules/:id/run` | 手动触发 | USER_EDIT |

### 6.2 模板管理

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/report-templates` | 模板列表 | USER_VIEW |
| POST | `/api/v1/admin/report-templates` | 创建模板 | USER_EDIT |
| GET | `/api/v1/admin/report-templates/:id` | 模板详情 | USER_VIEW |
| PATCH | `/api/v1/admin/report-templates/:id` | 编辑模板 | USER_EDIT |
| DELETE | `/api/v1/admin/report-templates/:id` | 删除模板 | USER_EDIT |
| POST | `/api/v1/admin/report-templates/:id/preview` | 预览模板 | USER_VIEW |
| POST | `/api/v1/admin/report-templates/:id/clone` | 复制模板 | USER_EDIT |

### 6.3 报告历史

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/report-history` | 历史列表 | USER_VIEW |
| GET | `/api/v1/admin/report-history/:id` | 报告详情 | USER_VIEW |
| GET | `/api/v1/admin/report-history/:id/download` | 下载 PDF | USER_VIEW |
| GET | `/api/v1/admin/report-history/compare` | 对比两份报告 | USER_VIEW |
| PATCH | `/api/v1/admin/report-history/:id/mark-read` | 标记已读 | user |

### 6.4 用户端

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/me/reports` | 推送给我的报告列表 | user |
| GET | `/api/v1/me/reports/:id` | 查看报告 | user |

---

## 7. 前端组件 Props

### 7.1 ReportScheduleList — 调度列表

```typescript
interface ReportScheduleListProps {
  // 无外部props，页面级组件
}

interface ReportScheduleItem {
  id: number;
  name: string;
  type: "daily" | "weekly" | "monthly" | "custom";
  templateName: string;
  isEnabled: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  lastReportStatus: "completed" | "failed" | null;
  recipientCount: number;
}
```

### 7.2 ReportEditor — 调度编辑

```typescript
interface ReportEditorProps {
  mode: "create" | "edit";
  scheduleId?: number;
  onSave: () => void;
}

interface ReportFormData {
  name: string;
  type: "daily" | "weekly" | "monthly" | "custom";
  templateId: number;
  cronExpression?: string;
  dataConfig: ReportDataConfig;
  recipients: Recipient[];
  pushChannels: string[];
  pushMessage?: string;
}
```

### 7.3 ReportViewer — 报告查看（内嵌PDF）

```typescript
interface ReportViewerProps {
  reportId: number;
  showDownload?: boolean;
  showShare?: boolean;
}

interface ReportViewerState {
  report: ReportHistoryItem;
  loading: boolean;
  pdfUrl: string | null;
  pushResults: PushStatus[];
  readReceipts: { userId: number; nickname: string; readAt: string }[];
}
```

### 7.4 ReportCompare — 报告对比

```typescript
interface ReportCompareProps {
  reportIdA: number;
  reportIdB: number;
}

interface CompareResult {
  sections: {
    name: string;
    metrics: { label: string; valueA: number | string; valueB: number | string; change: string; changePositive: boolean }[];
  }[];
}
```

---

## 交叉引用

| 关联模块 | 文档 | 关系 |
|---------|------|------|
| 运营 KPI | ref-1-operational-summary.md | 报告数据源复用 KPI 指标 |
| 自定义报表 | ref-4.9-report-testing.md | 报告模板可与自定义报表共享数据 |
| 用户分群 | ref-4.10-user-segmentation.md | 按分群指定收件人 |
| 工单系统 | ref-4.11-ticketing.md | 日报含工单摘要 |
| 通知系统 | PRD-README.md §2.2 | 站内信推送报告通知 |
| 邮件模板 | ref-4.5-marketing.md | 报告推送邮件样式复用 |
