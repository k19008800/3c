# 核心资金 SPEC：退款与红冲

- 文档 ID：SPEC-BILLING-004
- 状态：review
- 生效版本：v1.0.0
- 对应 PRD：`../../../../02-requirements/03-billing-and-finance/refund-and-reversal.md`
- 主权威来源：`docs/ref-4.4-finance.md` §4、`docs/ref-9.5-refund.md`、`docs/supplement/03-充值退款状态机.md` §三（ADR 冲突处均以 ADR-0003/ADR-0020 为准）
- 上游 ADR：ADR-0001、ADR-0002、ADR-0003、ADR-0004、ADR-0006、ADR-0008、ADR-0009、ADR-0010、ADR-0011、ADR-0012、ADR-0020

## 1. 页面与路由

| 页面 | 路由 | 入口 |
|------|------|------|
| 退款/红冲管理 | `admin/finance/refunds` | 管理后台 → 财务 → 退款管理 |
| 退款详情弹窗 | `admin/finance/refunds/:id`（侧滑/弹窗） | 列表「详情」 |

页面标题旁与每个操作按钮旁均有 `[?]` 帮助（见 §9 对照表）。列表含筛选栏、统计卡片、分页表格；详情展示退款明细、用户账户状况、审核时间线。

## 2. 角色与权限（ADR-0004/0008）

| 权限点 | 角色 | 说明 |
|--------|------|------|
| `refund.create` | 运营/客服、财务 | 发起退款，创建人不得审批本人单据 |
| `refund.review.first` | 财务员 | 初审 |
| `refund.review.second` | 财务主管/管理员 | 复审（>¥10k 必需） |
| `refund.review.super` | `super_admin` | 终审（>¥100k 追加） |
| `refund.execute` | 财务员/财务主管/超管 | 执行/重试（需 2FA） |
| `reversal.create`/`reversal.execute` | `admin`、`super_admin` | 红冲 |

- 无权限统一返回 `403 PERMISSION_DENIED`（后端校验，前端显隐不替代）。
- 职责分离：创建人 ≠ 审批人、初审 ≠ 复审、终审不与前级重复（ADR-0004）。
- 所有资金写端点（审核、执行、红冲）强制操作级 2FA，`super_admin` 不豁免（ADR-0008）。

## 3. 字段与校验

### 3.1 退款申请表单字段
| 字段 | 必填 | 规则 | 依据 |
|------|------|------|------|
| 用户 | 是 | 有效用户，未注销 | ref-9.5 |
| 退款金额 | 是 | 输入 ≤ 2 位小数；≤ 可退金额上限 | ADR-0002 |
| 退款类型 | 是 | `balance_refund` / `channel_refund` / `reversal` | ADR-0020 |
| 关联订单/单据 | 条件必填 | 原单金额不可修改/删除 | ADR-0020 |
| 退款原因 | 是 | 文本 | ref-9.5 |
| 是否通知用户 | 否 | 默认开 | ADR-0010 |
| 备注 | 否 | 文本 | ref-9.5 |

### 3.2 精度校验（ADR-0002）
- 输入最多 2 位小数；内部 `numeric(18,8)`；用户展示固定 2 位小数。
- 禁止 JS `Number` 做最终计算。

### 3.3 资金方向校验（ADR-0020）
- `balance_refund`：余额只增加一次（即对同一业务事件只允许一次补偿）。
- `channel_refund`：走原路，不得同时回滚余额。
- `reversal`：扣减即红冲，余额不足返回受控业务错误；禁止写负余额。

## 4. 状态机

引用并展开 [退款状态机](../../06-data-and-architecture/state-machines/refund.md)：

```
pending(待审核) ──审核通过──→ approved(待执行)
      │                        │
      ├──驳回──→ rejected(终态) ├──执行开始──→ processing(执行中)
      │                        │               ├──成功──→ completed(终态)
      │                        │               └──异常──→ failed(可重试/人工)
      └──执行(直通场景可省略 pending？待人工裁决。当前统一走 pending)──→ processing
```

