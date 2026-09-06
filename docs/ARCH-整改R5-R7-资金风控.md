# ARCH — 阶段二 P1 风控（R5–R7）技术方案

| 字段 | 值 |
|------|-----|
| 文档编号 | ARCH-2026-ADMIN-RECHARGE-R5R7-001 |
| 版本 | v1.2（按 ADR-0001 / BOSS 2026-08-30 人工确认修订） |
| 日期 | 2026-08-30 |
| 适用项目 | 3cloud（AI API 网关 + 管理后台） |
| 编制角色 | arch-agent（系统架构总设计师） |
| **业务依据（权威）** | `docs/PRD-整改R5-R7-资金风控.md`（PRD-RECT-P1-R5R7-001 v1.0，业务规则/状态机/配置/边界 E1–E31 **以 PRD 为准**） |
| 调度裁决（权威） | §10 调度双签裁决（B1–B20），与 PRD/正文冲突处以裁决与本节为准 |
| 上游契约 | `docs/ARCH-整改R1-R4-技术方案.md`（§3.4 幂等、§5 requirePerm、§6 notify、§7 migration 0027/0028、§12 A1–A8/D1/D2）、`docs/PRD-整改R1-R4-人工上账与资金入账.md`、`docs/整改方案-管理员充值业务演练.md` |
| 关联规范 | `kb/3cloud/tech-stack-decision.md`、`kb/3cloud/coding-standards-api-db-test.md`、`kb/3cloud/coding-standards-control-logic.md` |
| 现状依据 | 仓库代码逐文件核对（含 `admin-finance-stats.ts` 退款审核、`admin-settings.ts`/`admin-ops.ts` 配置端点、权限树 `sys.config`/`finance.refund`） |
| 执行方 | backend-agent / frontend-agent（**接口契约以本文档为准**）；test-agent 按 §6 验证；review-agent 门禁 |

> **本方案只做设计，不含代码实现。** 人工上账单笔上限以 ADR-0001 及 2026-08-30 人工确认结果为准：¥50,000，超过即拒绝；用户自助充值上限仍为 ¥1,000,000。历史 B3/B20 相反表述均视为 superseded；破坏性变更点见 §7.1。

---

## 1. 现状与改造总览

### 1.1 目标与范围（PRD §1/§2 承接）

| # | 整改项 | PRD 章节 | 验收标准 |
|---|--------|---------|---------|
| R5 | 分级审批统一（大额规则可配置） | PRD §3.1 | 三路径按金额触发对应审批级别；审批人 ≠ 创建人；调增免审批取消 |
| R6 | 拆分规避与限额 | PRD §3.2 | 9×¥9,999 第 6 笔起强制升级双人审批；24h 滚动窗口 |
| R7 | 操作级 2FA + 二次确认 | PRD §3.3 | 资金写操作未携带有效令牌/确认标记 → 后端拒绝；弹窗两步与后端一致 |

### 1.2 关键现状事实（设计依据）

1. **审批现状**：调账四级（increase<1万→none 免审、≥1万→level1；decrease<1万→level1、≥1万→level2；状态 `pending→pending_level2→approved`；已有职责分离）；人工上账/充值订单单步 `pending→paid/failed`、**无职责分离**（阶段一 PRD §3.1.1 第 7 条留待 R5）。
2. **退款审核（B16 新增落点）**：`admin-finance-stats.ts` `GET /admin/refunds` + `POST /admin/refunds/:id/review`（approve 走 `addBalance(type='refund')`），当前 `preHandler:[adminAuth]`（admin/super_admin 白名单）；`finance.refund` 权限点在权限树已有（admin+finance）。前端页 `AdminRefundReviewPage.tsx` 存在。
3. **配置端点现状（B17）**：`admin-settings.ts`/`admin-ops.ts` 全部用 `adminAuth` 角色白名单；权限树含 `sys.config`（admin+super_admin 持有）但 **grep 全仓无路由使用 requirePerm('sys.config')** —— 本期将 `sys.config` wire 到新配置端点。
4. **金额口径**：人工上账创建上限 `manual_topup.max_amount=50,000`（A1/B3 保持）；调账审批线 10,000 硬编码；用户端 `recharge.ts MAX_AMOUNT=1_000_000`（**B20 对齐 50,000**）。
5. **Redis 基建**：`lib/redis.ts`（ioredis 懒连接 + 静默降级）；`pre-consume`/`rate-limit` 已有 Lua 与 INCR 先例；PM2 cluster 多实例 → 限额计数必须跨进程原子。
6. **2FA 现状（仅登录链路）**：`2fa.ts` setup/enable/disable/verify/status；`verifyTOTP`（±1 窗口）/`verifyBackupCode`（一次性）可复用；`jwt.ts` 有 `purpose:'2fa'` 临时令牌先例；`user_2fa.totp_enabled` 权威。**登录 verify 无失败计数**（B14 共享计数需在 2fa.ts verify 接入）。**`/admin/2fa/reset` 端点现状不存在**（grep 无匹配）。
7. **前端**：`AdminManualRechargePage.tsx`（上限常量 50,000）、`AdminAdjustPage.tsx`（`needApproval = isIncrease ? amount>=10000 : true` 前端镜像）、`AdminRechargeOrdersPage.tsx`（audit/reject 直调无确认）、`AdminRefundReviewPage.tsx`（退款审核）、`RechargePage.tsx`（用户端充值，上限提示需随 B20 更新）、`components/OtpInput.tsx`、`lib/api.ts`（axios，**401 全局拦截跳登录** → R7 错误码避开 401）。
8. **错误处理/响应**：`AppError(message, statusCode, code)`；响应 `{ data, message }`；现有码 400 VALIDATION_ERROR / 403 FORBIDDEN / 409 ORDER_ALREADY_PROCESSED / 409 TRANSFER_NO_DUPLICATE / 409 REFUND_ALREADY_PROCESSED 等。
9. **测试模式**：真实 PG + Redis 集成测试（`buildTestApp()` + `app.inject` + 三角色 token）。

### 1.3 改造文件清单

| 文件路径（相对 `3cloud/`） | 改动内容 | R | 类型 |
|---|---|---|---|
| `api/src/lib/finance-rules.ts` | 扩展：`getFinanceRules()` 解析 `large_amount`/`limits`/`operation_2fa`/`manual_topup`（60s 缓存 + `resetFinanceRulesCache`）；纯函数 `calcApprovalTier(amount, direction)`（含调减恰 ¥10,000 特例）、`calcEffectiveTier`、`isReviewExempt`、`isLimitExempt(role)` | R5/R6/R7 | 改 |
| `api/src/services/billing/credit-limit.ts` | **新增**限额服务：`precheckAndReserve(tx, {opUserId, targetUserId, amount, refType, refId, exceedAction})`（PG 权威：advisory lock + 滚动汇总 + 插行 + 超限拒绝）；`syncRedisAdd`（提交后 ZADD，尽力而为）；`redisRollingSum`（Lua） | R6 | 增 |
| `api/src/scripts/lim_add.lua` | **新增** Redis Lua：滚动窗口 汇总-判定-自增-剪枝（ZSET，§3.1） | R6 | 增 |
| `api/src/routes/admin-finance-missing.ts` | 创建端点：限额预检/预占 + tier 定级 + `metadata.approval`/`limit_escalated` 初始化；review 端点：多阶段状态机 + 职责分离（含 B4 降级代审 `escalation_reason`）+ 2FA/二次确认 preHandler；列表新增审批字段 | R5/R6/R7 | 改 |
| `api/src/routes/recharge.ts` | audit/reject：多阶段状态机 + 职责分离（manual 单）+ 2FA/二次确认；用户端 `MAX_AMOUNT=1,000,000` 保持不变（B20）；管理端列表新增审批字段 | R5/R7/B20 | 改 |
| `api/src/routes/admin-adjust.ts` | `calcApproval` → `calcApprovalTier`（none 档废止 + 白名单免审 + tier3）；review 支持 `pending_super`（终审角色校验）；reverse 加钱方向限额预占；2FA/二次确认；降级代审 | R5/R6/R7 | 改 |
| `api/src/routes/admin-finance-stats.ts` | 退款审核鉴权 `adminAuth` → `requirePerm('finance.refund')`（B16）；review 挂 2FA/二次确认；审计补确认标记 | R7/B16 | 改 |
| `api/src/routes/admin-finance-rules.ts` | **新增** `GET/PUT /admin/finance/rules`（requirePerm('sys.config')；`operation_2fa` 段仅 super_admin；保存校验 + `resetFinanceRulesCache` + 审计 + 2FA/二次确认） | R7/B17 | 增 |
| `api/src/services/auth/jwt.ts` | 新增 `generateOperationToken`/`verifyOperationToken`（`purpose:'operation'`，`token_ttl_seconds`，payload 含 `seq`） | R7 | 增 |
| `api/src/routes/2fa.ts` | 新增 `POST /auth/2fa/operation-verify`；**登录 verify 接入共享失败计数（B14）**；disable 递增 `op2fa:revoked`（E27 失效联动） | R7 | 改+增 |
| `api/src/middleware/require-operation-2fa.ts` | **新增**中间件：令牌 + 二次确认标记（AND，E30）+ 强制策略（E22） | R7 | 增 |
| `api/src/db/schema/adjustment-records.ts` | 枚举追加 `'pending_super'`；新列 `superReviewedBy`/`limitEscalated`/`escalationReason` | R5 | 改 |
| `api/src/db/schema/credit-limit-events.ts` | **新增**限额事件表 schema | R6 | 增 |
| `api/src/db/migrations/0029_credit_limit_events.sql` | **新增**：`credit_limit_events` 表（§5） | R6 | 增 |
| `api/src/db/migrations/0030_adjustment_pending_super.sql` | **新增**：enum ADD VALUE + 调账三列（§5） | R5 | 增 |
| 测试文件 7 个（§6） | 分级/限额/2FA/退款/配置/回归 | R5–R7 | 增改 |
| `web-console/src/lib/operation-2fa.ts` | **新增**：`withOperation2fa` 包装 + op_token 内存缓存 + 二次确认标记 | R7 | 增 |
| `web-console/src/components/Operation2faModal.tsx` | **新增**：两步弹窗（① TOTP/备用码 → ② 操作摘要确认执行），复用 OtpInput | R7 | 增 |
| `web-console/src/pages/AdminManualRechargePage.tsx` | 多阶段展示（待双人复核/待终审）；审批链/限额升级标记；2FA 包装；`[?]` | R5/R6/R7 | 改 |
| `web-console/src/pages/AdminAdjustPage.tsx` | tier3/pending_super；免审提示（白名单开关）；审批链台账；2FA 包装；`[?]` | R5/R6/R7 | 改 |
| `web-console/src/pages/AdminRechargeOrdersPage.tsx` | 多阶段展示；补二次确认；2FA 包装；`[?]` | R5/R7 | 改 |
| `web-console/src/pages/AdminRefundReviewPage.tsx` | 鉴权收敛适配 + 2FA 包装 + 二次确认 + `[?]` | R7/B16 | 改 |
| `web-console/src/pages/RechargePage.tsx` | 用户端单笔充值上限提示 1,000,000（B20 保持现状）；不得与人工上账 ¥50,000 混用 | B20 | 校验 |
| `web-console/src/pages/AdminFinanceRiskConfigPage.tsx` | **新增**风控规则配置页（pageKey `finance-risk-config`，PRD §7.3；大额/限额/2FA 策略；保存需 2FA+二次确认；`[?]`） | R5/R6/R7/B17 | 增 |

