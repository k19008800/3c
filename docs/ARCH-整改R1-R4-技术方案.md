# ARCH — 阶段一 P0 止血（R1–R4）技术方案

| 字段 | 值 |
|------|-----|
| 文档编号 | ARCH-2026-ADMIN-RECHARGE-R1R4-001 |
| 版本 | v1.0 |
| 日期 | 2026-08-18 |
| 适用项目 | 3cloud（AI API 网关 + 管理后台） |
| 编制角色 | arch-agent（系统架构总设计师） |
| 适用范围 | 阶段一 P0 止血 R1–R4（人工上账创建 / 余额账户兜底 / 权限点鉴权 / 入账通知），**不含** P1（R5–R10）与 P2（R11–R15） |
| 关联文档 | `docs/整改方案-管理员充值业务演练.md`（RECT-2026-ADMIN-RECHARGE-001 v1.0）、`kb/3cloud/tech-stack-decision.md`、`kb/3cloud/coding-standards-api-db-test.md`、`kb/3cloud/coding-standards-control-logic.md`、`docs/ref-2.2.6-recharge.md`、`docs/PRODUCT-DESIGN-PRINCIPLES.md` |
| 现状依据 | 仓库代码逐文件核对（见 §2 文件清单） |
| 执行方 | backend-agent / frontend-agent（**接口契约以本文档为准**）；test-agent 按 §8 验证 |

> **本方案只做设计，不含代码实现。** 所有接口字段与现状代码逐一对齐，不凭空造字段。

---

## 1. 目标与范围

### 1.1 目标

解决演练暴露的 4 个 P0 断点（对应整改方案 §4.2 阶段一）：

| # | 整改项 | 解决断点 | 验收标准（整改方案原文） |
|---|--------|---------|------------------------|
| R1 | 人工上账创建接口 | P0-1 无创建入口 | 创建后出现在人工上账列表；重复创建同单号被拒 |
| R2 | 余额账户兜底 | P0-2 无余额行 404 | 无余额行用户充值成功，不再 404 |
| R3 | 权限点鉴权对齐 | P0-3 假授权 | finance 角色可审核人工上账、不可发起调账；越权请求 403 |
| R4 | 入账通知闭环 | P0-4 无用户通知 | 入账后用户收到站内信与邮件；通知记录可查 |

### 1.2 范围边界

- **本期实现**：R1–R4 涉及的后端端点/服务/中间件/前端按钮与页面改动、必要 migration（仅 1 项，见 §7）。
- **本期不做**：分级审批（R5）、限额拆分规避（R6）、2FA（R7）、platform_ledger 建表与写入（R8，仅留钩子 §10）、凭证上传落库（R9）、调账幂等接入（R10）、会计科目字典（R11）、红冲审批（R12）、审计 diff 增强（R13）、`[?]` 帮助体系（R14，前端交付时**必须**随新按钮补 `[?]`，见 §6.3）、台账导出（R15）。
- **幂等说明**：R1 创建接口本期即接 Idempotency-Key（属 R10 前置设计，见 §3.4）；调账幂等（R10）本期不动。

---

## 2. 现状与改造总览

### 2.1 改造文件清单

| 文件路径（相对 `3cloud/`） | 改动内容 | R 编号 | 改动类型 |
|---|---|---|---|
| `api/src/routes/admin-finance-missing.ts` | 新增 `POST /api/v1/admin/manual-topup` 创建端点；`POST /:id/review` approve 分支改走 `creditBalance`（替换裸 UPDATE+INSERT 流水）；approve 成功后触发 `notifyUser`；三端点鉴权由 `adminAuth` 换 `requirePerm('finance.topup')` | R1/R2/R3/R4 | 改 + 增 |
| `api/src/services/billing/balance.ts` | 新增 `creditBalance(tx, params)` 统一入账收口函数（§4） | R2 | 增 |
| `api/src/routes/admin-adjust.ts` | 免审批生效 / `applyApproval`（一级+二级）/ 红冲的**加钱方向**改走 `creditBalance`；生效后触发 `notifyUser`；全部端点鉴权换 `requirePerm('finance.adjust')` | R2/R3/R4 | 改 |
| `api/src/routes/recharge.ts` | 管理端 `POST /admin/recharge-orders/:id/audit` approve 分支改走 `creditBalance`；通过后触发 `notifyUser`；audit/reject 鉴权换 `requirePerm('finance.topup')`（裁决见 §5.3） | R2/R3/R4 | 改 |
| `api/src/lib/permissions.ts` | **新增**：`PERM_GROUPS`/`ROLE_PERMS`/`effectivePerms`/`hasPerm`（从 `admin-permissions.ts` 迁移并导出；权限树新增 `finance.adjust`） | R3 | 增 |
| `api/src/middleware/require-perm.ts` | **新增**（新建 `middleware/` 目录，对齐编码规范 §4.1 目录结构）：`requirePerm(permKey)` preHandler（§5） | R3 | 增 |
| `api/src/routes/admin-permissions.ts` | 删除内部重复的 `ROLE_PERMS`/`PERM_GROUPS`/`effectivePerms`，改为从 `lib/permissions.ts` 导入（行为不变） | R3 | 改 |
| `api/src/services/notify.ts` | **新增**：`notifyUser(userId, params)` 统一通知服务（站内信 + 按偏好邮件） | R4 | 增 |
| `api/src/db/schema/recharge-orders.ts` | 增加 `idempotencyKey` 列定义（配合 migration 0027） | R1 | 改 |
| `api/src/db/migrations/0027_recharge_orders_idempotency.sql` | **新增**：`recharge_orders.idempotency_key` 唯一列（§7） | R1 | 增 |
| `api/src/routes/admin-manual-topup.test.ts` | **新增**测试：创建/幂等/金额/兜底/通知/越权（§8） | R1–R4 | 增 |
| `api/src/services/billing/balance.test.ts` | **新增**测试：`creditBalance` 兜底/正常/流水（§8） | R2 | 增 |
| `api/src/middleware/require-perm.test.ts` | **新增**测试：权限矩阵（§8） | R3 | 增 |
| `web-console/src/lib/permissions.ts` | **新增**：前端 `ROLE_PERMS` 镜像 + `hasPerm(role, key)` + `usePerm(key)` hook | R3 | 增 |
| `web-console/src/pages/AdminManualRechargePage.tsx` | 增加「发起上账」按钮 + 表单弹窗（调用新创建端点）；按钮按 `usePerm('finance.topup')` 显隐；按钮旁补 `[?]` | R1/R3 | 改 |
| `web-console/src/pages/AdminAdjustPage.tsx` | 「发起调账」按钮按 `usePerm('finance.adjust')` 显隐（finance 角色隐藏） | R3 | 改 |

### 2.2 关键现状事实（设计依据）

