# 人工上账状态机

- 文档 ID：SM-BILLING-002
- 状态：approved
- 生效版本：v1.0.0
- 上游 ADR：ADR-0001、ADR-0003、ADR-0004、ADR-0009、ADR-0010、ADR-0021
- 对应 PRD：`../../../02-requirements/03-billing-and-finance/manual-topup.md`
- 对应 SPEC：`../../../03-functional-spec/03-billing-and-finance/manual-topup.md`

> **字段表达**（ADR-0021）：数据库持久化与 API 展示使用拆分字段 —— 业务 `status ∈ {pending, paid, rejected, failed}` + 审批阶段 `approval_phase ∈ {none, level1, level2, super, completed}`。本文档保留阶段流转的业务语义（ADR-0003），但不以 `pending_level2` / `pending_super` 作为业务 `status`（旧响应状态，deprecated）。

---

## 1. 状态定义

### 1.1 业务状态 `status`

| 状态 | 含义 | 是否终态 | 用户可见文案 |
|------|------|:---:|------|
| `pending` | 待审核（审批未全部通过，未入账） | 否 | 待处理 |
| `paid` | 已入账（余额已增加 + 资金流水 + 通知） | 是 | 已到账 |
| `rejected` | 已驳回（记录驳回原因，未入账） | 是 | 已驳回 |
| `failed` | 入账异常（未入账、单据关闭） | 是 | 处理失败 |

### 1.2 审批阶段 `approval_phase`

| 阶段 | 含义 | 备注 |
|------|------|------|
| `none` | 无审批要求 | 单人审批通过后直接入账并置 `completed` |
| `level1` | 一级审批已通过 / 等待二级审批 | — |
| `level2` | 二级审批已通过 / 等待入账 | 双人审批第二级 |
| `super` | 终审（super_admin） | 仅充值订单路径可达；人工上账**不进入终审档** |
| `completed` | 审批完成且已入账（`status=paid`） | 终态审批阶段 |

## 2. 转移矩阵

### 2.1 审批分级转迁（依据 ADR-0001 阈值 + ADR-0003 阶段 + ADR-0021 字段）

| 单笔金额区间 | 创建后 | 触发事件 | 阶段流转 | 业务状态 |
|-------------|-------|---------|---------|---------|
| ≤ ¥10,000 | `pending` / `approval_phase=none` | 一级审批通过 | `none → completed` | `pending → paid` |
| > ¥10,000 且 ≤ ¥50,000 | `pending` / `approval_phase=none` | 一级审批通过 | `none → level1` | `pending`（维持） |
| 同上 | `pending` / `level1` | 二级审批通过 | `level1 → level2 → completed` | `pending → paid` |
| > ¥50,000 | **创建即拒绝**（不产生单据） | — | 不进入审批，不进终审档 | — |
| 任一待审批阶段 | `pending` | 驳回 | 阶段记录驳回 | `pending → rejected`（终态） |
| 审批通过待入账 | `pending` / `completed` | 入账异常 | 阶段保持，业务转终态 | `pending → failed`（终态） |

- `super` 阶段：ADR-0001 定义 `>¥100,000` 追加 super_admin 终审；因人工上账单笔上限固定 ¥50,000（超过即拒绝，见 `open-issues.md` 项 13，已解决），`super` 阶段在人工上账业务对象不可达，仅保留语义供充值订单路径复用。

### 2.2 完整转移示意

```
创建（POST /admin/manual-topup，仅管理端；2FA + Idempotency-Key）
  │  （>¥50,000 拒绝创建）
  ▼
pending（status）/ approval_phase=none
  │
  ├── ≤¥10,000 ──(一审通过)──▶ approval_phase=completed ──▶ paid（入账+流水+通知+审计）✅
  ├── >¥10,000≤¥50,000 ──(一审通过)──▶ approval_phase=level1
  │         └──(二审通过)──▶ approval_phase=completed ──▶ paid（入账+流水+通知+审计）✅
  ├──(任一阶段驳回)──▶ rejected（记录驳回原因）✅
  └──(授权通过后入账异常)──▶ failed（未入账、单据关闭）✅
```

## 3. 每转移的副作用

| 转移 | 触发 | 数据库操作（事务内） | 事务提交后（异步/尽力） |
|------|------|---------------------|------------------------|
| 创建 → `pending` | 创建端点 | INSERT `recharge_orders`(`method='manual'`, `status='pending'`, `order_no`=MT 前缀, `amount`, `note`, `metadata.transfer_no/evidence_remark/created_by`)；写审计 `manual_topup.create` | 无 |
| `pending` 一审通过（单人） | 一级审批 approve | 状态条件更新 `pending→paid`；`creditBalance`（兜底建户 + 增额 + 流水）；`approval_phase=completed`；写审计 | Redis 账本同步；清除负余额标记；`notifyUser('recharge_success')` |
| `pending→level1`（一审通过，需二审） | 一级审批 approve | 状态条件更新 `approval_phase=none→level1`，`status` 保持 `pending`；写审计 | 无 |
| `level1` 二审通过 | 二级审批 approve | 状态条件更新 `pending→paid` + `approval_phase=completed`；`creditBalance`；写审计 | 同上通知回执 |
| `pending→rejected` | 驳回（`action=reject`） | 状态条件更新 `pending→rejected`，记录驳回原因与审批人；写审计 | 无（本期驳回不通知） |
| `pending→failed` | 授权通过后入账异常 | 事务回滚后单独置位 `failed`（未入账、单据关闭），记失败原因 | 审计 |

