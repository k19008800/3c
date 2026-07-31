# 功能说明书：§33 合规法务与成本分析

> **对应文档**：[`PRD-非功能需求.md`](PRD-非功能需求.md)
> **状态**：草案（仅需求文档）
> **优先级**：P1（隐私政策管理、服务条款版本管理）、P2（用户数据导出、供应商成本分析、合规报告、活动 ROI）

---


> **📖 页面功能说明帮助**
>
> **页面用途**：合规法务与成本分析 功能说明书。本文档详细定义了该模块各功能点的字段规格、校验规则、边界条件、交互方式和注意事项。
>
> **适用角色**：管理员（财务/法务）
>
> **核心操作**：
- 查看合规要求和审计报告
- 执行成本分析和优化建议
- 管理 SLA 和供应商合同
>
> **注意事项**：本 SPEC 文档面向开发者和测试人员，包含字段级定义和校验规则。页面标题旁的 `[]` 帮助气泡引用本文档内容，点击可查看当前页面功能说明。
>
> **关联组件**：页面标题右侧 `[]` 帮助按钮，悬停/点击弹出帮助弹窗。



## 33.0 总览

### 功能描述

平台运营到一定规模后，合规法务和成本分析成为刚需。本模块覆盖：隐私政策与服务条款管理、用户数据导出（GDPR 数据可携带权）、供应商成本分析、运营活动 ROI 分析、操作合规报告。

### 子模块清单

| 编号 | 模块 | 优先级 | 核心价值 |
|------|------|--------|---------|
| 33.1 | 隐私政策管理 | P1 | 隐私政策发布、版本管理、用户重新确认 |
| 33.2 | 服务条款版本管理 | P1 | 服务条款更新时用户重新确认 |
| 33.3 | 用户数据导出 | P2 | 用户可申请导出自己的全部数据 |
| 33.4 | 供应商成本分析 | P2 | 每个供应商的成本效率分析 |
| 33.5 | 运营活动 ROI 分析 | P1 | 每次活动的成本和收益核算 |

---

## 33.1 隐私政策管理

### 功能描述

管理平台隐私政策的版本更新。用户注册时同意当前版本，政策更新时通过弹窗要求用户重新确认，记录用户同意历史。

### 完成能力 / 展示效果

**管理后台 → 设置 → 隐私政策：**

```
隐私政策管理

  当前版本: v2.1 (2026-07-01)
  上次更新: 2026-07-01
  同意用户: 1,234 人（占活跃用户 92.3%）
  待同意用户: 103 人（占活跃用户 7.7%）

  ┌──────────────────────────────────────────────┐
  │  版本历史                                      │
  ├────────┬──────────┬────────┬────────┬─────────┤
  │ 版本   │ 发布日期  │ 同意数 │ 待同意 │ 操作     │
  ├────────┼──────────┼────────┼────────┼─────────┤
  │ v2.1   │ 2026-07-01│ 1234   │ 103    │ [查看]  │
  │ v2.0   │ 2026-01-01│ 2134   │ —      │ [查看]  │
  │ v1.0   │ 2025-06-01│ 1567   │ —      │ [查看]  │
  └────────┴──────────┴────────┴────────┴─────────┘

  [发布新版本] [编辑当前版本]
```

**发布新版本流程：**

```
1. 管理员编辑隐私政策内容（Markdown 编辑器）
2. 设置版本号（自动递增或手动输入）
3. 保存为草稿
4. 预览效果
5. 确认发布

发布后：
  ├── 新注册用户: 注册时同意最新版本
  └── 已注册用户:
      ├── 下次登录时弹出"隐私政策已更新，请重新确认"
      ├── 弹窗显示: 新版本变更摘要 + 完整内容链接
      └── 用户同意后记录同意时间到 user_privacy_consents 表
```

### 数据表结构

```typescript
// privacy_policy_versions — 隐私政策版本
export const privacyPolicyVersions = pgTable("privacy_policy_versions", {
  id: serial("id").primaryKey(),
  version: varchar("version", { length: 20 }).notNull(),  // v2.1
  title: varchar("title", { length: 200 }),
  content: text("content").notNull(),
  summary: text("summary"),  // 变更摘要
  status: varchar("status", { length: 20 }).default("published"), // draft / published
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// user_privacy_consents — 用户同意记录
export const userPrivacyConsents = pgTable("user_privacy_consents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  versionId: integer("version_id").notNull().references(() => privacyPolicyVersions.id),
  consentedAt: timestamp("consented_at").defaultNow(),
  ip: varchar("ip", { length: 45 }),
});
```

