# 核心资金 SPEC 总览

- 文档 ID：SPEC-BILLING-000
- 状态：approved
- 生效版本：v1.0.0
- 对应 PRD：`02-requirements/03-billing-and-finance/finance-overview.md`
- 上游 ADR：ADR-0001–0004、0006、0008–0013、0020–0024、0029；ADR-0018（文档集）
- 定位：第一批核心资金功能规格（SPEC）**跨主题总览**；汇总跨主题公共流程、通用验收门禁与一致性约束，**不重复定义各主题具体契约**（具体契约见各主题 SPEC §1–§9 与 `finance-overview.md`）

> **关系**：本文件与 [README.md](README.md)（目录索引）互补。README 是 5 个主题 SPEC 的文件索引；本文件是跨主题的**公共流程/验收门禁/一致性**汇总。事实均来自各主题已 `approved` SPEC 与对应 PRD/状态机，不新增虚构契约。

## 1. 追踪链

`PRD → SPEC → 状态机 → 权限 → API → 数据库 → TEST → OPS`（completeness-checklist 可追溯链，ADR-0016/0018）。

```
02-requirements/03-billing-and-finance/*.md  ──►  03-functional-spec/03-billing-and-finance/*.md
                                                        │
              05-api/* ◄────────── SPEC §API ──► 06-data-and-architecture/state-machines/*.md
              07-quality-and-acceptance/release-baseline.md ◄── SPEC §验收标准（ADR-0029）
              08-operations-and-deployment/* ◄── 迁移/部署/运维
```

## 2. 跨主题公共流程

### 2.1 资金入账流程（`creditBalance`，统一收口）

三个加钱方向（人工上账审核通过 / 调账调增 / 充值审核通过）统一收口到同一 `creditBalance(tx, …)`（人工上账 SPEC §7.1、充值状态机 §3）：

1. 状态条件更新单证（`WHERE status='<当前环节>'` 守卫，防并发重复）；
2. 无 `customer_balances` 行 → `INSERT … ON CONFLICT(user_id) DO NOTHING` 自动建户（幂等兜底）；
3. `UPDATE customer_balances SET available_balance+=amount, total_balance+=amount, version+=1 … RETURNING balance_after`（行级锁不丢更新）；
4. `INSERT balance_transactions(type='recharge', balance_after=…)`（流水与余额同事务强一致）；
5. 同一事务更新单证/审批阶段/审计；
6. 事务提交后：Redis 账本增量同步 → 通知（outbox，事务后异步）。任一失败整体回滚，不产生部分入账。

### 2.2 分级审批流程（ADR-0001/0004/0021）

- 阈值：≤¥10,000 单人；>¥10,000 且 ≤¥100,000 双人；>¥100,000 `super_admin` 终审。业务 `status` 与审批阶段 `approval_phase` 分离（ADR-0021，`pending_level2/pending_super` deprecated）。
- 调账在枚举内扩展 `pending_super`（状态机调整文档）；充值/人工上账用 `metadata.approval.phase`（状态机 recharge-order）。
- 职责分离强制：创建人≠审批人、一级≠二级、终审≠前级；`super_admin` 不豁免。

### 2.3 通知流程（ADR-0010）

- 强制站内事件：充值成功、人工上账到账、调账生效、退款完成、红冲完成（统一 `recharge_success` 入账事件）。
- 资金事务提交成功后才写 outbox/事件，异步发送；通知失败不回滚资金事务；资金失败不产生成功通知；重试不产生重复可见通知。状态 `queued/sent/failed/skipped`。

### 2.4 幂等流程（ADR-0009）

- 创建类端点（`POST /api/v1/recharge`、`admin/manual-topup`、`admin/adjust`）强制 `Idempotency-Key`；审批/红冲/退款执行纳入统一幂等规范 + 状态条件更新。
- Key 绑定操作者/方法/canonical 路径/请求摘要；同 Key 同摘要回放，异摘要 `409 IDEMPOTENCY_CONFLICT`；Redis 仅加速，DB 唯一约束/事务/状态守卫为最终边界；Redis 不可用 `503 IDEMPOTENCY_UNAVAILABLE`（不静默绕过）。

### 2.5 请求/响应流程（ADR-0011）

- 成功：`{ code:0, message:"ok", data, request_id }`；列表 `items/page/page_size/total`。
- 错误：`{ code, message, details, request_id }`，不返回业务 `data`；`request_id` 写入日志、审计和响应。
- 资金写端点错误响应不使用 `401`（避免前端 axios 401 全局拦截误登出），用 `403/429`。

## 3. 通用验收门禁

> 以下为跨主题的**公共验收门禁**（completeness-checklist 与 PRODUCT-DESIGN-PRINCIPLES）；各主题详细验收标准见对应 SPEC §验收标准。

