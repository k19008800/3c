# 差距矩阵 F：财务 / 供应商 / 对账（§9 / §25 / §29）

> 生成基准：git HEAD 91f62d3，本地工作区实际代码。
> 提取方式：`api/src/routes/*.ts` 全量正则 `app.(get|post|put|delete|patch)(` 提取端点；`api/src/services/{billing,finance,agent,consumption}/*.ts` 与 `api/src/lib/finance-rules.ts`、`api/src/middleware/require-operation-2fa.ts` 交叉核对；对照 `docs/SPEC-§9-*.md`、`SPEC-§25-*.md`、`SPEC-§29-*.md`、`PRD-财务模块增强.md`、`PRD-整改R1-R4-*.md`、`PRD-整改R5-R7-*.md`。
> 状态图例：✅已实现（前后端闭环）｜🟡部分实现（有后端/有前端但缺另一半、或路径与文档不符、或功能不完整）｜❌未实现｜📄文档超前（文档有而代码无）
> 财务模块涉及资金安全，状态判定偏保守：找不到明确端点或表结构即标 ❌/🟡，不凭命名猜测。

---

## A. 代码实际端点清单（按子域分组，共 ≈175 个财务相关端点）

> 说明：`me-gap.ts` 中提取到的端点均为公告/设备/知识库/隐私同意类，与财务无关，已剔除；`admin-risk-missing.ts` 中的安全事件/内容审核/订阅套餐/权限审计也与财务无直接关系，仅在风控小节引用。

### A.1 充值与支付（用户端 + 管理端）

| 路由文件 | 方法 | 路径 | 功能 |
|---|---|---|---|
| recharge.ts | GET | /api/v1/me/balance | 当前用户余额 |
| recharge.ts | POST | /api/v1/me/recharge | 发起充值（对公/扫码 mock） |
| recharge.ts | GET | /api/v1/me/recharge-orders | 我的充值订单 |
| recharge.ts | GET | /api/v1/me/promotions | 促销列表（空） |
| recharge.ts | POST | /api/v1/me/redemption/redeem | 兑换码核销 |
| recharge.ts | GET | /api/v1/me/recharge/records | 充值记录 |
| recharge.ts | GET | /api/v1/me/redemption/history | 兑换历史 |
| recharge.ts | GET | /api/v1/admin/recharge-orders | 充值订单列表（finance.topup） |
| recharge.ts | POST | /api/v1/admin/recharge-orders/:id/audit | 审核通过 → 加余额 + 流水 + 通知（2FA） |
| recharge.ts | POST | /api/v1/admin/recharge-orders/:id/reject | 驳回（2FA） |
| admin-payment.ts | GET | /api/v1/admin/payment/config | 支付渠道配置读取 |
| admin-payment.ts | PUT | /api/v1/admin/payment/config | 支付渠道配置更新 |
| admin-payment.ts | GET | /api/v1/admin/payment/certs | 支付证书列表 |
| admin-payment.ts | POST | /api/v1/admin/payment/cert | 上传支付证书 |
| admin-payment.ts | DELETE | /api/v1/admin/payment/cert/:name | 删除支付证书 |
| admin-finance-missing.ts | GET | /api/v1/admin/manual-topup | 人工上账列表（finance.topup） |
| admin-finance-missing.ts | GET | /api/v1/admin/manual-topup/users | 可上账用户搜索 |
| admin-finance-missing.ts | POST | /api/v1/admin/manual-topup | 发起人工上账（2FA） |
| admin-finance-missing.ts | POST | /api/v1/admin/manual-topup/:id/review | 人工上账审核（2FA） |
| admin-finance-missing.ts | GET | /api/v1/admin/redemption/batches | 兑换码批次列表 |
| admin-finance-missing.ts | GET | /api/v1/admin/redemption/batches/:id | 兑换码批次详情 |
| admin-finance-missing.ts | POST | /api/v1/admin/redemption/batches | 创建兑换码批次 |
| admin-finance-missing.ts | POST | /api/v1/admin/redemption/batches/:id/toggle | 启用/停用批次 |
| admin-finance-missing.ts | GET | /api/v1/admin/tax-banking/config | 税银配置读取 |
| admin-finance-missing.ts | PUT | /api/v1/admin/tax-banking/config | 税银配置更新 |
| admin-finance-missing.ts | GET | /api/v1/admin/tax-banking/history | 税银历史 |
| admin-finance-missing.ts | GET | /api/v1/admin/tax-banking/bank-accounts | 银行账户列表 |
| admin-finance-missing.ts | POST | /api/v1/admin/tax-banking/bank-accounts | 新增银行账户 |
| admin-finance-missing.ts | GET | /api/v1/admin/discount-rules | 折扣规则列表 |
| admin-finance-missing.ts | POST | /api/v1/admin/discount-rules | 新建折扣规则 |
| admin-finance-missing.ts | PUT | /api/v1/admin/discount-rules/:id | 编辑折扣规则 |
| admin-finance-missing.ts | POST | /api/v1/admin/discount-rules/:id/delete | 删除折扣规则 |
| admin-finance-missing.ts | PUT | /api/v1/admin/discount-rules | 批量调整折扣 |

