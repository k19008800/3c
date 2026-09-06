# 核心资金 SPEC：充值

- 文档 ID：SPEC-BILLING-001
- 状态：review
- 生效版本：v1.0.0
- 对应 PRD：`../../02-requirements/03-billing-and-finance/recharge.md`
- 上游 ADR：ADR-0001、ADR-0002、ADR-0003、ADR-0004、ADR-0008、ADR-0009、ADR-0010、ADR-0011、ADR-0021
- 对应 API：`../../05-api/user/recharge.md`
- 对应状态机：`../../06-data-and-architecture/state-machines/recharge-order.md`
- 事实来源：`docs/PRD-整改R1-R4-人工上账与资金入账.md`、`docs/ARCH-整改R1-R4-技术方案.md`、`docs/ref-2.2.6-recharge.md`、`docs/sprint-1/SPEC-充值中心.md`

## 1. 页面与路由

充值主题含两组页面：

| 页面 | 路由 | 布局 | 权限门控 |
|---|---|---|---|
| 用户端充值中心 | `/console/recharge` | ConsoleLayout（侧边栏 + 主内容） | 所有已登录用户（role >= user） |
| 管理端人工上账页 | `/admin/finance/manual-topup` | ConsoleLayout 管理导航 | `finance.topup`（finance/admin/super_admin 可见；finance 需财务导航支持，见 ARCH §12.4 D2） |
| 管理端调账页 | `/admin/finance/adjust`（含红字冲销入口） | ConsoleLayout 管理导航 | `finance.adjust`（仅 admin/super_admin） |

> 前端导航（ARCH §12.4 D2 裁决）：为 `finance` 渲染最小 `FINANCE_NAV`（人工上账、充值订单、退款审核、发票审核、对账报表、客户列表），逐项 `usePerm` 过滤；admin/super_admin 保持全量导航。

## 2. 角色与权限

### 2.1 权限点映射（来源 ARCH §5.2、ADR-0004）

| 权限点 | finance | admin | super_admin | sales/agent | 覆盖端点 |
|---|---|---|---|---|---|
| `finance.topup` | ✅ | ✅ | ✅ | ❌ | 人工上账（列表/创建/审核）、充值订单 audit/reject |
| `finance.adjust` | ❌ | ✅ | ✅ | ❌ | 调账（ledger/pending/创建/approve/review/reject/reverse） |
| `super_admin` `*` | — | — | ✅ | — | 全权限通配仅由统一守卫解释 |

### 2.2 职责分离（ADR-0004）

强制"创建人 ≠ 审批人、一级审批人 ≠ 二级审批人、终审人不得与前级重复"。R1 单步审核阶段（主权威来源现状）不强制，但 ADR-0004 已冻结为强制；不在进度上以本期过渡实现替代。

### 2.3 前端权限渲染（来源 ARCH §5.5）

- 无 `finance.topup` → 不渲染"发起上账/审核"；
- 无 `finance.adjust` → 不渲染"发起调账"；
- 因权限变化失效 → 禁用态 + tooltip"您暂无该操作权限"；
- 前端 `ROLE_PERMS` 为后端静态映射的镜像（仅展示层，真实安全在后端）；后端为唯一安全源。

## 3. 字段与校验

### 3.1 人工上账（管理端 `POST /admin/manual-topup`）

| 字段 | 业务含义 | 类型 | 必填 | 长度/精度 | 校验规则 |
|---|---|---|---|---|---|
| `user_id` | 目标用户 ID | integer | ✅ | — | 正整数；用户存在（404）；状态仅 `active`（`frozen` 400 `VALIDATION_ERROR`） |
| `amount` | 入账金额（CNY） | number | ✅ | 元，≤2 位小数；内部 `numeric(18,8)` | `>0` 且 `≤ MANUAL_TOPUP_MAX_AMOUNT(¥50,000)`（ADR-0001）；`toFixed(2)` 落库 |
| `note` | 入账原因 | string | ✅ | ≤500 字 | 非空（trim 后） |
| `transfer_no` | 转账单号 | string | 可选 | ≤100 | 填写则平台唯一；重复 → `DUPLICATE_BUSINESS_REFERENCE` |
| `evidence_remark` | 凭证说明 | string | 可选 | ≤500 | 对公回单核实说明 |
| `evidence_url` | 凭证附件 | — | 本期不接受 | — | 传入即 400（凭证能力后置 R9） |
| `currency` | 币种 | string | 系统默认 | 10 | 本期仅 CNY |
| `order_no` | 订单号 | string | 系统生成 | ≤50 | 唯一；管理端 `MT+yyyyMMddHHmmss+4位随机` |
| `status` | 业务状态 | enum | 系统 | — | `pending/paid/rejected/failed`（ADR-0021，不落 `pending_level2/super`） |
| `approval_phase` | 审批阶段 | enum | 系统 | — | `none/level1/level2/super/completed`（ADR-0021） |
| `paid_at` | 入账时间 | timestamp | 系统 | — | 审核通过时写入 |
| `reviewer_id` | 审核人 | integer | 系统 | — | 落 `metadata.reviewer_id`（本期；AR9 后正式列） |
| `review_note` | 驳回原因 | text | 驳回时必填 | ≤500 字 | 驳回操作必须填写 |

