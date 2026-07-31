# SPEC: §5.5 — Model Price Change Notifications

> **📖 页面功能说明帮助**
>
> **页面用途**：模型价格变更通知 功能说明书。本文档详细定义了该模块各功能点的字段规格、校验规则、边界条件、交互方式和注意事项。
>
> **适用角色**：管理员（财务/运营）
>
> **核心操作**：
- 管理模型价格调整通知流程
- 查看价格变更历史和影响分析
- 配置自动价格变更通知规则
>
> **注意事项**：本 SPEC 文档面向开发者和测试人员，包含字段级定义和校验规则。页面标题旁的 `[?]` 帮助气泡引用本文档内容，点击可查看当前页面功能说明。
>
> **关联组件**：页面标题右侧 `[?]` 帮助按钮，悬停/点击弹出帮助弹窗。




> **Parent**: [`PRD-§5.5-模型价格变更通知.md`](PRD-§5.5-模型价格变更通知.md)
> **Core Engine**: Price change → impact scoring → user notification
> **Priority**: P1

---

## 5.5 Model Price Change Notifications

### 5.5.0 Overview

When upstream suppliers change prices or platform administrators adjust selling prices, the system automatically evaluates which users need to know, calculates business impact per user, and delivers tiered notifications.

**Three-tier notification strategy:**

| Tier | Label | Latency | Channel | Criteria |
|------|-------|---------|---------|----------|
| 🔴 A | Critical | Immediate | In-app + Email | Impact score > 8 OR highly substitutable + big change |
| 🟡 B | Reference | Weekly summary | In-app only | Impact score 3-8 OR any user-used model changing >20% |
| 🟢 C | Noise | Never (log only) | None | Impact score < 3 OR unused/silent users |

**Core formula:**

```
Impact Score = |changeRate| × userModelCostShare × substitutabilityCoefficient

changeRate:               relative change between old and new price (+30%, -15%)
userModelCostShare:       this model's share in user's total spend (last 30d)
substitutabilityCoefficient:  0.3 (unreplaceable) ~ 2.0 (commoditized)
```

---

### 5.5.1 Price Change Logging

#### Description

Every price change (cost price or sale price) made through the pricing engine automatically records a change log entry. Manual price edits by administrators also produce logs.

#### Trigger Points

| Trigger | Source | Action |
|---------|--------|--------|
| Vendor cost price update | `vendor-sync` / manual admin edit | Write cost price change log |
| Platform sale price update | Admin price page (`routes/admin/prices.ts`) | Write sale price change log |
| Bulk import / price rule change | DB migration / system config | Batch write change logs |
| Activity price starts/ends | Campaign engine | Write temporary price change log |

#### Database Schema

```sql
CREATE TABLE price_change_logs (
  id              SERIAL PRIMARY KEY,
  model_id        INT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  vendor_id       INT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  old_cost_price  DECIMAL(12,6),
  new_cost_price  DECIMAL(12,6),
  old_sale_price  DECIMAL(12,6),
  new_sale_price  DECIMAL(12,6),
  change_rate     DECIMAL(5,2) NOT NULL,        -- signed percentage (e.g. 30.00, -15.50)
  effective_at    TIMESTAMPTZ NOT NULL,          -- when the new price takes effect
  reason          VARCHAR(500),                  -- "upstream price change", "platform adjustment", "campaign ended"
  operator_id     INT REFERENCES users(id),      -- admin manual edit
  dispatched      BOOLEAN NOT NULL DEFAULT FALSE, -- whether notification dispatch has run
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_price_change_model_effective ON price_change_logs(model_id, effective_at DESC);
CREATE INDEX idx_price_change_undispatched ON price_change_logs(effective_at, dispatched)
  WHERE dispatched = FALSE AND effective_at <= NOW();
```

#### API: Price Change Log CRUD

**Admin endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/admin/price-changes` | Paginated list (model, vendor, rate, status, coverage) |
| GET | `/api/v1/admin/price-changes/:id` | Single change detail + per-user notification status |
| GET | `/api/v1/admin/price-changes/stats` | Dashboard: today's changes, pending dispatch count, user coverage |
| POST | `/api/v1/admin/price-changes/:id/notify` | Manually re-trigger notification dispatch for this change |

**User endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/me/price-changes` | Price changes relevant to current user (paginated) |
| GET | `/api/me/price-changes/:modelId` | Full price history timeline for one model |

---

### 5.5.2 Substitutability Coefficient Engine

#### Description

Computes how easily a model can be replaced with alternatives of the same type. This prevents unnecessary notifications for irreplaceable models and prioritizes notifications for commoditized ones.

#### Auto-Calculation Rules