### API 接口

```
GET    /api/v1/admin/settings/privacy-policy/versions — 版本列表
POST   /api/v1/admin/settings/privacy-policy/versions — 创建版本
PUT    /api/v1/admin/settings/privacy-policy/versions/:id — 编辑
POST   /api/v1/admin/settings/privacy-policy/versions/:id/publish — 发布

// 用户端
GET    /api/v1/public/privacy-policy/current   — 当前版本（注册页展示）
POST   /api/v1/me/privacy-policy/consent       — 用户同意当前版本
GET    /api/v1/me/privacy-policy/status        — 用户是否需要重新确认
```

### 验收标准

#### □ 流程图一致性校验 — 与对应流程图对比验证流程分支、异常处理、决策节点完全一致

1. 管理员发布新隐私政策 → 用户下次登录时弹出确认弹窗
2. 用户确认 → 记录到 consent 表
3. 未同意的用户无法使用平台（功能受限）
4. 版本历史可追溯

---

## 33.2 服务条款版本管理

隐私政策相同逻辑，复用同一套机制。条款内容独立存储，用户同意记录独立。

### 数据表结构

```typescript
// terms_of_service_versions — 服务条款版本（结构同 privacy_policy_versions）
export const termsOfServiceVersions = pgTable("terms_of_service_versions", {
  id: serial("id").primaryKey(),
  version: varchar("version", { length: 20 }).notNull(),
  content: text("content").notNull(),
  summary: text("summary"),
  status: varchar("status", { length: 20 }).default("published"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// user_tos_consents — 用户同意记录
export const userTosConsents = pgTable("user_tos_consents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  versionId: integer("version_id").notNull().references(() => termsOfServiceVersions.id),
  consentedAt: timestamp("consented_at").defaultNow(),
  ip: varchar("ip", { length: 45 }),
});
```

### API 接口

```
GET    /api/v1/admin/settings/terms-of-service/versions
POST   /api/v1/admin/settings/terms-of-service/versions
PUT    /api/v1/admin/settings/terms-of-service/versions/:id
POST   /api/v1/admin/settings/terms-of-service/versions/:id/publish
```

### 验收标准

同隐私政策。

---

## 33.3 用户数据导出（P2）

### 功能描述

用户可申请导出自己在平台上的全部数据，满足 GDPR 数据可携带权要求。管理员可审核导出请求。

### 完成能力 / 展示效果

**用户端：**

```
我的数据导出

  可导出的数据:
  ☑ 个人资料（邮箱/手机/注册时间等）
  ☑ API Key 列表
  ☑ 调用日志（最近 90 天）
  ☑ 充值记录
  ☑ 交易记录
  ☑ 发票记录

  时间范围: [全部 ▼]

  [申请导出]

  导出后数据将以 ZIP 格式发送到您的注册邮箱
  处理时间: 24 小时内
```

**管理员端：**

```
数据导出请求
  用户: 张三  申请时间: 2026-07-28 14:00  状态: [待处理]

  点击"处理" → 后台生成导出文件 → 发送到用户邮箱
```

### API 接口

```
// 用户端
POST /api/v1/me/data-export/request       — 申请导出
GET  /api/v1/me/data-export/requests      — 导出请求记录

// 管理后台
GET  /api/v1/admin/data-export/requests   — 导出请求列表
POST /api/v1/admin/data-export/:id/process — 处理导出
```

### ZIP 内容结构

```
export-{userId}-{requestId}.zip
├── personal-info.json           # 个人资料（邮箱/手机/注册时间/实名信息等）
├── api-keys.json                # API Key 列表（不含完整 Key 值，显示前缀）
├── call-logs.json               # 调用日志（最近 90 天，按日聚合）
├── recharge-records.json        # 充值记录
├── transactions.json            # 交易记录（含消费/退款/转账）
├── invoices.json                # 发票记录
├── security-events.json         # 安全事件记录
├── notification-preferences.json # 通知偏好
├── login-history.json           # 登录历史
├── README.txt                   # 数据结构说明 + 联系客服方式
```