> **P1 合规**：本期新增/语义变化的按钮（多阶段审核、终审、2FA 输入、确认执行、保存风控配置等）必须随页面交付 `[?]` 帮助，数据源 = PRD §7/§8 对照表（PRODUCT-DESIGN-PRINCIPLES P1，不可降级）。

---

## 2. R5 分级审批统一（PRD §3.1 承接）

### 2.1 裁决：扩展 `finance_rules` 单键，配置段与 PRD §3.1.2/§3.2.2/§3.3.2 完全一致

扩展 `system_config key='finance_rules'` 的 JSON schema（`manual_topup` 兼容保留），新增三个配置段。**键名、默认值、校验与 PRD 逐字段对齐**：

```json
{
  "manual_topup": { "max_amount": 50000 },

  "large_amount": {
    "single_review_max": 10000,
    "dual_review_threshold": 10000,
    "super_review_threshold": 100000,
    "review_exempt": { "enabled": false, "max_amount": 1000, "subjects": ["赠送", "补偿", "纠错"] },
    "adjustment_decrease_same_tier": true
  },

  "limits": {
    "operator_24h": 50000,
    "recipient_24h": 50000,
    "exceed_action": "escalate",
    "exempt_roles": [],
    "count_decrease": false,
    "count_refund_review": false
  },

  "operation_2fa": {
    "policy": "mandatory_admin",
    "token_ttl_seconds": 300,
    "lock_threshold": 5,
    "lock_minutes": 15,
    "allow_backup_code": true,
    "scopes": ["manual_topup.create", "manual_topup.review", "adjust.create", "adjust.approve", "adjust.review", "adjust.reject", "adjust.reverse", "recharge.audit", "recharge.reject", "refund.review", "finance_rules.save"]
  }
}
```

| 段 | 字段 | 默认 | 语义/校验 |
|----|------|------|-----------|
| `large_amount` | `single_review_max` | 10,000 | ≤ 此值单审（恰为此值单审，E1）；正数 |
| | `dual_review_threshold` | 10,000 | > 此值双人（10,000.01 起，E2） |
| | `super_review_threshold` | 100,000 | > 此值追加 super_admin 终审；> dual_review_threshold（E12） |
| | `review_exempt` | 关 | 白名单科目免审（B2）：`enabled` + 科目 ∈ `subjects` + 调增 + ≤ `max_amount`(1,000)；**免审单计入 R6 累计** |
| | `adjustment_decrease_same_tier` | true | 调减与调增同档；**调减恰 ¥10,000 仍双人特例**（B1） |
| `limits` | `operator_24h` / `recipient_24h` | 50,000 | 操作人/被入账用户 24h 滚动窗口累计（B5/B6）；对外 canonical 键名，见 ADR-0022 |

> **已 superseded（2026-08-30，ADR-0022）**：不得使用 `limits.soft_limit` / `limits.hard_limit` 替代公开配置键。对外统一使用 `limits.operator_24h`、`limits.recipient_24h`、`limits.exceed_action`；两个维度独立计算，默认均为 ¥50,000。累计超限按 `exceed_action` 升级或拒绝；单笔上限校验优先于累计限额，人工上账超过 ¥50,000 直接拒绝。历史 soft/hard 名称仅可在迁移说明中作为旧键引用。
| | `exceed_action` | escalate | escalate=升级双人 / reject=直接拒绝（B7） |
| | `exempt_roles` | [] | 豁免角色（默认空；super_admin 不豁免，B8） |
| | `count_decrease` / `count_refund_review` | false | 调减/充值审核是否计入（B9/B10，默认否） |
| `operation_2fa` | `policy` | mandatory_admin | mandatory_admin / disabled（B12，与登录策略解耦） |
| | `token_ttl_seconds` / `lock_threshold` / `lock_minutes` | 300/5/15 | 令牌有效期 / 锁定阈值 / 锁定分钟（B11/B14，与登录共享计数） |
| | `allow_backup_code` | true | 备用码允许、一次性（B13） |
| | `scopes` | 见上 | 适用操作清单（审计与前端同步） |

**读取与计算（`lib/finance-rules.ts`）**：

```ts
/**
 * 金额档位（PRD §3.1.1 规则 1/3 + B1 特例）：
 *   increase: amount ≤ single_review_max → 1；≤ super_review_threshold → 2；否则 3
 *   decrease: 与调增同档，但 amount === single_review_max 时取 max(档, 2)（恰 ¥10,000 仍双人）
 */
export function calcApprovalTier(amount: number, direction: 'increase' | 'decrease'): 1 | 2 | 3

/** 限额升级：projected 任一维度超限 → max(tier, 2)（PRD §3.2.1 规则 4，仅升级到双人档，不自动升终审） */
export function calcEffectiveTier(tier: 1 | 2 | 3, opEscalated: boolean, userEscalated: boolean): 1 | 2 | 3

/** 白名单免审（B2）：enabled && direction=increase && subject ∈ subjects && amount ≤ max_amount */
export function isReviewExempt(subject: string, direction: string, amount: number): boolean

/** 限额豁免角色（B8）：role ∈ limits.exempt_roles */
export function isLimitExempt(role: string): boolean
```

### 2.2 审批状态机叠加

#### 2.2.1 存储裁决（arch 行使 PRD"存储形态由 arch 裁决"授权）

| 单据 | 裁决 | 理由 |
|------|------|------|
| **recharge_orders**（人工上账 + 充值订单） | **DB `status` 保持 `pending` 直至最终批准置 `paid`；审批阶段存 `metadata.approval`（jsonb：`{level, phase, first_reviewer, second_reviewer, super_reviewer, …}`）+ `metadata.limit_escalated`**；PRD 状态机语义（pending_level2=待双人复核、pending_super=待终审）以 `approval.phase` 承载 | ① `paid` = 已入账是 R1–R4 用户端契约（`/me/recharge-orders` 的 `paid→success` 映射），DB 枚举混入 `pending_level2/pending_super` 会原样透传给用户端 UI，须额外映射兜底；② metadata 已承载审批人（A8 `reviewer_id` 先例），扩展同构；③ 零迁移、阶段一测试（`status='pending'` 断言）不受影响 |
| **adjustment_records** | **状态枚举追加 `'pending_super'` + 新列 `super_reviewed_by`/`limit_escalated`/`escalation_reason`**（migration 0030） | 域内私有枚举，扩展与现状一致性最高；PRD §3.1.2 明确"调账已有 pending/pending_level2，扩展 pending_super" |

> 契约对齐说明（详见 §11）：PRD §3.1.2"`status` 扩展 `pending_level2/pending_super`（人工上账/充值订单）"在产品语义层完整承接（前端展示、状态机流转、验收项"待双人复核可见"均满足）；DB 存储形态按 PRD 授予 arch 的裁决权采用 metadata。此为与 PRD 唯一的存储层差异，其余全部对齐。

#### 2.2.2 recharge_orders 状态机（人工上账 / 充值订单 audit；PRD §3.1.3）

```
创建（status=pending；metadata.approval={level, phase:'level1_pending'}；limit_escalated?）
   ├─ 单审档（≤¥10,000）
   │     └─ review approve → paid（入账+流水+通知+审计）[终态]
   ├─ 双人档（>¥10,000 且 ≤¥100,000）
   │     ├─ 一审 approve → phase='level2_pending'（status 仍 pending，记 first_reviewer）
   │     └─ 二审 approve → paid [终态]
   ├─ 终审档（>¥100,000，**仅充值订单**；人工上账受单笔上限 ¥50,000 约束不产生此档，B3/E11）
   │     ├─ 一审 → phase='level2_pending' → 二审 → phase='super_pending'（记 second_reviewer）
   │     └─ super 终审（super_admin）→ paid [终态]
   └─ 任一步 reject → failed（记 review_note）[终态]
```

- **原子守卫**（防并发重复审批，对齐阶段一 `where status='pending'` 模式；E6）：
  - 一审：`WHERE id=? AND status='pending' AND metadata->>'approval_phase'='level1_pending'`
  - 二审：`WHERE id=? AND status='pending' AND metadata->>'approval_phase'='level2_pending'`
  - 终审：`WHERE id=? AND status='pending' AND metadata->>'approval_phase'='super_pending'`
  - 0 行 → 409 `ORDER_ALREADY_PROCESSED` 整体回滚；**仅最终批准的事务内调 `creditBalance`**（阶段推进不触余额）。
- **存量兼容（B18）**：存量 pending 单无 `metadata.approval` → **沿用提交时级别（旧规则=单审）**，不重算、不升级（§7.2）。

#### 2.2.3 adjustment_records 状态机（none 档废止；PRD §3.1.3）