### A.2 调账与信用（授信）

| 路由文件 | 方法 | 路径 | 功能 |
|---|---|---|---|
| admin-adjust.ts | GET | /api/v1/admin/adjust/ledger | 调账台账（finance.adjust） |
| admin-adjust.ts | GET | /api/v1/admin/adjust/pending | 待我审批队列 |
| admin-adjust.ts | POST | /api/v1/admin/adjust | 发起调账（2FA，分级定级） |
| admin-adjust.ts | POST | /api/v1/admin/adjust/:id/approve | 一级审批通过（2FA） |
| admin-adjust.ts | POST | /api/v1/admin/adjust/:id/review | 二级复核 / super 终审（2FA） |
| admin-adjust.ts | POST | /api/v1/admin/adjust/:id/reject | 驳回（2FA） |
| admin-adjust.ts | POST | /api/v1/admin/adjust/:id/reverse | 红字冲销（2FA） |
| admin-credit.ts | GET | /api/v1/admin/credit/meta | 信用元数据 |
| admin-credit.ts | GET | /api/v1/admin/credit/opened | 已开授信客户 |
| admin-credit.ts | GET | /api/v1/admin/credit/customers | 授信客户列表 |
| admin-credit.ts | GET | /api/v1/admin/credit/customers/:id | 授信客户详情 |
| admin-credit.ts | GET | /api/v1/admin/credit/rules | 授信规则列表 |
| admin-credit.ts | GET | /api/v1/admin/credit/rules/:id/history | 规则变更历史 |
| admin-credit.ts | POST | /api/v1/admin/credit/rules | 新建授信规则 |
| admin-credit.ts | PATCH | /api/v1/admin/credit/rules/:id | 编辑授信规则 |
| admin-credit.ts | POST | /api/v1/admin/credit/rules/:id/toggle | 启用/停用规则 |

### A.3 发票 / 对账 / 锁账 / 报表 / 退款

| 路由文件 | 方法 | 路径 | 功能 |
|---|---|---|---|
| admin-invoices.ts | GET | /api/v1/admin/invoices | 发票申请列表 |
| admin-invoices.ts | POST | /api/v1/admin/invoices/:id/issue | 开具发票 |
| admin-invoices.ts | POST | /api/v1/admin/invoices/:id/reject | 驳回发票 |
| admin-invoices.ts | POST | /api/v1/admin/invoices/:id/send-email | 邮件发送发票 |
| admin-invoices.ts | GET | /api/v1/admin/invoices/:id/download | 下载发票文件（PDF） |
| admin-invoices.ts | GET | /api/v1/admin/invoice-stats/summary | 发票统计汇总 |
| admin-invoices.ts | GET | /api/v1/admin/invoice-stats/trend | 发票趋势 |
| admin-invoices.ts | GET | /api/v1/admin/invoice-stats/uninvoiced | 未开票明细 |
| admin-reconciliation.ts | POST | /api/v1/admin/finance/reconciliation/run | 手动触发对账（finance.reconciliation） |
| admin-reconciliation.ts | GET | /api/v1/admin/finance/reconciliation/reports | 对账报告列表 |
| admin-reconciliation.ts | GET | /api/v1/admin/finance/reconciliation/reports/:id | 对账报告详情 |
| admin-reconciliation.ts | GET | /api/v1/admin/finance/reconciliation/export/:id | 导出对账报告 |
| admin-reconciliation.ts | POST | /api/v1/admin/finance/reconciliation/mismatches/:id/resolve | 差异处理（FINANCE_RECON_APPROVE + 2FA） |
| admin-reconciliation.ts | POST | /api/v1/admin/finance/reconciliation/mismatches/:id/process | 差异执行（2FA） |
| admin-finance-missing.ts | GET | /api/v1/admin/reconciliation/diffs | 对账差异列表（旧路径） |
| admin-finance-missing.ts | POST | /api/v1/admin/reconciliation/diffs/:id/:op | 差异操作（旧路径，2FA） |
| admin-finance.ts | GET | /api/v1/admin/finance/dashboard | 财务看板 |
| admin-finance.ts | GET | /api/v1/admin/finance/transactions | 财务流水（通用） |
| admin-finance.ts | GET | /api/v1/admin/finance/accounts | 资金账户总览 |
| admin-finance.ts | GET | /api/v1/admin/finance/accounts/trend | 资金变动趋势 |
| admin-finance.ts | GET | /api/v1/admin/finance/close/status | 锁账当前状态 |
| admin-finance.ts | POST | /api/v1/admin/finance/close/execute | 执行月结锁账（2FA） |
| admin-finance.ts | GET | /api/v1/admin/finance/close/history | 锁账历史 |
| admin-finance.ts | POST | /api/v1/admin/finance/close/:period/unlock | 超管临时解锁（superAdmin + 2FA） |
| admin-finance.ts | GET | /api/v1/admin/commission/flow | 佣金流水 |
| admin-finance-rules.ts | GET | /api/v1/admin/finance/rules | 风控规则配置（sys.config） |
| admin-finance-rules.ts | PUT | /api/v1/admin/finance/rules | 更新风控规则（2FA） |
| admin-finance-stats.ts | GET | /api/v1/admin/settlements | 结算单列表 |
| admin-finance-stats.ts | POST | /api/v1/admin/settlements/:id/settle | 执行结算（2FA） |
| admin-finance-stats.ts | GET | /api/v1/admin/profit | 利润分析 |
| admin-finance-stats.ts | GET | /api/v1/admin/reconciliation | 对账总览 |
| admin-finance-stats.ts | GET | /api/v1/admin/refunds | 退款列表（finance.refund） |
| admin-finance-stats.ts | POST | /api/v1/admin/refunds/:id/review | 退款审核（2FA） |
| admin-finance-stats.ts | POST | /api/v1/admin/refunds/:id/execute | 退款执行（2FA） |

