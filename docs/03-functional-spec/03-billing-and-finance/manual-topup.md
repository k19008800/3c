# 核心资金 SPEC：人工上账

- 文档 ID：SPEC-BILLING-002
- 状态：review
- 生效版本：v1.0.0
- 对应 PRD：`../../../../02-requirements/03-billing-and-finance/manual-topup.md`
- 对应状态机：`../../../../06-data-and-architecture/state-machines/manual-topup.md`
- 上游 ADR：ADR-0001、ADR-0002、ADR-0003、ADR-0004、ADR-0008、ADR-0009、ADR-0010、ADR-0011、ADR-0013、ADR-0021、ADR-0022
- API 契约：`../../../05-api/admin/manual-topup.md`

> **定位**：本文档是人工上账的系统功能规格，以 PRD 与状态机为业务事实，字段/校验/API/事务本文件为准，可直接供前端与后端实现与验收。ALL 契约符合 ADR-0011（API 响应与错误码）与 ADR-0002（精度）。

---

## 1. 页面与路由

| 页面 | 路由 | 入口 | 权限 |
|------|------|------|------|
| 人工上账（列表 + 发起 + 审核） | `/admin/finance/manual-topup` | 管理后台 → 财务 → 人工上账 | `finance.topup` |

- 页面落点：`AdminManualRechargePage`（现状含列表 + 审核；新增「发起上账」入口）。
- finance 角色本期渲染最小「财务导航」，菜单项按 `usePerm` 过滤（人工上账 / 充值订单 / 退款审核 / 发票审核 / 对账报表 / 客户列表）；admin / super_admin 保持全量导航。
- 页面标题右侧必须有 `[?]` 页面帮助（`pageKey=finance-manual-topup`）；每个操作按钮旁必须有 `[?]` 按钮级帮助（见 §8 对照表）。

## 2. 角色与权限

| 权限点 | finance | admin | super_admin | agent/sales/customer | 覆盖端点 |
|--------|:---:|:---:|:---:|:---:|----------|
| `finance.topup` | ✅ | ✅ | ✅ | ❌ | `GET/POST /api/v1/admin/manual-topup`、`POST /api/v1/admin/manual-topup/:id/review`、`GET /api/v1/admin/manual-topup/users` |
| `finance.adjust` | ❌ | ✅ | ✅ | ❌ | 调账端点（非本文档 topic） |

- 鉴权：后端 `requirePerm('finance.topup')`（JWT 登录校验 + 权限点校验）；无权限 `403 PERMISSION_DENIED`（ADR-0004/0011）。
- 职责分离（ADR-0004）：创建人≠审批人、一级审批人≠二级审批人；`finance` 可创建并可审核人工上账，但创建人不得审批本人单据。
- 前端只控制入口显隐（`usePerm`），不得替代后端校验。

## 3. 字段与校验

### 3.1 创建请求字段

| 字段 | 类型 | 必填 | 校验 | 落库 |
|------|------|:---:|------|------|
| `user_id` | integer | ✅ | 正整数；用户存在（不存在 `404 NOT_FOUND`）；状态 `active`（`frozen` → `400 VALIDATION_ERROR`） | `recharge_orders.user_id` |
| `amount` | number | ✅ | `> 0` 且 `≤ MANUAL_TOPUP_MAX_AMOUNT（默认 ¥50,000）`；最多 2 位小数 | `recharge_orders.amount`(`numeric(18,2)`) |
| `note` | string | ✅ | 非空（trim 后）、≤500 字 | `recharge_orders.note` |
| `transfer_no` | string | 可选 | ≤100；填写则全平台唯一（重复 `409 DUPLICATE_BUSINESS_REFERENCE`） | `recharge_orders.metadata.transfer_no` |
| `evidence_remark` | string | 可选 | ≤500 | `recharge_orders.metadata.evidence_remark` |
| `evidence_url` | — | — | 本版本不接受（`R9` 未落地）；传入即 `400 ` | — |
| `topup_type` | enum | 可选 | `bank_transfer` / `grant`，仅驱动表单校验，不强制落库（【待人工裁决】是否落库） | — |