1. **人工上账无创建入口**：`admin-finance-missing.ts:146-274` 仅 GET 列表 + POST review；`recharge.ts:82` 用户端 `ALLOWED_METHODS = ['bank_transfer','alipay','wechat','qq']` 不含 `manual`（天然保证 manual 订单只能由管理端创建）。
2. **余额更新三处裸 SQL**：`admin-finance-missing.ts:240-260`、`admin-adjust.ts:224-247/314-348/416-444`、`recharge.ts:387-410`、`recharge.ts:261-283`（兑换码），全部 `UPDATE customer_balances ... RETURNING`，无行即 `BALANCE_NOT_FOUND`；`initBalance`（`balance.ts:327-335`）只在注册调用（`auth.ts`）。
3. **权限树**：`admin-permissions.ts:76-82` `ROLE_PERMS` 静态映射，`finance` 已有 `finance.topup` 但**无 `finance.adjust`**；路由层 `adminAuth` 仅放行 `admin/super_admin`。
4. **用户站内信通道是 `notifications` 表**（`me.ts:484` `/me/notifications` 读它；`admin-consumption.ts:494` 手动提醒也写它）；`user_notifications` 是价格变更专用表（`tier` NOT NULL + `price_change_log_id` FK + `is_weekly_summary`，`/me/notifications` 不读它）。
5. **邮件链路已就绪**：`mailer.ts sendMail`（SMTP 未配置时返回 `{ok:false,skipped:true}` 不抛错，写 `email_logs`）；`email_templates` 表存在（`name` unique、`subject_zh/body_html_zh` 必填、支持 `{{变量}}` 插值），**当前无 `recharge_success` 模板**；通知策略存于 `system_config` key=`notification_policies_list`（channel/event_type/template_id/enabled/throttle_seconds，`admin-permissions.ts:286-299`）。
6. **幂等**：`services/idempotency.ts` 的 L1 Redis 锁原语（`acquireIdempotencyLock`/`releaseIdempotencyLock`/`cacheIdempotentResponse`/`getCachedIdempotentResponse`）为通用 Redis 原语可直接复用；其 L2 DB 兜底绑定 `consumption_records.request_id`（消费链路专用），**不适用**财务写操作，需以 `recharge_orders.idempotency_key` 唯一列兜底。
7. **金额单位**：`recharge_orders.amount` numeric(18,2) 元、`balance_transactions.amount` numeric(18,8) 元 —— 接口契约沿用现状"元"（Number），不引入"分"。
8. **错误处理**：`lib/errors.ts` `AppError(message, statusCode, code)`，`statusCode` 由 Fastify 默认映射 HTTP 状态；错误体格式沿用现状（无全局 setErrorHandler，本期不新增）。
9. **测试模式**：真实 PG 集成测试（`admin-risk-finance.test.ts` 风格：`buildTestApp()` 最小 Fastify 实例 + `app.inject` + 独立时间戳隔离 + `afterAll` 清理），非 mock。

---

## 3. R1 人工上账创建接口

### 3.1 裁决：复用 `recharge_orders` 表（method='manual'），不新建表

| 维度 | 裁决 |
|------|------|
| **结论** | **复用 `recharge_orders` 表**，新订单 `method='manual'`、`status='pending'` |
| 理由 1 | 现状 GET 列表（`admin-finance-missing.ts:151`）按 `method='manual'` 过滤该表、POST review 也操作该表 —— 新建表需改写列表/审核/前端契约并迁移存量，成本高、收益为零 |
| 理由 2 | 字段已够：`order_no`(unique)/`amount`/`currency`/`method`/`status`/`note`/`paid_at`/`metadata`(jsonb) 承载人工上账全部语义（§7 详细论证） |
| 理由 3 | 用户端 `ALLOWED_METHODS` 不含 `manual` → 用户无法自助创建，天然隔离管理端通道 |
| 例外 | 仅需新增 `idempotency_key` 唯一列（幂等 L2 兜底，§7），属唯一必须迁移项 |

### 3.2 接口契约

#### `POST /api/v1/admin/manual-topup` — 发起人工上账

**请求头**

| Header | 必填 | 说明 |
|--------|------|------|
| `Authorization: Bearer <jwt>` | ✅ | 需 `finance.topup` 权限（admin / super_admin / finance） |
| `Idempotency-Key` | 推荐 | UUID 或业务单号，长度 ≤ 100；重复提交按 §3.4 处理 |

**请求体**（字段与 GET 列表/审核契约 snake_case 对齐）

```json
{
  "user_id": 42,
  "amount": 1000.00,
  "note": "线下对公转账已到账，凭凭证入账",
  "transfer_no": "BANK-20260818-0001",
  "evidence_remark": "对公回单已核验，金额一致"
}
```

| 字段 | 类型 | 必填 | 校验 | 落库 |
|------|------|------|------|------|
| `user_id` | number | ✅ | 正整数；用户存在（查 `users`，不存在 404）；用户 `status` 建议为 active/suspended（**frozen 拒绝入账**，`VALIDATION_ERROR`） | `recharge_orders.user_id` |
| `amount` | number | ✅ | `> 0` 且 `≤ MANUAL_TOPUP_MAX_AMOUNT`（§3.3） | `recharge_orders.amount`（`toFixed(2)`，对齐现状） |
| `note` | string | ✅ | 非空，≤ 500 | `recharge_orders.note` |
| `transfer_no` | string | 可选 | ≤ 100 | `recharge_orders.metadata.transfer_no` |
| `evidence_remark` | string | 可选 | ≤ 500 | `recharge_orders.metadata.evidence_remark` |
| `evidence_url` | — | — | **本期不接受**（凭证上传属 R9）；传入即 400，防止前端误以为已支持上传 | — |

> `metadata` 同时写入 `{ source: 'admin-manual-topup', created_by: <operatorId> }`，为 R8 的 `operatorId` 与 R9 凭证扩展预留。

**响应 201**

```json
{
  "data": {
    "id": 123,
    "order_no": "MT202608181530121234",
    "user_id": 42,
    "amount": 1000,
    "method": "manual",
    "status": "pending",
    "status_label": "待审核",
    "created_at": "2026-08-18T07:30:12.000Z"
  },
  "message": "上账申请已创建，待审核"
}
```

- 订单号生成器：新增 `genManualOrderNo()`（前缀 `MT` + yyyyMMddHHmmss + 4 位随机，对齐 `recharge.ts genOrderNo` 风格），避免与用户端 `RC` 前缀混淆；GET 列表契约不含 order_no 字段，无前端影响。

**错误码表**

| HTTP | code | 场景 | 抛错方式 |
|:---:|------|------|---------|
| 400 | `VALIDATION_ERROR` | amount ≤ 0 / 超上限 / user_id 非法 / note 缺失 / 传入 `evidence_url` / 用户状态 frozen | `ValidationError` |
| 401 | `UNAUTHORIZED` | 未登录 / Token 缺失或失效 | `UnauthorizedError` |
| 403 | `FORBIDDEN` | 无 `finance.topup` 权限（如 sales / agent / customer） | `ForbiddenError`（§5） |
| 404 | `NOT_FOUND` | 用户不存在 | `NotFoundError('User', userId)` |
| 409 | `IDEMPOTENCY_CONFLICT` | 同 Idempotency-Key 已处理/处理中（§3.4） | `IdempotencyConflictError` |
| 500 | `ORDER_CREATE_FAILED` | 插入失败（唯一键冲突等非预期） | `AppError` |

**审计**：成功后写 `audit_logs`，`action='manual_topup.create'`、`resource='recharge_order'`、`resourceId=String(order.id)`、`details={ userId, amount, order_no, created_by }`。

### 3.3 金额上限裁决（配置化，本期先常量）

| 项 | 现状 | 裁决 |
|----|------|------|
| 用户端单笔上限 | `recharge.ts:83` `MAX_AMOUNT = 1_000_000`（元） | 本期不改（用户自助充值归属产品口径） |
| 人工上账单笔上限 | 无（端点不存在） | **默认 `MANUAL_TOPUP_MAX_AMOUNT = 50_000`（元）**，对齐 `ref-2.2.6-recharge.md §4.4` 对公转账上限 ¥50,000 —— 人工上账语义 = 线下/对公已到账入账，与对公口径一致 |
| 配置化 | — | **新增 `system_config` key = `finance_rules`**（JSON）：`{ "manual_topup": { "max_amount": 50000 } }`；读取优先级：配置 → 常量默认值。实现为 `api/src/lib/finance-rules.ts`（或 balance 服务内小工具）：`getManualTopupMaxAmount()` 读 `system_config` 并缓存 60s，读失败回退常量。**不引入新依赖** |
| 后续 | — | P2-14 三处口径统一（大额预警 1 万 / 调账审批线 1 万 / 对公双档 / 用户端上限）属 R5/R6，本方案仅收口人工上账一处，其余保持现状 |

> ⚠️ 需要产品/调度确认：上限默认值取 50,000 还是 1,000,000（见 §11 开放问题 Q1）。

### 3.4 幂等设计（Idempotency-Key）

**裁决：复用 `services/idempotency.ts` 的 L1 Redis 锁原语 + 新增 DB 唯一列做 L2 兜底。**