- `approved` = 审核通过、尚未执行；审核不改变余额，也不写退款流水。
- `execute` 抢占为 `processing`，余额退款成功后事务内进入 `completed`；失败进入 `failed`，资金事务整体回滚并允许重试。
- `failed` 可按幂等规则重试；重试走 `execution` 端点。
- 红冲生效时原单在反向记录成功后转 `reversed`，失败不得转 `reversed`。

## 5. 操作与反馈

### 5.1 操作清单
| 操作 | 端点 | 2FA | 幂等 | 反馈 |
|------|------|-----|------|------|
| 发起退款/红冲 | `POST /api/v1/admin/refunds` | 发起本身（可选，执行必）；创建需权限点 | `Idempotency-Key` | 返回退款单 |
| 初审 | `POST /api/v1/admin/refunds/:id/review` | 是 | 幂等 | 状态更新 |
| 复审 | 同上（复审角色） | 是 | 幂等 | 状态更新 |
| 驳回 | `POST /api/v1/admin/refunds/:id/reject` | 是 | 幂等 | `rejected` |
| 执行/重试 | `POST /api/v1/admin/refunds/:id/execute` | 是 | 幂等 + 状态条件更新 | `processing→completed/failed` |
| 红冲执行 | `POST /api/v1/admin/refunds/:id/execute`（type=reversal） | 是 | 幂等 | 反向记录生效，原单 `reversed` |

### 5.2 固定错误码（ADR-0011/0008/0009）
| 场景 | HTTP | code |
|------|------|------|
| 无权限 | 403 | `PERMISSION_DENIED` |
| 缺/未启用操作 2FA | 403 | `OPERATION_2FA_REQUIRED` |
| 2FA 错误/过期/重放 | 403 | 固定错误码（2FA 错误码） |
| 同 Key 不同摘要重放 | 409 | `IDEMPOTENCY_CONFLICT` |
| 重复业务凭证 | 409 | `DUPLICATE_BUSINESS_REFERENCE` |
| 单据已处理 | 409 | `ORDER_ALREADY_PROCESSED` |
| Redis 幂等不可用 | 503 | `IDEMPOTENCY_UNAVAILABLE` |
| 余额不足（禁负） | 422 | `INSUFFICIENT_BALANCE`（受控业务错误） |
| 余额账户缺失 | 404 | `BALANCE_NOT_FOUND` |
| 参数校验失败 | 400 | 参数错误码 |
| 通用内部错误 | 500 | 内部错误码 |

## 6. API 契约

落地端点见 [`05-api/admin/finance.md` §A](../../05-api/admin/finance.md)，核心端点：
- `POST /api/v1/admin/refunds` — 发起退款/红冲
- `GET /api/v1/admin/refunds` — 退款/红冲列表
- `GET /api/v1/admin/refunds/:id` — 详情
- `POST /api/v1/admin/refunds/:id/review` — 审核（初审/复审/终审）
- `POST /api/v1/admin/refunds/:id/reject` — 驳回
- `POST /api/v1/admin/refunds/:id/execute` — 执行/重试
- `POST /api/v1/admin/refunds/:id/void` — 作废（`【待人工裁决】` 作废语义与已执行单的关系）

响应格式遵循 ADR-0011：`{ code:0, message:"ok", data, request_id }`，列表 `items/page/page_size/total`。

## 7. 异常、并发与事务

### 7.1 真实事务边界（以 ADR-0020/0006/0009 为准）
- **余额退款事务**：校验余额 → `UPDATE customer_balances ... RETURNING` + `INSERT balance_transactions(type='refund', balance_after)` + 更新业务单据状态 + 写审计 → 任一失败整体回滚。余额为负则回滚返回 `INSUFFICIENT_BALANCE`。
- **原路退款事务**：调用支付通道退款 → 通道返回成功后更新充值订单退款状态，**不同时回滚余额**。通道失败进入 `failed` 支持重试。
- **红冲事务**：生成独立反向资金记录 + 扣减（如适用）→ 反向记录成功生效后，原单在同一提交内或紧随其后转 `reversed`；失败不得转 `reversed`。
- 资金写入按 ADR-0006 资金链路：业务操作 → 原子更新余额 → 写流水 → 关联业务 → 写审计日志。