- 精度依据 ADR-0002：金额输入最多 2 位小数（元/分）；内部余额/流水 `numeric(18,8)`；禁止 `Number` 作为最终计算依据。
- 单笔上限依据 ADR-0001：manual-topup 固定 ¥50,000（超限拒绝，**不进终审档**）；用户自助充值 ¥1,000,000 为独立业务对象，不混同。

### 3.2 审批请求字段（`/:id/review`）

| 字段 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| `action` | enum | ✅ | `approve`（通过） / `reject`（驳回） |
| `approval_phase` | enum | 条件 | `approve` 时服务端按金额阈值计算下一阶段；`reject` 时必须处于待审批（`pending`） |
| `review_note` | string | `reject` 时必填 | 驳回原因，≤500 字 |
| `two_factor_code` | string | ✅ | 操作级 2FA 码（ADR-0008），一次性 |

### 3.3 审批阶段（ADR-0021）

- 业务状态 `status` 仅 `pending/paid/rejected/failed`；审批阶段 `approval_phase ∈ {none, level1, level2, super, completed}`。
- 管理端响应同时返回 `status`、`approval_phase`、`approval_required`；用户端仅暴露业务状态。
- 新接口不得以 `pending_level2`/`pending_super` 作为业务 `status`（deprecated）。

## 4. 状态机

详见 [人工上账状态机](../../06-data-and-architecture/state-machines/manual-topup.md)。要点摘录：

- 审批分级转迁（依据 ADR-0003 阶段语义 + ADR-0001 阈值 + ADR-0021 字段表达）：
  - ≤¥10,000：`pending(status)` → 一级通过（`approval_phase: none/level1 → completed`）→ `paid`。
  - >¥10,000 且 ≤¥50,000：`pending` → 一级通过（`level1`）→ 二级通过（`level2 → completed`）→ `paid`。
  - 任一待审批阶段可 `reject` → `rejected`；入账异常 → `failed`。
  - `>¥50,000` 在创建即拒绝（不产生单据，不进终审档）。
- 每次状态流转执行状态条件更新（`where status='pending'` 等守卫），并发/重复审批被拦截（ADR-0009）。

## 5. 操作与反馈

### 5.1 操作级 2FA（ADR-0008）

创建、审批（通过/驳回）均为资金写操作，强制后端操作级 2FA，`super_admin` 不默认豁免。固定错误码：权限不足 `403 PERMISSION_DENIED`；缺少/未启用 `403 OPERATION_2FA_REQUIRED`；错误、过期、重放使用固定错误码。前端二次确认（弹窗）不能替代后端校验。

### 5.2 幂等（ADR-0009）

- 创建端点强制 `Idempotency-Key`（头），Key 绑定操作者、方法、canonical 路径、请求摘要；相同 Key/摘要回放首次结果（`200` + `X-Idempotent-Replay: true`）；不同摘要 `409 IDEMPOTENCY_CONFLICT`；Redis 不可用 `503 IDEMPOTENCY_UNAVAILABLE`。
- 审批/驳回为状态条件更新，重复处理返回 `ORDER_ALREADY_PROCESSED`；重复凭证返回 `DUPLICATE_BUSINESS_REFERENCE`。

### 5.3 固定错误码（ADR-0011）

成功响应统一 `{ code: 0, message: "ok", data, request_id }`；错误统一 `{ code, message, details, request_id }`（无业务 `data`）。资金写端点错误码见 `05-api/admin/manual-topup.md` §6。HTTP 状态：成功 2xx、参数 400、认证 401、权限 403、资源 404、冲突 409、依赖 503、内部 500。

### 5.4 交互反馈

- 前端进行二次确认与 toast；`request_id` 供排查；越权不得以 200 掩盖 403。
- 入账成功后列表/台账展示入账成功且不出现 404（R2 兜底）；用户端余额卡正确显示入账后金额。

## 6. API 契约

管理端人工上账端点完整契约见 [05-api/admin/manual-topup.md](../../05-api/admin/manual-topup.md)。高点摘录：

| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| `POST` | `/api/v1/admin/manual-topup` | 创建人工上账 | `finance.topup` + 2FA + Idempotency-Key |
| `GET` | `/api/v1/admin/manual-topup` | 列表 | `finance.topup` |
| `POST` | `/api/v1/admin/manual-topup/:id/review` | 审批（approve/reject） | `finance.topup` + 2FA |
| `GET` | `/api/v1/admin/manual-topup/users` | 用户搜索（邮箱/ID/手机号，≤10 条） | `finance.topup` |

