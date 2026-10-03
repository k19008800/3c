# PRD §9 财务模块（资金 / 对账 / 结算 / 供应商）

> 品牌：**浩寅云**　|　代码基线：2026-10-03 工作区（含 Step 4 补全：platform_ledger 已落地）
> 状态图例：✅已实现｜🟡部分实现｜❌未实现（规划中）
> 路径权威：以 `api/src/routes/*.ts` 实际注册为准。资金安全敏感，状态判定保守。

---

## 一、功能清单

### 1.1 资金总账与账户（§29.1 / §29.2）

| 编号 | 功能点 | 实际端点 / 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 9.1.1 | **平台总账 platform_ledger（逐笔分录）** | migration `0044_platform_ledger.sql`；schema `db/schema/platform-ledger.ts`；service `services/finance/platform-ledger.ts` | ✅ | Step 4 已建表；写入由 billing 主链路副作用完成，非独立写端点 |
| 9.1.2 | 总账分录分页查询 | `GET /api/v1/admin/finance/ledger`（`admin-ledger.ts`） | ✅ | 按科目/方向(debit/credit)/用户/日期筛选，admin/super_admin |
| 9.1.3 | 科目汇总 + **会计恒等式校验** | `GET /api/v1/admin/finance/ledger/summary` | ✅ | 按科目聚合余额，校验 debit=credit 平衡（§29.1 核心） |
| 9.1.4 | 资金账户总览 / 趋势 | `admin-finance.ts`：`GET /api/v1/admin/finance/accounts`、`/accounts/trend` | ✅ | 总余额/可用/冻结/构成/趋势 |
| 9.1.5 | 财务看板 / 通用流水 | `GET /api/v1/admin/finance/dashboard`、`/api/v1/admin/finance/transactions` | ✅ | 看板与通用流水查询 |

### 1.2 充值 / 支付 / 人工上账

| 编号 | 功能点 | 实际端点 | 状态 | 说明 |
|---|---|---|---|---|
| 9.2.1 | 用户余额 / 充值下单 / 充值订单 | `recharge.ts`：`GET /me/balance`、`POST /me/recharge`、`GET /me/recharge-orders`、`/me/recharge/records` | ✅ | 对公/扫码 mock |
| 9.2.2 | 充值订单审核（加余额+流水+通知，2FA） | `recharge.ts`：`GET /admin/recharge-orders`、`POST /:id/audit`、`POST /:id/reject` | ✅ | 双闸 `finance.topup` + 操作 2FA |
| 9.2.3 | 人工上账（R1） | `admin-finance-missing.ts`：`GET/POST /admin/manual-topup`、`GET /admin/manual-topup/users`、`POST /:id/review` | ✅ | 创建+审核均带 2FA |
| 9.2.4 | 支付渠道配置 / 证书 | `admin-payment.ts`：`GET/PUT /admin/payment/config`、证书 list/upload/delete | ✅ | 微信/支付宝/对公配置 + 证书 |
| 9.2.5 | 折扣规则 | `admin-finance-missing.ts`：`GET/POST /admin/discount-rules`、`PUT/DELETE /:id`、批量调整 | ✅ | 列表/创建/编辑/删除/批量 |
| 9.2.6 | 税银配置 / 银行账户 | `admin-finance-missing.ts`：`/admin/tax-banking/{config,history,bank-accounts}` | ✅ | 配置读写 + 历史 + 账户管理 |

### 1.3 调账 / 授信 / 锁账

| 编号 | 功能点 | 实际端点 | 状态 | 说明 |
|---|---|---|---|---|
| 9.3.1 | 调账台账 / 三级审批 / 红冲（R5/R12） | `admin-adjust.ts`：`GET /admin/adjust/{ledger,pending}`、`POST /admin/adjust`、`POST /:id/{approve,review,reject,reverse}` | ✅ | pending→level2→super→approved，全写操作 2FA；红字冲销 |
| 9.3.2 | 信用授信体系（§9.4） | `admin-credit.ts`：`GET /admin/credit/{meta,opened,customers[/:id],rules[/:id],rules/:id/history}`、`POST/PATCH /rules`、`POST /rules/:id/toggle` | ✅ | 规则 CRUD + 客户 + 规则历史；用户侧 `/me/credit` 自查端点缺失 🟡 |
| 9.3.3 | 财务锁账与结转（§29.4） | `admin-finance.ts`：`GET /finance/close/status`、`POST /close/execute`（2FA）、`GET /close/history`、`POST /close/:period/unlock`（super+2FA） | ✅ | 锁账/执行/历史/超管临时解锁；前置 7 项检查需逐行复核 |

### 1.4 发票 / 退款 / 结算

| 编号 | 功能点 | 实际端点 | 状态 | 说明 |
|---|---|---|---|---|
| 9.4.1 | 发票申请 / 开具 / 驳回 / 邮件 / PDF 下载 | `admin-invoices.ts`：`GET /admin/invoices`、`POST /:id/{issue,reject,send-email}`、`GET /:id/download` | ✅ | PDF 下载已实现 |
| 9.4.2 | 税票统计看板（§9.6） | `GET /admin/invoice-stats/{summary,trend,uninvoiced}` | ✅ | 路径为 `/admin/invoice-stats/*`（非旧文档 `/admin/finance/tax-summary*`） |
| 9.4.3 | 退款审核 / 执行（含佣金扣回，§9.5） | `admin-finance-stats.ts`：`GET /admin/refunds`、`POST /:id/{review,execute}`（均 2FA） | 🟡 | 审核/执行闭环；佣金自动扣回 `agent_commission_deductions` 落地情况需 service 层复核 |
| 9.4.4 | 结算单 / 执行结算 | `admin-finance-stats.ts`：`GET /admin/settlements`、`POST /:id/settle`（2FA）、`GET /admin/profit` | ✅ | 利润分析齐备 |
| 9.4.5 | 代理商提现双审 | `admin-withdrawals.ts`：`GET /admin/agent-withdrawals[/:id]`、`POST /:id/{review,transfer}` | ✅ | 一审 + 打款（二审） |