```
发起（定级：金额档 + R6 限额升级；无免审档或按白名单免审开关）
  ├─ 白名单免审（B2 开启且命中）→ approved（提交即生效；计入 24h 累计）
  ├─ level1（单审档）：pending ──approve──▶ approved（生效）
  ├─ level2（双人档）：pending ──approve──▶ pending_level2 ──review──▶ approved
  ├─ level3（终审档）：pending ──approve──▶ pending_level2 ──review──▶ pending_super ──review(super)──▶ approved
  ├─ 任一步 reject → rejected
  └─ approved ──reverse──▶ reversed（反向记录作为新单据重新定级；加钱方向计入限额，B9/B19）
状态机约束：仅当前环节可流转（原子守卫）；终态不可再审批（E7）。
```

- **调减特例（B1）**：`calcApprovalTier` 对 decrease 恰为 `single_review_max` 时返回 ≥2（双人档）。
- **review 端点扩展**（最小端点变更）：`POST /admin/adjust/:id/review` 同时处理 `pending_level2`（二审）与 `pending_super`（终审）；`pending_super` 强制 `operator.role==='super_admin'` 且 ≠ requestedBy/approvedBy/reviewedBy，否则 403/400。
- **红冲**：`reverse` 端点本期不改造审批链（R12 范围），但挂 2FA/二次确认 + 加钱方向限额预占（§3.3）。
- **存量兼容（B18）**：存量 `approval_level='level1'/'level2'` 的待审单沿用原流程；`pending_super`/level3 仅新单产生。

### 2.3 接口契约变更（含错误码）

#### 2.3.1 `POST /admin/manual-topup`（创建）

| 项 | 现状 | R5 后 |
|----|------|-------|
| 金额上限 | ≤ 50,000 否则 400（A1） | **保持 ≤ 50,000（B3 裁决）**；提示"大额入账请走充值订单/分级审批" |
| 限额预检 | 无 | 含本笔预检：超 `operator_24h`/`recipient_24h` → `exceed_action=escalate` 升级标记 / `reject` → **429 `DAILY_LIMIT_EXCEEDED`**（§3.4） |
| 响应 | `{ id, order_no, user_id, amount, method, status:'pending', status_label, created_at }` | 新增 `approval_level`(1\|2)、`approval_phase:'level1_pending'`、`limit_escalated`(bool)、`message`（按档位/升级提示） |
| metadata | `{ source, created_by, … }` | 追加 `approval:{level,phase,limit_check}`、`limit_escalated` |

#### 2.3.2 `POST /admin/manual-topup/:id/review` / `POST /admin/recharge-orders/:id/audit`

| 场景 | 现状 | R5 后 |
|------|------|-------|
| 单审档通过 | `{ status:'approved'/'paid' }` + 入账 | **不变**（单审路径契约零变化） |
| 一审通过（双人/终审档） | 直接入账 | 200 `{ status:'pending', approval_level, approval_phase:'level2_pending', message:'一级审批通过，等待双人复核' }`（不入账） |
| 二审通过（双人档） | — | `{ status:'approved'/'paid', balance_after }`（入账） |
| 终审通过（终审档） | — | `{ status:'approved'/'paid', balance_after, approval_phase:'approved' }`（入账） |
| 驳回 | 不变 | **不变**（任意阶段可驳回，原因必填） |

**请求头/体新增（R7 + B4）**：

| 项 | 说明 |
|----|------|
| `X-Operation-Token` | 操作级 2FA 令牌（5 分钟，窗口内复用；R7） |
| `X-Operation-Confirm: confirmed` | 二次确认标记（E30 AND 语义；R7） |
| `escalation_reason`（body，可选） | **super_admin 降级代审时必填**（B4；审计标记 `degraded:true`） |

**新增/沿用错误码**：

| HTTP | code | 场景 |
|:---:|------|------|
| 400 | `VALIDATION_ERROR` | 审核人=创建人（E3）、二审=一审（E4）、终审=前两级（E5）、降级代审缺原因、阶段不匹配 |
| 403 | `FORBIDDEN` | 终审非 super_admin 角色；无权限点（沿用） |
| 409 | `ORDER_ALREADY_PROCESSED` | 并发重复审批/终态再审批（E6/E7，沿用） |
| 429 | `DAILY_LIMIT_EXCEEDED` | 创建预检超硬限且 `exceed_action=reject`（E20） |
| 403 | `OPERATION_2FA_REQUIRED` / `OPERATION_2FA_INVALID` / `OPERATION_2FA_EXPIRED` / `OPERATION_2FA_NOT_ENABLED` | R7 中间件（§4.4；**不用 401 防前端登出**） |
| 403 | `OPERATION_CONFIRM_REQUIRED` | 缺二次确认标记（E30） |
| 429 | `OPERATION_2FA_LOCKED` | 锁定中（E23/E31） |

#### 2.3.3 调账端点

- `POST /admin/adjust` 响应新增：`approval_level`(1\|2\|3)、`limit_escalated`、`message`（"已提交一级/双人/终审审批"或"已生效（白名单免审）"）。调增 <¥10,000 默认进入一级审批（B2）。
- `POST /admin/adjust/:id/review`：扩展 `pending_super`；终审强制 super_admin。
- `GET /admin/adjust/pending?level=1|2` 新增 `level=3`（pending_super）。

#### 2.3.4 GET 列表 — 新增字段（向后兼容，纯增量）

`GET /admin/manual-topup`、`GET /admin/recharge-orders`、`GET /admin/adjust/ledger` 每条新增：

```json
{
  "approval_level": 2,
  "approval_phase": "level2_pending",
  "first_reviewer_id": 5,
  "second_reviewer_id": null,
  "super_reviewer_id": null,
  "limit_escalated": true,
  "escalation_reason": "24h 累计超限，升级双人审批",
  "stalled": false
}
```

- `stalled`：B15 台账超时标记（懒计算：`status∈{pending,pending_level2,pending_super}` 且 `now-created_at > SLA`，SLA 默认初审 12h/复审+终审 24h，对齐 ref §7.2.2；配置见 §2.5）。
- 调账台账另展示审批链（申请人→一级→二级→终审）与 `limit_escalated`（PRD §3.1.4）。

### 2.4 职责分离矩阵（PRD §4 承接 + B4）

| 规则 | 人工上账 | 充值订单 audit | 调账 | 退款审核（B16） |
|------|---------|---------------|------|----------------|
| 创建人 ≠ 审批人 | ✅ `metadata.created_by` ≠ 任一审批人 | ✅ 仅 manual 单（用户自助单跳过） | ✅ 现状已有 | 申请方为用户，天然满足 |
| 一级 ≠ 二级 | ✅ | ✅ | ✅ 现状已有 | 单步，不适用 |
| 终审 ≠ 一/二级 | 人工上账无终审档（B3） | ✅（tier3） | ✅（pending_super 校验） | 不适用 |
| 驳回人 ≠ 创建人 | ✅ | ✅ manual 单 | ✅ 现状已有 | ✅ |

- **B4：super_admin 不豁免职责分离**——super_admin 同样不能审批自己发起的单据；"自建自审"仅能走**降级代审路径**（`escalation_reason` 必填 + 审计标记 `degraded:true`）。
- 校验抛 `ValidationError`（400），与调账现状风格一致。

### 2.5 审批人不足与滞留（B4/B15）

| 场景 | 行为 | 实现 |
|------|------|------|
| 双人档无第二人可审（可审集合为空：排除创建人/已审人后无 active 且持权限点者） | **单据滞留当前环节** + 创建人侧提示"审批人不足，已通知管理员" + **即时通知 super_admin**（B4） | 创建/审批时计算可审集合；为空 → `notifyAdmins('approval_stalled', {orderId})`（复用 notify 机制写 notifications，type=`approval_stalled`）+ 审计 `approval_stalled` |
| 审批人持续不足或滞留超时 | super_admin **代审**：弹窗必填降级原因（`escalation_reason`）→ 审计标记 `degraded:true` | review/audit 端点：当 `operatorId === 创建人` 或 super_admin 代审场景 → `escalation_reason` 必填，否则 400 |
| 滞留超时（SLA） | **台账/列表超时标记**（`stalled:true`，懒计算，零定时任务） | §2.3.4 字段；SLA 配置 `finance_rules.approval_stall`（默认 `{level1_hours:12, level2_hours:24, super_hours:24}`） |
| 滞留超时主动通知上级 | **取舍标注（B15 轻量版）**：本期实现"标记 + 创建/审批时刻即时通知"；**超时扫描定时任务为高成本项，若排期紧仅做标记**（§9 Q1） | — |

---

## 3. R6 拆分规避与限额（PRD §3.2 承接）

### 3.1 Redis 计数设计（24h **滚动窗口**，裁决 B5/B6 取代任务稿日键方案）

> **偏离任务原稿说明**：原稿键 `lim:op:{userId}:{yyyymmdd}`（自然日）被 PRD E15（跨日按滚动窗口）与 B5/B6"滚动窗口"裁决取代。滚动窗口语义更严谨（23:59 与次日 00:01 连续计算），且"单笔上限 = 单日累计上限"在滚动窗口下不产生窗口切换瞬间的绕过。实现如下。

**键设计（ZSET 事件集）**：

```
lim:op:{operatorId}     —— 操作人滚动 24h 加钱事件集（score=事件时间戳 ms）
lim:user:{targetUserId} —— 被入账用户滚动 24h 加钱事件集
member = "{refType}:{refId}:{amountCents}"   （refType ∈ manual_topup|adjustment|reverse）
```

- 事件级存储 → 精确到毫秒，无量化误差；TTL 48h（每次写刷新），无事件后自动消失。
- **跨进程原子（Lua `lim_add.lua`）**：

```lua
-- KEYS[1]=ZSET 键；ARGV[1]=member；ARGV[2]=score(ms)；ARGV[3]=amountCents；ARGV[4]=windowMs(86400000)；ARGV[5]=limitCents；ARGV[6]=allow(1|0)
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[2] - ARGV[4])   -- 剪枝窗口外
local sum = 0
for _, m in ipairs(redis.call('ZRANGEBYSCORE', KEYS[1], ARGV[2] - ARGV[4], '+inf')) do
  sum = sum + tonumber(string.match(m, ':(%d+)$'))                  -- member 尾部 amountCents
end
if sum + tonumber(ARGV[3]) > tonumber(ARGV[5]) and tonumber(ARGV[6]) == 0 then
  return { 0, sum }                                                 -- 拒绝（reject 模式）
end
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[1])
redis.call('EXPIRE', KEYS[1], 172800)
return { 1, sum + tonumber(ARGV[3]) }
```

