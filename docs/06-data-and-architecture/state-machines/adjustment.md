# 调账状态机

- 文档 ID：SM-BILLING-003
- 状态：approved
- 生效版本：v1.0.0
- 上游 ADR：ADR-0001、ADR-0002、ADR-0003、ADR-0008、ADR-0009、ADR-0010、ADR-0013、ADR-0021、ADR-0022
- 对应 PRD：`../../../02-requirements/03-billing-and-finance/balance-adjustment.md`
- 对应 SPEC：`../../../03-functional-spec/03-billing-and-finance/balance-adjustment.md`
- 事实来源：`docs/PRD-整改R5-R7-资金风控.md`（§4/§5）、`docs/ARCH-整改R5-R7-资金风控.md`、`docs/balance-adjustment.md`（PRD §4）

## 0. 范围与规范依据

本状态机覆盖**调账**（管理员对用户余额人工调整，含调增/调减/红冲）资金单据的生命周期。审批档位按**入账金额**统一分级（R5），并结合 24h 累计限额（R6）升级、操作级 2FA（R7）把关；生效后错误的调账通过**红冲**建立独立反向资金记录纠错（不使用"退款"语义）。

> **权威裁决（ADR-0021 语义 + 调账扩展）**：充值/人工上账采用 `status + approval_phase` 拆分表达；调账在状态机层面保留 `pending_level2` / `pending_super` 作为审批链环节表达，并落列 `super_reviewed_by`（终审人）。响应层是否序列化为 `approval_phase` 与 get_block 见调账 SPEC §状态机；状态流转的**原子守卫**语义与充值一致（仅当前环节状态可流转）。

## 1. 状态定义

### 1.1 业务状态（`status`）

| `status` | 含义 | 是否终态 | 用户可见文案 | 说明 |
|---|---|---|---|---|
| `pending` | 已创建、待一级审批（或免审判定） | 否 | 待处理 | 审批链首环节；免审开关命中且符合条件的单可跳过直接生效（见 §2） |
| `pending_level2` | 待二级审批（双人档或终审档的二级复核环节） | 否 | 审核中 | 双人档 / 终审档经过一级后进入 |
| `pending_super` | 待 `super_admin` 终审（终审档 >¥100,000） | 否 | 审核中 | 双人档之后、终审之前 |
| `approved` | 调账已生效（余额已入账/扣减） | 否（可红冲） | 已生效 | 余额写流水 + 通知 + 审计；**非终态**，可直接红冲转 `reversed` |
| `rejected` | 已驳回 | 是 | 已驳回 | 任一审批环节驳回；不改余额 |
| `failed` | 执行失败 | 是 | 处理失败 | 生效入账事务执行失败、整体回滚后落为失败 |
| `reversed` | 已红冲 | 是 | 已冲正 | 独立反向资金记录生效后原单转该状态 |

### 1.2 审批档位（`approval_tier`，独立字段）

| 档位 | 金额区间（调增基准金额） | 审批链 | 依据 |
|---|---|---|---|
| `exempt` | 白名单科目免审命中（赠送/补偿/纠错 且 ≤¥1,000 且调增方向）且开关开启 | 无需审批，提交即生效（计入 24h 累计） | R5-B2 |
| `tier1` | ≤ ¥10,000（调减恰为 ¥10,000 仍 tier2） | 单审：一级审批人 approve | ADR-0001 / R5-B1 |
| `tier2` | > ¥10,000 且 ≤ ¥100,000 | 双人：一级 → 二级 | ADR-0001 |
| `tier3` | > ¥100,000 | 三人：一级 → 二级 → `super_admin` 终审 | ADR-0001 |

> 24h 累计限额超限（ADR-0013/AD-0022）：`exceed_action=escalate` 时，本笔审批级别 = `max(金额档, 双人档)`（不自动升终审）；`exceed_action=reject` 时直接拒绝，不创建单据。优先级：单笔上限 → 24h 限额 → 金额审批档（PRD §3.4）。

## 2. 转移矩阵

> 主流转（ADR-0003 + R5 tier3）：`pending → pending_level2 → pending_super → approved`，按审批档位跳过阶段；待审核状态可转 `rejected`；生效后可通过红冲转 `reversed`；入账执行异常转 `failed`。