### 1.5 对账（§29.3 / §29.8）

| 编号 | 功能点 | 实际端点 | 状态 | 说明 |
|---|---|---|---|---|
| 9.5.1 | 发起对账 / 报告 / 导出 | `admin-reconciliation.ts`：`POST /admin/finance/reconciliation/run`、`GET .../reports[/:id]`、`GET .../export/:id` | ✅ | 发起/报告/导出闭环 |
| 9.5.2 | 差异处理（新路径） | `POST /admin/finance/reconciliation/mismatches/:id/{resolve,process}`（FINANCE_RECON_APPROVE + 2FA） | ✅ | 新路径，权限+2FA |
| 9.5.3 | 差异处理（旧路径，并存） | `admin-finance-missing.ts`：`GET /admin/reconciliation/diffs`、`POST /diffs/:id/:op` | 🟡 | **新旧两套路径并存**，需产品裁决保留/废弃；差异 `/stats`、`/export` 未见 |
| 9.5.4 | 全链路自动对账调度 / 恒等式自动校验 | 手动触发对账已通；T+1 自动调度、恒等式定时校验 | 🟡 | 无 T+1 00:30 自动调度；恒等式校验已在 ledger/summary 手动提供，未做定时巡检 |

### 1.6 供应商 / 渠道结算（§25）

| 编号 | 功能点 | 实际端点 | 状态 | 说明 |
|---|---|---|---|---|
| 9.6.1 | 供应商主数据 / Key / 模型 / 定价 / 成本 / 画像 | `suppliers.ts` + `admin-vendor-alias.ts` 全套 | ✅ | CRUD + 连通测试 + 余额查询 + 批量调价 |
| 9.6.2 | 供应商结算单（管理端视角） | `admin-vendor-settlements.ts`：`POST /generate`、`GET [/:id]`、`GET /:id/download`、`POST /:id/{confirm,paid,dispute}` | ✅ | 生成/查询/下载/确认/打款/争议，均 2FA |
| 9.6.3 | 供应商账单匹配 / 性能排行 | `GET /admin/supplier-bill-match`、`GET /admin/vendor-performance` | ✅ | 管理端视角 |
| 9.6.4 | **渠道端 vendor 自助门户**（查结算/收件箱/自助发起结算） | 无 `/api/v1/vendor/*` 路由 | ❌ | 渠道当前为「管理员代操作」，供应商无自助门户（§25.1/25.2/25.4 全缺） |

### 1.7 资金风控整改（R1–R7，全部落地）

| 项 | 状态 | 落点 |
|---|---|---|
| R1 人工上账创建入口 | ✅ | `admin-finance-missing.ts`，双闸 |
| R2 余额账户兜底 | ✅ | `services/billing/balance.ts` creditBalance 统一收口，建户兜底 |
| R3 权限点鉴权 | ✅ | 从角色白名单切换为 `requirePerm('finance.*')` |
| R4 入账通知闭环 | ✅ | 充值/调账/人工上账三路径均 notifyUser |
| R5 分级审批 | ✅ | `calcApprovalTier` level1/2/3，充值与调账共享 service |
| R6 拆分规避 / 24h 滚动限额 | ✅ | `lib/finance-rules.ts` soft/hard 双闸 + Redis lua 24h 窗口 + `limit_escalated` |
| R7 操作级 2FA | ✅ | `require-operation-2fa` 挂全部资金写操作 |
| R10 幂等键 | ✅（充值侧） | `services/idempotency.ts`，调账侧未接入 |

---

## 二、关键架构

- **资金写入统一收口**：所有入账（充值审核/调账/人工上账/发放）→ `services/billing/balance.ts` 建户兜底 + 流水 + 通知；所有资金写操作强制「权限点 + 操作 2FA」双闸。
- **platform_ledger 为只读查询层**：表由 billing 主链路副作用逐笔写入（serial/direction/balance_after），`/admin/finance/ledger[/summary]` 仅做查询与恒等式校验，不在路由层直接写账。
- **分级审批**：调账三级（pending→pending_level2→pending_super→approved），充值/人工上账经 `recharge-approval` service 共享状态机；调减 ¥10,000 双人特例有用例覆盖。
- **金额一律 integer（分）**；snake_case 响应契约。

---

## 三、未实现 / 规划中（❌）

1. **9.7 资金报表中心（§29.5 / §9.2 / §9.3）**：日/周/月报生成、定时邮件推送、PDF 导出全空。现有 dashboard/profit 是看板，非定期报表。
2. **9.8 信用逾期管理（§29.6）**：授信已开，但逾期罚息/催收通知/暂停额度/减免罚息整套缺失，账期到期后无自动动作。
3. **9.9 多币种结算（§29.7）**：无汇率管理，全部 CNY 单币种假设。
4. **9.6.4 渠道 vendor 自助门户（§25.1/25.2/25.4）**：`/api/v1/vendor/*` 零路由。

## 四、路径偏差修正（重写 PRD 必看）

- 对账差异：新 `/admin/finance/reconciliation/mismatches/:id/{resolve,process}` vs 旧 `/admin/reconciliation/diffs/:id/:op` 并存 → 待裁决。
- 税票看板：实际 `/admin/invoice-stats/*`，非 `/admin/finance/tax-summary*`。
- 总账：实际 `/admin/finance/ledger[/summary]`（Step 4 新增）。
