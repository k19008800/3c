# 充值订单状态机

- 文档 ID：SM-BILLING-001
- 状态：approved
- 生效版本：v1.0.0
- 上游 ADR：ADR-0003、ADR-0001、ADR-0021、ADR-0009、ADR-0010
- 对应 PRD：`../../02-requirements/03-billing-and-finance/recharge.md`
- 对应 SPEC：`../../03-functional-spec/03-billing-and-finance/recharge.md`
- 事实来源：`docs/supplement/03-充值退款状态机.md`、`docs/PRD-整改R1-R4-人工上账与资金入账.md`（§3.1.4）、`docs/ARCH-整改R1-R4-技术方案.md`（§3.5、§4）

## 0. 范围与规范依据

本状态机覆盖**充值主题**下资金单据的生命周期，含有两类业务对象，二者共用同一套入账语义（`pending → … → paid`），但来源与审批流程不同：

1. **用户自助充值订单**（`recharge_orders`，用户端 `POST /me/recharge` 创建，method ∈ `bank_transfer / alipay / wechat / qq`）；
2. **管理员人工上账**（同一 `recharge_orders` 表，`method='manual'`，管理端 `POST /admin/manual-topup` 创建）。

> **权威裁决（ADR-0021）**：业务对象持久化 `status` 只表示资金业务状态 `pending / paid / rejected / failed`；审批阶段单独存字段 `approval_phase ∈ {none, level1, level2, super, completed}`。`pending_level2`、`pending_super` 仅作 **deprecated 旧响应状态标记**，新接口一律使用 `status + approval_phase` 拆分表达。冲突以 ADR-0021 为准。

## 1. 状态定义

### 1.1 持久化业务状态（`status`，唯一业务语义）

| `status` | 含义 | 是否终态 | 用户可见文案 | 说明 |
|---|---|---|---|---|
| `pending` | 已创建、待审核（含各级审批待办） | 否 | 待处理 | 审批阶段由独立 `approval_phase` 表达（见 §1.2） |
| `paid` | 已入账（资金到账） | 是 | 已到账 | 入账成功且资金流水已写 |
| `rejected` | 已驳回 | 是 | 已驳回 | 任一待审核阶段被驳回；不改动余额 |
| `failed` | 入账执行异常 | 是 | 处理失败 | 审核通过但入账事务执行失败、整体回滚后落单为失败 |

> 说明：历史/旧接口曾用 `pending_level2`、`pending_super` 作为状态值编码审批阶段（ADR-0021 背景）。本状态机将其**映射为 `status='pending'` + 相应 `approval_phase`**，不再作为业务状态持久化，符合 ADR-0021 禁新增要求。

### 1.2 审批阶段（`approval_phase`，独立字段）

| `approval_phase` | 含义 | 审批人要求（ADR-0001） |
|---|---|---|
| `none` | 无需审批即可入账 | — |
| `level1` | 待一级审批（单人） | ≤ ¥10,000 由单一审批人完成 |
| `level2` | 待二级审批（双人） | > ¥10,000 且 ≤ ¥100,000 需双人审批（一级 + 二级） |
| `super` | 待终审 | > ¥100,000 追加 `super_admin` 终审 |
| `completed` | 审批完成、已入账 | — |

> 审批人、审批时间、审批结果、审批历史**单独记录**（不入 `status`/`approval_phase` 内），见 §6 审计。管理端响应同时返回 `status`、`approval_phase`、`approval_required`；用户端只暴露 §1.1 的业务状态，不暴露审批阶段。

## 2. 转移矩阵

> 主流转（ADR-0003）：`pending → pending_level2 → pending_super → paid`，按实际审批级别跳过阶段；待审核状态可转 `rejected`；入账异常转 `failed`。`pending_level2/pending_super` 在持久化层即 `status=pending + approval_phase=level2/super`。