| 当前状态 | 事件 | 下一状态 | 触发器 | 依据 |
|---|---|---|---|---|
| （无） | 发起（白名单免审命中且开关开启） | `approved` | 免费提交即生效；写 24h 累计 | R5-B2 |
| （无） | 发起（tier1 单审） | `pending` | 申请人提交；金额 ≤¥10,000（调增） | ADR-0001 |
| `pending` | 一级审批通过（tier1） | `approved` | 一级审批人 `approve`；职责分离校验通过 | ADR-0001 |
| `pending` | 一级审批通过（tier2/tier3，需继续） | `pending_level2` | 一级审批人 `approve` | ADR-0001 |
| `pending_level2` | 二级审批通过（tier2） | `approved` | 二级复核人 `approve`（≠一级） | ADR-0001 |
| `pending_level2` | 二级审批通过（tier3，需终审） | `pending_super` | 二级复核人 `approve` | ADR-0001 |
| `pending_super` | 终审通过 | `approved` | `super_admin` `approve`（≠创建人/前两级） | ADR-0001 |
| `pending` / `pending_level2` / `pending_super` | 驳回 | `rejected` | 任一审批人 `reject`（必填原因） | ADR-0003 |
| `pending` / `pending_level2` / `pending_super` | 生效入账执行异常 | `failed` | `applyAdjustment` 事务失败整体回滚 | ADR-0003 |
| `approved` | 红冲（发起） | → 红冲单据走独立状态机（本单保持 `approved` 直至反向生效） | 红冲发起人创建独立反向记录 | ADR-0003/0020 |
| `approved` | 红冲反向记录生效 | `reversed` | 独立反向资金记录成功后原单置 `reversed`（=红冲） | ADR-0003/0020 |
| `rejected` / `failed` / `reversed` | — | （终态） | — | — |

**简化状态图：**

```
发起（定级：金额档 + 24h 限额升级；免审取消除非白名单命中）
  ├─ 白名单免审命中(开关开) → approved（提交即生效，计入 24h 累计）
  ├─ tier1（≤¥10,000）:     pending ──一级通过──► approved
  ├─ tier2（>¥10,000）:     pending ──一级──► pending_level2 ──二级通过──► approved
  ├─ tier3（>¥100,000）:    pending ──一级──► pending_level2 ──二级──► pending_super ──super_admin 通过──► approved
  ├─ 任一步驳回 → rejected（不改余额）
  └─ approved ──红冲(reverse, 独立反向记录生效)──► reversed

approved ──生效入账事务执行异常整体回滚──► failed（终态）
```

> `rejected`/`failed`/`reversed` 为终态：禁止再次审批、禁止被动修改（防重复入账由状态条件原子更新拦截，见 §4）。纠错不走"修改原单"，而是红冲建立独立反向资金记录（§5）。

## 3. 每个转移的副作用

| 转移 | 数据库操作 | 余额/资金 | 限额/审计 | 通知 |
|---|---|---|---|---|
| 创建 → `pending` / `approved`(免审) | INSERT（含 `adjustment_no`、方向、金额、科目 `ledger_code`、原因、`approval_tier`、`idempotency_key`、`super_reviewed_by=NULL`）；写入 `credit_limit_events` 预占限额 | 免审档：事务内直接入账；否则不动余额 | R6 限额预占（含本笔判定），写审计 `adjustment.create` | 调增生效时站内信必发；调减通知文化后续 |
| `pending → approved`（tier1 / 白名单） | 同一事务：① `status` 由 `pending` 置 `approved`（`WHERE status='pending'` 原子守卫）；② 调增 `creditBalance` / 调减 `debitBalance`（建户兜底 + 余额变更 + `balance_transactions`） | 余额增减，流水强一致（同事务回滚） | 审计含操作者、direction、amount、`balance_after` | `adjustment_applied` 站内信（ADR-0010 outbox） |
| `pending_level2 → pending_level2` / `pending` → `pending_level2` | 审批链进度更新；审批人/时间/结果落库 | 不动余额 | 审计审批环节、`OPERATION_2FA_OK` 校验 | — |
| `pending_super → approved` | 同"→approved"，记录 `super_reviewed_by` | 余额入账/扣减 | 审计终审人 | 同上 |
| 任一步 → `rejected` | 单证置 `rejected`；记录 `review_note`、审批人 | 不动余额；限额预占已计入、不回退 | 审计 | 驳回用户通知评估 |
| 任一待审 → `failed` | 事务整体回滚（建户/入账/流水全回滚）；单据置 `failed` | 余额不变（已回滚） | 审计失败原因 | 不触发成功通知 |
| `approved → reversed` | 生成独立反向记录（`balance_transactions` 反向）；反向记录成功生效后原单置 `reversed` | 反向扣减/加回，禁负 | 审计红冲发起人/审批人 | 红冲生效通知 |

> 通知时序（ADR-0010）：资金事务**提交成功后**写 outbox，再异步发送；通知失败不回滚资金事务；资金失败不得产生成功通知；重试不得造成重复可见通知。

## 4. 并发、幂等与状态守卫