```
同一个 Idempotency-Key：
  L1: acquireIdempotencyLock(key)  ──acquired──▶ 继续创建；失败(业务异常) → releaseIdempotencyLock
                                    ──duplicate─▶ 查 L2 是否已有订单 → 有：回放创建结果(200 + X-Idempotent-Replay:true)
                                                  / 无（首请求仍在处理中）→ 409 IDEMPOTENCY_CONFLICT
                                    ──degraded──▶ 降级放行（Redis 不可用），由 L2 唯一约束兜底
  L2: recharge_orders.idempotency_key UNIQUE（migration 0027）→ 并发双写撞唯一约束 → isIdempotencyUniqueViolation
      风格判断（新增针对 recharge_orders 的匹配，或直接 catch 23505 + 约束名含 idempotency_key）→ 409
```

- **直接复用**：`resolveIdempotencyKey`（头解析）、`acquireIdempotencyLock` / `releaseIdempotencyLock`、`cacheIdempotentResponse` / `getCachedIdempotentResponse`（成功后将 `{ id, order_no, status }` 缓存，TTL 24h 与 `IDEMPOTENCY_TTL_SECONDS` 一致）。
- **不可复用**：`findConsumptionByRequestId` / `buildEntryFromConsumptionRecord` / `replayIdempotentRequest`（绑定 consumption_records，财务写操作无对应语义）；重复提交策略按裁决为 **409 + 回放（若 L1 缓存命中）**，与整改方案"重复创建同单号被拒"一致。
- **降级语义**：Redis 不可用 → L1 degraded 放行 → L2 唯一约束兜底（撞约束 → 409），资金安全优先，与 `coding-standards-control-logic.md §三` 三层守卫精神一致。
- **约定**：幂等键由前端生成（`crypto.randomUUID()`），`Idempotency-Key` 头必传推荐；服务端 `requestId` 兜底。
- R10（调账幂等）本期不实施，但同一套 L1 原语在二期直接复用，无需新建设施。

### 3.5 状态机

```
                    ┌──────────┐
                    │ 创建端点  │  POST /admin/manual-topup（仅管理端）
                    └────┬─────┘
                         ▼
┌───────────┐   审核通过   ┌─────┐   审核驳回   ┌─────────┐
│ paid (已入账)│ ◀──────── │ pending │ ─────────▶ │ failed   │
│            │ approve    │ 待审核  │  reject    │ 已驳回   │
└───────────┘            └─────┘            └─────────┘
   （终态，入账+流水+通知）                       （终态，note 记驳回原因）
```

- 与现有 GET 列表 / POST review 完全兼容：GET 列表 `paid→approved`、`failed→rejected` 前端映射（`admin-finance-missing.ts:122`）不变；POST review 仅操作 `pending`（`where status='pending'` 原子守卫）不变。
- `cancelled` / `refunded` 状态本期不启用（保留枚举，R5 起才可能扩展）。

### 3.6 前端落点

- **页面**：`web-console/src/pages/AdminManualRechargePage.tsx`（路由 `/admin/finance/manual-topup`，App.tsx:221）—— 现状仅有列表 + 审核弹窗，在此页新增「发起上账」按钮 + 表单弹窗（user_id 搜索选择 / amount / note / transfer_no / evidence_remark）。
- **交互**：提交时生成 `Idempotency-Key`（`crypto.randomUUID()`）并随请求头发送；成功 → toast + `invalidateQueries(['admin-manual-topup'])` 刷新列表。
- **权限显隐**：按钮仅在 `usePerm('finance.topup')` 为 true 时渲染（§5.5）。
- **合规**：新按钮旁必须有 `[?]` 帮助（`HelpIcon` tooltip，内容见整改方案 §七「发起上账[?]」），按钮级文案随本迭代交付，违反 PRODUCT-DESIGN-PRINCIPLES P1 不得验收。

---

## 4. R2 余额账户兜底

### 4.1 统一收口函数 `creditBalance`

落点：`api/src/services/billing/balance.ts`（与 `addBalance`/`deductBalance` 同文件）。

```ts
/**
 * 统一入账收口：余额账户兜底 + 原子增额 + 资金流水（必须在调用方事务内执行）
 *
 * 解决 P0-2：入账统一 UPDATE customer_balances ... RETURNING 无行即 404，
 * 历史/异常用户（无余额行）直接失败。本函数先 INSERT ON CONFLICT DO NOTHING
 * 复用 initBalance 语义兜底建行，再原子增额 + 写流水，保证任意入账路径
 * （人工上账审核 / 调账生效 / 充值订单审核）行为一致。
 *
 * @param tx - 调用方已开启的 Drizzle 事务（db.transaction 的 tx 参数）
 * @param params.userId - 入账用户 ID（必须已存在，调用方负责校验；FK 违约由事务回滚）
 * @param params.amount - 入账金额（元，正数；内部 toFixed(8) 对齐 numeric(18,8)）
 * @param params.type - 流水类型：'recharge' | 'adjustment'（balance_transactions.type 枚举）
 * @param params.referenceType - 引用类型：'recharge_order' | 'adjustment' | 'redemption' 等
 * @param params.referenceId - 引用 ID：订单/调账记录 ID（字符串）
 * @param params.description - 流水描述（含单号/科目，便于审计）
 * @returns { balanceAfter: string } 入账后可用余额（元，字符串）
 * @throws {AppError} 500 BALANCE_CREDIT_FAILED — UPDATE 意外命中 0 行（理论不可达）
 *
 * @example
 * const { balanceAfter } = await creditBalance(tx, {
 *   userId: order.userId, amount: order.amount, type: 'recharge',
 *   referenceType: 'recharge_order', referenceId: String(order.id),
 *   description: `人工上账审核通过 ${order.orderNo}`,
 * });
 */
export async function creditBalance(
  tx: TxContext,   // Drizzle 事务类型（与现有 db.transaction 回调参数一致）
  params: {
    userId: number;
    amount: string | number;
    type: 'recharge' | 'adjustment';
    referenceType: string;
    referenceId: string;
    description: string;
  },
): Promise<{ balanceAfter: string }> { /* 见 4.2 时序 */ }
```

### 4.2 事务时序

```
调用方 db.transaction(async (tx) => {
  1. [调用方] 原子占单/置状态：如 recharge_orders pending→paid（where status='pending' 守卫，防并发重复审核）
  2. creditBalance(tx, {...})：
     a. INSERT INTO customer_balances (user_id, total_balance, available_balance, frozen_balance, currency)
        VALUES (userId, '0', '0', '0', 'CNY')
        ON CONFLICT (user_id) DO NOTHING          ← 兜底建行（复用 initBalance 语义，幂等）
     b. UPDATE customer_balances
        SET available_balance = available_balance + amount::numeric,
            total_balance     = total_balance     + amount::numeric,
            version           = version + 1,
            updated_at        = NOW()
        WHERE user_id = userId
        RETURNING available_balance AS "balanceAfter"   ← a 保证必命中
     c. INSERT INTO balance_transactions (user_id, type, amount, balance_after,
        reference_type, reference_id, description) VALUES (...)
     d. return { balanceAfter }
  3. [调用方] 更新单证快照/状态（如 adjustment_records.balance_after、audit 写）
});  ← 事务提交（失败整体回滚，含兜底建行）

事务提交后（路由层，不阻塞主响应；函数内部已尽力而为）：
  4. await adjustLedgerAvailable(userId, +amount)          ← Redis 热账本 available 增量同步
  5. if (Number(balanceAfter) >= 0) await clearNegativeFlag(userId)   ← 充值回正清除负余额强制预扣标记
  6. [R4] notifyUser(...)（见 §6）
```

### 4.3 并发安全说明