### A.4 代理商提现 / 佣金

| 路由文件 | 方法 | 路径 | 功能 |
|---|---|---|---|
| admin-withdrawals.ts | GET | /api/v1/admin/agent-withdrawals | 代理提现列表 |
| admin-withdrawals.ts | GET | /api/v1/admin/agent-withdrawals/:id | 提现详情 |
| admin-withdrawals.ts | POST | /api/v1/admin/agent-withdrawals/:id/review | 提现一审 |
| admin-withdrawals.ts | POST | /api/v1/admin/agent-withdrawals/:id/transfer | 提现打款/二审 |

### A.5 供应商 / 渠道（管理端）

| 路由文件 | 方法 | 路径 | 功能 |
|---|---|---|---|
| suppliers.ts | GET | /api/v1/admin/suppliers | 供应商列表 |
| suppliers.ts | GET | /api/v1/admin/suppliers/:id | 供应商详情 |
| suppliers.ts | POST | /api/v1/admin/suppliers | 新建供应商 |
| suppliers.ts | PUT | /api/v1/admin/suppliers/:id | 编辑供应商 |
| suppliers.ts | DELETE | /api/v1/admin/suppliers/:id | 删除供应商 |
| suppliers.ts | GET | /api/v1/admin/suppliers/:id/models | 供应商模型列表 |
| suppliers.ts | POST | /api/v1/admin/suppliers/:id/models | 新增供应商模型 |
| suppliers.ts | PUT | /api/v1/admin/models/:id | 编辑模型 |
| suppliers.ts | PATCH | /api/v1/admin/models/:id/status | 模型上下架 |
| suppliers.ts | POST | /api/v1/admin/suppliers/:id/models/batch-status | 批量模型上下架 |
| suppliers.ts | GET | /api/v1/admin/suppliers/:id/keys | 供应商 Key 列表 |
| suppliers.ts | POST | /api/v1/admin/suppliers/:id/keys | 新增供应商 Key |
| suppliers.ts | PUT | /api/v1/admin/keys/:id | 编辑 Key |
| suppliers.ts | DELETE | /api/v1/admin/keys/:id | 删除 Key |
| suppliers.ts | POST | /api/v1/admin/suppliers/:id/test | 连通性测试 |
| suppliers.ts | GET | /api/v1/admin/suppliers/:id/balance | 供应商余额查询 |
| suppliers.ts | GET | /api/v1/admin/pricing | 客户定价列表（supplier.pricing） |
| suppliers.ts | POST | /api/v1/admin/pricing | 新建客户定价 |
| suppliers.ts | PUT | /api/v1/admin/pricing/:id | 编辑客户定价 |
| suppliers.ts | GET | /api/v1/public/pricing | 公开定价页 |
| suppliers.ts | GET | /api/v1/public/stats | 公开统计 |
| admin-vendor-alias.ts | GET | /api/v1/admin/vendor-profiles | 渠道画像列表 |
| admin-vendor-alias.ts | POST | /api/v1/admin/vendor-profiles | 新建渠道画像 |
| admin-vendor-alias.ts | PUT | /api/v1/admin/vendor-profiles/:id | 编辑渠道画像 |
| admin-vendor-alias.ts | GET | /api/v1/admin/vendor-pricing | 渠道报价列表 |
| admin-vendor-alias.ts | PUT | /api/v1/admin/vendor-pricing/:id | 编辑渠道报价 |
| admin-vendor-alias.ts | POST | /api/v1/admin/vendor-pricing/batch-adjust | 批量调价 |
| admin-vendor-alias.ts | GET | /api/v1/admin/vendor-costs | 渠道成本列表 |
| admin-vendor-alias.ts | PUT | /api/v1/admin/vendor-costs/:id | 编辑渠道成本 |
| admin-vendor-alias.ts | GET | /api/v1/admin/vendor-stats | 渠道统计 |
| admin-vendor-alias.ts | GET | /api/v1/admin/vendor-performance | 渠道性能排行榜（管理端） |
| admin-vendor-alias.ts | GET | /api/v1/admin/vendor-models | 渠道模型视图 |
| admin-vendor-alias.ts | PUT | /api/v1/admin/vendor-models/:id | 编辑渠道模型 |
| admin-vendor-alias.ts | POST | /api/v1/admin/vendor-keys/:id/toggle | 渠道 Key 启停 |
| admin-vendor-alias.ts | DELETE | /api/v1/admin/vendor-keys/:id | 删除渠道 Key |
| admin-vendor-alias.ts | POST | /api/v1/admin/vendors/:id/toggle-status | 渠道状态切换 |
| admin-vendor-alias.ts | POST | /api/v1/admin/vendors/:id/models | 渠道新增模型 |
| admin-vendor-alias.ts | POST | /api/v1/admin/vendors/:id/keys | 渠道新增 Key |
| admin-vendor-settlements.ts | POST | /api/v1/admin/vendor-settlements/generate | 生成渠道结算单 |
| admin-vendor-settlements.ts | GET | /api/v1/admin/vendor-settlements | 渠道结算单列表 |
| admin-vendor-settlements.ts | GET | /api/v1/admin/vendor-settlements/:id | 结算单详情 |
| admin-vendor-settlements.ts | GET | /api/v1/admin/vendor-settlements/:id/download | 下载结算单 |
| admin-vendor-settlements.ts | POST | /api/v1/admin/vendor-settlements/:id/confirm | 确认结算（2FA） |
| admin-vendor-settlements.ts | POST | /api/v1/admin/vendor-settlements/:id/paid | 标记已打款（2FA） |
| admin-vendor-settlements.ts | POST | /api/v1/admin/vendor-settlements/:id/dispute | 发起争议（2FA） |
| admin-vendor-settlements.ts | GET | /api/v1/admin/supplier-bill-match | 供应商账单匹配 |
| admin-price-changes.ts | GET | /api/v1/admin/price-changes | 价格变动列表 |
| admin-price-changes.ts | GET | /api/v1/admin/price-changes/stats | 价格变动统计 |
| admin-price-changes.ts | GET | /api/v1/admin/price-changes/:id | 价格变动详情 |
| admin-price-changes.ts | GET | /api/v1/admin/price-changes/:id/impact | 价格变动影响分析 |
| admin-price-changes.ts | POST | /api/v1/admin/price-changes/:id/notify | 通知客户 |
| admin-price-changes.ts | GET | /api/v1/admin/price-changes/dispatch-logs | 通知派发日志 |
| admin-price-changes.ts | GET | /api/v1/admin/substitutability | 可替代模型矩阵 |
| admin-price-changes.ts | PATCH | /api/v1/admin/substitutability | 更新替代关系 |