### 7.2 幂等与状态条件更新（ADR-0009）
- 创建类端点强制 `Idempotency-Key`；审批/执行/红冲纳入统一幂等规范 + 状态条件更新。
- Key 绑定操作者、方法、canonical 路径与请求摘要；Redis 仅作加速锁，DB 约束/事务/状态守卫为最终边界。

### 7.3 并发
- 余额扣减用行级锁（`SELECT ... FOR UPDATE`）保证原子，扣后为负回滚（ADR-0020 禁负）。
- 重复审核/重复执行由状态守卫拦截（仅允许合法状态转移）。

### 7.4 失败补偿
| 场景 | 补偿 |
|------|------|
| 余额退款执行中断 | 事务回滚，无部分入账；`pending/approved` 可重试 |
| 原路通道退款失败 | 重试 ≤3 次，仍失败 → `failed` 标记 + 人工介入 |
| 红冲执行失败 | 反向记录不生效，原单保持原状，可重试 |
| 通知发送失败 | 以 outbox 异步重试，不回滚资金事务（ADR-0010） |

## 8. 验收标准
1. 分型退款集成测试：余额只加一次、原路不叠加余额回滚、红冲独立反向记录（ADR-0020）。
2. 禁负余额：余额不足返回受控错误，无负余额落库；并发不超扣。
3. 阈值审批：≤¥10k 单人、>¥10k 双人、>¥100k 终审；创建人≠审批人。
4. 2FA：未带有效操作 token 拒绝（`OPERATION_2FA_REQUIRED`）。
5. 幂等：同 Key 重放首结果，异摘要 409，重复凭证/已处理单据固定错误码。
6. 状态机：`pending→approved→processing→completed`，`rejected`、`failed`(可重试)；红冲原单仅成功生效后转 `reversed`。
7. 审计/通知：完成即审计 + 站内通知；通知失败不影响资金结果。

## 9. 页面与操作帮助

### [?] 页面帮助

- **适用角色**：财务人员、财务主管、运营客服、超级管理员。
- **功能定位**：统一处理余额退款、支付原路退款和红冲申请，确保资金方向、审批职责和执行结果可追溯。
- **核心操作**：查询退款单、发起退款/红冲、初审/复审/终审、执行或重试、查看审计时间线。
- **注意事项**：退款类型决定资金方向；原路退款不得同时增加或扣减平台余额；红冲不得造成负余额；所有执行操作需要有效操作级 2FA。
- **常见问题**：为什么退款不能重复执行？为什么原路退款失败后只能重试而不能直接改余额？为什么创建人不能审批自己的单据？

### [?] 按钮级帮助对照表

| 操作入口 | Tooltip 帮助文本 | 所需权限 | 可用状态 |
|---|---|---|---|
| 发起退款 | 创建退款申请并选择余额退款或原路退款路径 | `refund.create` | 可退款且未生成处理中单据 |
| 发起红冲 | 创建一笔与原业务相反的资金记录，不直接修改原单 | `reversal.create` | 原业务单允许红冲 |
| 审核 | 按当前审批级别审核退款申请，不能跳过前置级别 | `refund.review.first/second/super` | `pending` |
| 执行/重试 | 执行已批准的退款；失败单据按幂等规则重试 | `refund.execute` | `approved` 或 `failed` |
| 查看详情 | 查看退款类型、资金方向、审批链、执行结果和审计记录 | `refund.view` | 所有已授权记录 |
| 导出 | 导出当前筛选范围的退款记录，敏感字段按规则脱敏 | `refund.export` | 查询结果可导出 |