| 当前状态 | 事件 | 下一状态 | 触发器 | 依据 |
|---|---|---|---|---|
| `pending` | 一级审批通过且 ≤¥10,000（单人） | `paid` | 审批人 `approve`；`approval_phase level1→completed` | ADR-0001/0003 |
| `pending` | 一级审批通过但 >¥10,000（需双人） | `pending_level2`（`status=pending`, `approval_phase=level2`） | 一级审批人 `approve` | ADR-0001 |
| `pending_level2` | 二级审批通过且 ≤¥100,000 | `paid` | 二级审批人 `approve`；`phase level2→completed` | ADR-0001 |
| `pending_level2` | 二级审批通过但 >¥100,000（追加终审） | `pending_super`（`status=pending`, `approval_phase=super`） | 二级审批人 `approve` | ADR-0001 |
| `pending_super` | 终审通过并入账 | `paid` | `super_admin` `approve`；`phase super→completed` | ADR-0001/0003 |
| `pending` | 驳回 | `rejected` | 任一审批人 `reject`（须填原因） | ADR-0003 |
| `pending_level2` | 驳回 | `rejected` | 审批人 `reject`（须填原因） | ADR-0003 |
| `pending_super` | 驳回 | `rejected` | 审批人 `reject`（须填原因） | ADR-0003 |
| 任一待审核状态 → 审核通过后入账 | 入账事务执行异常 | `failed` | `creditBalance` 事务失败整体回滚 | ADR-0003 |
| `paid` | — | （终态） | — | — |
| `rejected` | — | （终态） | — | — |
| `failed` | — | （终态） | — | — |

**简化状态图（含审批分级，简化 `pending_level2/pending_super` 表达）：**

```
创建（status=pending, approval_phase=none）
  │
  ├─(≤¥10,000 单人)──批准 phase=completed──► paid（入账：余额+流水+通知+审计）  终态
  │
  ├─(>¥10,000&&≤¥100,000 双人)
  │    └─ level1 通过 → phase=level2
  │         └─ level2 通过 → phase=completed → paid  终态
  │
  ├─(>¥100,000 追加 super_admin)
  │    └─ level1 → level2 → phase=super
  │         └─ super 终审通过 → paid  终态
  │
  └─(任一待审核阶段驳回, approval_phase 记驳回阶段) → rejected  终态

paid ──入账事务执行异常整体回滚──► failed （status=failed，终态）
```

> `paid`/`rejected`/`failed` 为终态：禁止再次审核、禁止被动修改（防重复入账由状态条件原子更新拦截，见 §4）。纠错不走"修改原单"，而是走独立反向资金记录（红冲），见 §5。

## 3. 每个转移的副作用

| 转移 | 数据库操作 | 余额/资金 | 缓存/索引 | 通知 / 审计 |
|---|---|---|---|---|
| 创建 → `pending` | INSERT `recharge_orders`（`method='manual'` 时含 `metadata{source,created_by}`、`idempotency_key`；用户自助充值含 `payment_method`、`expires_at`）；生成唯一 `order_no`（管理端 `MT+…`，用户端 `RE+yyyyMMdd+流水`/`recharge_yyyyMMdd_…`） | 不动余额 | — | 写审计 `manual_topup.create` / `recharge.create`；无用户通知 |
| `pending → paid`（一级/二/终审通过） | 同一事务内：① 将单证 `status` 由 `pending` 置 `paid`（`WHERE status='pending'` 原子守卫，防并发重复审核）；② `creditBalance(tx,…)`：无余额行 `INSERT … ON CONFLICT(user_id) DO NOTHING` 兜底建户 → `UPDATE customer_balances SET available_balance+=amount, total_balance+=amount, version+=1 RETURNING balance_after` → `INSERT balance_transactions(type='recharge', balance_after=…)` | 余额增加，资金流水与余额强一致（同事务回滚） | 事务提交后：`adjustLedgerAvailable` 同步 Redis 热账本；余额回正时 `clearNegativeFlag` | 事务提交后触发 `recharge_success` 站内信（必发）+ 按偏好邮件；写审计含 `balance_after`、通知状态 |
| 入账异常 → `failed` | 事务整体回滚（建户/加额/流水全部回滚）；单证落 `status='failed'` | 余额不变（已回滚），无部分入账 | 不同步 | 不触发成功通知；审计记录失败原因 |
| 任一待审核 → `rejected` | 单证 `status='rejected'`；记录驳回原因 `review_note`，审批人 `metadata.reviewer_id` | 不动余额 | — | 写审计；驳回用户通知后续阶段评估（本期不覆盖） |