- 所有资金写转移（创建 / 一二级 approve / reject）均需操作级 2FA（ADR-0008）。
- 每个 approve/reject 执行**状态条件更新**（`where status='pending'` 且 `approval_phase` 符合期望），写审计含操作者、`approval_phase`、`request_id`。

## 4. 并发与幂等（ADR-0009）

- 创建：强制 `Idempotency-Key`（Redis L1 锁 + `recharge_orders.idempotency_key` 唯一列 L2 兜底）；相同 Key/摘要回放，不同摘要 `409 IDEMPOTENCY_CONFLICT`；Redis 不可用 `503 IDEMPOTENCY_UNAVAILABLE`。
- 审批/驳回：状态条件更新拦截并发/重复操作，`409 ORDER_ALREADY_PROCESSED`；同 `transfer_no` 重复创建 `409 DUPLICATE_BUSINESS_REFERENCE`。
- 任何转移不得绕过状态守卫：`status` 非 `pending` 或 `approval_phase` 不符 → 拒绝并返回冲突码。
- 建户兜底：`INSERT ... ON CONFLICT (user_id) DO NOTHING`，并发不重复建户；增额依赖行级锁不丢更新。

## 5. 回滚与补偿

- **入账事务失败**：`pending→paid` 与建户/增额/流水在**同一 `db.transaction`** 内，任一失败整体回滚，订单保持 `pending`，无部分入账、无重复通知。
- **终态不可撤销**：`paid` / `rejected` / `failed` 为终态，不可再次流转；`paid` 后不可改为 `rejected`。
- **错误入账补偿**（ADR-0003/0020）：不使用「退款」语义；由 admin/super_admin 走调账/红冲创建**独立反向资金记录**，原单金额不可修改、不可删除；反向记录成功生效后才将原单转 `reversed`（属调账状态机，非本文档）。
- **禁止负余额**：需要扣减余额的纠错/冲销在余额不足时返回受控业务错误，不写入负余额（ADR-0020）。
- **驳回/失败/取消不计回滚 24h 限额**：申请创建成功时即计入 24h 累计（ADR-0013），驳回、失败、取消不回退。

## 6. 审计与通知

- **审计**：创建、approve（各级）、reject、自动建户均写审计日志，含操作者、`status/approval_phase` 变更、`transfer_no`、`request_id`（ADR-0011）；鉴权拒绝不写业务审计。
- **通知**（ADR-0010）：`paid` 入账成功（非失败）才触发 `recharge_success`；资金事务提交成功后写 outbox/event 再异步发送；站内信强制、Email 按偏好；通知状态 `queued/sent/failed/skipped`，可重试/人工补发；失败不回滚资金；重试不产生重复可见通知。通知回执并入审计 `notification` 状态。

## 7. 测试映射

映射到 `03-functional-spec/03-billing-and-finance/manual-topup.md` §9 与 `05-api/admin/manual-topup.md` §8 用例：

| # | 用例 | 状态机验证点 |
|---|------|-------------|
| 1 | 创建成功（201） | 新单据 `status=pending`、`approval_phase=none`、`order_no` MT 前缀、`metadata.transfer_no` 正确；审计有 `manual_topup.create` |
| 2 | 创建参数校验 | ≤0 / 超上限 → 拒绝；`>¥50,000` 拒绝不进终审档；frozen 用户 → 400 |
| 3 | 幂等/唯一 | 同 Key 回放 / 不同摘要 409；同 `transfer_no` `DUPLICATE_BUSINESS_REFERENCE`；仅 1 行落库 |
| 4 | 越权 | finance 200；sales/customer 403 `PERMISSION_DENIED`；未登录 401 |
| 5 | 无余额行兜底 | 无 `customer_balances` 行 → approve → 自动建户 + 余额=amount + 流水；不再 `BALANCE_NOT_FOUND`；并发建户单行 |
| 6 | 审批分级 | ≤¥10,000 一审即 `paid`；>¥10,000≤¥50,000 需二审才 `paid`；创建人=审批人 / 一二级重复 → 拒绝 |
| 7 | 重复审批 | 同单重复 approve → `409 ORDER_ALREADY_PROCESSED`，余额不重复累加 |
| 8 | 2FA | 无/未启用 `OPERATION_2FA_REQUIRED`；错误/过期/重放固定错误码 |
| 9 | 通知 | `paid` 后 `recharge_success` 记录；SMTP 未配置 email=`skipped` 不报错 |
| 10 | 24h 限额 | operator/recipient 维度滚动窗口；`exceed_action` 处置 |
| 11 | 终态与补偿 | `paid/rejected/failed` 不可再流转；错误入账走调账/红冲反向记录，不产生负余额 |
## [?] 页面帮助定位

> 本文档为状态机专章（非 UI 页面），不定义独立页标题或操作按钮的 [?] 帮助；其对应页面（[?] 页面帮助与按钮级帮助对照表）定义于本状态机所属主题  3-functional-spec/03-billing-and-finance 对应 SPEC 的 §[?] 页面帮助章节。