```
Base value by peer count:
  Same-type active models ≥ 8  → 1.5
  Same-type active models 5-7  → 1.2
  Same-type active models 2-4  → 1.0
  Same-type active models = 1  → 0.5

Adjustments (additive):
  User uses >2 models of this type             → +0.3
  Alternative exists with ≥30% lower price     → +0.3
  User has switched models in this type before  → +0.2
  User has never switched, using >3 months     → -0.2
```

"Same type" refers to `model_type` enum: `chat, embedding, image, audio, rerank, video, moderation, realtime`.

#### Input Data Sources

| Data | Source | Used For |
|------|--------|----------|
| Active models per type | `models` table (status = active) | Base value |
| User's model usage history | `call_logs` aggregated (last 90d) | Adjustment: user usage |
| User's model events | `operation_logs` (model switch events) | Adjustment: user switches |
| Vendor-model pricing | `vendor_models` table | Alternative price comparison |

#### API: Coefficient Override (Admin)

```typescript
PATCH /api/v1/admin/substitutability
Body: {
  modelId: number;
  manualCoefficient?: number | null; // null = use auto
  reason?: string;                   // required if manualCoefficient set
}
```

The override is stored in a new `model_substitutability` table:

```sql
CREATE TABLE model_substitutability (
  model_id           INT PRIMARY KEY REFERENCES models(id) ON DELETE CASCADE,
  auto_coefficient   DECIMAL(3,1) NOT NULL,
  manual_coefficient DECIMAL(3,1),         -- NULL when using auto
  manual_reason      VARCHAR(500),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### 5.5.3 Impact Score Calculator

#### Description

Computes per-user-per-change impact score. This is the core decision input for notification dispatch.

#### Algorithm

```typescript
interface ImpactScoreInput {
  changeRate: number;              // e.g. 0.30 for +30%
  userModelCostShare: number;      // 0.0 ~ 1.0
  substitutability: number;        // 0.3 ~ 2.0
}

function calculateImpactScore(input: ImpactScoreInput): number {
  return Math.abs(input.changeRate) * input.userModelCostShare * input.substitutability;
}

function determineTier(score: number, change: PriceChange, user: User): NotificationTier {
  // Override rules
  if (change.isFreeToPaid || change.isPaidToFree) return "A";
  
  // Tier by score
  if (score > 8) return "A";
  if (score >= 3) return "B";
  
  // Additional: any user-used model changing >20%
  if (user.hasUsedModelInLast30Days(change.modelId) && Math.abs(change.changeRate) > 0.20) return "B";
  
  return "C";
}
```

#### Evaluation Frequency

The dispatch job runs **every hour**, processing all `price_change_logs` where:
- `dispatched = FALSE`
- `effective_at <= NOW()`

For each change, it evaluates all users and writes notification records to `user_notifications`.

---

### 5.5.4 Notification Templates

#### Message Templates

**A-tier (critical — single push):**

In-app notification:
```json
{
  "type": "price_increased_major" | "price_decreased_major",
  "title": "{model} {direction} {changeRate}",
  "content": "您正在使用的 {model} 将于 {effectiveDate} 起调整价格。\n旧价：{oldPrice} → 新价：{newPrice}（{direction} {changeRate}）\n\n影响您的 {keyCount} 个 API Key。\n{alternative_section}",
  "refType": "price_change",
  "refId": "{changeLogId}"
}
```

Email template:
```
Subject: [3cloud] {model} price {direction} on {effectiveDate}

{model} price change notice
  Old: {oldPrice} → New: {newPrice} ({direction} {changeRate})
  Effective: {effectiveDate}

This model is used by your {keyCount} API key(s).

{alternative_section}

View details → {link}
Manage notification preferences → {prefLink}
```

Alternative section (for price increases with alternatives):
```
Suggested alternatives that may suit your needs:
  - {altModel1}: {altPrice}
  - {altModel2}: {altPrice}
```

**B-tier (weekly summary):**

```json
{
  "type": "price_weekly_summary",
  "title": "本周模型价格变动周报",
  "content": "本周您使用的模型中有 {changeCount} 个价格已调整：\n\n{changeList}\n\n查看完整详情 → {link}",
  "refType": "price_summary",
  "refId": "{summaryId}"
}
```

---

### 5.5.5 User Preferences

#### Sensitivity Setting

Stored in `users.price_notify_sensitivity`:

| Value | Behavior |
|-------|----------|
| `minimal` | Only A-tier notifications for highly substitutable models (coefficient ≥ 1.5) |
| `standard` | Default. Full A/B/C tier logic |
| `full` | B-tier triggers for any user-used model change >10% (not just >20%) |
| `none` | No price notifications. User must visit price change page manually |

#### API

```typescript
PATCH /api/me/preferences
Body: { priceNotifySensitivity: "minimal" | "standard" | "full" | "none" }