### 3.2 用户自助充值（`POST /me/recharge` / `POST /api/v1/recharge`）

| 字段 | 类型 | 必填 | 精度 | 校验 |
|---|---|---|---|---|
| `amount` | number | ✅ | 元，支持到分（¥0.01，2 位小数） | `≥ ¥1` 且 `≤ ¥1,000,000`（ADR-0001）；≤2 位小数（ADR-0002） |
| `payment_method` | enum | ✅ | — | `alipay / wechat / bank_transfer`（用户端 `ALLOWED_METHODS` 不含 `manual`） |
| `promotion_id` | number | 可选 | — | 存在且活动有效 |
| （自助充值）`order_no` | string | 系统生成 | — | 唯一；`RE+yyyyMMdd+流水(6位)` / `recharge_yyyyMMdd_…` |

> 金额精度总则（ADR-0002）：输入最多 2 位小数、内部 `numeric(18,8)`、展示固定 2 位小数；禁止 JS `Number` 作最终计算依据。

### 3.3 入账执行（`creditBalance`，来源 ARCH §4）

- 入账金额按 `type='recharge'`（人工上账/充值审核） 写 `balance_transactions`，内部 `toFixed(8)` 对齐 `numeric(18,8)`。
- 无余额行先 `INSERT … ON CONFLICT(user_id) DO NOTHING` 零余额建户（幂等），再原子增额 + 写流水；同事务，失败整体回滚。
- `version+1` 乐观锁保留；事务内不做 Redis（Redis 同步在事务提交后）。

## 4. 状态机

引用 [充值订单状态机](../../06-data-and-architecture/state-machines/recharge-order.md)，展开触发器：

| 事件/触发器 | 生效前提 | 动作 | 结果 |
|---|---|---|---|
| `create`（`POST /admin/manual-topup` 或 `POST /recharge`） | 权限 `finance.topup`（管理端）/ 用户登录；幂等 Key；校验通过 | 生成 `pending` 单，写 `approval_phase` 初始 | `status=pending` |
| `approve`（一级/二/终审） | 状态守卫 `WHERE status='pending'`；职责分离；2FA（如启用）；`Idempotency-Key` | `creditBalance` 入账 + 流水 + 通知 + 审计 | `pending → paid`（分阶段流转见状态机 §2） |
| `reject` | 状态守卫 `WHERE status='pending'` | 记录 `review_note`、审批人 | `pending → rejected` |
| 入账执行异常 | 事务任一步失败 | 整体回滚 | 置/保持 `failed` |
| 30min 超时（自助充值） | cron 扫描 | 置 `expired` | — |
| 支付回调成功 | 签名 + 幂等 + 金额核对 | 入账 | `pending → paid` |
| 支付回调失败/金额不符 | — | 保持待验证 + 异常标记 | 不增加余额 |

## 5. 操作与反馈

- **创建**：toast "已提交，等待审核" → 列表刷新，新单 `pending` 置顶。
- **审核通过**：二次确认 → toast "入账成功，金额已到账" → 行状态 `paid`（用户收到 `recharge_success`）。
- **驳回**：必填驳回原因 → 行状态 `rejected`，原因展示于"驳回原因"列。
- **错误**：越权 403 `PERMISSION_DENIED`、幂等冲突 409/503、校验失败 400，前端按错误码给出具体反馈（ADR-0011 `request_id` 写入日志/审计/响应）。
- **前端幂等键**：提交时生成 `crypto.randomUUID()` 作 `Idempotency-Key`（ARCH §3.4/§3.6）。
- 用户端充值中心反馈：二维码弹窗倒计时、支付状态每 5 秒轮询、结果弹窗（成功/失败/超时）、过期可重新发起。