**数据格式**：所有 JSON 文件使用 `utf-8` 编码，每行一个 JSON 对象（JSON Lines 格式），方便程序逐行处理。

**数据范围**：
- 时间范围：默认导出用户全量数据（不受 90 天调用日志查询限制）
- 数据时效：以管理员处理请求的时间点为基准，导出该时刻的存量数据
- 不包含：其他用户信息、系统配置、管理员操作记录

### 大文件与异常处理

| 场景 | 处理方式 |
|------|---------|
| 调用日志超过 10 万条 | 按日分片生成多个 `call-logs-{date}.json` 文件 |
| ZIP 文件超过 50MB | 自动分卷为多个 ZIP（`part1.zip`、`part2.zip`），逐个发送 |
| 导出任务执行超时 | 队列后台任务，最长执行时间 30 分钟；超时后标记失败并通知管理员 |
| 生成过程中数据变更 | 以请求时的数据库快照为准，导出说明中标注导出时间点 |
| 文件下载链接过期 | 下载链接有效期 7 天，过期后可重新申请 |
| 邮件发送失败 | 管理员端显示"邮件发送失败"状态，支持手动重发链接 |

### 处理流程

```
用户申请导出
  → 写入 data_export_requests 表（status=pending）
  → 管理员收到通知
  → 管理员审核 → 点击"处理"
    ├── status=approved: 后台异步任务开始生成 ZIP
    │     ├── 查询用户数据 → 组装 JSON 文件 → 打包 ZIP
    │     ├── 上传至 OSS 临时存储（TTL 7 天）
    │     └── 发送邮件通知（含下载链接）
    │     → 更新 status=completed
    └── status=rejected: 发送拒绝通知邮件
```

### 数据表扩展

```typescript
// data_export_requests
export const dataExportRequests = pgTable("data_export_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  // pending | approved | processing | completed | failed | rejected
  processedBy: integer("processed_by").references(() => users.id),
  processedAt: timestamp("processed_at"),
  fileUrl: text("file_url"),                // OSS 下载链接
  fileExpiresAt: timestamp("file_expires_at"), // 链接过期时间
  fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
  errorMessage: text("error_message"),
  rejectReason: text("reject_reason"),
});
```

### 管理后台处理页面增强

```
数据导出请求
  ┌────┬────────┬────────────┬──────────┬────────┬──────────────────────┐
  │ #  │ 用户    │ 申请时间    │ 状态     │ 文件   │ 操作                 │
  ├────┼────────┼────────────┼──────────┼────────┼──────────────────────┤
  │ 1  │ 张三    │ 07-28 14:00│ ✅ 已完成  │ 1.2MB  │ [重新发送链接] [删除] │
  │ 2  │ 李四    │ 07-29 09:30│ ⏳ 生成中  │ —      │ [取消]                │
  │ 3  │ 王五    │ 07-29 16:00│ ⏸ 待处理  │ —      │ [处理] [拒绝]         │
  │ 4  │ 赵六    │ 07-28 20:00│ ❌ 失败    │ —      │ [重新处理] [通知用户]  │
  └────┴────────┴────────────┴──────────┴────────┴──────────────────────┘
```

### 验收标准

1. 用户申请导出 → 管理员审核 → 生成 ZIP → 发送到用户邮箱
2. ZIP 包含用户的所有数据（JSON Lines 格式）
3. 导出请求 24 小时内完成
4. 超过 10 万条记录时自动分片
5. ZIP 超过 50MB 时自动分卷
6. 下载链接 7 天有效期，过期可重新申请
7. 生成失败时管理员可重新处理
8. 生成状态实时更新（待处理/生成中/已完成/失败）
9. 管理员可拒绝导出并填写拒绝原因

---

## 33.4 供应商成本分析（P2）

### 功能描述

分析每个供应商的成本结构、成本效率，为供应商管理和定价决策提供数据支持。

### 完成能力 / 展示效果