1. **建行幂等**：`INSERT ... ON CONFLICT (user_id) DO NOTHING` 由 PG 原子保证，N 个并发事务同时为同一用户建行时仅 1 个生效，其余 no-op，不报错不重复。
2. **增额不丢**：`UPDATE` 命中同一用户行时行级锁串行化 —— 第二个事务等待第一个提交后基于新值继续，最终余额 = 原值 + Σ(各笔增量)，无丢失更新。
3. **流水与余额强一致**：`balance_transactions` 与余额更新同事务，任一步失败整体回滚，杜绝"钱加了没流水"。
4. **乐观锁保留**：`version + 1` 语义与现状一致（供未来对账/冲突检测，本期不新增 CAS 校验，避免改变现有行为）。
5. **已知局限（本期不改）**：`UPDATE` 无 `AND available_balance >= amount` 负余额保护（现状调减/红冲同样没有；创建时预检查过，极端并发下可能短暂透支）—— 属 R6/R7 风控增强范围，本方案标注不扩大改动面。
6. **事务内不做 Redis**：`adjustLedgerAvailable`/`clearNegativeFlag` 在事务提交后调用（对齐 `coding-standards-api-db-test.md §2.5`「事务内不要做 Redis 操作」）；其内部自带 try/catch（`ledger.ts:206-218/246-254`），失败静默跳过，不影响主链路。

### 4.4 改造点清单（每处改动）

| # | 文件 | 位置（现状行号） | 改动 |
|---|------|----------------|------|
| 1 | `admin-finance-missing.ts` | POST review approve，232-263 行 | 保留 pending→paid 原子 UPDATE；将 240-260 行裸 UPDATE customer_balances + INSERT balance_transactions 替换为 `creditBalance(tx, { userId: order.userId, amount: order.amount, type: 'recharge', referenceType: 'recharge_order', referenceId: String(order.id), description: '人工上账审核通过 '+order.orderNo })`；**删除** `BALANCE_NOT_FOUND` 分支（不再可达） |
| 2 | `admin-adjust.ts` | 免审批生效，222-248 行 | `sign > 0`（调增）→ `creditBalance(tx, { type: 'adjustment', ... })`；`sign < 0`（调减）→ 保持现状 UPDATE（本期不收口，§11 Q6） |
| 3 | `admin-adjust.ts` | `applyApproval`（一级 approve / 二级 review），313-348 行 | 同上：调增方向 → `creditBalance`；调减方向保持 |
| 4 | `admin-adjust.ts` | 红冲 reverse，397-447 行 | 反向方向为 increase（原调减被冲回，加钱）→ `creditBalance`；反向 decrease（原调增被冲销，扣钱）→ 保持现状 |
| 5 | `recharge.ts` | 管理端 audit approve，379-410 行 | 同 #1：`creditBalance(tx, { type: 'recharge', referenceType: 'recharge_order', ... })`，删除 `BALANCE_NOT_FOUND` |
| 6（可选，建议顺手） | `recharge.ts` | 兑换码 redeem，261-283 行 | 同为"入账"语义，建议本期一并收口（`type:'recharge'`，referenceType='redemption'）；如不愿扩大改动面可标注 TODO 留二期，**不阻塞 R2 验收** |

> 收口后行为差异仅一处：无余额行用户不再 404，自动建行入账（验收标准"不再 404"）。正常路径 SQL 语义不变。

---

## 5. R3 权限点鉴权中间件

### 5.1 裁决

- **中间件位置**：`api/src/middleware/require-perm.ts`（**新建 `middleware/` 目录**，对齐 `coding-standards-api-db-test.md §4.1` 目录结构中的 `middleware/`）。
- **权限映射落点**：`api/src/lib/permissions.ts`（公共纯逻辑：`PERM_GROUPS`/`ROLE_PERMS`/`effectivePerms`/`hasPerm` 全部导出）；`admin-permissions.ts` 改为从该文件导入（删除内部副本），保证"权限树展示"与"路由鉴权"单源一致。
- **adminAuth 保留还是替换**：**保留 adminAuth 给非资金路由**（全部现有 admin 路由不动，避免放宽角色白名单导致大面积越权）；**本次资金路由显式替换**为 `requirePerm(permKey)`（其内部已含 jwtAuth 登录校验，`adminAuth` 的角色白名单不再适用于这些路由）。替换清单见 §5.4。

### 5.2 权限分配表

| 权限点 | finance | admin | super_admin | sales / agent / customer | 覆盖端点（`preHandler`） |
|--------|:---:|:---:|:---:|:---:|--------------------------|
| `finance.topup` | ✅ | ✅ | ✅ | ❌ | `GET /admin/manual-topup`、`POST /admin/manual-topup`、`POST /admin/manual-topup/:id/review`、`POST /admin/recharge-orders/:id/audit`、`POST /admin/recharge-orders/:id/reject`（裁决见下） |
| `finance.adjust` | ❌ | ✅ | ✅ | ❌ | `GET /admin/adjust/ledger`、`GET /admin/adjust/pending`、`POST /admin/adjust`、`POST /admin/adjust/:id/approve|review|reject|reverse` |

> `finance.adjust` 为**新增权限点**：`PERM_GROUPS` 财务组追加 `{ key: 'finance.adjust', label: '手动调账' }`；`ROLE_PERMS.admin` 追加 `'finance.adjust'`；`super_admin` 为 `['*']` 自动拥有；`finance` 不授。
>
> **recharge-orders 审核归 `finance.topup` 的裁决**：整改方案 FAQ 明确"finance 角色仅可审核人工上账**与充值订单**"（§七 常见问题），且 `SPEC-§30` 的 RECHARGE_MANAGE 语义与 `finance.topup` 一致 —— 故 audit/reject 挂 `finance.topup`，与人工上账同组放行 finance。若产品另有口径，见 §11 Q4。

### 5.3 代码级伪代码

```ts
// ============ api/src/lib/permissions.ts（从 admin-permissions.ts 迁移 + 扩展） ============
/** 权限分组树（权限管理页展示用） */
export const PERM_GROUPS: { group: string; permissions: { key: string; label: string }[] }[] = [
  { group: '财务', permissions: [
    { key: 'finance.refund', label: '退款审核' },
    { key: 'finance.topup', label: '人工上账' },
    { key: 'finance.adjust', label: '手动调账' },   // ← 新增
    { key: 'finance.invoice', label: '发票管理' },
    { key: 'finance.reconciliation', label: '对账报表' },
  ]},
  // ... 其余组原样迁移
];

/** 角色 → 权限 key 集合（单一主角色模型；super_admin='*' 通配） */
export const ROLE_PERMS: Record<string, string[]> = {
  super_admin: ['*'],
  admin: [/* 原样 */ 'finance.topup', 'finance.adjust', /* ... */],
  finance: ['finance.refund', 'finance.topup', 'finance.invoice', 'finance.reconciliation', 'customer.view'],
  agent: ['customer.view', 'customer.credit'],
  sales: ['customer.view', 'customer.edit'],
};

/** 展开通配符：'*' → 全部权限点 */
export function effectivePerms(role: string): string[] {
  if (ROLE_PERMS[role]?.includes('*')) return PERM_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));
  return ROLE_PERMS[role] ?? [];
}

/** 权限点判定（路由中间件与权限树共用） */
export function hasPerm(role: string, permKey: string): boolean {
  const eff = effectivePerms(role);
  return eff.includes('*') || eff.includes(permKey);
}
```