## 6. API 契约

引用 [用户充值 API 契约](../../05-api/user/recharge.md)。核心端点（canonical `/api/v1/*`，ADR-0023）：

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| POST | `/api/v1/admin/manual-topup` | `finance.topup` + 幂等 | 发起人工上账（201） |
| GET | `/api/v1/admin/manual-topup` | `finance.topup` | 人工上账列表 |
| POST | `/api/v1/admin/manual-topup/:id/review` | `finance.topup` + 幂等 | 审核（approve/reject） |
| GET | `/api/v1/admin/manual-topup/users?search=&page_size=10` | `finance.topup` | 轻量用户搜索（ARCH §12.4 D1） |
| POST | `/api/v1/admin/recharge-orders/:id/audit` | `finance.topup` + 幂等 | 充值订单审核通过 |
| POST | `/api/v1/admin/recharge-orders/:id/reject` | `finance.topup` + 幂等 | 充值订单驳回 |
| POST | `/api/v1/recharge` 或 `/api/v1/me/recharge` | user + 幂等 | 发起用户充值 `【待人工裁决 canonical 路径】` |
| POST | `/api/v1/me/recharge/callback` | 渠道签名 | 支付回调（外部） |

请求/响应核心字段与错误码见 API 文档。

## 7. 异常、并发与事务

- **幂等（ADR-0009）**：创建类强制 `Idempotency-Key`；Key 绑定操作者/方法/canonical 路径/请求摘要；相同 Key/摘要回放，不同摘要 409；Redis 不可用 503；DB 唯一约束 + 状态守卫为最终边界。
- **并发（状态条件原子更新）**：审核 `WHERE status='pending'`；重复/并发审核 → 409 `ORDER_ALREADY_PROCESSED`，余额不重复累加。
- **事务**：建户 + 加额 + 流水同事务，整体回滚（无部分入账）；事务提交后做 Redis 同步与通知。
- **错误码**：400 `VALIDATION_ERROR`、401 `UNAUTHORIZED`、403 `PERMISSION_DENIED` / `OPERATION_2FA_REQUIRED`、404 `NOT_FOUND`、409 `IDEMPOTENCY_CONFLICT` / `ORDER_ALREADY_PROCESSED` / `DUPLICATE_BUSINESS_REFERENCE`、503 `IDEMPOTENCY_UNAVAILABLE`、500 内部错误（ADR-0011、ADR-0009）。
- **响应封装（ADR-0011）**：成功 `{code:0, message:"ok", data, request_id}`；列表 `items/page/page_size/total`；错误 `code/message/details/request_id`。

## 8. 页面与操作帮助

> 按 PRODUCT-DESIGN-PRINCIPLES P1（不可降级）定制实现，非占位符。管理端人工上账页与用户端充值中心均需覆盖；下表为管理端人工上账页（与 PRD §8.4 一致），用户端充值中心对照清单见下。

### [?] 页面帮助

- **管理端人工上账页**（`pageKey=finance-manual-topup`）：供财务人员创建、审核人工上账；审核通过前不改变余额。适用角色、审批分级、2FA、通知和常见错误以本 SPEC §§2–7 为准。
- **用户端充值中心**（`pageKey=customer-recharge`）：供客户创建自助充值、查看支付状态与历史；支付回调必须验签并按幂等规则处理。未支付订单 30 分钟过期，过期后可重新发起。
- **注意事项**：人工上账单笔不超过 ¥50,000；自助充值单笔不超过 ¥1,000,000；所有金额最多 2 位小数；资金写操作需二次确认和操作级 2FA。

### [?] 按钮级帮助对照表

#### 管理端人工上账