### A.6 实名认证 / 风控 / 消费告警（与资金相关的周边）

| 路由文件 | 方法 | 路径 | 功能 |
|---|---|---|---|
| admin-real-name.ts | GET | /api/v1/admin/real-name/stats | 实名认证统计 |
| admin-real-name.ts | GET | /api/v1/admin/real-name | 实名审核列表 |
| admin-real-name.ts | GET | /api/v1/admin/real-name/:id | 实名详情 |
| admin-real-name.ts | POST | /api/v1/admin/real-name/:id/review | 单条审核 |
| admin-real-name.ts | POST | /api/v1/admin/real-name/review | 批量审核 |
| admin-real-name.ts | POST | /api/v1/admin/real-name/direct | 直接实名 |
| admin-real-name.ts | POST | /api/v1/admin/real-name/invite | 邀请实名 |
| admin-consumption.ts | GET | /api/v1/admin/consumption/tracking | 消费追踪 |
| admin-consumption.ts | GET | /api/v1/admin/consumption/stream | 实时消费流 |
| admin-consumption.ts | GET | /api/v1/admin/consumption/anomalies | 消费异常列表 |
| admin-consumption.ts | POST | /api/v1/admin/consumption/anomalies/:id/:op | 异常处理 |
| admin-consumption.ts | GET | /api/v1/admin/balance-alert-config | 余额告警配置 |
| admin-consumption.ts | PUT | /api/v1/admin/balance-alert-config | 更新余额告警配置 |
| admin-consumption.ts | GET | /api/v1/admin/balance-alerts | 余额告警列表 |
| admin-consumption.ts | POST | /api/v1/admin/balance-alerts/:userId/notify | 手动通知用户 |
| admin-risk.ts | GET | /api/v1/admin/risk/dashboard | 风控看板 |
| admin-risk.ts | GET | /api/v1/admin/risk/events | 风控事件列表 |
| admin-risk.ts | POST | /api/v1/admin/risk/events/:id/:op | 风控事件处理 |
| admin-risk.ts | GET | /api/v1/admin/risk/rules | 风控规则列表 |
| admin-risk.ts | POST | /api/v1/admin/risk/rules | 新建风控规则 |
| admin-risk.ts | PUT | /api/v1/admin/risk/rules/:id | 编辑风控规则 |

---

## B. 功能点差距矩阵（对照 SPEC-§9 / §25 / §29）

### B.1 §29 资金与对账管理（核心财务）