- 降级：`getRedis()` null / 命令异常 → **回退 PG 权威查询**（§3.2），不阻断主链路（对齐 `lib/redis.ts` 静默降级）。

### 3.2 与 PG 的一致性取舍（裁决：PG 为权威 + Redis 热路径）

| 方案 | 说明 | 取舍 |
|------|------|------|
| A 纯 Redis ZSET | 事件级、TTL 自清理 | Redis 清空/崩溃 → 计数丢失 → 限额被绕过，资金安全不可接受 |
| B **PG 权威 + Redis 加速（采纳）** | 新表 `credit_limit_events`（每笔计数一行，含时间戳，滚动查询）；生效创建事务内 **`pg_advisory_xact_lock` 串行化同维度并发** + 汇总判定 + 插行；Redis 作热路径读/写（提交后尽力同步，缺失回填） | 与 `coding-standards-control-logic.md §五`"PG 持久化权威 + Redis 热路径"一致；advisory lock 消除"先到先得"竞态（E16） |
| C 纯 PG 聚合 balance_transactions | 无新表 | balance_transactions 无操作人维度（user_id 是被入账用户），聚合不出"操作人累计"；热表加列属大迁移 |

**`credit_limit_events` 表**（§5 migration 0029）：

```sql
CREATE TABLE credit_limit_events (
  id          serial PRIMARY KEY,
  scope       varchar(10)  NOT NULL CHECK (scope IN ('operator', 'user')),
  user_id     integer      NOT NULL REFERENCES users(id),
  amount      numeric(18,2) NOT NULL,
  ref_type    varchar(30)  NOT NULL,              -- manual_topup | adjustment | reverse
  ref_id      varchar(50)  NOT NULL,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT uq_credit_limit_event UNIQUE (scope, ref_type, ref_id)  -- 同单同维度只计一次（幂等）
);
CREATE INDEX idx_credit_limit_events_scope_user ON credit_limit_events (scope, user_id, created_at);
```

**写入（创建/发起事务内）**：

```sql
-- ① 同维度串行化（op 维度一把锁、user 维度一把锁，粒度 = 用户）
SELECT pg_advisory_xact_lock(hashtext('lim:' || $scope || ':' || $user_id));
-- ② 滚动汇总（24h）
SELECT COALESCE(SUM(amount),0) FROM credit_limit_events
WHERE scope = $scope AND user_id = $user_id AND created_at > now() - interval '24 hours';
-- ③ 判定：sum + 本笔 > limit 且 exceed_action='reject' → 抛 429（事务回滚，单据不创建）
-- ④ 插行（op + user 各一行）
INSERT INTO credit_limit_events (scope, user_id, amount, ref_type, ref_id) VALUES (...);
```

- **TOCTOU 消除**：advisory lock 使同维度并发计数严格串行（E16 先到先得）；UNIQUE 约束防同单重复计数（重试/双写兜底）。
- **回填**：Redis 键缺失/过期 → 从 PG 滚动汇总回填（读路径自动）。

### 3.3 计入时点与计数范围（B9/B10/B18/B19 裁决）

| 操作 | 计入维度 | 计入时点 |
|------|---------|---------|
| 人工上账创建 | op + user | **创建时预占**（含本笔判定；提交即预占，PRD §3.2.1 规则 8） |
| 调账调增发起 | op + user | 创建时预占（含免审白名单单，B2） |
| 调账调减发起 | **不计入**（B9，`count_decrease=false`） | — |
| 红冲加钱方向发起 | op + user | 创建时预占（反向记录作新单据，B9） |
| 红冲扣钱方向 | **不计入、不回退**（B19） | — |
| 充值订单审核（用户自助） | **不计入**（B10，`count_refund_review=false`） | — |
| 兑换码入账 | 不计入（PRD 规则 8 明确） | — |
| 退款审核（B16 范围） | **不计入**（PRD 计数清单未列，金额由用户申报，拆分语义不同于运营操作；§9 Q5 待产品确认） | — |

- **驳回/红冲不回退累计（B19）**：已预占的计数在单据被驳回或红冲后**不扣减**（防"提交-撤销-再提交"循环绕过，E17）；红冲加钱方向本身新增计数。
- **无"生效阶段复核"**：计数与定级在创建时一次性完成并固化（B18 同语义），审核环节不再触碰限额（与任务原稿"生效计入"方案不同，PRD 明确按提交时点预占）。

### 3.4 检查时序（先查限额 → 再定审批级别；PRD §3.2.3）

```
资金写操作提交（人工上账创建 / 调账发起 / 红冲加钱方向发起）
  ① 权限点校验（R3，requirePerm）
  ② 操作级 2FA + 二次确认（R7，requireOperation2fa preHandler）
  ③ 24h 累计预检（含本笔）：
     a. op 维度：rollingSum(op) + 本笔 > operator_24h（且 role ∉ exempt_roles，B8）
     b. user 维度：rollingSum(user) + 本笔 > recipient_24h
     c. 任一超限：
        exceed_action='reject' → 429 DAILY_LIMIT_EXCEEDED（E20）
        exceed_action='escalate' → 升级标记（E13/E14）
  ④ 审批定级：
     level = calcApprovalTier(amount, direction)
     升级标记 → level = max(level, 2)（不自动升终审，PRD 规则 4）
     免审：isReviewExempt 命中 且 无升级标记 → 免审（提交即生效）
  ⑤ 生成单据（pending / pending_level2 / pending_super / approved[免审]），
     limit_escalated / escalation_reason 落库；credit_limit_events 插行（op+user）；
     提交后 Redis ZADD（尽力而为）
```

- **与 R5 叠加**：先限额 → 再定级；限额升级只到双人档（max(金额档, 2)），9×¥9,999 第 6 笔起升级（E13 验收）。
- **免审单同样计入累计**（B2 三重约束兜底，PRD 规则 3）。

### 3.5 降级与一致性取舍汇总

| 故障 | 行为 | 风险等级 |
|------|------|:---:|
| Redis 不可用 | 预检回退 PG 查询；ZADD 失败静默跳过（PG 已落，下次回填自愈） | 低 |
| PG 不可用 | 创建事务无法执行（credit_limit_events 依赖 PG）→ 主链路失败 | — |
| 计数与真实入账漂移 | 对账体系（§29）比对 balance_transactions 与 credit_limit_events 差异告警 | 低 |
| 驳回不回退造成的额度占用 | 产品已接受（B19 保守风控）；超占时后续单据升级/拒绝，可配置调高限额缓解 | 中（产品已裁决） |

---

## 4. R7 操作级 2FA + 二次确认（PRD §3.3 承接）

### 4.1 设计模式裁决

| 维度 | 裁决 |
|------|------|
| 模式 | `POST /auth/2fa/operation-verify`（TOTP/备用码 → 短时操作令牌）→ 资金写端点 preHandler `requireOperation2fa` 校验 `X-Operation-Token` **AND** `X-Operation-Confirm`（E30） |
| 与登录 2FA 区分 | 复用 `verifyTOTP`/`verifyBackupCode`/`user_2fa`；令牌 `purpose:'operation'`（`'2fa'` 登录临时令牌不可互用）；**策略独立**（`operation_2fa.policy` 与登录 `two_factor_policy` 解耦，B12） |
| 令牌形态 | **无状态 JWT**（`purpose:'operation'`，`token_ttl_seconds=300`，payload 含 `seq`），不落 Redis；Redis 承担：失败计数/锁定（共享）、签发序号与失效版本（E27） |
| 复用窗口 | 5 分钟窗口内同操作者复用（B11/E29），每次操作仍校验；不可跨操作者 |
| 二次确认 | 独立标记头 `X-Operation-Confirm: confirmed`（E30 AND）；后端记录审计 `confirmed:true`。二次确认是意图确认（非加密凭证），2FA 令牌才是身份凭证 |
| 落点 | §4.8 清单（9 资金端点 + 退款审核 B16 + 配置保存 B17）；只读端点不挂 |

### 4.2 端点契约：`POST /api/v1/auth/2fa/operation-verify`

```
鉴权：Authorization: Bearer <登录 JWT>（jwtAuth）
请求体：{ "token"?: string, "backup_code"?: string }   // 至少一个；都传 token 优先
成功 200：{ "data": { "op_token": "<jwt>", "expires_in": 300 }, "message": "验证通过" }
```

| HTTP | code | 场景 |
|:---:|------|------|
| 400 | `VALIDATION_ERROR` | 均缺失/均非法 |
| 400 | `TWO_FACTOR_NOT_ENABLED` | 操作者未启用 2FA（复用 2fa.ts 现有码） |
| 400 | `INVALID_2FA_CREDENTIAL` | TOTP/备用码错误（每次失败 INCR 共享计数，§4.5；对齐 2fa.ts 码） |
| 429 | `OPERATION_2FA_LOCKED` | 共享计数达阈值锁定中（E23/E31） |
| 401 | `UNAUTHORIZED` | 登录 JWT 失效（此处允许 401，登录态失效本应登出） |

> ⚠️ 错误码红线：**资金端点中间件一律不用 401**（403/429），避免触发前端 axios 401 全局拦截器误登出（`lib/api.ts`）。

**内部流程**：

```
1. jwtAuth → userContext
2. 查 user_2fa.totp_enabled：false → 400 TWO_FACTOR_NOT_ENABLED
3. 锁检查：get 2fa:fail:{userId} ≥ lock_threshold → 429 OPERATION_2FA_LOCKED（剩余=TTL）
4. 校验：token → verifyTOTP（±1 窗口，E28）；否则 backup_code → verifyBackupCode 命中 → 移除该哈希（一次性，E24/E25）
5. 失败 → INCR 2fa:fail:{userId}（首次 EXPIRE lock_minutes*60）→ 400 INVALID_2FA_CREDENTIAL + 剩余次数
6. 成功 → DEL 2fa:fail:{userId} → seq = INCR op2fa:issued_seq:{userId} → generateOperationToken({userId,email,role,seq})
7. 审计：签发/失败/锁定写 audit_logs（PRD 规则 10）
```

