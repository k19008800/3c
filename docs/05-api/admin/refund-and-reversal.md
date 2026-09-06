# API：管理端退款/红冲（refund-and-reversal）

- 文档 ID：API-BILLING-003-RF
- 状态：approved
- 生效版本：v1.0.0
- 主权威来源：`docs/ref-4.4-finance.md` §4、`docs/ref-9.5-refund.md` §7、`docs/supplement/03-充值退款状态机.md` §三（ADR 冲突处均以 ADR-0003/ADR-0020 为准）
- 上游 ADR：ADR-0001、ADR-0003、ADR-0004、ADR-0008、ADR-0009、ADR-0011、ADR-0020
- 关联 SPEC：`../../../03-functional-spec/03-billing-and-finance/refund-and-reversal.md`
- 关联状态机：`../../../06-data-and-architecture/state-machines/refund.md`

> **说明**：本文件为退款/红冲 topic 的专属 API 契约。为便于与其他核心资金主题（人工上账/调账/结算）并行编写后统一合并，本文件不覆盖 `05-api/admin/finance.md`；合并时由调度统一并入 `finance.md`。

## 覆盖范围
退款（余额退款 / 充值订单原路退款）与红冲（调账/人工上账纠错）的管理端接口。仅覆盖本 topic；人工上账/调账/充值审核/对账端点见各自专属文档。

## 统一约束（全 endpoint 生效）
1. **2FA**：审核、执行、红冲等**资金写端点**强制操作级 2FA，`super_admin` 不豁免（ADR-0008）。
2. **幂等**：创建类端点强制 `Idempotency-Key`；审批/执行/红冲纳入统一幂等规范并做状态条件更新（ADR-0009）。
3. **权限**：后端按权限点鉴权，角色仅作聚合；无权限 `403 PERMISSION_DENIED`；创建人 ≠ 审批人、初审 ≠ 复审（ADR-0004）。
4. **禁负余额**：余额不足的扣减/冲销返回受控业务错误 `INSUFFICIENT_BALANCE`，不写负余额；无平台垫付优先抵扣（ADR-0020）。
5. **金额精度**：输入 ≤2 位小数，内部 `numeric(18,8)`，佣金 `numeric(18,4)`；禁止 JS Number 做最终计算（ADR-0002）。
6. **账本**：当前版本不写 `platform_ledger`；余额与对账依据 `customer_balances` / `balance_transactions` / 业务单据 / `billing_logs`（ADR-0012）。
7. **响应格式**：成功 `{ code:0, message:"ok", data, request_id }`；列表 `items/page/page_size/total`；错误 `code/message/details/request_id`，不返回业务 data（ADR-0011）。

> **契约状态标注**：当前仓库 `api/src/db/schema/gap-fix-2026-08.ts` 的 `refund_requests` 仅实现 `pending|approved|rejected` 三态，与 ADR 状态机（`pending→approved→processing→completed`，含 `rejected`/`failed`）存在差距。以下端点凡依赖 `processing/completed/failed` 的，落地前需迁移表补齐状态；未经路由/测试 audit 的端点不得标记 `implemented`。

---

## A. 权限点

| 权限点 | 角色 | 说明 |
|--------|------|------|
| `refund.create` | 运营/客服、财务 | 发起退款/红冲；创建人不得审批本人单据 |
| `refund.review.first` | 财务员 | 初审 |
| `refund.review.second` | 财务主管/管理员 | 复审（>¥10k 必需） |
| `refund.review.super` | `super_admin` | 终审（>¥100k 追加） |
| `refund.execute` | 财务员/财务主管/超管 | 执行/重试（需 2FA） |
| `refund.void` | `super_admin`（`【待人工裁决】`） | 作废未执行/误建申请 |

权限点鉴权规则按 ADR-0004：前端显隐不替代后端校验，无权限统一 `403 PERMISSION_DENIED`。

---

## B. 端点

### B.1 发起退款/红冲
`POST /api/v1/admin/refunds`

- 权限点：`refund.create`；`Idempotency-Key` 必填。

**请求**：
```json
{
  "userId": 10086,
  "refundType": "balance_refund",        // balance_refund | channel_refund | reversal
  "amount": "200.00",
  "refReason": "API 失败多扣",
  "refCallLogId": null,                   // balance_refund 关联计费单据（可选）
  "refOrderId": 123,                      // channel_refund 关联充值订单
  "channel": "alipay",                    // channel_refund 原路通道
  "notifyUser": true,
  "note": "客服核实确认"
}
```

**字段与校验**：

| 字段 | 必填 | 规则 | 依据 |
|------|------|------|------|
| `userId` | 是 | 有效用户且未注销 | ref-9.5 §8 |
| `refundType` | 是 | `balance_refund` / `channel_refund` / `reversal` | ADR-0020 |
| `amount` | 是 | ≤2 位小数；≤ 可退金额上限；原单金额不可改/删 | ADR-0002/0020 |
| `refReason` | 是 | 文本 | ref-9.5 |
| `refCallLogId` | 条件 | `balance_refund` 关联计费单据 | ADR-0020 |
| `refOrderId` | 条件 | `channel_refund` 关联充值订单 | ADR-0020 |
| `channel` | 条件 | 原路渠道（alipay/wechat/bank_transfer） | ref-4.4 §2 |
| `notifyUser` | 否 | 默认 true | ADR-0010 |
| `note` | 否 | 文本 | ref-9.5 |

**类型分支校验（ADR-0020）**：
- `balance_refund` → 关联计费单据；余额只增加一次（同一业务事件仅允许一次补偿）。
- `channel_refund` → 关联充值订单；**不得同时执行余额回滚**。
- `reversal` → 关联待纠错原单；生成独立反向资金记录，不使用"退款"语义。