```ts
// ============ api/src/middleware/require-perm.ts（新建） ============
import { verifyToken } from '../services/auth/jwt';
import { hasPerm } from '../lib/permissions';
import { UnauthorizedError, ForbiddenError } from '../lib/errors';

/**
 * 权限点鉴权 preHandler：JWT 登录校验 + 权限点校验（组合守卫，替代资金路由的 adminAuth 角色白名单）。
 *
 * 与 adminAuth 的区别：adminAuth 只认 admin/super_admin 两个硬编码角色；
 * 本守卫按 ROLE_PERMS 静态映射（lib/permissions.ts）判定，支持 finance 等
 * 细粒度角色（P0-3 假授权修复）。登录失败 401，无权限 403。
 *
 * @param permKey - 权限点 key，如 'finance.topup' / 'finance.adjust'
 * @returns Fastify preHandler
 * @throws {UnauthorizedError} 401 未登录 / Token 失效
 * @throws {ForbiddenError} 403 无权限点（越权）
 */
export function requirePerm(permKey: string) {
  return async (request: any, _reply: any) => {
    const authHeader = request.headers.authorization;
    const token = authHeader?.split(' ')[1];
    if (!token) throw new UnauthorizedError('Missing token');
    const payload = verifyToken(token);
    if (!payload) throw new UnauthorizedError('Invalid or expired token');
    request.userContext = payload;                       // 与 adminAuth 一致注入
    const { role } = payload as { role: string };
    if (!hasPerm(role, permKey)) {
      throw new ForbiddenError(`无权限执行该操作（需要权限点 ${permKey}）`);
    }
  };
}
```

```ts
// ============ 路由挂载示例（admin-finance-missing.ts / admin-adjust.ts / recharge.ts） ============
import { requirePerm } from '../middleware/require-perm';

// 人工上账三端点：preHandler: [requirePerm('finance.topup')]
app.get('/api/v1/admin/manual-topup', { preHandler: [requirePerm('finance.topup')] }, handler);
app.post('/api/v1/admin/manual-topup', { preHandler: [requirePerm('finance.topup')] }, handler);
app.post('/api/v1/admin/manual-topup/:id/review', { preHandler: [requirePerm('finance.topup')] }, handler);

// 调账全端点：preHandler: [requirePerm('finance.adjust')]
// 充值订单 audit/reject：preHandler: [requirePerm('finance.topup')]
```

### 5.4 adminAuth 处置

- **保留**：`adminAuth`（或各文件局部 `jwtAuth+adminAuth`）继续服务其余 admin 路由（用户管理、风控、内容等），**不动**。
- **替换范围（仅 3 组资金路由）**：`admin-finance-missing.ts` 人工上账三端点、`admin-adjust.ts` 全部端点、`recharge.ts` 管理端 audit/reject。
- **兼容性**：替换后 admin / super_admin 行为不变（两者均拥有全部资金权限点）；新增 finance 角色可访问人工上账与充值审核；越权（sales/agent/customer 或 finance 调账）→ 403 `FORBIDDEN`（与现状 adminAuth 越权同码，前端 `extractError` 无需改动）。

### 5.5 前端按钮级权限

现状：`web-console` 无 `hasPerm` 工具，均为 `useAuthStore((s) => s.user?.role)` 直接比对（如 `ConsoleLayout.tsx:197`）。方案：

```ts
// ============ web-console/src/lib/permissions.ts（新增） ============
import { useAuthStore } from "../store/auth";

/** 前端 ROLE_PERMS 镜像（与 api/src/lib/permissions.ts 保持一致；仅展示层控制，真实安全在后端） */
const ROLE_PERMS: Record<string, string[]> = {
  super_admin: ["*"],
  admin: ["customer.view", "customer.edit", "customer.credit", "customer.verify",
          "finance.refund", "finance.topup", "finance.adjust", "finance.invoice",
          "finance.reconciliation", "supplier.view", "supplier.edit", "supplier.pricing",
          "sys.config", "sys.users", "sys.audit"],
  finance: ["finance.refund", "finance.topup", "finance.invoice", "finance.reconciliation", "customer.view"],
  agent: ["customer.view", "customer.credit"],
  sales: ["customer.view", "customer.edit"],
};

export function hasPerm(role: string | undefined, permKey: string): boolean {
  if (!role) return false;
  const eff = ROLE_PERMS[role];
  if (!eff) return false;
  return eff.includes("*") || eff.includes(permKey);
}

/** 按钮级权限 hook：读取 auth store 的 role */
export function usePerm(permKey: string): boolean {
  const role = useAuthStore((s) => s.user?.role);
  return hasPerm(role, permKey);
}
```

- `AdminManualRechargePage.tsx`：「发起上账」按钮 `{usePerm("finance.topup") && <button ...>发起上账</button>}`。
- `AdminAdjustPage.tsx`：「发起调账」按钮 `{usePerm("finance.adjust") && ...}`（finance 角色自动隐藏）。
- 说明：前端镜像与后端静态映射**双份维护**是现状妥协（后端 `ROLE_PERMS` 为代码常量、无 `/me/permissions` 端点）；二期若引入动态权限（R5+ / SPEC-§30 独立 roles 表），前端改拉取 `effective` 列表，本设计预留了 `hasPerm(role, key)` 的纯函数形态便于迁移。

---

## 6. R4 入账通知

### 6.1 裁决：站内信写入 `notifications` 表（非 `user_notifications`）

| 项 | 现状事实 | 裁决 |
|----|---------|------|
| 用户端站内信通道 | `/me/notifications`（`me.ts:484`）读 **`notifications`** 表；`admin-consumption.ts` 手动提醒也写它 | **站内信写 `notifications`**，`type='recharge_success'`（未在 `NOTIFICATION_CATEGORY` 映射时兜底归入 system 分类，用户可见） |
| `user_notifications` 表 | 价格变更专用：`tier` varchar(1) NOT NULL、`price_change_log_id` FK、`is_weekly_summary`；`/me/notifications` 不读它 | **不写入**（写了用户看不到，通知闭环断裂）；任务字面要求与代码事实冲突，本裁决需调度/产品确认（§11 Q3） |
| 邮件模板 | `email_templates` 表存在（支持 `{{变量}}` 插值），**无 `recharge_success` 模板** | 模板查询按 `name='recharge_success'`；**不存在 → 纯站内信 + `email_logs` 不写/记 skipped，预留模板名**（产品在后台建模板后自动生效，代码零改动） |
| 用户偏好 | `users` 表无偏好字段；现成机制为 `system_config` key=`notification_policies_list`（channel/event_type/enabled） | 邮件是否发送按策略：`channel='email' && event_type='recharge.success'`，无策略行时**默认发送**（策略行 `enabled=false` 时跳过） |

### 6.2 服务签名

```ts
// ============ api/src/services/notify.ts（新建） ============

/** notifyUser 入参 */
export interface NotifyParams {
  /** 收件用户 ID（站内信必发目标） */
  userId: number;
  /** 通知事件类型（notifications.type），本期统一 'recharge.success' */
  event: string;
  /** 站内信标题 */
  title: string;
  /** 站内信正文（纯文本，用户端 /me/notifications 直接展示） */
  content: string;
  /** 邮件模板名（email_templates.name），如 'recharge_success'；模板缺失 → 纯站内信 */
  templateName?: string;
  /** 模板 {{变量}} 插值（amount / orderNo / balanceAfter 等） */
  templateVars?: Record<string, string | number>;
  /** notifications.metadata（订单号/金额/单证 ID，审计与前端展示用） */
  metadata?: Record<string, unknown>;
}

/**
 * 入账通知：站内信（必发）+ 按用户偏好发邮件（尽力而为）。
 *
 * 调用约定：必须在主事务 COMMIT 之后调用（通知失败绝不回滚资金）。
 * 内部逐通道 try/catch，任何失败仅记日志/返回状态，不向外抛错，
 * 保证主链路（入账响应）不受通知故障影响（对齐 admin-consumption.ts
 * notifyHandler 的"先站内信后邮件"顺序，但改为尽力而为、可异步）。
 *
 * @param params - 见 NotifyParams
 * @returns { inApp: boolean; email: 'sent' | 'skipped' | 'failed' | 'no_template' }
 */
export async function notifyUser(params: NotifyParams): Promise<{ inApp: boolean; email: string }> { /* 见 6.3 */ }
```

**实现步骤（内部）**