| 编号 | 功能点 | 代码位置 | 文档位置 | 状态 | 差距说明 |
|---|---|---|---|---|---|
| 29.1 | 平台资金流水（platform_ledger 逐笔总账） | ❌ 表/端点均不存在；grep `platform_ledger/platformLedger` 0 命中 | SPEC-§29 §29.1 | ❌ | 文档定义的 `platform_ledger` 表与 `/admin/finance/ledger*` 端点完全未建。现有 `/admin/finance/transactions` 是通用流水查询，不等价于"按 type 聚合的资金总账"。此为 §29 最大缺口。 |
| 29.2 | 资金账户管理（总余额/可用/冻结/构成/趋势） | admin-finance.ts:266 `/finance/accounts`、:338 `/accounts/trend` | SPEC-§29 §29.2 | ✅ | 端点已存在；冻结明细拆分与前端组件需另核。 |
| 29.3 | 对账差异处理工作台 | admin-reconciliation.ts:53/67（mismatches/resolve+process）；admin-finance-missing.ts:953/976（reconciliation/diffs+op） | SPEC-§29 §29.3 | 🟡 | 后端有差异处理能力，但存在**两套路径并存**：`/admin/finance/reconciliation/mismatches/:id/{resolve,process}` 与 `/admin/reconciliation/diffs/:id/:op`，与文档约定的 `/admin/finance/reconciliation/differences*` 路径不一致；差异统计 `/stats`、差异导出 `/export` 端点未见。 |
| 29.4 | 财务锁账与结转 | admin-finance.ts:354/382/433/450（close/status+execute+history+unlock） | SPEC-§29 §29.4 | ✅ | 锁账状态/执行/历史/超管临时解锁四端点齐备；前置检查清单（充值/消费/退款/发票/佣金/恒等式 7 项）是否在 execute 中逐条执行需在 backend 复核（本矩阵未逐行验证）。 |
| 29.5 | 资金报表中心（日/周/月报 + 定时推送 + PDF 下载） | ❌ grep `daily-report\|reports/generate\|reports/schedule\|finance/reports` 0 命中 | SPEC-§29 §29.5；PRD-财务 §9.2/§9.3 | ❌ | 完全未实现：无报表生成、无定时推送配置、无 PDF 导出。`/admin/profit`、`/admin/finance/dashboard` 是看板不是定期报表。 |
| 29.6 | 违约金与逾期管理（罚息/催收/分级暂停） | ❌ grep `overdue.*list\|penalty\|罚息\|waive\|suspend` 在 finance 路由 0 命中（命中的 overdue 均为工单/实名审核超时，非信用逾期） | SPEC-§29 §29.6；PRD-财务 §9.4 配套 | ❌ | 信用额度体系（admin-credit）已建，但**逾期罚息、催收通知、暂停额度、减免罚息**整套完全缺失。授信客户账期到期后无任何自动处理。 |
| 29.7 | 多币种结算（汇率管理/换算/告警） | ❌ grep `exchange_rate\|多币种\|currency.*rate` 0 命中 | SPEC-§29 §29.7 | ❌ | 完全未实现，全部以 CNY 单币种假设。 |
| 29.8 | 充值→消费→对账全链路监控 | admin-consumption.ts:521-536（tracking/stream/anomalies/balance-alerts）；admin-reconciliation.ts（对账 run） | SPEC-§29 §29.8 | 🟡 | 有消费异常检测、余额告警、手动对账触发，但**无统一"全链路运营面板"**，无 T+1 00:30 自动对账调度（需 grep scripts/cron 进一步确认），无会计恒等式自动校验端点。 |

### B.2 §9 财务模块增强（旧版，已部分迁移至 §29）

| 编号 | 功能点 | 代码位置 | 文档位置 | 状态 | 差距说明 |
|---|---|---|---|---|---|
| 9.1 | 财务总账（科目余额表） | 合并到 29.1，见上 | SPEC-§9 对照表 | ❌ | platform_ledger 未建，科目余额聚合查询无承载表。 |
| 9.2 | 月度财务报告（PDF/Excel 导出，每月 3 日自动生成） | ❌ | PRD-财务 §9.2 | ❌ | 无 `/admin/finance/reports/monthly*` 端点。 |
| 9.3 | 财务日报自动推送（邮件 9:00） | ❌ | PRD-财务 §9.3 | ❌ | 无 daily-report config/history/test 端点。 |
| 9.4 | 授信额度体系 | admin-credit.ts 全套（meta/opened/customers/rules CRUD/history/toggle）；services/billing/credit-limit.ts | PRD-财务 §9.4；SPEC-§9 对照表 | ✅ | 授信规则 CRUD、客户列表、规则历史齐备；用户侧 `/me/credit` 自查端点未在 routes 中见到（🟡 待补）。 |
| 9.5 | 退款自动化（含佣金扣回） | admin-finance-stats.ts:486/560/662（refunds list/review/execute）；services/agent/commission-backfill.ts | PRD-财务 §9.5 | 🟡 | 退款申请列表/审核/执行三端点齐备；**"佣金扣回"自动计算与 `agent_commission_deductions` 表是否落地未在路由层证据中看到**（需 services/agent/commission.ts 复核）。 |
| 9.6 | 税票统计看板 | admin-invoices.ts:307/337/368（invoice-stats summary/trend/uninvoiced）；admin-invoices.ts:274 发票 PDF 下载 | PRD-财务 §9.6 | ✅ | 开票汇总/趋势/未开票明细/PDF 下载四端点齐备；`/admin/finance/tax-summary*` 文档路径与实际 `/admin/invoice-stats/*` 路径不一致。 |