- 创建响应 201：`{ id, order_no, user_id, amount, method:'manual', status:'pending', status_label, approval_phase, created_at }`。
- 列表响应：`{ items, page, page_size, total }`；每项含 `status + approval_phase + approval_required`。
- 所有资金写端点遵循 ADR-0011 统一包装与 `request_id`。

## 7. 异常、并发与事务

### 7.1 事务边界（R2 creditBalance 收口）

入账审核事务（`db.transaction`）：
1. 状态条件更新 `recharge_orders` `pending → paid`（`where status='pending'` 守卫，防并发重复审核）；
2. `creditBalance(tx, { userId, amount, type:'recharge', referenceType:'recharge_order', referenceId, description })`：
   a. `INSERT INTO customer_balances ... ON CONFLICT (user_id) DO NOTHING`（无余额行自动建户，幂等）；
   b. `UPDATE customer_balances SET available_balance+=amount, total_balance+=amount, version+=1, updated_at=NOW() WHERE user_id=userId`（行级锁串行，不丢更新）；
   c. `INSERT INTO balance_transactions(...)`（流水与余额同事务强一致）；
3. 更新单证快照/`approval_phase=completed`、`reviewer_id`、审计；
4. 事务提交，失败整体回滚（含兜底建户）。

事务提交后（不阻塞主响应）：Redis 账本可用增量同步 → 负余额标记清除（>=0 时）→ `notifyUser`（站内信必发 + 按偏好邮件）。`creditBalance` 不含 Redis 操作。

### 7.2 并发与幂等

- 建户幂等由 PG `ON CONFLICT` 原子保证；增额依赖行级锁；流水与余额同事务。
- 创建幂等由 `Idempotency-Key`（Redis L1 + `recharge_orders.idempotency_key` 唯一列 L2）兜底；重复提交 409/回放。
- 重复审核由状态条件更新拦截（`ORDER_ALREADY_PROCESSED`）。
- 已知局限（不改）：增额 `UPDATE` 无 `AND available_balance >= amount` 负余额保护（人工上账为加钱方向，正常不减余额；扣减/纠错方向见 ADR-0020 返回受控错误，禁止负余额）。

### 7.3 失败补偿

- 入账事务失败：整体回滚，订单保持 `pending`，无部分入账、无重复通知。
- 入账后纠错：由 admin/super_admin 走调账/红冲创建独立反向资金记录，原单金额不可改/删（ADR-0003/0020）。
- 通知失败：不回滚资金事务；outbox 状态 `queued/sent/failed/skipped`，可重试/人工补发（ADR-0010）。

## 8. [?] 页面帮助与按钮级帮助对照表

> 定制化（非占位符），符合 PRODUCT-DESIGN-PRINCIPLES P1。数据源：主权威来源 `PRD-整改R1-R4` §7/§8，结合分级审批口径更新。

### [?] 页面帮助

页面帮助入口：`pageKey=finance-manual-topup`。说明人工上账的适用范围、审批分级、权限边界、操作级 2FA 与审计要求。

**页面名称**：财务 → 人工上账
**适用角色**：finance / admin / super_admin
**功能定位**：管理员/财务为指定用户账户资金入账。线下/对公已到账凭凭证走「人工上账」；平台赠送/补偿/纠错亦可入账。全过程按权限点鉴权、分级审批留痕、入账必通知。
**核心操作**：
1. 搜索用户（邮箱/手机号/用户ID）→ 核对状态与余额；
2. 点击「发起上账」→ 选择入账类型 → 填写金额、原因、凭证说明、转账单号 → 操作级 2FA 确认提交；
3. 待审核列表 → 按金额阈值分级审批（一审/二审）或驳回（填原因）；
4. 审核通过后用户收到站内信 + 邮件（按偏好），管理员可在列表核验到账。
**注意事项**：
- 涉及资金变动，提交与审核均需操作级 2FA 与二次确认，全程写审计；
- 单笔上账金额上限 ¥50,000；超过即拒绝，不进入终审档；大额对公请走充值订单；
- 对公到账需记录转账单号（全平台唯一，不可重复入账）；凭证文件上传后续版本开放；
- 创建人不得审批本人单据；一级与二级审批人不得重复；
- 用户无余额账户时系统自动建户后入账，无需人工干预；
- `frozen`/禁用用户需先解锁再上账。