```
1. 站内信（必发）：
   await db.insert(schema.notifications).values({
     userId, type: event, title, content,
     metadata: params.metadata ?? null,
   }).catch(e => { logger.error('[notify] in_app failed', e); return null; });
   → inApp = 是否插入成功
2. 邮件（按偏好，默认发送）：
   a. 读 notification_policies_list（system_config），找 { channel:'email', event_type: event }：
      行存在且 enabled=false → 返回 email='skipped'（策略关闭）
   b. 查 email_templates where name = templateName：
      无 → return email='no_template'（纯站内信，预留模板名；不写 email_logs）
   c. 渲染：subject = tpl.subjectZh 替换 {{vars}}；html = tpl.bodyHtmlZh 替换 {{vars}}
      （本期只做简单 String.replace 插值，不做转义引擎 —— 模板为后台受信内容）
   d. const res = await sendMail({ to: user.email, subject, html, templateName });
      → email = res.ok ? 'sent' : res.skipped ? 'skipped' : 'failed'
      （sendMail 本身写 email_logs；SMTP 未配置返回 skipped，不抛错 —— mailer.ts:60-65）
3. 返回 { inApp, email }（调用方并入 audit details）
```

### 6.3 调用点（各一处，均在事务提交后）

| # | 文件 | 触发时机 | 参数要点 |
|---|------|---------|---------|
| 1 | `admin-finance-missing.ts` | POST review approve 事务提交后 | `event:'recharge.success'`；`title:'充值到账通知'`；`content:'您的账户已入账 ¥X，当前余额 ¥Y'`；`templateName:'recharge_success'`；`templateVars:{ amount, balanceAfter, orderNo }`；`metadata:{ orderId, orderNo }` |
| 2 | `admin-adjust.ts` | 免审批生效 / `applyApproval`（一级 approve、二级 review）生效后，即 status→approved 的**每个入口**（共 3 个代码点，语义均为"调账生效"） | 同上 `event/template`；`content` 区分"调账(调增/调减)生效"文案；`metadata:{ adjustmentId, direction, amount }` |
| 3 | `recharge.ts` | 管理端 audit approve 事务提交后 | `metadata:{ orderId, orderNo }` |

- **事件/模板统一裁决**：三处统一 `event='recharge.success'` + `templateName='recharge_success'`（一期最小改动，通知策略与模板单点维护）；二期细分 `adjustment.success` 等事件再做策略拆分（§11 Q5）。
- **审计**：扩展现有 audit `details`，追加 `notification: { in_app: true, email: 'sent'|'skipped'|'no_template'|'failed' }`（对齐 `admin-consumption.ts:509-513` 的 email 状态记录风格）。
- **异步性**：实现允许两种形态，推荐 **同步 await**（`notifyUser` 内部全 catch 不抛，主响应延迟为一次 DB 插入 + 可选 SMTP；量级可控）；若需严格不阻塞，可 `setImmediate(async () => await notifyUser(...))`（对齐编码规范 §4.4）。**禁止**把 notifyUser 放进资金事务。
- **`[?]` 合规**：本期新增按钮（发起上账）与涉及的资金操作按钮（审核通过/驳回/发起调账）须按 PRODUCT-DESIGN-PRINCIPLES P1 补齐按钮级帮助，文案引用整改方案 §七对照表。

---

## 7. 数据模型变更

### 7.1 结论：仅 1 项新 migration（0027），无新表

| 变更 | 内容 | 必要性 |
|------|------|--------|
| **migration 0027** | `recharge_orders` 增加 `idempotency_key varchar(100) NULL` + 唯一索引 `uq_recharge_orders_idempotency_key` | 幂等 L2 DB 兜底（§3.4）—— R1 唯一必须迁移项 |
| `recharge_orders` 其余字段 | `order_no` unique / `amount` numeric(18,2) / `currency` / `method` / `status` 枚举 / `paid_at` / `note` text / `metadata` jsonb | **够用**：凭证扩展字段（`evidence_url`/`transfer_no`/`reviewer_id`，P1-9）本期先存 `metadata`，R9 凭证上传落地时再评估专列 |
| 其他表 | `customer_balances` / `balance_transactions` / `adjustment_records` / `notifications` / `email_templates` / `system_config` | **零变更**（R2 纯 SQL 语义；R4 全复用现有表） |

**migration 0027 草案**

```sql
-- 0027_recharge_orders_idempotency.sql
-- R1 人工上账创建幂等：L2 DB 唯一兜底（L1 为 Redis 锁，见 ARCH-...R1R4 §3.4）
ALTER TABLE recharge_orders ADD COLUMN idempotency_key varchar(100);

-- 唯一索引：存量行 idempotency_key 全 NULL，PG 唯一索引允许多个 NULL，无需数据回填
CREATE UNIQUE INDEX uq_recharge_orders_idempotency_key ON recharge_orders (idempotency_key);

-- 兜底：万一历史数据存在同 key 重复（理论不可能，本列为新列），上线前先跑
-- SELECT idempotency_key, count(*) FROM recharge_orders GROUP BY 1 HAVING count(*) > 1;  预期 0 行
```

- 同步更新 `api/src/db/schema/recharge-orders.ts` 增加 `idempotencyKey: varchar('idempotency_key', { length: 100 })`（唯一索引用 `uniqueIndex` 声明，与 schema 类型层一致；partition 表 0025 不涉及本表，可直接 drizzle-kit generate 或手写 SQL，**禁止 db:push**）。
- 遵循 `coding-standards-api-db-test.md §2.3`：migration SQL 提交 Git、人工检查后执行、生产前备份。

---

## 8. 测试清单

运行方式：仓库根 `pnpm test`（= api vitest run，真实 PG + Redis 测试实例，风格对齐 `admin-risk-finance.test.ts`：`buildTestApp()` + `app.inject` + 独立 `ts` 时间戳 + `afterAll` 清理）。

| # | 用例 | 挂载文件 | 验证点 |
|---|------|---------|--------|
| 1 | 创建上账成功 | `api/src/routes/admin-manual-topup.test.ts` | 201；`recharge_orders` 落库 `method='manual'`、`status='pending'`、`order_no` 以 MT 开头、`metadata.transfer_no` 正确；audit `manual_topup.create` 有记录 |
| 2 | 创建-参数校验 | 同上 | amount=0 / 负数 / > 上限 → 400 `VALIDATION_ERROR`；缺 note → 400；`evidence_url` 传入 → 400；user_id 不存在 → 404；frozen 用户 → 400 |
| 3 | 创建-幂等（同 Idempotency-Key 重复提交） | 同上 | 首请求 201；同 key 重放（Redis 缓存命中）→ 200/409 且 `recharge_orders` 仅 1 行（`where idempotency_key=key` count=1）；杀 Redis 缓存后重放 → L2 唯一约束 409，仍 1 行 |
| 4 | 审核通过-无余额行兜底（R2） | 同上 | 用户**无** `customer_balances` 行 → POST review approve → 200；`customer_balances` 行自动创建且余额=amount；`balance_transactions` 1 条（type='recharge'，balance_after 正确） |
| 5 | 审核通过-正常路径 | 同上 | 有余额行 → approve → 200；余额 +amount；流水 balance_after 快照正确；重复 approve → 409 `ORDER_ALREADY_PROCESSED` |
| 6 | 审核通过-通知触发（R4） | 同上 | approve 后 `notifications` 表新增 `type='recharge_success'` 记录（userId/标题/正文）；SMTP 未配置时 email='skipped' 且不报错；audit details 含 `notification` 状态 |
| 7 | 越权-权限点（R3） | 同上 | finance 角色创建/审核 → 200；sales 角色 → 403 `FORBIDDEN`；customer 角色 → 403；未登录 → 401 |
| 8 | `creditBalance`-无行兜底 | `api/src/services/billing/balance.test.ts` | 事务内调用：INSERT ON CONFLICT 建行 → UPDATE 增额 → 流水；返回 balanceAfter；事务回滚时三写全部回滚 |
| 9 | `creditBalance`-有行 | 同上 | 已有行：余额正确累加、version+1、流水一条、不产生第二行 |
| 10 | `creditBalance`-并发 | 同上（可选） | 同用户并发 10 次 creditBalance（Promise.all 各自事务）→ 余额=10×amount，流水 10 条（不丢更新） |
| 11 | 调账-生效走收口（R2） | `api/src/routes/admin-adjust.test.ts`（或并入 #8） | 无余额行用户调增免审批生效 → 自动建行 + 余额正确 + 流水 type='adjustment'；一级/二级审批生效同验；红冲（加钱方向）同验 |
| 12 | 充值审核-走收口（R2） | `api/src/routes/admin-risk-finance.test.ts` 扩展或新建 | 无余额行用户 audit → 自动建行 + 余额正确；audit 后 notifications 有 `recharge_success` 记录 |
| 13 | `requirePerm`-权限矩阵 | `api/src/middleware/require-perm.test.ts` | `hasPerm`：super_admin('*') 全放行；admin 有 finance.topup/finance.adjust；finance 有 finance.topup 无 finance.adjust；sales 全无。中间件：无 token 401、坏 token 401、无权限 403、有权限 放行（userContext 注入） |
| 14 | 越权-调账（R3） | `api/src/routes/admin-adjust.test.ts` | finance 角色 POST /admin/adjust → 403；admin → 201/200 |