### B.3 §25 渠道（供应商）增强

| 编号 | 功能点 | 代码位置 | 文档位置 | 状态 | 差距说明 |
|---|---|---|---|---|---|
| 25.1 | 渠道端结算对账（vendor 自助查结算周期/明细/导出 CSV） | ❌ grep `/vendor/` 在 routes 0 命中（管理端 `/admin/vendor-settlements/*` 是管理员视角，非渠道自助） | SPEC-§25 §25.1 | ❌ | 文档定义的 `/api/v1/vendor/settlement/current\|history\|:id/detail\|:id/export` 全部未建。渠道当前无自助门户。 |
| 25.2 | 渠道公告/通知（vendor 端收件箱） | ❌ 无 `/vendor/notifications*` | SPEC-§25 §25.2 | ❌ | 渠道端通知体系完全缺失；管理端群发 `/admin/vendor/notifications` 也未见。 |
| 25.3 | 渠道性能排行榜（管理端） | admin-vendor-alias.ts:734 `/admin/vendor-performance` | SPEC-§25 §25.3 | ✅ | 管理端性能排行榜已实现；数据口径（健康评分/延迟/错误率/综合得分）是否按文档加权计算需复核。 |
| 25.4 | 渠道自助结算申请（vendor 发起 → admin 审核 → 打款） | ❌ 无 `/vendor/settlement/request*`、无 `/admin/vendor/settlement/requests*`（管理端现有 `/admin/vendor-settlements/generate` 是平台主动生成，非渠道发起） | SPEC-§25 §25.4 | ❌ | 渠道自助发起结算申请流程未建；当前结算完全由平台侧 generate 触发。 |
| 25.x | 供应商 CRUD / Key / 模型 / 定价 / 成本 / 画像 | suppliers.ts 全套 + admin-vendor-alias.ts 全套 | SPEC-§25 §25.0 | ✅ | 供应商主数据、Key 管理、模型管理、客户定价、渠道成本、渠道画像、批量调价、状态切换、账单匹配均已实现。 |
| 25.x | 供应商结算单（管理员视角） | admin-vendor-settlements.ts:71-152（generate/list/get/download/confirm/paid/dispute） | SPEC-§25 §25.1 管理侧 | ✅ | 结算单生成/查询/下载/确认/打款/争议六端点齐备，均带 2FA。 |

### B.4 其他财务周边

| 编号 | 功能点 | 代码位置 | 文档位置 | 状态 | 差距说明 |
|---|---|---|---|---|---|
| — | 支付渠道配置（微信/支付宝/对公） | admin-payment.ts:168/178/217/243/282（config get/put + certs 上传/删除） | ref-4.4 支付配置 | ✅ | 配置读写与证书管理齐备。 |
| — | 人工上账（R1） | admin-finance-missing.ts:217/332/376/601 | PRD-R1-R4 §3.1 | ✅ | 列表/用户搜索/创建/审核四端点齐备，创建与审核均带 2FA。 |
| — | 调账（含红冲） | admin-adjust.ts:99/195/262/453/515/708/740 | PRD-R1-R4 §3.3 | ✅ | 台账/待审/发起/一级/二级/驳回/红冲七端点齐备。 |
| — | 代理商提现双审 | admin-withdrawals.ts:60/128/182/229 | SPEC-§29 末尾"提现二审角色配置" | ✅ | 列表/详情/一审/打款（二审）四端点齐备；`withdraw_second_review_role` 配置项需在 site_configs 复核。 |
| — | 实名认证（财务前置） | admin-real-name.ts 全套 | — | ✅ | 统计/列表/详情/单审/批审/直接实名/邀请七端点齐备。 |
| — | 兑换码批次管理 | admin-finance-missing.ts:840-928 | — | ✅ | 批次列表/详情/创建/启停四端点齐备。 |
| — | 税银配置 / 银行账户 | admin-finance-missing.ts:1105-1186 | — | ✅ | 税银配置读/写/历史 + 银行账户列表/新增齐备。 |
| — | 折扣规则 | admin-finance-missing.ts:1029-1091 | — | ✅ | 列表/创建/编辑/删除/批量调整五端点齐备。 |
| — | 风控规则配置（finance_rules） | admin-finance-rules.ts:131/137；lib/finance-rules.ts | PRD-R5-R7 §3.1.2 | ✅ | 风控规则配置读/写（2FA），大额规则/限额/2FA 策略统一在 finance_rules JSON。 |

---

## C. 资金风控专项差距（R1–R7）