```
供应商成本分析 — 2026 年 7 月

  ┌──────────┬──────────┬────────┬────────┬────────┬────────┐
  │ 供应商   │ 调用量   │ 成本    │ 营收    │ 毛利率 │ 每元产出 │
  ├──────────┼──────────┼────────┼────────┼────────┼────────┤
  │ DeepSeek │ 8.2M     │ ¥4,200 │ ¥12,500│ 66.4%  │ ¥2.98  │
  │ Qwen     │ 5.1M     │ ¥3,800 │ ¥8,200 │ 53.7%  │ ¥2.16  │
  │ GLM      │ 2.3M     │ ¥2,100 │ ¥3,800 │ 44.7%  │ ¥1.81  │
  │ OpenAI   │ 1.8M     │ ¥5,500 │ ¥6,200 │ 11.3%  │ ¥1.13  │
  └──────────┴──────────┴────────┴────────┴────────┴────────┘

  成本趋势（近 12 月）
  [折线图: 各供应商月成本趋势]

  供应商成本占比: DeepSeek 27% / Qwen 24% / GLM 13% / OpenAI 36%
```

### API 接口

```
GET /api/v1/admin/finance/vendor-cost-analysis
  period=month&date=2026-07
  → { vendors: [{ name, callVolume, cost, revenue, margin, costEfficiency }], trends, costShare }
```

### 验收标准

1. 供应商成本分析展示各供应商的成本/营收/毛利率
2. 成本趋势折线图显示近 12 个月变化
3. 成本占比饼图展示各供应商的成本占比

---

## 33.5 运营活动 ROI 分析（P1）

### 功能描述

每个运营活动（充值返现/消费折扣/邀请奖励）的成本和效果核算，评估活动 ROI。

### 完成能力 / 展示效果

```
活动 ROI 分析 — 2026 年 7 月

  ┌──────────┬────────┬────────┬────────┬────────┬────────┐
  │ 活动名称 │ 活动成本│ 增量营收│ 净收益  │ ROI    │ 状态  │
  ├──────────┼────────┼────────┼────────┼────────┼────────┤
  │ 618 充值返现│ ¥12,500│ ¥45,000 │¥32,500 │ 260%   │ 已结束 │
  │ 新用户优惠 │ ¥8,000 │ ¥18,000 │¥10,000 │ 125%   │ 进行中 │
  │ 邀请奖励  │ ¥3,200 │ ¥8,500  │¥5,300  │ 166%   │ 进行中 │
  │ 夏季折扣  │ ¥6,000 │ ¥12,000 │¥6,000  │ 100%   │ 已结束 │
  └──────────┴────────┴────────┴────────┴────────┴────────┘
```

### 计算逻辑

```
活动成本: 活动期间发放的奖励金额 + 折扣减免金额 + 营销推广费用
增量营收: 活动期间新增用户带来的消费 + 现有用户增量消费
  ├── 新增用户消费 = 活动期间注册用户在活动期间的消费总额
  └── 增量消费 = (活动期间日均消费 - 活动前日均消费) × 活动天数
净收益: 增量营收 - 活动成本
ROI: (净收益 / 活动成本) × 100%
```

### API 接口

```
GET /api/v1/admin/campaigns/:id/roi     — 单个活动 ROI
GET /api/v1/admin/campaigns/roi-summary — ROI 汇总
```

### 验收标准

1. 活动 ROI 分析展示各活动的成本/增量营收/ROI
2. ROI 计算基于活动前后的消费数据对比
3. 支持查看单个活动的详细 ROI 计算过程


---

### [] 页面帮助

**页面名称**：功能说明书：§33 合规法务与成本分析

**适用角色**：视具体功能而定（参见总览中的优先级和适用角色说明）

**功能定位**：该页面提供 功能说明书：§33 合规法务与成本分析 相关的配置、查询和管理能力。

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

### [] 按钮级帮助对照表

| 按钮/操作 | 帮助说明 |
|----------|---------|
| 创建/新增 | 添加一条新记录 |
| 编辑 | 修改已有记录的字段内容 |
| 删除 | 删除选中的记录（不可恢复，需确认） |
| 搜索 | 按关键词搜索匹配的记录 |
| 筛选 | 按选中条件过滤列表 |
| 导出 CSV | 将当前列表数据导出为 CSV 文件 |
| 查看详情 | 查看选中记录的完整信息 |

---

## 边界条件（补充自 boundary-supplement.md §16）

### 模块概述

合规法务与成本分析模块涵盖隐私政策管理、服务条款版本管理、用户数据导出（GDPR）、供应商成本分析、运营活动 ROI 分析。

### 边界条件清单