- **状态条件原子更新**：审批/入账均以 `WHERE status='<当前环节>'` 守卫；重复或并发审批命中 0 行 → 返回 `409 ORDER_ALREADY_PROCESSED`，不重复入账/扣减。仅当前环节状态可流转（阶段一 P1-2 修复语义）。
- **职责分离与守卫（ADR-0004/R5）**：申请人 ≠ 任何审批人；一级 ≠ 二级；`super_admin` 终审 ≠ 前两级；`super_admin` 不豁免"创建 ≠ 审批"（自建自审仅走降级代审路径）；`super_admin` 代审必填 `escalation_reason`（审计标记 `degraded:true`）。
- **幂等（ADR-0009）**：创建类操作强制 `Idempotency-Key`（`POST /api/v1/admin/adjust`）；审批、红冲纳入统一幂等规范并做状态条件更新。相同 Key/摘要回放首次结果；不同摘要 `409 IDEMPOTENCY_CONFLICT`；`adjustment_no` 业务唯一约束最终兜底；Redis 仅作加速锁，不可用返回 `503 IDEMPOTENCY_UNAVAILABLE`，不得静默绕过。
- **限额原子化（ADR-0013/R6）**：`credit_limit_events` + advisory lock 串行化同维度（操作人 / 被入账用户），UNIQUE 幂等；Redis ZSET 热路径、PG 权威。驳回/红冲不回退累计（B19）。

## 5. 回滚与补偿

- **不得修改/删除原单**：`rejected`/`failed`/`reversed` 终态单不可改、不可删（ADR-0003）。
- **错误调账用红冲纠错**（ADR-0003/0020）：不删除原记录，通过红冲创建**独立反向资金记录**；反向记录成功生效后原单转 `reversed`；反向记录本身作为新单据按自身金额**重新定级**审批。
- **禁止负余额**（ADR-0020）：调减/扣减/红冲在余额不足时返回受控业务错误（`INSUFFICIENT_BALANCE`），不写负余额；不引入平台垫付账户。
- **入账事务失败整体回滚**：建户/加额或扣减/流水任一步失败整体回滚，单保持审批态或置 `failed`，不产生部分入账。

## 6. 审计与通知

- **强制站内通知（ADR-0010）**：调账生效（调增）→ 站内信必发（`adjustment_applied`）；调减/扣减通知后续定义。通知失败不回滚资金事务；状态 `queued/sent/failed/skipped`。
- **业务审计**：所有调账写操作写审计：发起、每次审批环节、驳回、红冲——含操作者、操作类型、结果、IP；操作级 2FA 校验成功/失败/锁定/令牌签发写审计；降级代审标记 `degraded:true`；限额豁免标记 `limit_exempt`（B8）。
- **对账（ADR-0012 + supplement/02）**：调账/红冲不写入 `platform_ledger`；余额对账恒等式含 `adjust_amount` 作为输入之一。

## 7. 测试映射

> 测试意图映射源自 `docs/PRD-整改R5-R7-资金风控.md` §6 验收清单与 `docs/ARCH-整改R5-R7-资金风控.md` §8 测试；"待建真实映射"项随正式测试工程落地补充。

| 测试意图 | 期望结果 | 来源 |
|---|---|---|
| 调账单笔上限 ¥50,000 | >¥50,000 创建拒绝；大额走充值订单或拆分提示 | ADR-0001 / PRD E11 |
| tier 分级审批 | ≤¥10,000 单审生效；>¥10,000 走 grade2；>¥100,000 走 grade3 终审 | ADR-0001 / PRD E1/E2/E12 |
| 调减恰为 ¥10,000 | 仍双人档（不放松） | R5-B1 / PRD E1 |
| 白名单免审 | 开关默认关闭；命中且 ≤¥1,000 → approved 提交即生效；计入 24h 累计 | R5-B2 / PRD E9 |
| 职责分离 | 申请人自审、一级=二级、终审=前级均拒绝 | PRD E3/E4/E5 |
| 24h 限额双维度 | 操作人/用户 24h 累计默认 ¥50,000；9×¥9,999 第 6 笔起强制升级双人 | ADR-0013 / PRD E13 |
| exceed_action=reject | 超限提交返回 429 `DAILY_LIMIT_EXCEEDED` | ADR-0022 / PRD E20 |
| 操作级 2FA + 二次确认 AND | 任一缺失后端拒绝；420 `OPERATION_2FA_*`；5 次失败锁定 15 分钟 | ADR-0008 / PRD E22-E31 |
| 幂等/重复审批 | 同 Key 重放回首次；重复/并发审批 409 `ORDER_ALREADY_PROCESSED` | ADR-0009 / PRD E6 |
| 红冲 → reversed | 反向记录生效后原单 `reversed`；反向单重新定级 | ADR-0003/0020 |

## 8. 数据模型要点

- 复用调账单据承载调增/调减/红冲语义；`approved` 表示已生效（非终态）。
- 新增列：`super_reviewed_by`（终审人）、`approval_tier`、`ledger_code`（会计科目）、`idempotency_key`（唯一，migration 补齐）、`escalation_reason`（super_admin 代审必填）；`credit_limit_events` 承载 24h 限额计数。
- 金额精度：调账输入 ≤2 位小数（元）；余额内部 `numeric(18,8)`（ADR-0002）。
## [?] 页面帮助定位

> 本文档为状态机专章（非 UI 页面），不定义独立页标题或操作按钮的 [?] 帮助；其对应页面（[?] 页面帮助与按钮级帮助对照表）定义于本状态机所属主题  3-functional-spec/03-billing-and-finance 对应 SPEC 的 §[?] 页面帮助章节。