> 通知时序（ADR-0010）：资金事务**提交成功后**写入 outbox/事件，再异步发送；通知失败不回滚资金事务；资金失败不得产生成功通知；重试不得造成重复可见通知。

## 4. 并发、幂等与状态守卫

- **状态条件原子更新**：审核/入账均以 `WHERE status='pending'` 守卫，重复或并发审核命中 0 行 → 返回 `409 ORDER_ALREADY_PROCESSED`/`CONFLICT`，余额不重复累加。
- **创建幂等（ADR-0009）**：创建类资金操作强制 `Idempotency-Key`（`POST /api/v1/recharge`、`POST /api/v1/admin/manual-topup`）。Key 绑定操作者、方法、canonical 路径、请求摘要；相同 Key/摘要回放首次结果，不同摘要返回 `409 IDEMPOTENCY_CONFLICT`。
  - L1：Redis 加速锁（`acquireIdempotencyLock`/`releaseIdempotencyLock`/`cacheIdempotentResponse`）；相同 Key 且 L2 已有订单 → 回放首次结果 + `X-Idempotent-Replay:true`。
  - L2：`recharge_orders.idempotency_key` 唯一约束（migration 0027）最终兜底；并发双写撞唯一约束 → `409`。
  - Redis 不可用不得静默绕过 → `503 IDEMPOTENCY_UNAVAILABLE`（ADR-0009）；业务唯一约束、事务、状态守卫是最终边界。
- **业务唯一约束**：`order_no` 唯一；用户端 `payment_order_no`（支付渠道订单号）唯一，重复/迟到回调幂等忽略（返回 `200 duplicate notification`）。
- **转账回单唯一**：人工上账 `transfer_no` 填写则平台内唯一，重复创建返回 `DUPLICATE_BUSINESS_REFERENCE`（第一道防重复入账闸）。

## 5. 回滚与补偿

- **不得修改原单金额/状态**：`paid`/`rejected`/`failed` 终态单不可改、不可删（ADR-0003）。
- **人工上账/充值订单纠错不使用退款语义**（ADR-0003、ADR-0020）：通过**红冲**创建独立反向资金记录（`balance_transactions` 反向记录）；反向记录成功生效后原单才可转相关补偿状态。当前版本禁止退款/红冲产生负余额，余额不足的扣减/纠错返回受控业务错误。
- **充值订单退款**（独立于充值入账，见同目录 `refund.md` 状态机）：执行支付渠道原路退款，不同时余额回滚（ADR-0020）。本期充值主题文档不展开退款状态机，仅声明边界。
- **入账事务失败**：建户/加额/流水任一步失败整体回滚，订单保持 `pending`/置 `failed`，不产生部分入账（ADR-0003、ARCH §4.3）。

## 6. 审计与通知

- **站内通知强制发送事件（ADR-0010）**：充值成功、人工上账到账、调账生效、退款完成、红冲完成；Email/SMS/Webhook 等按用户偏好。
- **入账成功通知事件统一为 `recharge_success`**（`notifications.type` 与 `email_templates.name` 同名，与 SPEC-§22 事件表一致；ARCH §12.1 Q4 裁决）。
- **事件字段（ADR-0010）**：event_id、event_type、aggregate、user、amount、currency、occurred_at、idempotency_key。
- **通知状态（ADR-0010）**：`queued/sent/failed/skipped`，支持查询、告警、重试和人工补发。
- **业务审计**：创建写 `manual_topup.create`/`recharge.create`；审核写审批人、审批时间、审批结果、审批历史；入账审计含 `balance_before/after`、`notification` 状态。审批人与历史单独落库，不合并进 `status`/`approval_phase`（ADR-0021）。

## 7. 测试映射