### [?] 按钮级帮助对照表

| 按钮/操作 | `[?]` 帮助说明 |
|----------|---------------|
| 发起上账 | 为指定用户创建人工上账订单：对公到账需记录转账单号（全平台唯一），提交后进入待审核，审核通过前不改变用户余额 |
| 用户搜索（选择用户） | 按邮箱 / 手机号 / 用户ID 搜索并选中目标用户；回显邮箱、名称、当前余额与账户状态；禁用/冻结用户需先解锁 |
| 入账类型（对公到账） | 用于线下/对公已到账入账：转账单号必填且全平台唯一，防止重复入账 |
| 入账类型（平台赠送） | 用于平台赠送 / 补偿 / 纠错：转账单号选填，入账原因必填 |
| 入账金额 | 单笔入账金额，最低 ¥0.01、最高 ¥50,000（超过上限的大额对公走充值订单），最多保留 2 位小数 |
| 到账后余额预览 | 按所选用户当前余额 + 输入金额实时计算入账后可用余额，供提交前核对 |
| 上传凭证 / 凭证说明 | 记录对公到账凭证/回单信息（文件上传能力后续版本开放，本期以说明文字记录） |
| 转账单号 | 银行转账流水号；对公到账必填且全平台唯一，同一单号不可重复上账 |
| 确认提交 | 通过操作级 2FA 后弹出二次确认，确认后生成待审核上账订单并按金额阈值进入分级审批队列 |
| 审核通过（一审/二审） | 确认单据有效且未超过当前审批人可审批额度；按分级审批推进，必要时移交二审；生效后自动通知用户并写资金流水与审计日志，不可撤销（错误入账需冲正） |
| 驳回 | 拒绝该上账单据，必须填写驳回原因；单据状态变为已驳回，不改变用户余额 |
| 重置表单 | 清空当前发起上账表单的全部填写内容，恢复默认状态 |

## 9. 验收标准（真实测试映射）

映射到 `05-api/admin/manual-topup.md` §8 用例与状态机「测试映射」：

| # | 验收标准 | 测试用例映射 |
|---|---------|-------------|
| T1 | 创建端点 201；`method='manual'`、`status='pending'`、`order_no` 以 `MT` 开头、`metadata.transfer_no` 正确、审计 `manual_topup.create` | finance API 契约用例 1 |
| T2 | 参数校验：amount=0/负/超上限 → `VALIDATION_ERROR`；缺 note → 400；`evidence_url` 传入 → 400；user_id 不存在 → 404；frozen 用户 → 400 | 用例 2 |
| T3 | 幂等：同 Idempotency-Key 重放回放 / 不同摘要 `IDEMPOTENCY_CONFLICT`；同 `transfer_no` 重复 `DUPLICATE_BUSINESS_REFERENCE` | 用例 3 |
| T4 | 越权：finance 创建/审核 200；sales/customer 403；未登录 401 | 用例 7 |
| T5 | 无余额行用户审核通过 → 自动建户 + 入账 + 流水，不再 `BALANCE_NOT_FOUND`；并发建户不重复 | 状态机测试映射 / 用例 5 |
| T6 | 审批分级：≤¥10,000 一审通过即入账；>¥10,000 且≤¥50,000 需二审；创建人=审批人 / 一二级重复被拒 | 用例 6 |
| T7 | 2FA：无 token / 未启用 `OPERATION_2FA_REQUIRED`；错误/过期/重放固定错误码 | ADR-0008 用例 |
| T8 | 通知：入账成功 `notifications` 新增 `recharge_success`；SMTP 未配置 email=`skipped` 不报错；审计含 notification 状态 | 用例 8 |
| T9 | 24h operator/recipient 滚动限额按 `exceed_action` 处置 | ADR-0013 用例 |
| T10 | status/approval_phase/approval_required 三字段返回；用户端仅业务状态；无 `pending_level2` status | ADR-0021 用例 |
| T11 | P1 合规：页面 + 各按钮 `[?]` 帮助为非空定制文案 | 前端 E2E / help 组件用例 |