### 4.3 操作令牌（`services/auth/jwt.ts` 扩展）

```ts
export interface OperationTokenPayload {
  purpose: 'operation';
  userId: number; email: string; role: string;
  seq: number;          // 签发序号（E27 失效版本，Redis op2fa:issued_seq 递增）
}
export function generateOperationToken(p: Omit<OperationTokenPayload,'purpose'>): string   // expiresIn = token_ttl_seconds
export function verifyOperationToken(t: string): { ok:true; payload: OperationTokenPayload } | { ok:false; reason:'expired'|'invalid' }
```

- **E27 失效联动（2FA 重置/禁用）**：现状无 `/admin/2fa/reset` 端点（grep 无匹配），本期实现：
  - `2fa.ts` disable 时 `SET op2fa:revoked:{userId} = <当前 issued_seq>`（Redis）；
  - `requireOperation2fa` 校验 `payload.seq <= op2fa:revoked:{userId}` → 403 `OPERATION_2FA_EXPIRED`；
  - Redis 不可用 → 跳过失效检查（fail-open，与降级语义一致）；
  - 管理员强制重置端点是否新建属产品范围（§9 Q2）。
- 与登录 `2fa` 临时令牌通过 `purpose` 隔离，交叉使用即无效。

### 4.4 中间件 `requireOperation2fa`（新建）

```
preHandler 顺序：[requirePerm(perm), requireOperation2fa]
1. ctx = request.userContext（requirePerm 已注入）
2. 读 operation_2fa.policy：'disabled' → 直接放行（全部关闭，不推荐）
3. 读 user_2fa.totp_enabled：false（policy=mandatory_admin，E22）→ 403 OPERATION_2FA_NOT_ENABLED
   （message 带引导：'执行资金操作需先启用双因素认证'；前端弹窗 [前往启用]）
4. 读 limits.exempt_roles：role 命中 → 放行（B8 配置，默认空）+ 审计标记 2fa:'exempt'
5. header 'x-operation-token' 缺失 → 403 OPERATION_2FA_REQUIRED
6. verifyOperationToken：
   - reason='expired' → 403 OPERATION_2FA_EXPIRED（E26）
   - reason='invalid' → 403 OPERATION_2FA_INVALID
   - payload.userId ≠ ctx.userId → 403 OPERATION_2FA_INVALID
   - payload.seq ≤ op2fa:revoked:{userId} → 403 OPERATION_2FA_EXPIRED（E27）
7. header 'x-operation-confirm' !== 'confirmed' → 403 OPERATION_CONFIRM_REQUIRED（E30）
8. 通过 → request.opToken = payload；审计（scopes 匹配）
```

### 4.5 错误次数限制（B14：与登录共享计数）

| 项 | 值 |
|----|-----|
| 键 | `2fa:fail:{userId}`（**登录 verify 与 operation-verify 共享**） |
| 阈值/锁定 | `lock_threshold=5` 次 → 锁 `lock_minutes=15` 分钟（TTL=lock_minutes*60，首次失败 INCR 时 EXPIRE） |
| 接入点 | ① operation-verify（§4.2 步骤 3/5/6）；② **`2fa.ts` 登录 verify 的失败路径**（新增：失败 INCR、成功 DEL、锁定检查）——现状登录链路无计数，本期补齐 |
| 锁定语义 | 锁定期间两链路均 429 `OPERATION_2FA_LOCKED`；已签发令牌不受影响 |
| 告警 | 达阈值写审计 `2fa.locked` + 通知管理员（PRD 规则 6） |
| 降级 | Redis 不可用 → 跳过计数与锁定（fail-open） |

### 4.6 未启用 2FA 操作者策略（B12：mandatory_admin 强制）

| 方案 | 裁决 | 说明 |
|------|------|------|
| **A 强制（mandatory_admin，采纳）** | 资金角色（finance/admin/super_admin）执行资金写操作**必须已启用 2FA**；未启用 → 403 `OPERATION_2FA_NOT_ENABLED` + 引导错误码 + 前端弹窗 [前往启用]（跳管理端安全设置，SecurityPage 已有流程） | 与验收"未 2FA 请求被拒"一致 |
| B 放行+标记 | 不采纳 | 留有绕过面，违背验收 |
| disabled 档 | 配置提供（不推荐），用于紧急关闭 | — |

### 4.7 前端交互（PRD §3.3.4 承接：同一弹窗两步）

```ts
// web-console/src/lib/operation-2fa.ts
let opTokenCache: { token: string; expiresAt: number } | null = null;   // 内存缓存，不落 localStorage
export async function withOperation2fa(action: () => Promise<any>): Promise<any>
// 403 OPERATION_2FA_REQUIRED / EXPIRED → 打开 Operation2faModal → operation-verify → 缓存令牌
// → 自动重放原请求（附 X-Operation-Token + X-Operation-Confirm）
// 403 OPERATION_2FA_NOT_ENABLED → 引导弹窗 [前往启用]
// 其余错误原样抛出（403 不触发 axios 401 登出）
```

```tsx
// web-console/src/components/Operation2faModal.tsx —— 两步弹窗（PRD §3.3.4 顺序：先身份后意图）
// 第一步：OtpInput（6 位）+ "无法使用认证器？使用备用码"切换（allow_backup_code）
//         未启用 → 引导文案 + [前往启用]；锁定 → 倒计时（15:00）输入禁用
// 第二步（验证通过后同弹窗切换）：操作摘要（单据类型/用户/金额/到账后余额/审批级别/限额升级提示）+ [确认执行]/[返回修改]
// 确认执行 → 发送原请求（附令牌 + X-Operation-Confirm: confirmed）
```

- **顺序裁决（PRD 产品建议）**：同一弹窗两步——先 2FA 身份验证，通过后同窗切摘要二次确认，两步全过才发请求。`withOperation2fa` 的 403 驱动重放与各页现有按钮无缝衔接。
- **过期重试**：`OPERATION_2FA_EXPIRED` → 清缓存、重开弹窗、保留原操作上下文。
- **`[?]` 合规**：2FA 输入/确认执行/前往启用/备用码/限额升级提示按钮随 PRD §8 对照表落地。

### 4.8 落点清单（资金写操作 preHandler）

| 端点 | 权限点 | 2FA+确认 | 说明 |
|------|--------|:---:|------|
| `POST /admin/manual-topup` | finance.topup | ✅ | 创建 |
| `POST /admin/manual-topup/:id/review` | finance.topup | ✅ | 审核/驳回 |
| `POST /admin/recharge-orders/:id/audit` | finance.topup | ✅ | 审核 |
| `POST /admin/recharge-orders/:id/reject` | finance.topup | ✅ | 驳回 |
| `POST /admin/adjust` | finance.adjust | ✅ | 发起（含免审生效） |
| `POST /admin/adjust/:id/approve` | finance.adjust | ✅ | 一级 |
| `POST /admin/adjust/:id/review` | finance.adjust | ✅ | 二级/super 终审 |
| `POST /admin/adjust/:id/reject` | finance.adjust | ✅ | 驳回 |
| `POST /admin/adjust/:id/reverse` | finance.adjust | ✅ | 红冲 |
| **`POST /admin/refunds/:id/review`（B16）** | **finance.refund（adminAuth→权限点收敛）** | ✅ | 退款审核通过/驳回 |
| **`PUT /admin/finance/rules`（B17）** | **sys.config（operation_2fa 段仅 super_admin）** | ✅ | 保存风控配置（敏感写操作） |

> 只读端点（列表/台账/待审/用户搜索/限额查询）不挂 2FA。

---

## 5. 数据模型变更（migration 清单）

### 5.1 结论：仅 2 项新 migration

| # | migration | 内容 | 归属 |
|---|-----------|------|------|
| **0029** | `0029_credit_limit_events.sql` | 新表 `credit_limit_events`（§3.2 DDL） | R6 |
| **0030** | `0030_adjustment_pending_super.sql` | `ALTER TYPE adjustment_status ADD VALUE 'pending_super'` + `adjustment_records` 加三列 | R5 |

**0030 草案**：

```sql
-- R5 三级审批：调账枚举追加 pending_super（super_admin 终审待审态）
-- 注意：PG 12+ 允许事务内 ALTER TYPE ADD VALUE（同事务内不得使用新值）；人工检查后执行。
-- 回滚说明：PG 不支持 DROP VALUE，回滚=保留该值不用（§7.3）。
ALTER TYPE adjustment_status ADD VALUE 'pending_super';

-- 调账审批链扩展（PRD §3.1.2 字段表）
ALTER TABLE adjustment_records ADD COLUMN super_reviewed_by integer REFERENCES users(id);
ALTER TABLE adjustment_records ADD COLUMN limit_escalated boolean NOT NULL DEFAULT false;
ALTER TABLE adjustment_records ADD COLUMN escalation_reason varchar(255);
```

**零变更确认**：`recharge_orders`（审批态/审批人/升级标记存 metadata，零迁移）、`user_2fa`/`users`（复用）、`system_config`（finance_rules JSON 键，无 DDL）、`refund_requests`（复用，仅鉴权/2FA 改造）、`customer_balances`/`balance_transactions`。

### 5.2 schema 文件同步

| 文件 | 变更 |
|------|------|
| `api/src/db/schema/adjustment-records.ts` | 枚举追加 `'pending_super'`；`superReviewedBy`/`limitEscalated`/`escalationReason` 列 |
| `api/src/db/schema/credit-limit-events.ts` | 新表定义 + `uq_credit_limit_event` 唯一索引 + 复合索引，re-export 到 `db/schema/index.ts` |

> 遵循 `coding-standards-api-db-test.md §2.3`：migration SQL 提交 Git、人工检查后执行、生产前备份；禁止 db:push。

---

## 6. 测试清单

运行方式：仓库根 `pnpm test`（真实 PG + Redis，风格对齐 `admin-risk-finance.test.ts`：`buildTestApp()` + `app.inject` + 三角色 token + afterAll 清理）。

### 6.1 分级审批（R5，覆盖 PRD E1–E12）