> 已建立真实测试优先级映射（源自 `docs/ARCH-整改R1-R4-技术方案.md` §8 测试清单，见下表）。T-02 已补齐用户自助充值创建幂等的代码与专项回归；支付回调契约/验签/金额核对/重复回调、渠道熔断、三级审批逐级边界、终态不可二次审核及 `approval_phase` 序列化等仍属真实测试映射差额，已登记为 `docs/00-index/open-issues.md` 第 14 项待办，后续随正式契约与测试工程落地回填本表。

| 测试意图 | 真实用例（来源） | 期望结果 |
|---|---|---|
| 创建成功（人工上账） | ARCH §8 用例 1（`admin-manual-topup.test.ts`） | 201；`recharge_orders` method='manual'、status='pending'、order_no 以 `MT` 开头、metadata 正确；审计 `manual_topup.create` 有记录 |
| 创建参数校验 | ARCH §8 用例 2 | amount=0/负数/>上限 → 400 `VALIDATION_ERROR`；缺 note → 400；user_id 不存在 → 404；frozen 用户 → 400 |
| 创建幂等（同 Key 重复） | ARCH §8 用例 3；`api/src/routes/admin-recharge-orders.test.ts` T-02 | 用户自助充值首请求 201；同 Key 同参数回放首次订单并标记 `X-Idempotent-Replay`；同 Key 不同金额返回 409；数据库唯一约束作为兜底。Redis 故障后的真实 L2 演练仍待独立环境 |
| 审核通过–无余额行兜底 | ARCH §8 用例 4 | 用户无 `customer_balances` 行 → approve → 200；余额行自动创建且余额=amount；1 条流水 |
| 审核通过–正常路径/防重复 | ARCH §8 用例 5 | 有余额行 → 余额+amount、流水 balance_after 正确；重复 approve → 409 `ORDER_ALREADY_PROCESSED` |
| 审核通过–通知触发 | ARCH §8 用例 6 | approve 后 `notifications` 表 `recharge_success` 记录；SMTP 未配置 email='skipped' 不报错；audit 含 notification 状态 |
| 越权–权限点 | ARCH §8 用例 7 | finance 创建/审核 → 200；sales → 403 `FORBIDDEN`；customer → 403；未登录 → 401 |
| `creditBalance` 兜底/正常/并发 | ARCH §8 用例 8/9/10（`balance.test.ts`） | 无行建户+增额+流水；有行累加、version+1、流水一条；并发 10 次余额=10×amount 不丢更新；事务回滚时三写全回滚 |
| 审批分级转移 | ARCH §8 用例 11/12（调账/充值审核实现） | 无余额行用户入账自动建户；按审批档位跳过阶段 |
| 权限矩阵 `requirePerm` | ARCH §8 用例 13（`require-perm.test.ts`） | super_admin('*') 全放行；admin 有 topup/adjust；finance 有 topup 无 adjust；无 token 401、错 token 401、无权限 403、有权限放行 |
| 越权–调账 | ARCH §8 用例 14 | finance → 403；admin → 201/200 |

> 上述映射差额（用户自助充值回调幂等、渠道熔断、审批分级逐级边界、终态不可二次审核的独立测试、`approval_phase` 序列化正确性等）已登记 `docs/00-index/open-issues.md` 第 14 项，随后续正式测试工程建立并回填本表。

## 8. 数据模型要点

- 复用 `recharge_orders` 表承载人工上账（`method='manual'`），不新建表（ARCH §3.1 裁决）。
- 仅新增列：`idempotency_key varchar(100)` + 唯一索引 `uq_recharge_orders_idempotency_key`（migration 0027）。存量行该列为 `NULL`（PG 唯一索引允许多个 NULL，无需回填）。
- `balance_transactions.amount` 内部精度 `numeric(18,8)`；`recharge_orders.amount` 为 `numeric(18,2)` 元（输入最多 2 位小数，ADR-0002）。
## [?] 页面帮助定位

> 本文档为状态机专章（非 UI 页面），不定义独立页标题或操作按钮的 [?] 帮助；其对应页面（[?] 页面帮助与按钮级帮助对照表）定义于本状态机所属主题  3-functional-spec/03-billing-and-finance 对应 SPEC 的 §[?] 页面帮助章节。