> 复用现有测试基建：`generateAccessToken({ userId, email, role })` 签发三角色 token（admin / finance / sales）；`buildTestApp()` 挂载被测路由 + 必要时 `app.setErrorHandler`（参考 `sales-support.test.ts:137`）。未覆盖：邮件真实外发（SMTP 集成留 test-agent 手工项）、前端按钮显隐（web-console 由 test-agent E2E 或人工验收）。

---

## 9. 兼容性、风险与回滚方案

### 9.1 兼容性

| 对象 | 结论 |
|------|------|
| GET `/admin/manual-topup` 列表契约 | 不变（`evidence_url: null` 等占位字段保持；新增订单出现在列表 pending 页签） |
| POST `/admin/manual-topup/:id/review` 契约 | 不变（响应 `{ id, status, balance_after }` 不变）；驳回路径零改动 |
| 用户端充值链路 | 不受影响（`ALLOWED_METHODS` 不含 manual；R2 收口只影响管理端审核路径） |
| 调账/充值审核响应契约 | 不变（仅内部实现换 `creditBalance`，对外字段一致） |
| admin / super_admin 操作权限 | 不变（两者拥有全部资金权限点）；新增 finance 角色获得人工上账/充值审核能力（预期行为） |
| JWT / adminAuth | 其余 admin 路由原样保留，不动 |
| 数据库 | 0027 仅加可空唯一列，存量数据全 NULL 安全，无需回填 |

### 9.2 风险与缓解

| 风险 | 等级 | 缓解 |
|------|:---:|------|
| R2 改造 3+1 处资金路径引入回归（余额算错/重复入账） | 高 | §8 用例 4/5/8/9/11/12 覆盖正常+兜底+并发；`creditBalance` 为纯增量 SQL 语义，与现状 SQL 逐字对齐；上线前全量 `pnpm test` |
| R3 权限映射遗漏导致误拒（admin 被 403） | 中 | §8 用例 7/13/14 三角色矩阵覆盖；`ROLE_PERMS` 迁移时逐 key 核对 admin 全量权限 |
| R4 邮件误发真实用户（SMTP 已配置时） | 中 | 本期模板 `recharge_success` 不存在 → 自动纯站内信（`no_template`），**邮件通道默认不发**；模板上线前 test-agent 用测试 SMTP 验证；站内信内容走审核后可控文案 |
| 幂等唯一索引与 Redis 锁竞态（释放误删锁） | 中 | 复用 `RELEASE_LOCK_LUA` token 校验释放（idempotency.ts:69-74）；L2 唯一约束最终兜底 |
| 并发重复审核（双击） | 中 | 现状 `where status='pending'` 原子守卫保留，R2 收口不改此语义 |
| 前端权限双份维护漂移 | 低 | 后端为唯一安全源；前端仅展示层；二期动态权限时收敛（§5.5） |

### 9.3 回滚方案

| 层面 | 回滚动作 |
|------|---------|
| 代码 | 各改动点可独立回退：删 R1 创建端点（存量 manual 单可继续 review 或 reject 清理，无资损）；R2 还原为裸 UPDATE（balance_transactions 已写、无重复副作用）；R3 还原 adminAuth；R4 移除 notifyUser 调用即可 |
| 数据库 | 0027 禁止手改已提交文件；回滚 = 追加新 migration `DROP INDEX uq_recharge_orders_idempotency_key; ALTER TABLE recharge_orders DROP COLUMN idempotency_key;` |
| 数据 | 本期无自动资金变动（创建仅生成 pending 单，审核才入账），回滚窗口内不会产生需要冲正的记录 |

---

## 10. 与 §29 platform_ledger 的预留钩子（本期不实现）

现状：`platform_ledger` 表**不存在**（grep 全仓无匹配），属 R8 建表范围。本期为避免二期返工，预留以下写入点：

1. **写入点 = `creditBalance` 函数体**（§4.2 步骤 2 与步骤 2c 之间）：二期 R8 在此追加
   `tx.insert(platformLedger).values({ entry_type, amount, user_id, operator_id, related_order_no, payment_channel, created_at })` 即可，**所有调用点零改动** —— 因为本期三个入账路径已全部收口到 creditBalance。
   - entry_type 映射预留：`type='recharge'` → `'user_recharge'`；`type='adjustment'` → `'internal_adjust'`（对齐整改方案 §2.7 口径）。
2. **operatorId 来源已预留**：R1 创建订单 `metadata.created_by`（§3.2）；调账 `adjustment_records.requested_by/approved_by` 现有；R8 读单证即可，无需本期新增字段。
3. **relatedOrderNo 来源已预留**：R1 `order_no`（MT 前缀）、调账 `reference_no` 现有。
4. **对账口径一致性**：`balance_transactions`（本期已收口统一写）与未来 `platform_ledger` 同事务写入（R8 时 creditBalance 内同步），保证 §29 T+1 对账无口径分裂。
5. **不建表**：本期**不创建** platform_ledger 表/列（超 R1–R4 范围，避免空表与迁移噪音），仅在 ARCH 文档层固化上述钩子，交付给二期 R8。

---

## 11. 需要调度/产品确认的开放问题

| # | 问题 | 背景 | 本期默认裁决（可先行实施） | 责任人 |
|---|------|------|--------------------------|--------|
| Q1 | 人工上账单笔上限默认值 | 代码 `MAX_AMOUNT=1,000,000` vs ref-2.2.6 对公 ¥50,000（P2-14 口径不统一） | **¥50,000**，配置化 `system_config finance_rules` 可覆盖 | 产品-agent |
| Q2 | 充值订单审核（audit/reject）是否放行 finance 角色 | 整改方案 FAQ 说"finance 可审核人工上账与充值订单"；R3 表只给了 manual-topup/adjust 两个权限点 | **挂 `finance.topup` 放行 finance** | 产品-agent |
| Q3 | R4 站内信写入表：`notifications` vs `user_notifications` | 任务字面要求 `user_notifications`，但用户端 `/me/notifications` 读 `notifications`；`user_notifications` 为价格变更专用表（tier NOT NULL） | **写 `notifications`（type='recharge_success'）**，否则通知闭环用户不可见 | 调度-agent（与任务书冲突） |
| Q4 | R4 三处通知是否统一 `recharge.success` 事件 | 调账/人工上账/充值审核语义不同；模板仅预留 `recharge_success` 一个 | **统一**，二期细分 `adjustment.success` | 产品-agent |
| Q5 | 幂等重复提交响应：409 vs 回放首次响应 | R10 整改项预留；本期只需"重复提交被拒" | **409 `IDEMPOTENCY_CONFLICT` + L1 缓存命中时回放** | 调度-agent |
| Q6 | R2 是否收口调减/红冲扣钱方向 | 任务列了"红冲"走 creditBalance，但扣钱方向与函数语义（加钱）不符 | **仅收口加钱方向**；扣钱方向保持现状 UPDATE，二期 R12 统一 | 调度-agent |