| # | 用例 | 挂载文件 | 验证点 |
|---|------|---------|--------|
| 1 | tier 计算边界 | `api/src/lib/finance-rules.test.ts` | 恰 ¥10,000→1（调增，E1）；10,000.01→2（E2）；恰 ¥100,000→2；100,000.01→3；**调减恰 ¥10,000→2（B1 特例）**；配置缺失/损坏回退默认；`resetFinanceRulesCache` 生效 |
| 2 | 免审判定 | 同上 | 开关关→不命中；开：{赠送/补偿/纠错} 且 ≤¥1,000 且调增→命中；调减/超额/非白名单→不命中（E9） |
| 3 | 人工上账单审（≤1万） | `api/src/routes/admin-manual-topup.test.ts` | 创建（approval_level=1）→ 他人审核 → paid 入账；创建人自审 → 400（E3）；驳回 → failed；>50,000 创建 → 400（B3/E11） |
| 4 | 人工上账双人（>1万） | 同上 | 一审 → 仍 pending + phase='level2_pending' + 列表字段；一审=创建人 400；二审=一审 400（E4）；并发双一审 → 409 仅一次生效（E6）；终态再审批 409（E7） |
| 5 | 充值订单 audit 分级（含终审档） | `api/src/routes/admin-recharge-orders.test.ts`（新） | 用户自助单 >10 万：一审→二审→super 终审→paid（E12）；manual 单自审 400；finance/admin 终审 → 403；super=前两级 400（E5）；reject 任意阶段 → failed |
| 6 | 调账 tier3 + 免审取消 | `api/src/routes/admin-adjust.test.ts` | 调增 ≤1万 默认 pending 待审（B2）；>10万 → pending→pending_level2→pending_super→approved；pending_super 非 super_admin → 403；白名单开启 → 免审直接生效 + 计入累计；调减恰 1 万双人（B1） |
| 7 | 职责分离 + 降级代审（B4） | 同上 | 创建≠一审、一审≠二审、super≠前两级、创建≠驳回；super_admin 自建自审 → 400（无原因）；带 `escalation_reason` → 通过 + 审计 `degraded:true`（E8） |
| 8 | 审批人不足通知 | 同上 | 可审集合为空 → 单据滞留 + notifications 出现 `approval_stalled`（super_admin 收件）+ 审计 |

### 6.2 限额（R6，覆盖 PRD E13–E21）

| # | 用例 | 挂载文件 | 验证点 |
|---|------|---------|--------|
| 9 | 拆分升级（E13 验收） | `api/src/services/billing/credit-limit.test.ts` + admin-*.test.ts | 9×¥9,999：第 1–5 笔单审，第 6 笔起 `limit_escalated=true` + approval_level≥2（累计 59,994>50,000） |
| 10 | 双维度超限 | 同上 | 跨操作人给同一用户累计 >50,000 → 后续笔升级（E14，user 维度合并计数） |
| 11 | 滚动窗口跨日（E15） | 同上 | 构造 23:59 前事件（created_at 可控），00:01 后提交：窗口内仍累计，不按自然日重置；24h 前事件不计 |
| 12 | 并发先到先得（E16） | 同上 | 两笔并发同操作人：advisory lock 串行，后笔按新累计升级/拒绝，无超发 |
| 13 | 驳回/红冲不回退（B19/E17） | 同上 | 调增发起计数 → 驳回 → 计数不变；红冲扣钱方向不回退；红冲加钱方向新增计数 |
| 14 | 调减/充值审核/兑换码不计入（B9/B10） | 同上 | 调减发起、audit 通过、兑换码 redeem 均不产生计数 |
| 15 | exceed_action 切换（E20/B7） | 同上 | escalate（默认）→ 升级；配置 reject → 429 `DAILY_LIMIT_EXCEEDED` 拒绝创建 |
| 16 | 豁免（B8/E19） | 同上 | `exempt_roles` 配置命中角色 → 跳过预检 + 审计 `limit_exempt`；super_admin 默认不豁免 |
| 17 | Redis 降级 | 同上 | Redis 不可用 → 预检回退 PG；ZADD 失败不阻断；Redis 恢复回填 |

### 6.3 操作级 2FA（R7，覆盖 PRD E22–E31）

| # | 用例 | 挂载文件 | 验证点 |
|---|------|---------|--------|
| 18 | 无令牌/无确认拒绝 | `api/src/middleware/require-operation-2fa.test.ts` | 缺 `X-Operation-Token` → 403 `OPERATION_2FA_REQUIRED`；有令牌缺 `X-Operation-Confirm` → 403 `OPERATION_CONFIRM_REQUIRED`（E30）；只读端点不拦截 |
| 19 | 未启用强制（B12/E22） | 同上 | `totp_enabled=false`（policy=mandatory_admin）→ 403 `OPERATION_2FA_NOT_ENABLED` + 引导信息；policy=disabled → 放行 |
| 20 | verify 成功 | `api/src/routes/2fa-operation.test.ts` | TOTP → op_token（expires_in=300）；备用码 → 一次性移除（E24）；用尽提示（E25）；令牌可过中间件注入 `request.opToken` |
| 21 | 共享锁定（B14/E23/E31） | 同上 + `2fa.test.ts` | **登录 verify 与 operation-verify 共享 `2fa:fail:{userId}`**：登录失败 3 次 + 操作失败 2 次 → 第 5 次后两链路均 429 锁 15 分钟；成功重置；锁定期间正确验证码也 429 |
| 22 | 过期/伪造/绕过 | 同上 | 过期令牌 403 `OPERATION_2FA_EXPIRED`（E26）；登录 2fa 令牌当 op 用/他人 userId → 403 `OPERATION_2FA_INVALID`；错误码断言非 401（防前端登出） |
| 23 | 2FA 重置/禁用失效（E27） | 同上 | disable 后递增 revoked seq → 旧 op_token 403；重新启用后新令牌可用 |
| 24 | 全端点挂载回归 | admin-manual-topup/adjust/recharge-orders/refund 测试 | §4.8 清单 11 个写端点逐一拦截；登录链路 2FA 回归 |
| 25 | 退款审核收敛（B16） | `api/src/routes/admin-risk-finance.test.ts` 扩展 | finance 角色 review 退款 → 200（requirePerm('finance.refund')）；无令牌 → 403；approve 后余额/流水不变（复用 addBalance） |
| 26 | 配置端点（B17） | `api/src/routes/admin-finance-rules.test.ts`（新） | GET/PUT `/admin/finance/rules`：admin 可改 large_amount/limits、改 operation_2fa → 403；super_admin 可改全部；保存校验（阈值一致性）+ `resetFinanceRulesCache` 即时生效 + 审计 + 2FA |
| 27 | 前端包装（手工/可选 E2E） | web-console（test-agent 手工项） | 两步弹窗→验证→摘要确认→自动重放；锁定倒计时；未启用引导跳转；403 不触发登出 |

### 6.4 阶段一回归 + 行为变更用例（B2/B20）

| # | 用例 | 说明 |
|---|------|------|
| 28 | **B2 测试更新**：`admin-adjust.test.ts` 原"调增免审批生效"用例改为"调增 ≤1万 → pending 待审"（免审批语义变更，**必须同步修改**，否则阶段一用例失败） | R5 落地必做 |
| 29 | **B20 用户端上限**：`/me/recharge` amount > 1,000,000 → 400；amount=1,000,000 → 201；人工上账 >¥50,000 另按 B3 拒绝 | `recharge.ts` 用户端测试 |
| 30 | 958 全量回归：幂等/兜底/通知/权限矩阵用例保持 | 阶段一契约回归 |

---

## 7. 兼容性、风险与回滚

### 7.1 破坏性变更点清单（与阶段一契约的差异，必须同步发版/更新用例）

| # | 变更点 | 阶段一行为 | R5–R7 行为 | 影响与处理 |
|---|--------|-----------|------------|-----------|
| B1' | 人工上账创建上限 | >50,000 拒绝（A1） | **保持 50,000（B3）**；终审档仅充值订单/调账 | 无前端常量变更；PRD E11 提示文案"大额请走充值订单路径" |
| B2' | 调增 <¥10,000 | 免审批即生效（none 档） | **默认取消免审批**，进入一级审批；白名单免审开关默认关 | **运营流程变化** + 阶段一 `admin-adjust.test.ts`"免审批生效"用例必须更新（§6 用例 28）；前端"免审"文案移除 |
| B3' | review/audit 多阶段响应 | 单审即 `status:'approved'/'paid'` | 双人/终审档一审后 `status` 仍 `pending` + `approval_phase` | **前端依赖新字段 → 前后端同批发布** |
| B4' | 职责分离 | 创建人可自审 | 创建人 ≠ 审批人强制（super_admin 不豁免，B4） | 行为收紧 |
| B5' | 资金写操作 2FA | 无 | 未启用 → 403；缺令牌/确认 → 403 | **上线前置**：管理团队账号启用 2FA；前后端同发；配置 `operation_2fa.policy` 紧急关闭 |
| B6' | 24h 限额（滚动） | 无 | 创建预占；超限升级/拒绝 | 运营超限提示；默认值 50,000（B5/B6） |
| **B20'** | **用户端单笔充值上限** | `recharge.ts MAX_AMOUNT=1,000,000` | **保持 1,000,000（B20）** | 无用户侧上限变更；前端保持 1,000,000 提示；人工上账另受 ¥50,000 单笔上限约束 |
| B7' | 退款审核鉴权 | adminAuth（admin/super_admin） | `requirePerm('finance.refund')`（+finance 角色） | 鉴权放宽（finance 可审退款），预期行为（B16）；前端导航/按钮权限同步（§9 Q8） |

### 7.2 存量数据与兼容性

| 对象 | 结论 |
|------|------|
| 存量 `recharge_orders` pending | **沿用提交时级别（B18）= 旧规则单审**，不重算、不升级；`metadata.approval` 缺失视为单审流程（与旧 review 契约一致） |
| 存量 `recharge_orders` paid/failed 等终态 | 不动；列表新字段返回 null/缺省 |
| 存量 `adjustment_records` 待审单 | 沿用各自 `approval_level`（level1/level2 原流程）；level3/pending_super 仅新单产生 |
| 存量 approved/reversed | 不动；红冲回补已废除（B19 不回退），旧单无计数残留问题 |
| `finance_rules` 既有 `{manual_topup:{max_amount}}` | 兼容：缺 `large_amount`/`limits`/`operation_2fa` 段 → 读取默认值；保存配置时全量写回 |
| 用户端 `/me/recharge-orders`、`/me/balance` | 零改动（分级期间仍显示 pending；`paid` 语义不变）；用户自助充值上限保持 ¥1,000,000（B20） |
| 退款审核 `refund_requests` | 表零改动；鉴权/2FA 叠加 |