| # | 门禁 | 校验内容 | 依据 |
|---|---|---|---|
| G1 | **approved 准入** | SPE/SPEC/接口均为 `approved`，状态机为 `approved`，ADR 为 `accepted`；任一为 draft → 不通过 | completeness-checklist #1 |
| G2 | **可追溯链完整** | PRD→SPEC→状态机→权限→API→数据→TEST→OPS 每环节存在且引用正确 | ADR-0016 |
| G3 | **金额一致性** | 单笔上限/审批阈值/24h 限额/精度在 PRD/SPEC/状态机/数据字典四处一致 | ADR-0001/0002 |
| G4 | **状态一致性** | `status`/`approval_phase` 枚举、终态规则在状态机/API/数据字典一致 | ADR-0021/0003 |
| G5 | **错误码一致性** | `PERMISSION_DENIED`/`ORDER_ALREADY_PROCESSED`/`DUPLICATE_BUSINESS_REFERENCE`/`IDEMPOTENCY_*`/`CYCLE_ALREADY_CLOSED` 等在 API/SPEC 一致 | ADR-0011 |
| G6 | **`[?]` 帮助** | 每主题 SPEC 含定制 `[?] 页面帮助与按钮级帮助对照表`；页面标题旁与每个按钮旁均有 `[?]` | PRODUCT-DESIGN-PRINCIPLES P1 |
| G7 | **安全闸** | 分级审批 + 职责分离、24h 限额、操作级 2FA + 二次确认、幂等 + 状态守卫、禁负余额生效 | ADR-0001/0004/0008/0009/0013/0020 |
| G8 | **可验收基线** | 验收证据归属唯一发布基线文件（不参考历史 1159/1132/808 数字） | ADR-0029 |

### 3.1 `[?]` 页面/按钮帮助对照汇总（锚点）

各主题详细 `[?]` 对照表在本目录对应 SPEC 章节，开发/验收时逐表落地：

| 主题 | SPEC 章节 | 页面帮助 pageKey 示例 | 按钮级覆盖 |
|---|---|---|---|
| 充值 | [recharge.md §8](recharge.md) | 用户充值中心 / 人工上账页 | 当前余额、金额、支付方式、确认充值、审核等 |
| 人工上账 | [manual-topup.md §8](manual-topup.md) | `finance-manual-topup` | 发起上账、用户搜索、审核、驳回、重置表单等 |
| 调账 | [balance-adjustment.md §8](balance-adjustment.md) | `finance-adjust`、`finance-risk-config` | 发起调账、审核/复核/终审、驳回、红冲、2FA 验证、确认执行等 |
| 退款/红冲 | [refund-and-reversal.md §9](refund-and-reversal.md) | 退款与红冲管理 | 发起退款、初审/复审/终审、驳回、执行、重试、红冲、作废、详情 |
| 结算/对账 | [settlement-and-reconciliation.md §9](settlement-and-reconciliation.md) | 对账管理、结算管理 | 运行对账、处理差异、创建结算周期、调整金额、确认结算等 |

## 4. 跨主题一致性约束（四处一致）

金额、状态、错误码三类**跨文档四处一致**（PRD / SPEC / 状态机 / API 或数据字典）；不一致处标 `DOC_CODE_GAP` 并回填。

1. **金额**：单笔上限（自助充值 ¥1,000,000、人工上账/调账 ¥50,000）、审批阈值（≤1 万单审 / >1 万双人 / >10 万终审）、24h 限额（默认 ¥50,000）、精度（输入 ≤2 位小数、内部 `numeric(18,8)`、佣金 `numeric(18,4)`、报告 `numeric(18,6)`、本期 CNY）在 PRD/SPEC/状态机/数据字典一致。
2. **状态**：业务 `status` 与审批阶段 `approval_phase` 拆分表达（ADR-0021）；`pending_level2/pending_super` 不作业务 `status`；退款 `pending→approved→processing→completed`、调账 `…→approved/reversed`、结算 `open→closed→settled` 终态规则在状态机/API/数据字典一致。
3. **错误码**：核心资金错误码（§4.2 下表）在 API 契约与各 SPEC §错误码一致。

### 核心资金错误码（一致性基线）

| 错误码 | HTTP | 场景 |
|---|---|---:|
| `VALIDATION_ERROR` | 400 | 参数/业务校验失败 |
| `PERMISSION_DENIED` | 403 | 越权/无权限点 |
| `OPERATION_2FA_REQUIRED`（及 INVALID/EXPIRED/NOT_ENABLED/LOCKED） | 403/429 | 操作级 2FA 相关 |
| `OPERATION_CONFIRM_REQUIRED` | 403 | 缺二次确认 |
| `INSUFFICIENT_BALANCE` | 422 | 余额不足（禁负） |
| `BALANCE_NOT_FOUND` | 404 | 余额账户缺失 |
| `ORDER_ALREADY_PROCESSED` | 409 | 单据已处理 |
| `DUPLICATE_BUSINESS_REFERENCE` | 409 | 业务凭证重复 |
| `IDEMPOTENCY_CONFLICT` | 409 | 同 Key 异摘要 |
| `CYCLE_ALREADY_CLOSED` | 409 | 结算重复关账 |
| `SETTLEMENT_AMOUNT_NEGATIVE` | 400 | 调整后金额为负 |
| `DAILY_LIMIT_EXCEEDED` | 429 | 24h 限额超限（reject） |
| `IDEMPOTENCY_UNAVAILABLE` | 503 | 幂等基础设施不可用 |

## 5. 未决事项

- 跨主题公共项引用 `docs/00-index/open-issues.md`（项 11 等）；各主题 `【待人工裁决】` 项以对应 PRD/SPEC §未决事项为准。
- 一致性门槛：新增/修订任一主题契约时，须同步核对本文件 §4 的一致性基线；不一致标 `DOC_CODE_GAP`。