---

## 附：实现顺序建议（给 backend-agent / frontend-agent）

1. **P0 地基**：`lib/permissions.ts`（抽权限映射 + 新增 finance.adjust）→ `middleware/require-perm.ts` → migration 0027 + schema 更新。
2. **R2 收口**：`balance.ts` 新增 `creditBalance` → 三处路由改造（含测试 #8/#9 先行，保证语义不变）。
3. **R1 创建端点**：`admin-finance-missing.ts` 新增 POST + 幂等接入 + 审计。
4. **R3 鉴权替换**：三组资金路由 preHandler 替换 + 前端 `usePerm`。
5. **R4 通知**：`services/notify.ts` → 三处调用点 + audit 扩展。
6. **前端**：`AdminManualRechargePage` 发起上账表单 + 按钮显隐 + `[?]` 帮助。
7. **收尾**：§8 全量用例通过（仓库根 `pnpm test`），review-agent 门禁。

---

## 12. 双签裁决记录（调度主持，2026-08-18，Gate 1 ✅）

> 参与方：调度-agent（主持）、product-agent（PRD v1.0）、arch-agent（ARCH v1.0）。
> 裁决依据：PRD §10 待裁决清单（A1–A8）+ ARCH §11 开放问题（Q1–Q6）+ 调度对现状代码的独立核验（`me.ts:484` notifications 表、`user_notifications` 价格变更专用、`AdminManualRechargePage.tsx` 路由存在）。
> **本记录为 backend-agent / frontend-agent 实现的最终权威契约；与 PRD/ARCH 正文冲突处以本记录为准。**

### 12.1 裁决表

| 项 | 裁决 | 说明 |
|----|------|------|
| A1 / Q1 单笔上限 | **¥50,000**，配置化 `system_config finance_rules`（默认 50000），读失败回退常量 | 采纳建议值；>50,000 本期拒绝创建，R5 分级放开 |
| A2 单日累计上限 | **本期不设限** | 与对公口径一致；R6 补 24h 限额与拆分规避 |
| A3 站内信可关闭性 | **强制开启不可关闭**（资金到账强通知） | 邮件按偏好；R4 交付附文档修订：`SPEC-§22` §22.6 事件表 `recharge_success` 站内信改"不可关闭" |
| A4 / Q2 充值订单审核权限 | **audit + reject 挂 `finance.topup`，放行 finance 角色** | 对齐 SPEC-§4 §4.4 适用角色（财务） |
| A5 新增 `finance.adjust` | **新增权限点**（财务组 `{ key:'finance.adjust', label:'手动调账' }`），仅授 admin/super_admin | 同步后端 ROLE_PERMS 与前端镜像 |
| A6 `topup_type` | **本期不新增字段/列**；`transfer_no`/`evidence_remark` 按**可选**写入 `metadata`；"对公凭证/单号必填"校验**后置 R9**（本期无凭证上传能力，无法强制必填） | PRD 3.1.2 相应验收项调整（见 12.2） |
| A7 用户状态 | **仅 active 可入账**；frozen/禁用 拒绝（400 `VALIDATION_ERROR`，提示"请先解锁"） | 收窄 ARCH §3.2 的 "active/suspended" 口径 |
| A8 `reviewer_id` | **本期写入 `recharge_orders.metadata`（review 通过时记录 reviewer_id/review_note）**，不新增列 | 正式落库随 R9 凭证方案 |
| Q3 站内信写入表 | **写 `notifications` 表**，`type='recharge_success'`（PRD 中 `user_notifications` 引用**更正**） | 已核验：`/me/notifications` 只读 `notifications`（`me.ts:484`）；`user_notifications` 为价格变更专用（`tier` NOT NULL + `price_change_log_id`） |
| Q4 事件命名 | 三处统一 **`recharge_success`**（`notifications.type` 与 `email_templates.name` 同名，与 SPEC-§22 事件表一致） | 修正 ARCH §6 的 `recharge.success` 双命名；二期细分 `adjustment_success` |
| Q5 幂等重复响应 | **409 `IDEMPOTENCY_CONFLICT`**；L1 Redis 缓存命中时回放首次响应（200 + `X-Idempotent-Replay:true`） | 与整改方案"重复创建同单号被拒"一致 |
| Q6 收口范围 | **仅收口"加钱方向"**（人工上账审核 / 调账免审批生效+一级+二级 / 红冲加钱 / 充值审核 audit）；**调减、红冲扣钱方向保持现状 UPDATE**；**兑换码 redeem 本期不收口**（保持现状，`creditBalance` 注释标注为未来统一点） | 收窄 ARCH §4.4 改造点 6 为"不实施（标注 TODO）" |

### 12.2 对 PRD 验收项的裁决调整

| PRD 验收项 | 调整后口径 |
|-----------|-----------|
| R1"对公到账（bank_transfer）凭证与转账单号必填；平台赠送（grant）选填" | 本期实现为："`transfer_no` 填写则全平台唯一 + `evidence_remark` 可记录（均入 metadata）"；凭证上传与"对公必填"校验随 R9 落地后验收 |
| R1 字段表 `topup_type`（A6） | 本期不落库；创建表单仍可提供"对公到账/平台赠送"选择（仅用于前端提示），但不作为后端必填驱动 |
| R2"调账生效 / 充值订单审核两条现有路径同样具备兜底" | 覆盖三条管理端入账路径（人工上账审核 / 调账生效 / 充值审核 audit）；兑换码路径不在本期验收范围 |
| R3"审核人（reviewer_id）在审核时落库" | 落库于 `recharge_orders.metadata.reviewer_id`（本期）；正式列随 R9 |

### 12.3 遗留（二期，不在本期 Gate）

- 凭证上传与必填校验（R9）、reviewer_id 正式列（R9）、`platform_ledger` 写入（R8，钩子见 §10）、调账幂等（R10）、兑换码收口、`adjustment_success` 事件细分。

### 12.4 补充裁决 D1/D2（2026-08-18，frontend-agent 交付后追加）

> 背景：frontend-agent 实现时发现两个阻断 PRD R3 验收（"finance 角色可发起、可审核人工上账；前端可见对应入口"）的缺口，调度核实后追加裁决。

| 项 | 缺口 | 裁决 | 责任人 |
|----|------|------|--------|
| **D1** | finance 角色在人工上账页搜索用户时调用 `GET /admin/customers`（`admin-customers.ts:135`）被 adminAuth 拒绝（403），前端仅有"直接输入用户 ID"兜底，无法回显余额/状态 | **新增专用轻量搜索端点** `GET /api/v1/admin/manual-topup/users?search=&page_size=10`（`requirePerm('finance.topup')`）：按 邮箱/用户ID/手机号 搜索，返回 `{ id, email, name, status, available_balance }`，最多 10 条；不放开 `GET /admin/customers`（避免 agent/sales 越权看全量客户列表）。前端选择器改调该端点 | backend-agent（新增端点）/ frontend-agent（切换调用） |
| **D2** | finance 角色无管理侧边栏：`ConsoleLayout.tsx:197,212,238` 仅 admin/super_admin 渲染管理导航，finance 落入 PORTAL_NAV，无法导航到人工上账页 | **本期为 finance 角色渲染最小"财务导航"**：菜单项 = `FINANCE_NAV`（人工上账 finance.topup / 充值订单 finance.topup / 退款审核 finance.refund / 发票审核 finance.invoice / 对账报表 finance.reconciliation / 客户列表 customer.view），逐项 `usePerm` 过滤；admin/super_admin 保持全量导航不变；topbar roleLabel 增补 FINANCE；PORTAL_NAV 条件排除 finance | frontend-agent |

> 说明：D2 属 P0-3"假授权"的前端残留修复，纳入本期 Gate 3 验收；完整权限菜单收敛（全部角色 × 全部菜单）随 SPEC-§30 动态权限二期统一。D1/D2 均不改变后端资金契约。