### 7.3 风险与回滚

| 风险 | 等级 | 缓解 |
|------|:---:|------|
| 多阶段状态机重复入账/错序 | 高 | §6 用例 4/5/6/12 并发覆盖；phase 守卫 + 0 行 409 回滚；仅最终批准 creditBalance |
| 限额计数与单据不一致 | 高 | PG 权威同事务（advisory lock + UNIQUE 幂等）；Redis 可回填；§6 用例 9–17 |
| 2FA 强制上线运营断操作 | 中 | 上线检查清单（管理员 2FA 启用率 100%）；`operation_2fa.policy='disabled'` 一键回滚 |
| 前端 401 拦截器误登出 | 中 | R7 错误码避开 401（§4.2 红线）；§6 用例 22 断言 |
| B2 免审批取消引发运营投诉 | 中 | 白名单免审开关可开（{赠送,补偿,纠错} ≤¥1,000）；PRD §7.2 FAQ 文案 |
| 人工上账与用户充值上限混淆 | 中 | 前端和 API 明确区分：用户自助充值单笔上限 ¥1,000,000；人工上账单笔上限 ¥50,000，超限走充值订单路径 |
| enum ADD VALUE 迁移异常 | 低 | 人工检查 drizzle SQL（同事务不使用新值） |
| 存量 pending 单在升级后的行为（B18） | 低 | 明确"沿用旧级别"，实现零重算 |

**回滚方案**：

| 层面 | 回滚动作 |
|------|---------|
| 代码（R5） | 还原 `calcApprovalTier` 为旧 `calcApproval`、review/audit 回单步；metadata.approval 字段保留无害 |
| 代码（R6） | 移除创建端点限额预占与 Lua；表保留不启用 |
| 代码（R7） | 移除 `requireOperation2fa` 挂载；或 `operation_2fa.policy='disabled'`（中间件读取，60s 缓存） |
| 代码（B20） | 用户自助充值 `MAX_AMOUNT=1,000,000` 保持不变；人工上账由 `manual_topup.max_amount=50,000` 单独约束 |
| 数据库 0029 | `DROP TABLE credit_limit_events;`（追加反向 migration） |
| 数据库 0030 | PG 无 DROP VALUE → 保留 `pending_super` 不用；新增列可 `DROP COLUMN`（反向 migration） |
| 数据 | 计数表可清空重建（从单据重新回放）；R5/R7 无自动资金变动，回滚窗口无冲正需求 |

---

## 8. 与阶段一遗留（R8/R9/R10）的衔接

| 遗留项 | 衔接设计 |
|--------|---------|
| **R8 platform_ledger** | 写入钩子仍在 `creditBalance`：R5 多阶段不改写入点（入账只在最终批准）；R6 计数（credit_limit_events）与 R8 总账可共事务；`operatorId` 来源在 R5 后更完整（审批链落库） |
| **R9 凭证落库** | `metadata.approval`（审批链）与 A8 `metadata.reviewer_id` 在 R9 引入正式列时合并评估（审批链一列/审批表），避免二次迁移；调账新增的 `super_reviewed_by` 列随 R9 统一 |
| **R10 幂等** | 创建幂等已接；review/audit 多阶段后建议 R10 一并接入（防重放，与 phase 守卫互补）；2FA op_token 与 Idempotency-Key 正交 |
| R11 科目字典 | R5 白名单 `{赠送,补偿,纠错}` 常量+配置承载，R11 切换字典驱动（PRD 差异 7） |
| R12 红冲审批 | 红冲本期保持直接生效（P2-12 不修），已挂 2FA + 限额预占；R12 叠加审批链 |
| R2 收口范围 | 调减/兑换码未走 creditBalance（Q6 裁决）；R6 不覆盖兑换码；R8 统一收口时评估 |

---

## 9. 开放问题清单（B1–B20 裁决后剩余，待双签）

| # | 问题 | 背景 | 默认裁决（可先行实施） | 责任人 |
|---|------|------|------------------------|--------|
| Q1 | 滞留超时主动通知（B15 高成本项） | 台账标记已定；定时扫描通知上级成本高 | **本期仅"标记 + 创建/审批时刻即时通知"**；超时扫描定时任务（通知上级）若排期紧不实现，标注取舍 | 调度-agent |
| Q2 | 管理员强制重置 2FA 端点 | 现状无 `/admin/2fa/reset`（PRD E27 引用 SPEC-§20） | 本期实现 disable 联动失效（revoked seq）；**不新建重置端点**（产品另立 PRD） | 产品-agent |
| Q3 | 风控规则配置页落点 | 新页面 vs 并入风控规则页 | **新增 `AdminFinanceRiskConfigPage`**（pageKey finance-risk-config）；frontend-agent 可并入现有设置页 | frontend-agent |
| Q4 | B20 用户端上限的公告/前端提示节奏 | 已确认用户自助充值上限保持 ¥1,000,000 | 无上限变更；仅需保持现有提示，并在人工上账页面单独展示 ¥50,000 限制 | 已关闭（2026-08-30） |
| Q5 | 退款审核是否计入 R6 限额 | PRD 计数清单未列 | **默认不计入**（用户申报金额，拆分语义不同）；如需计入开放配置 | 产品-agent |
| Q6 | `sys.config` 是否顺带收敛 admin-settings/admin-ops | 现状两文件用 adminAuth | **本期不改既有设置端点**，仅新配置端点用 `requirePerm('sys.config')` | 调度-agent |
| Q7 | 用户端充值上限是否配置化 | B20 已确认保持 ¥1,000,000 | 当前保持既有常量 ¥1,000,000；不与人工上账 ¥50,000 共用配置 | 已关闭（2026-08-30） |
| Q8 | 前端财务导航是否补退款审核入口 | B16 后 finance 可审退款 | 确认 D2 财务导航含退款审核（finance.refund）；若缺补菜单项 | frontend-agent |

---

## 10. 调度双签裁决（B1–B20，权威）

> 主持：调度-agent；参与：product-agent（PRD v1.0）、arch-agent（ARCH v1.1）。**本表为 backend/frontend/test 实现的最终权威契约；与 PRD/ARCH 正文冲突处以本表为准。**

| 项 | 裁决 | ARCH 落地位置 | 与阶段一契约的兼容处理 |
|----|------|--------------|----------------------|
| **B1** | 采纳：调减与调增同档；恰 ¥10,000 仍双人特例保留 | §2.1 `adjustment_decrease_same_tier` + `calcApprovalTier` 特例；§6 用例 1/6 | 调减现状 ≥1 万即二级，同档后 ≤1 万调减降为单审、**恰 1 万保留双人**（不放松）——行为变化写入 §6 用例 1 边界断言 |
| **B2** | 采纳：取消"调增<¥10,000 金额型免审批"（none 档废止）；白名单科目免审开关默认关闭（开启时仅 {赠送,补偿,纠错} 且 ≤¥1,000 免审，计入 24h 累计） | §2.1 `review_exempt` + `isReviewExempt`；§2.2.3 状态机；§3.3 计数范围 | ⚠️ **阶段一 `admin-adjust.test.ts`"调增免审批生效"用例必须同步更新**（§6 用例 28）：免审批语义变更，否则阶段一用例失败；前端"免审·提交即生效"提示移除 |
| **B3** | **终裁（2026-08-30，覆盖历史“放开至 1,000,000”表述）**：人工上账创建上限 **¥50,000**；超过即拒绝，不进入人工上账终审档。大额对公入账走充值订单路径。 | §2.1 `manual_topup.max_amount=50000`；§2.2 状态机；§6 用例 3 | 与 ADR-0001 及 BOSS 人工确认一致；历史 1,000,000 方案标记 superseded |
| **B4** | 采纳：super_admin 不豁免职责分离；审批人不足 → 单据滞留 + 通知 super_admin → 代审（必填降级原因 + 审计标记） | §2.4 矩阵 + §2.5 降级；`escalation_reason` 契约（§2.3.2）；§6 用例 7/8 | 阶段一无此语义，纯新增；super_admin 自建自审由"直接放行"（现状未校验）改为"仅降级代审路径可过"——行为收紧 |
| **B5/B6** | 采纳：操作人、被入账用户 24h 累计限额各 ¥50,000（滚动窗口） | §2.1 `limits.operator_24h/recipient_24h`；§3.1 ZSET 滚动窗口（**取代任务原稿日键方案**） | 阶段一 A2"单日累计本期不设限"由 R6 兑现；滚动窗口跨日语义 §6 用例 11 |
| **B7** | 采纳：超限默认强制升级审批（max(金额档,双人档)），`exceed_action='reject'` 可配置 | §2.1 `limits.exceed_action` + `calcEffectiveTier`；§3.4 时序；§6 用例 15 | 新增；9×¥9,999 第 6 笔起升级（整改方案验收） |
| **B8** | 采纳：super_admin 不豁免限额（默认） | §2.1 `limits.exempt_roles=[]` + `isLimitExempt`；§3.4；§6 用例 16 | 新增；豁免记录写审计 |
| **B9/B10** | ✅ 调减不计入；红冲加钱计入（作新单预占）；充值订单审核（用户自助）不计入任何维度；**驳回/红冲不回退（B19）**，废除 DECRBY 回补 | §3.3 计数范围表；§6 用例 13/14 | 保守风控防"提交-撤销-再提交"循环绕过（PRD B19 建议值）；覆盖调度此前"红冲回补"的过渡裁决 |
| **B11** | 采纳：操作令牌 5 分钟，窗口内同操作者复用 | §4.1/§4.3 `token_ttl_seconds=300`；§6 用例 20/22 | 新增；对齐登录 tempToken 语义 |
| **B12** | 采纳：mandatory_admin 强制（资金角色先启用 2FA）；未启用时返回明确引导错误码 + 前端引导弹窗 | §4.1/§4.4/§4.6 `operation_2fa.policy`；403 `OPERATION_2FA_NOT_ENABLED` + [前往启用] 弹窗；§6 用例 19 | 新增；上线前置 = 管理账号启用率 100%（§7.1 B5'） |
| **B13** | 采纳：备用码允许、一次性 | §4.2 `allow_backup_code=true`；§6 用例 20 | 复用登录一次性消费语义（2fa.ts 已实现） |
| **B14** | 采纳：连续 5 次失败锁 15 分钟，**与登录共享计数** | §4.5 `2fa:fail:{userId}` 共享键；**2fa.ts 登录 verify 接入计数（现状无）**；§6 用例 21 | 登录链路行为变化（登录 2FA 新增锁定）——属安全增强，与 SPEC-§20 登录锁定对齐，标注文档同步 |
| **B15** | 采纳轻量版：台账超时标记 + 滞留通知上级；如实现成本高可仅做标记 | §2.5 超时标记（懒计算）+ 创建/审批时刻通知；**定时扫描取舍标注**（§9 Q1） | 新增；SLA 对齐 ref §7.2.2 |
| **B16** | 采纳：退款审核纳入 R7（通过/驳回需 2FA+二次确认；鉴权收敛 finance.refund） | §4.8 落点 + §1.3 `admin-finance-stats.ts` 改造；前端 `AdminRefundReviewPage.tsx`；§6 用例 25 | 鉴权从 adminAuth 放宽至 finance.refund（+finance 角色可审）——预期行为（PRD 差异 8）；财务导航确认（§9 Q8） |
| **B17** | 采纳：大额/限额配置 → admin/super_admin（并入 sys.config 或新增 finance.rule_config 权限点）；2FA 策略 → 仅 super_admin | §4.8 配置端点 `PUT /admin/finance/rules`（requirePerm('sys.config')，operation_2fa 段 super_admin-only）；§6 用例 26 | `sys.config` 权限点现状存在于权限树但无路由使用，本期 wire 到新端点；**不改既有 admin-settings/admin-ops**（§9 Q6） |
| **B18** | 采纳：按提交时点固化（存量待审单沿用旧级别） | §2.2.2/2.2.3 存量兼容 + §7.2 | 存量 pending 单不重算、不升级（**修正 ARCH v1.0"重算 tier"设计**）；配置变更即时生效于新单 |
| **B19** | 采纳：驳回/红冲不回退累计 | §3.3 计数范围 + §3.4；§6 用例 13 | **废除 ARCH v1.0"红冲回补 DECRBY"设计**（lim_dec.lua 不建）；保守风控防"提交-撤销-再提交"循环 |
| **B20** | **用户自助充值单笔上限保持 ¥1,000,000**；与人工上账上限 ¥50,000 是不同业务对象，不得混同 | `recharge.ts` 用户端保持现状；用户自助充值大额仍按充值订单审批规则处理 | 依据 ADR-0001；历史“用户端与人工上账统一上限”表述 superseded |

