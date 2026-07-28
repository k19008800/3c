# SPEC: §5.5 — Model Price Change Notifications

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

**页面名称**：SPEC: §5.5 — Model Price Change Notifications

**适用角色**：视具体功能而定（参见总览中的优先级和适用角色说明）

**功能定位**：该页面提供 SPEC: §5.5 — Model Price Change Notifications 相关的配置、查询和管理能力。

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