GET /api/me/preferences
Response: { priceNotifySensitivity: "standard" }
```

---

### 5.5.6 Scheduled Tasks

| Task | Frequency | Implementation |
|------|-----------|----------------|
| `dispatch-price-notifications` | Every hour | Scan undispatched `price_change_logs` → compute impact per user → write `user_notifications` → mark `dispatched = true` |
| `generate-weekly-summary` | Monday 08:00 Asia/Shanghai | Aggregate all B-tier model changes from last 7 days → write one summary `user_notifications` per affected user |

---

### 5.5.7 Service Architecture

```
┌─────────────────┐     ┌──────────────────────────────────┐     ┌───────────────────┐
│  services/pricing│ ──► │  services/price-alert-service/   │ ──► │ notification-     │
│  (price write)   │     │                                  │     │ service/          │
└─────────────────┘     │  change-log.ts  ← writes DB      │     │ (push to users)   │
                         │  impact-calc.ts ← reads stats    │     └───────────────────┘
                         │  substitutability.ts ← computes  │
                         │  dispatch.ts    ← decides tier   │
                         │  summary.ts     ← weekly merge   │
                         └──────────────────────────────────┘
                                    │
                                    ▼
                         ┌───────────────────┐
                         │  routes/me/       │
                         │  (user queries)   │
                         └───────────────────┘
```

---

### 5.5.8 Acceptance Criteria

| ID | Criteria | Pass/Fail |
|----|----------|-----------|
| AC1 | Price change log is auto-created when cost price is updated via vendor sync | |
| AC2 | Price change log is auto-created when sale price is updated via admin price page | |
| AC3 | Dispatch job correctly computes impact score and writes A-tier notifications | |
| AC4 | B-tier notifications are merged into weekly summary (max 1/week per user) | |
| AC5 | User with `minimal` sensitivity receives fewer notifications than `standard` | |
| AC6 | Price changes for models the user has never called produce 0 notifications | |
| AC7 | Price changes with <5% change produce 0 notifications for all users | |
| AC8 | Admin can manually re-trigger notification for a specific change log | |
| AC9 | User can view per-model price history timeline | |
| AC10 | Alternative model suggestions appear in price increase A-tier notifications | |
| AC11 | No emails are sent for B-tier (summary) notifications | |
| AC12 | Silent users (no calls in 90 days) never receive price notifications | |


---

### [?] 页面帮助

**页面名称**：模型价格变更通知

**适用角色**：管理员（财务/运营）

**功能定位**：上游供应商调价或平台调整售价时，系统自动评估受影响的用户，计算每位用户的业务影响，并分级推送通知。

**子模块说明**：
- §5.5.1 价格变更管理：记录供应商调价与平台售价调整
- §5.5.2 影响评估：按用户计算价格变更的业务影响评分（0-10）
- §5.5.3 分级通知：A 级（影响大，即时推送站内+邮件）/ B 级（周汇总，站内）/ C 级（仅记录）
- §5.5.4 通知历史：价格变更通知的发送记录与用户反馈

**注意事项**：
- A 级通知（影响评分 > 8 或高替代性+大变更）即时发送站内信+邮件
- B 级通知每周汇总一次（站内信）
- C 级通知不发送，仅记录日志
- 用户已使用的模型价格变动 >20% 触发 B 级及以上通知

**常见问题**：
Q: 为什么有的价格变更我没有收到通知？
A: 系统按影响评分分级通知。影响较小（C 级）的变更仅记录不推送，B 级每周汇总一次。

Q: 通知渠道有哪些？
A: 站内信和邮件。A 级即时双渠道，B 级站内信周汇总。

### [?] 按钮级帮助对照表

**§5.5.1 价格变更管理**

| 按钮/操作 | 帮助说明 |
|----------|---------|
| 录入调价 | 记录供应商调价或平台售价调整 |
| 查看变更历史 | 查看历史价格变更记录 |

**§5.5.2 影响评估**

| 按钮/操作 | 帮助说明 |
|----------|---------|
| 查看影响分析 | 查看按用户维度的影响评分和明细 |
| 导出影响报告 | 导出受影响用户清单（CSV） |

**§5.5.3 分级通知**

| 按钮/操作 | 帮助说明 |
|----------|---------|
| 查看通知策略 | 查看 A/B/C 三级通知策略配置 |
| 手动触发通知 | 对指定用户手动补发价格变更通知 |
| 查看发送记录 | 查看通知发送状态和回执 |