---

## 11. 与 PRD 契约对齐说明（PRD-RECT-P1-R5R7-001 承接映射）

> 本表供 backend/frontend/test 核对：PRD 每条规则/状态机/配置/边界在 ARCH 的落点；**标注为"arch 存储裁决"的条目是 ARCH 在 PRD 授予的裁决权内做的存储层选择，业务语义与 PRD 完全一致。**

| PRD 条目 | ARCH 落点 | 对齐结论 |
|---------|-----------|---------|
| §3.1.1 规则 1–3（统一大额规则/判定基数/调减同档+B1 特例） | §2.1 `calcApprovalTier` / §2.2 状态机 | ✅ 对齐 |
| §3.1.1 规则 4（免审批取舍 B2） | §2.1 `review_exempt` / §2.2.3 | ✅ 对齐（阶段一测试更新见 §6 用例 28） |
| §3.1.1 规则 5（职责分离） | §2.4 | ✅ 对齐（B4 降级代审 §2.5） |
| §3.1.1 规则 6/7（状态机/越权与体验） | §2.2 / §2.5 | ✅ 对齐（B15 取舍 §9 Q1） |
| §3.1.1 规则 8/9/10（配置化/B18/审批人落库） | §2.1 / §2.2 存量兼容 / §2.3.4 | ✅ 对齐（审批人落库形态 = arch 裁决：recharge→metadata、adjust→新列） |
| §3.1.2 配置表 `large_amount` | §2.1 | ✅ 键名/默认值逐字段一致 |
| §3.1.2 字段表（status 扩展/审批人/limit_escalated/escalation_reason） | §2.2.1 存储裁决 / §2.3.4 | ⚠️ **唯一存储层差异**：recharge_orders 的 `pending_level2/pending_super` 以 `metadata.approval.phase` 承载（DB status 保持 pending 至 paid），产品语义与验收项完整承接；调账按 PRD 扩展枚举+列 |
| §3.1.3 状态机（三类单据） | §2.2.2 / §2.2.3 | ✅ 语义一致（流转/守卫/终态） |
| §3.2.1 规则 1–10（限额/滚动窗口/超限/豁免/计数范围/固化/文案） | §3.1–§3.5 | ✅ 对齐（存储 = arch 裁决：PG `credit_limit_events` + Redis ZSET；任务原稿日键被 B5/B6 滚动窗口取代） |
| §3.2.2 配置表 `limits` | §2.1 | ✅ 键名/默认值一致 |
| §3.2.3 限额判定流程 | §3.4 | ✅ 先查限额→再定级；2FA 在前（preHandler） |
| §3.3.1 规则 1–11（适用范围/令牌/复用/策略/备用码/锁定/二次确认 AND/重置/审计） | §4.1–§4.8 | ✅ 对齐（令牌形态 = arch 裁决：无状态 JWT + Redis seq/revoked；二次确认 = `X-Operation-Confirm` 头） |
| §3.3.2 配置表 `operation_2fa` | §2.1 | ✅ 键名/默认值一致 |
| §3.3.3 流程 | §4.2/§4.4/§4.7 | ✅ 对齐 |
| §4 权限矩阵 | §2.4 / §4.8 | ✅ 对齐（B16 退款审核、B17 配置权限已并入） |
| §5 边界 E1–E31 | §2/§3/§4 对应条款 + §6 用例 | ✅ 逐一承接（E1–E12→R5 用例 1–8；E13–E21→R6 用例 9–17；E22–E31→R7 用例 18–24） |
| §6 验收清单 | §6 用例表 | ✅ 对齐（含"9×¥9,999 第 6 笔升级"验收映射用例 9） |
| §7/§8 `[?]` 帮助 | §1.3 前端行 + §4.7 | ✅ 数据源 = PRD §7/§8 |
| §9 差异 1–12 | §4（SPEC-§20 修订）、§2.1（ref 统一）、§3（维度差异）、§4.8（退款 B16）、§8 | ✅ 承接；需产品同步修订的文档清单由 product-agent 执行 |
| §10 B1–B20 | §10 双签裁决表 | ✅ 全部采纳并固化 |

---

## 附：实现顺序建议（给 backend-agent / frontend-agent）

1. **地基**：`finance-rules.ts` 扩展（三配置段解析 + 纯函数 + 测试 #1/#2）→ migration 0029/0030 + schema 同步。
2. **R5 状态机**：manual-topup review 多阶段 + 职责分离 + 降级代审 → recharge audit 同构 → adjust tier3/pending_super（测试 #3–#8）。
3. **R6 限额**：`credit-limit.ts` + Lua → 创建预占/判定 → 豁免/回退语义（测试 #9–#17）。
4. **R7 2FA**：jwt 操作令牌 → operation-verify（含共享计数、登录 verify 接入）→ `require-operation-2fa` 中间件（令牌+确认标记）→ 落点清单（含退款审核 B16、配置端点 B17）（测试 #18–#26）。
5. **B3/B20（2026-08-30 修订）**：人工上账 `manual_topup.max_amount=50,000`，超过即拒绝；用户自助充值 `MAX_AMOUNT=1,000,000` 保持不变。两者不得再写成统一上限。
6. **前端**：`operation-2fa.ts` + `Operation2faModal`（两步）→ 四页面（人工上账/调账/充值订单/退款审核）多阶段展示与 2FA 包装 → 风控配置页 → `[?]` 更新。
7. **收尾**：§6 全量用例（含阶段一回归与 B2/B20 变更用例）通过，review-agent 门禁，双签 §9 开放问题。

---

## 附：与 ARCH v1.0 的变更说明（v1.0 → v1.1）

| 变更 | v1.0（任务稿默认） | v1.1（PRD + B1–B20） |
|------|-------------------|---------------------|
| 配置段命名 | `approval`/`limits`(soft/hard) | **PRD 三配置段 `large_amount`/`limits`/`operation_2fa`，键名逐字段对齐** |
| 人工上账创建上限 | 放开至 1,000,000 | **保持 50,000（B3）**；超过即拒绝，终审档不适用于人工上账 |
| 调增免审批 | 取消（默认）+ 白名单备选 | **取消 + 白名单 `{赠送,补偿,纠错} ≤¥1,000` 开关默认关（B2）** |
| 调减分级 | 对称同档（无特例） | **同档 + 恰 ¥10,000 仍双人（B1 特例）** |
| 限额窗口 | 日键 `{yyyymmdd}` | **24h 滚动窗口（B5/B6）**：Redis ZSET 事件集 + PG `credit_limit_events` |
| 计数时点 | 生效时计入 + 红冲回补 | **创建时预占（B18）+ 驳回/红冲不回退（B19）**；`lim_dec.lua` 废除 |
| 审批人不足 | fail-closed 滞留 + super_admin 兜底 | **B4：滞留 + 通知 super_admin + 代审必填原因 + 审计标记**；B15 超时标记 |
| 2FA | 强制策略 + 独立计数 | **B12 mandatory_admin + 与登录共享计数（B14）+ 二次确认标记头（E30）+ 2FA 重置失效（E27）** |
| 范围 | 9 资金端点 | **+退款审核（B16）+ 风控配置保存（B17）**；`sys.config`/`finance.refund` 权限点 wire |
| 用户端上限 | 未涉及 | **B20：MAX_AMOUNT 1,000,000 保持不变；与人工上账 ¥50,000 分开** |
