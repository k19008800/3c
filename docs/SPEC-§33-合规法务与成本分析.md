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
> **注意事项**：本 SPEC 文档面向开发者和测试人员，包含字段级定义和校验规则。页面标题旁的 `[?]` 帮助气泡引用本文档内容，点击可查看当前页面功能说明。
>
> **关联组件**：页面标题右侧 `[?]` 帮助按钮，悬停/点击弹出帮助弹窗。



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

### 验收标准

1. 用户申请导出 → 管理员审核 → 生成 ZIP → 发送到用户邮箱
2. ZIP 包含用户的所有数据（JSON 格式）
3. 导出请求 24 小时内完成

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
  ?period=month&date=2026-07
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

### [?] 页面帮助

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