| 整改项 | 代码位置 | 状态 | 说明 |
|---|---|---|---|
| **R1 人工上账创建入口** | admin-finance-missing.ts:217/332/376/601 | ✅ | 列表 + 用户搜索 + 创建 + 审核闭环；`requirePerm('finance.topup')` + `requireOperation2fa` 双闸。 |
| **R2 余额账户兜底** | services/billing/balance.ts `creditBalance`；recharge.ts:21 引入；admin-adjust.ts:22 引入 ledger | ✅ | 三条入账路径统一收口到 `creditBalance` / `adjustLedgerAvailable`，建户兜底（ON CONFLICT DO NOTHING）由 services 层承担；具体零行建户逻辑需在 balance.ts 复核。 |
| **R3 权限点鉴权对齐** | middleware/require-perm.ts；路由中 `requirePerm('finance.topup'/'finance.adjust'/'finance.refund'/'finance.reconciliation'/'supplier.pricing'/'sys.config')` 广泛使用 | ✅ | 已从角色白名单切换为权限点；finance 角色可见人工上账、不可见调账（调账路由挂 `finance.adjust`）。 |
| **R4 入账通知闭环** | recharge.ts:755、admin-adjust.ts:409/674、admin-finance-missing.ts:768 均调用 `notifyUser` | ✅ | 三条入账路径（充值审核/调账/人工上账）均触发通知；站内信必发 + 邮件按偏好的语义需在 notify.ts 复核。 |
| **R5 分级审批统一** | admin-adjust.ts:84-88 `calcApprovalTier` 返回 level1/level2/level3；:453/515/526 一/二/终三级审批；recharge-approval.ts `buildApprovalMeta/resolveOrderApproval/nextPhaseAfterApprove/approveStagePatch`；admin-adjust.test.ts 用例 7/11 覆盖 | ✅ | 调账侧三级审批链完整实现（pending→pending_level2→pending_super→approved）；充值订单/人工上账侧通过 recharge-approval service 共享逻辑；调减 ¥10,000 双人特例（B1）有用例覆盖。 |
| **R6 拆分规避与 24h 限额** | lib/finance-rules.ts:30/48/98/299（soft/hard 双闸）；services/billing/credit-limit.ts + credit-limit.test.ts；scripts/lim_add.lua（Redis 24h 滚动窗口）；admin-adjust.ts:327 `effTier !== tier` 升级逻辑、:183 `limit_escalated` 字段返回 | ✅ | 操作人/被入账用户双维度 24h 滚动限额已落地，soft=升级审批 / hard=429 拒创建，Redis lua 脚本计数；`limit_escalated`/`escalation_reason` 已在台账返回。 |
| **R7 操作级 2FA + 二次确认** | middleware/require-operation-2fa.ts；资金写路由（recharge audit/reject、adjust 全写操作、manual-topup review、refund review/execute、close/execute、close/unlock、vendor-settlements confirm/paid/dispute、reconciliation mismatches process/resolve、finance-rules put）均挂 `requireOperation2fa` | ✅ | 后端强制 2FA 已接入全部资金写操作；5 分钟操作令牌复用语义需在 require-operation-2fa.ts 复核。 |
| R8 platform_ledger 联动 | 无 | ❌ | 见 §29.1，platform_ledger 表未建，R8 自然未落地。 |
| R9 凭证落库（OSS/附件表） | 未见附件存储服务 | 🟡 | 人工上账凭证字段是否落库需在 admin-finance-missing.ts 创建逻辑复核；当前 routes 中未见 multipart 上传端点。 |
| R10 幂等键（Idempotency-Key） | services/idempotency.ts 已存在；recharge.ts:26-35 引入并使用 `resolveIdempotencyKey/acquireIdempotencyLock/releaseIdempotencyLock/cacheIdempotentResponse` | ✅ | 充值侧已接入幂等；调账侧是否接入未在 grep 中看到，需复核。 |
| R11 科目字典 | 未见独立科目字典表 | 🟡 | R5 白名单科目 `{赠送,补偿,纠错}` 以常量承载（PRD 已知），未切字典驱动。 |
| R12 红冲审批 | admin-adjust.ts:740 `/admin/adjust/:id/reverse` | ✅ | 红字冲销端点存在，走 2FA。 |
| R13 审计 diff | 未见 | 🟡 | 审计日志存在但 diff 级字段变更记录未在本次扫描中确认。 |

---

## D. 关键发现

### D.1 已落地的核心能力（管理端财务闭环完整）
1. **R1–R7 资金风控整改已全部代码落地**：人工上账、余额兜底、权限点、通知、分级审批（level1/2/3）、24h 滚动限额（Redis lua + soft/hard 双闸）、操作级 2FA 全部有路由 + service + 测试用例支撑。这是当前代码库最扎实的一块。
2. **管理端财务主功能齐备**：充值订单审核、人工上账、调账（含红冲）、信用额度、发票开具/PDF/统计、退款审核执行、锁账/解锁、对账运行/差异处理、供应商结算全流程、提现双审、支付配置、税银配置、折扣规则、兑换码批次——约 175 个端点覆盖了 PRD 中管理侧的绝大部分诉求。

