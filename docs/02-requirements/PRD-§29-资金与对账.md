# §29 资金与对账管理

- 品牌：浩寅云
- 代码基线：git HEAD `91f62d3`（2026-10-03，含 Step 4 platform_ledger）
- 权威源：`api/src/routes/{admin-finance,admin-reconciliation,admin-ledger,admin-credit,admin-finance-stats,admin-invoices}.ts`、migration 0044
- 状态图例：✅ 已实现 / 🟡 部分实现 / ❌ 未实现（规划中）

## 29.1 功能清单

| 编号 | 能力 | 代码落点 | 状态 | 差距说明 |
|---|---|---|---|---|
| 29.1 | 平台总账 platform_ledger（逐笔流水/会计恒等式） | 表 `platform_ledger`（migration 0044，account/entry_date/user/ref_type+ref_id 索引）；`admin-ledger.ts`：`GET /admin/finance/ledger`、`GET /admin/finance/ledger/summary` | ✅ | Step 4 已上线：按账户逐笔流水 + 科目汇总查询；资金流水写入点与恒等式校验随入账链路接入 |
| 29.2 | 资金账户管理（总余额/可用/冻结/趋势） | `admin-finance.ts`：`GET /admin/finance/accounts`、`/accounts/trend` | ✅ | 冻结明细拆分与前端组件另核 |
| 29.3 | 对账差异处理工作台 | 新路径 `admin-reconciliation.ts`：`POST /finance/reconciliation/run`、`/reports[/:id]`、`/export/:id`、`/mismatches/:id/{resolve,process}`（FINANCE_RECON_APPROVE + 2FA） | 🟡 | **新旧两套路径并存**：旧 `/admin/reconciliation/diffs/:id/:op`（admin-finance-missing）未废弃；文档路径以新路径为准，待产品裁决旧路径下线 |
| 29.4 | 财务锁账与结转 | `admin-finance.ts`：`GET /finance/close/status`、`POST /close/execute`（2FA）、`GET /close/history`、`POST /close/:period/unlock`（superAdmin + 2FA） | ✅ | 前置 7 项检查（充值/消费/退款/发票/佣金/恒等式）执行细节待 backend 逐行复核 |
| 29.5 | 资金报表中心（日/周/月报 + 定时推送 + PDF） | — | ❌ | 无报表生成/定时推送配置；`/admin/profit`、`/finance/dashboard` 是看板非定期报表 |
| 29.6 | 违约金与逾期管理（罚息/催收/分级暂停） | — | ❌ | 授信体系（admin-credit 全套规则 CRUD）已建，但逾期罚息/催收/暂停额度/减免完全缺失 |
| 29.7 | 多币种结算（汇率管理/换算/告警） | — | ❌ | 全部 CNY 单币种假设 |
| 29.8 | 充值→消费→对账全链路监控 | `admin-consumption.ts`：tracking/stream/anomalies/balance-alerts；`admin-reconciliation.ts` 手动 run | 🟡 | 异常检测/余额告警/手动对账有；无 T+1 自动对账调度、无恒等式自动校验对外端点 |
| 29.9 | 授信额度体系 | `admin-credit.ts`：meta/opened/customers/rules CRUD/history/toggle；`services/billing/credit-limit.ts` | ✅ | 用户侧 `/me/credit` 自查端点待补 |

## 29.2 关键架构

- 资金写入口统一收口 `creditBalance`（R2 兜底建户），所有资金变动写 `balance_transactions`；platform_ledger 作为**平台侧**会计视图按账户（用户/代理/渠道/平台）镜像入账，二者方向约束遵循 ADR-0020（禁负）。
- 安全闸复用统一七件套（ADR-0001/0002/0004/0008/0009/0010/0013）：金额上限、分级审批、24h 滚动限额、操作级 2FA、幂等、状态守卫、通知出事务后异步。
- 精度：内部 `numeric(18,8)`，佣金 `numeric(18,4)`，报告 `numeric(18,6)`（ADR-0002）。

## 29.3 未实现项

| 优先级 | 事项 |
|---|---|
| P0 | 29.6 信用逾期管理（罚息/催收/暂停） |
| P1 | 29.5 资金报表中心（日报自动邮件推送） |
| P1 | 旧对账路径 `/admin/reconciliation/diffs*` 下线裁决 |
| P2 | 29.7 多币种、29.8 T+1 自动对账调度 |