| 按钮/操作 | 按钮级 `[?]` 帮助说明 |
|---|---|
| 发起上账 [?] | 为指定用户创建人工上账订单：对公到账需上传凭证并填写转账单号，提交后进入待审核，审核通过前不改变用户余额 |
| 用户搜索（选择用户）[?] | 按邮箱/手机号/用户ID 搜索并选中目标用户；展示邮箱、名称、当前余额与状态；禁用/冻结用户需先解锁 |
| 入账类型（对公到账）[?] | 用于线下/对公转账已到账的入账：凭证与转账单号建议必填，防止重复入账 |
| 入账类型（平台赠送）[?] | 用于平台赠送/补偿/纠错/客服补单：凭证与转账单号选填，入账原因必填 |
| 入账金额 [?] | 单笔入账金额，最低 ¥0.01、最高 ¥50,000，最多保留 2 位小数 |
| 到账后余额预览 [?] | 按当前所选用户余额 + 输入金额实时计算入账后的可用余额，供提交前核对 |
| 上传凭证 [?] | 上传对公到账凭证/回单截图，仅支持 JPG/PNG/PDF，≤5MB |
| 转账单号 [?] | 银行转账流水号；同一单号不可重复上账（全平台唯一） |
| 确认提交 [?] | 校验通过后弹出二次确认，确认后生成待审核上账订单并通知审核队列 |
| 审核通过 [?] | 确认单据有效，资金计入用户余额；生效后自动通知用户并写资金流水与审计日志，且不可撤销（错误入账需冲正） |
| 驳回 [?] | 拒绝该上账单据，必须填写驳回原因；单据状态变为已驳回，不改变用户余额 |
| 重置表单 [?] | 清空当前发起上账表单的全部填写内容，恢复默认状态 |

### [CORRUPTED / NONCANONICAL] 本节原标题不可可靠恢复

> 本节标题存在问号替换型编码损坏。当前路径在现场状态中为未跟踪内容，且本次环境无法运行 Git 历史命令，未找到可交叉验证的原始标题；因此不猜测恢复。下方未损坏的逐项帮助内容仅保留供评审，标题恢复并经人工裁决前不得据此授予 canonical/approved 状态。

用户端充值中心 `/console/recharge` 各元素须有 `[?]`（pageKey 待前端按既有帮助组件约定固化）：

| 元素 | 按钮级 `[?]` 帮助说明 |
|---|---|
| 当前余额卡片 [?] | 展示当前可用余额及其预警底色（≤¥10 黄、≤¥1 红） |
| 快捷金额/自定义金额 [?] | 快捷金额 ¥50/¥100/¥200/¥500/¥1000/¥5000；自定义 ¥1–¥1,000,000（自助充值上限），支持到分 |
| 支付方式（支付宝/微信）[?] | 扫码/跳转支付，30 分钟未支付自动过期 |
| 支付方式（对公转账）[?] | 线上下单+上传凭证，需财务审核，工作日 T+1 |
| 优惠横幅 [?] | 展示充值活动规则（如"首充满¥100送¥20"），按活动自动赠送 |
| 确认充值 [?] | 校验通过后创建充值订单并展示二维码，支付成功后自动入账并通知 |
| 二维码弹窗（倒计时/轮询）[?] | 扫码后倒计时 30 分钟，每 5 秒轮询支付状态 |
| 对公转账弹窗（凭证上传/审核说明）[?] | 上传凭证 JPG/PNG/PDF ≤5MB，审核通过前不计入余额，被驳回可修改后重新提交 |
| 充值记录（重新支付）[?] | 展示订单号/金额/方式/时间/状态；过期订单 30 分钟内可重新支付 |
| 消费明细筛选 [?] | 按时间范围（7d/30d/90d）与类型（全部/充值/消费/退款）筛选，展示余额前后 |

## 9. 验收标准

> 对应 PRD §9 与 ARCH §8；均可在 `pnpm test`（真实 PG+Redis）验证。

- [ ] 用户自助充值：创建 201、`status=pending`；30min 超时 expired；回调幂等不重复入账；金额不一致不增加余额；单笔上限 ¥1,000,000 校验。
- [ ] 人工上账：创建 201、`method='manual'`、`order_no` 以 `MT` 开头；字段校验（用户/金额/原因/单号）拦截；单号重复拒绝；幂等 Key 重放仅 1 行。
- [ ] 审核：approve → `paid` + 余额 + 流水 + `recharge_success` 通知；reject → `rejected` + 驳回原因；重复审核 409。
- [ ] 兜底：无余额行用户入账成功不 404；并发建户不重复；对账口径无变化。
- [ ] 权限：finance 可创建/审核（+前端入口），sales/customer 403；职责分离拦截；`hasPerm` 矩阵正确。
- [ ] 通知：入账成功站内信必发 + 邮件按偏好；关闭偏好仅站内信；失败不影响入账、记录可查。
- [ ] P1 合规：页面标题与每个按钮均有 `[?]`，内容与 §8 对照表一致。