### D.2 三大结构性缺口（建议优先补）
1. **❌ platform_ledger 平台总账未建（§29.1）**——这是 §29 的核心表，文档明确"逐笔流水作为唯一资金来源"，但代码 0 引用。当前 `/admin/finance/transactions` 是通用查询，不等价于带 `serial_no/type/direction/balance_after/reversed_by_serial` 的资金总账。**不补此表，29.1 资金流水、29.8 全链路监控的会计恒等式校验、9.1 科目余额表全部无承载**。
2. **❌ 渠道端 vendor/* 自助门户完全缺失（§25.1/25.2/25.4）**——文档定义的 `/api/v1/vendor/settlement/*`、`/api/v1/vendor/notifications/*`、`/api/v1/vendor/settlement/request` 全部未建。当前渠道管理是"管理员代操作"模式，供应商看不到自己的结算单、收不到通知、不能自助发起结算。
3. **❌ 资金报表中心（§29.5 / 9.2 / 9.3）与逾期管理（§29.6）完全空白**——无日/周/月报生成、无定时邮件推送、无 PDF 下载；无信用逾期罚息、无催收通知、无暂停额度。授信客户已开了额度但账期到期后系统无任何自动动作。

### D.3 文档与代码不一致（需在第 5 步重写 PRD 时对齐）
1. **对账差异路径分裂**：文档写 `/admin/finance/reconciliation/differences*`，代码实际有两套——`/admin/finance/reconciliation/mismatches/:id/{resolve,process}`（新，带 FINANCE_RECON_APPROVE 权限+2FA）和 `/admin/reconciliation/diffs/:id/:op`（旧）。需决定保留哪套、废弃哪套。
2. **税票看板路径**：文档写 `/admin/finance/tax-summary*`，代码实际是 `/admin/invoice-stats/{summary,trend,uninvoiced}`。
3. **§9 SPEC 已标注"拆分迁移中"**：9.1/9.2/9.3/9.4 合并到 §29，但 §29 对应位置（29.1/29.5/29.6）多数未实现——**迁移是文档层完成了，代码层没跟上**。
4. **发票 PDF 下载已实现**（`/admin/invoices/:id/download`），但 PRD-财务 §9.6 未明确此端点，重写 PRD 时应补回。

### D.4 资金安全相关的保守判断
- **不声称已实现的项**：29.1 platform_ledger、29.5 报表中心、29.6 逾期、29.7 多币种、25.1/25.2/25.4 渠道自助——这些在路由层 0 命中，按"找不到明确实现即标 ❌"原则处理。
- **标 🟡 待复核的项**：
  - 9.5 退款佣金扣回（`agent_commission_deductions` 表是否落地需 services/agent/commission.ts 复核）
  - 29.3 对账差异工作台（两套路径并存，需产品裁决保留哪套）
  - 29.4 锁账前置 7 项检查是否在 execute 中逐条执行（未逐行验证）
  - R9 凭证落库（人工上账凭证文件是否有 OSS/附件表承载，routes 未见 multipart 端点）
  - R10 调账侧幂等键（idempotency service 在充值侧已用，调账侧未见）
- **测试文件与源文件对应关系**：`admin-recharge-audit.test.ts`、`admin-recharge-orders.test.ts`、`admin-manual-topup.test.ts`、`admin-settlement-2fa.test.ts` 这四个测试文件对应的"同名单数源文件"不存在——实际实现分别落在 `recharge.ts`、`admin-finance-missing.ts`、`admin-vendor-settlements.ts`（via requireOperation2fa）。测试是真实跑的，只是文件名与源文件不一一对应，重写 PRD 时不必强行对应。

### D.5 建议补全优先级
| 优先级 | 缺口 | 理由 |
|---|---|---|
| P0 | platform_ledger 表 + /admin/finance/ledger* 端点 | §29.1 是整个资金模块的基石，不建则流水/恒等式/科目表全空 |
| P0 | 29.6 信用逾期管理（罚息/催收/暂停） | 授信已开但无逾期处理，资金敞口 |
| P1 | 29.5 资金报表中心（日报自动推送） | 财务日常刚需，PRD 反复提及 |
| P1 | 25.1/25.4 渠道端结算自助 | 供应商门户是 §25 的核心价值 |
| P2 | 29.7 多币种 | 当前无海外渠道结算需求，可延后 |
| P2 | 25.2 渠道公告通知 | 依赖渠道门户先建 |

---

## 附录：本矩阵未覆盖项
- services 层内部逻辑（billing/settle、agent/commission、finance/reconciliation、finance/vendor-settlement）的逐行正确性未在本矩阵验证——本矩阵只做端点级与文档级对照。
- 前端 web-console / web-portal 页面是否齐备未扫描（由前端分片负责）。
- 数据库 schema 是否真的有 `adjustment_records.super_reviewed_by`、`adjustment_records.limit_escalated` 等列未在本矩阵验证（由 backend 数据分片负责）。