**响应（201）**：
```json
{ "code": 0, "message": "ok", "data": { "id": 5001, "refundNo": "RF-260731-0001", "status": "pending" }, "request_id": "req_..." }
```

**错误**：`400` 参数校验；`403 PERMISSION_DENIED`；`409 DUPLICATE_BUSINESS_REFERENCE`（重复业务凭证）；`409 IDEMPOTENCY_CONFLICT`（同 Key 异摘要）；`503 IDEMPOTENCY_UNAVAILABLE`。

### B.2 退款/红冲列表
`GET /api/v1/admin/refunds`

| Query | 说明 |
|-------|------|
| `page` / `page_size` | 分页 |
| `status` | `pending`/`approved`/`processing`/`completed`/`rejected`/`failed` |
| `refund_type` | `balance_refund`/`channel_refund`/`reversal` |
| `start_date` / `end_date` | 时间范围 |
| `search` | 订单号/用户昵称 |

**响应**：`{ code:0, message:"ok", data:{ items, page, page_size, total }, request_id }`，items 含 refundNo/用户/金额/类型/状态/申请时间/操作。

### B.3 退款/红冲详情
`GET /api/v1/admin/refunds/:id`
返回明细、用户账户状况、审核/执行时间线、流水与审计关联（ref-4.4 §4.2）。

### B.4 审核
`POST /api/v1/admin/refunds/:id/review`

- 权限点：`refund.review.first` / `.second` / `.super`；操作级 2FA 必填；幂等。

**请求**：
```json
{ "action": "approve", "stage": "first|second|super", "note": "金额核对一致" }
```

**审批阈值（ADR-0001）**：
- ≤ ¥10,000：单人（`first` 通过即可）。
- > ¥10,000 且 ≤ ¥100,000：双人（`first` + `second`，不同人）。
- > ¥100,000：双人 + `super_admin` 终审（`super`）。

**职责分离（ADR-0004）**：创建人 ≠ 审批人；初审 ≠ 复审；终审不与前级重复，违者返 `403/409`。
**响应**：终审通过 → `approved`；未达终审档则推进 `review_stage`。

### B.5 驳回
`POST /api/v1/admin/refunds/:id/reject`

**请求**：
```json
{ "rejectReason": "...", "operation2fa": "..." }
```
**响应**：状态 → `rejected`（终态）。无权限 `403 PERMISSION_DENIED`；缺 2FA `403 OPERATION_2FA_REQUIRED`。

### B.6 执行 / 重试
`POST /api/v1/admin/refunds/:id/execute`

- 权限点：`refund.execute`；2FA + `Idempotency-Key` 必填；状态条件更新（仅 `approved` 可执行，`failed` 可重试）。

**请求**：
```json
{ "operation2fa": "...", "idempotency_key": "rd-..." }
```

**执行语义（按 ADR-0020/0006）**：

| 类型 | 执行动作 |
|------|---------|
| `balance_refund` | 事务内：校验余额 → `UPDATE customer_balances ... RETURNING` + `INSERT balance_transactions(type='refund', balance_after)` + 更新单据状态 + 审计；余额为负则回滚 `INSUFFICIENT_BALANCE`，写流水与余额强一致 |
| `channel_refund` | 调用支付通道原路退款（异步回调）→ 成功后更新充值订单退款状态；**无余额回滚**；通道失败 `failed` 可重试（≤3 次） |
| `reversal` | 生成独立反向资金记录 → 成功生效后原单转 `reversed`（失败不得转 `reversed`）；如需扣减余额则受禁负校验 |

**响应**：`processing → completed`；执行异常 → `failed`（可重试）。

### B.7 作废（`【待人工裁决】`）
`POST /api/v1/admin/refunds/:id/void`
作废未执行/误建的退款申请。**作废语义（能否作废已 `approved` 未执行单、与审计/幂等的关系）待人工裁决；确认前不标 `implemented`。**

### B.8 退款/红冲统计
`GET /api/v1/admin/refunds/summary`
按日/周/月汇总退款笔数、金额，按类型拆分（ref-9.5 §7 summary 端点扩展）。

---

## C. 错误码（本 topic，ADR-0011/0008/0009）

| 场景 | HTTP | code |
|------|------|------|
| 无权限 | 403 | `PERMISSION_DENIED` |
| 缺/未启用操作 2FA | 403 | `OPERATION_2FA_REQUIRED` |
| 2FA 错误/过期/重放 | 403 | 2FA 固定错误码 |
| 同 Key 异摘要重放 | 409 | `IDEMPOTENCY_CONFLICT` |
| 重复业务凭证 | 409 | `DUPLICATE_BUSINESS_REFERENCE` |
| 单据已处理 | 409 | `ORDER_ALREADY_PROCESSED` |
| Redis 幂等不可用 | 503 | `IDEMPOTENCY_UNAVAILABLE` |
| 余额不足（禁负） | 422 | `INSUFFICIENT_BALANCE` |
| 余额账户缺失 | 404 | `BALANCE_NOT_FOUND` |
| 原单金额被改/删除 | 409 | `SOURCE_ORDER_MUTATED`（`【待人工裁决】` 是否单列） |

---

## D. 未决事项（`【待人工裁决】` 清单）
1. B.7 作废端点语义及是否纳入 v1.0.0。
2. B.8 统计字段细化（是否需按运营口径导出）。
3. 充值订单无法原路时的线下兜底执行与账号侧规则。
4. `SOURCE_ORDER_MUTATED`（原单被改）是否单列错误码，还是复用 `ORDER_ALREADY_PROCESSED`。
5. 佣金扣回在 ADR-0020 分型下的最终落表规则是否需修订。

> 其余人工上账/调账/充值审核/对账 topic 端点见各自专属文档，本文件不覆盖。