| # | 场景 | 触发条件 | 预期行为 | 影响范围 | 优先级 |
|---|------|---------|---------|---------|--------|
| COMP-001 | 数据导出大文件处理 | 用户请求导出账号数据，导出数据量超过 100 MB | 采用异步导出机制：创建导出任务 → 后台打包 → 完成后发送下载链接（有效期 7 天）；大文件分片压缩，支持断点续传下载 | 数据导出 | P0 |
| COMP-002 | 成本分析数据延迟 | 供应商成本数据延迟到达（如 T+2 日仍未到账） | 成本分析页面显示"部分数据待更新"标记；延迟数据到达后自动刷新分析结果；未到账的数据在图表中用虚线标记为"预估" | 成本分析 | P1 |
| COMP-003 | GDPR 数据删除请求过期处理 | 用户提交的 GDPR 数据删除请求在规定的 30 天窗口内未完成处理 | 标记请求为 `OVERDUE`，自动升级通知到法务负责人和系统管理员；请求过期不影响删除义务的履行，延期处理仍须完成 | GDPR 请求 | P0 |
| COMP-004 | 活动 ROI 计算异常 | 运营活动 ROI 计算时，某个数据源（如投放成本、转化收入）不可用 | 使用已有数据计算部分 ROI，不可用的数据标记为"待补充"；ROI 报告显示"数据完整度"百分比；数据完整度 < 60% 时 ROI 报告标注为"低置信度" | ROI 分析 | P1 |
| COMP-005 | 隐私政策版本回滚 | 隐私政策发版后需紧急回滚到上一版本 | 版本管理支持一键回滚，回滚后当前版本标记为 `REVOKED`；用户重新看到回滚后的版本，系统引导用户重新确认 | 隐私政策 | P0 |
| COMP-006 | 服务条款批量确认超时 | 服务条款更新后，大量用户同时确认新协议导致系统压力 | 确认操作为异步低负载写入；系统设置用户"最后操作期限"，期限内未确认的逐步限制功能（先限制新 API 创建，再限制 API 调用） | 服务条款 | P1 |
| COMP-007 | 供应商成本多维度聚合异常 | 供应商成本按多维度（模型、时间、区域）聚合时出现数据不一致 | 使用 OLAP 预聚合（物化视图）保证各维度聚合结果一致性；发现不一致时刷新物化视图；告警记录不一致的范围和差值 | 成本分析 | P2 |
| COMP-008 | 合规数据归档冲突 | 合规数据在归档过程中被新的操作访问 | 归档前检查是否有未完成的事务；归档中的数据标记为 `ARCHIVING` 状态，新操作自动跳过；归档完成后更新访问权限 | 数据归档 | P2 |

### 详细说明

#### COMP-001: GDPR 数据删除请求过期

**处理流程**:
1. 用户提交 GDPR 数据删除请求 → 状态 `PENDING`，设置最终期限（30 天）
2. 到期前 7 天（D+23）：发送提醒通知给法务团队
3. 到期前 3 天（D+27）：升级通知到法务负责人
4. 到期日（D+30）：标记 `OVERDUE`，升级到法务总监和 CISO
5. 过期后仍须尽快处理，处理完成后更新状态为 `COMPLETED_OVERDUE`
6. 监管报告需说明所有过期请求的原因

#### COMP-002: 大文件导出处理

**技术实现**:
- 导出任务创建后立即返回 `task_id`
- 后台异步执行数据收集、格式转换、压缩打包
- 文件大小 > 100MB 自动分片（每片 50MB）
- 下载链接使用预签名 URL（临时 Token，有效期 7 天）
- 支持断点续传（HTTP Range 头）

### 异常流程汇总

| 场景 | 恢复策略 | 是否通知 |
|------|---------|---------|
| 大文件导出 | 异步分片 + 预签名 | 任务完成通知 |
| 成本分析数据延迟 | 部分数据标记 + 自动刷新 | P2 运维通知 |
| GDPR 请求过期 | 升级通知 + 延期处理 | P0 法务通知 |
| ROI 计算异常 | 部分结果 + 低置信度标记 | 仅报告标记 |
| 隐私政策回滚 | 版本回滚 + 重新确认 | 用户重新确认 |
| 条款确认超时 | 逐步限制功能 | 用户通知 |
