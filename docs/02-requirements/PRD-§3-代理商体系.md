# §3 代理商体系 — 浩寅云

> 代码基线：91f62d3 + Step4 | 重写日期：2026-10-03
> **模型以代码为准**：代理商等级为 `junior / senior / partner` 三级（初级代理 / 高级代理 / 平台合伙人），**单级佣金**。
> 已废弃旧 ref-3 的「预备/一级/高级三级晋升 + 子代理多级抽成」模型，本文不再描述。

## 等级与佣金模型（实际实现）

| 等级 | DB level | 中文标签 | 默认佣金率 | 说明 |
|---|---|---|---|---|
| 初级代理 | `junior` | 初级代理 | 10%（0.1） | 名下客户消费按比例计佣，满 ¥100 可提现 |
| 高级代理 | `senior` | 高级代理 | 20%（0.2） | 达标升级 |
| 平台合伙人 | `partner` | 平台合伙人 | 30%（0.3） | 最高比例与专属政策 |

> 规则来源：`routes/me-agent.ts` `COMMISSION_RULES` 静态常量。佣金率落库 `agents.commission_rate`（百分数，10=10%），管理端可按代理调整（0-100）。**单级计佣，无 parent_agent_id、无多级抽成**。
> **邀请码仅用于拉新激励，不绑定客户归属**；客户归属唯一来源是「代理报备→后台审核→划拨 agent_customers」。

## 功能清单

### 3.1 代理端（`/api/v1/agent/*`，jwtAuth + requireAgent）

| 编号 | 功能点 | 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 3.1.1 | 代理看板 KPI | `routes/agent-console.ts` GET `/agent/dashboard` | ✅已实现 | 累计/本月佣金、客户数、消费、排名 |
| 3.1.2 | 名下客户列表 / 客户详情 | `agent-console.ts` GET `/agent/customers`、`/agent/consumption/recent` | ✅已实现 | 搜索/分页/余额/累计消费/累计佣金 |
| 3.1.3 | 客户消费明细 | `agent-console.ts` GET `/agent/consumption` | 🟡部分实现 | 明细+筛选+今日/本月统计在；缺趋势图/模型分布/CSV 导出 |
| 3.1.4 | 佣金记录与汇总 | `routes/agent.ts` GET `/agent/commission` | ✅已实现 | total/pending/settled/本月分页汇总 |
| 3.1.5 | 可提现余额 / 收款银行账户 | `agent.ts` `/agent/withdraw/{balance,bank-info}` GET/PUT | ✅已实现 | 余额=已结算佣金−未拒绝提现；银行账户 upsert |
| 3.1.6 | 申请提现 / 提现记录 | `agent.ts` POST `/agent/withdraw/apply`、GET `/agent/withdraw/records` | ✅已实现 | 最低 ¥100（硬编码），建单 pending + 冻结可提现余额 |
| 3.1.7 | 月度结算单 / 单期明细 / 代理确认 | `agent.ts` `/agent/settlements[/:period[/confirm]]` | 🟡部分实现 | on-the-fly 聚合 + system_config KV 确认；无持久化结算表、无 48h 自动确认 |
| 3.1.8 | 业绩排行榜 | `agent.ts` GET `/agent/ranking` | 🟡部分实现 | month/total 榜含 my_rank；无季度/上期对比/奖励自动发放 |
| 3.1.9 | 邀请码 / 重新生成 / 使用记录 | `agent.ts` `/agent/invite/code[/regenerate]`、`/agent/invite/records` | ✅已实现 | 仅拉新激励，consumeInviteCode 不写 agent_customers |
| 3.1.10 | 营销素材库 | `agent.ts` GET `/agent/materials` | 🟡部分实现 | 读 site_content type=marketing-material/published；无独立素材表/上传/下载量 |

### 3.2 代理设置与报备（Step4 新增，补齐 AgentSettingsPage）

> `routes/me-agent.ts`（migration 0045 `agent_notif_prefs`），共 10 端点。AgentSettingsPage.tsx 原 8 个死端点已全部补齐，smoke 测试通过。

| 编号 | 功能点 | 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 3.2.1 | 代理身份资料 | `me-agent.ts` GET `/me/agent/profile` | ✅已实现 | 非代理返回 `is_agent=false`；含 level/rate/实名状态/收款账户 |
| 3.2.2 | 佣金等级规则展示 | `me-agent.ts` GET `/me/agent/commission-rules` | ✅已实现 | 静态三级规则，标记当前等级 |
| 3.2.3 | 提现/佣金汇总卡片 | `me-agent.ts` GET `/me/agent/withdraw-summary` | ✅已实现 | balance/commission_total/withdrawn/pending/withdrawable/本月消费佣金 |
| 3.2.4 | 通知偏好读写 | `me-agent.ts` GET/PUT `/me/agent/notif-prefs` | ✅已实现 | agent_notif_prefs 表；customer_alert/commission_notify/audit_notify |
| 3.2.5 | 佣金明细分页 | `me-agent.ts` GET `/me/agent/commissions` | ✅已实现 | 支持 customer_email 过滤 |
| 3.2.6 | 提现记录（含状态文案/银行信息） | `me-agent.ts` GET `/me/agent/withdrawals` | ✅已实现 | withdrawal_no/status_label/reject_reason |
| 3.2.7 | 提交提现申请 | `me-agent.ts` POST `/me/agent/withdraw` | ✅已实现 | 金额≥¥100 且≤可提现余额；银行四要素必填 |
| 3.2.8 | **代理自助报备客户** | `me-agent.ts` GET/POST `/agent/reports` | ✅已实现 | 按 user_id/email/phone 解析目标 customer；写 agent_approvals(pending)；重复 pending 报备拦截 |

### 3.3 佣金与结算服务

| 编号 | 功能点 | 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 3.3.1 | 消费实时计佣 | `services/agent/commission.ts` `generateCommissionForConsumption` | ✅已实现 | 命中 active 绑定→直接 settled，consumption_record_id 幂等 |
| 3.3.2 | 退款冲销佣金 | `commission.ts` `cancelCommissionsForConsumption` | ✅已实现 | settled→cancelled，回冲代理余额 |
| 3.3.3 | 缺佣自愈回填 | `commission-backfill.ts` 常驻 60s 扫描近 24h | ✅已实现 | |

### 3.4 管理端

| 编号 | 功能点 | 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 3.4.1 | 代理列表 + 全局汇总 | `routes/admin-agents.ts` GET `/admin/agents` | ✅已实现 | join users + 客户数/佣金汇总/月度佣金 |
| 3.4.2 | 改佣金率 / 启停代理 | `admin-agents.ts` PUT `/admin/agents/:id` | 🟡部分实现 | 仅改 commissionRate/status，**不能改 level**；改率无审计 |
| 3.4.3 | 报备审核四态机 | `routes/admin-misc-missing.ts` `/admin/agents/approvals/*` | ✅已实现 | pending/approved/bound/rejected + approve/reject/re-review/unbind；approve 自动划拨 agent_customers |
| 3.4.4 | 提现审核与打款 | `routes/admin-withdrawals.ts` `/admin/agent-withdrawals/:id/(review\|transfer)` | 🟡部分实现 | 两步（review→processing→transfer→completed）；无角色分离、无打款凭证 |
| 3.4.5 | 佣金工作台（全局视图） | `routes/admin-finance.ts` GET `/admin/commission/flow` | ✅已实现 | 全局概览+代理账本+明细流水 |
| 3.4.6 | 通用返利配置 + 兑换码批次 | `routes/admin-affiliate-coupons.ts` | ✅已实现 | affiliate config/records + coupons/generate（与代理佣金两套独立机制） |

### 3.5 业务员 CRM（与代理共用 agent_customers）

| 编号 | 功能点 | 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 3.5.1 | 客户认领/详情/联系人/阶段/标签 | `routes/me-sales.ts` `/me/customers*` | ✅已实现 | source='sales'；客户阶段 lead/trial/active/silent/churned |
| 3.5.2 | 跟进提醒 | `me-sales.ts` `/me/follow-reminders*` | ✅已实现 | 列表/新建/完成/忽略 |
| 3.5.3 | 销售业绩看板 | `me-sales.ts` GET `/me/sales-performance` | ✅已实现 | 含同组销售排名 |

## 关键架构说明

- **客户归属双来源**：`agent_customers` 表统一记录归属，`source` 区分代理报备（agent）与业务员认领（sales）。
- **金额口径**：`me-agent.ts` 全程用「元」（DB numeric），前端契约小数佣金率；旧 `agent.ts` 用「分」——两套契约并存，新页面前者为准。
- **结算非持久化**：月度结算单按 YYYY-M 实时聚合，确认状态写 system_config KV，无 settlement_cycles 表。

## 未实现 / 规划中

| 功能点 | 状态 | 说明 |
|---|---|---|
| 后台主动「设为代理商」创建端点 | ❌未实现（规划中） | 无 POST /admin/agents；新代理目前靠 me-sales 自动建 junior(rate=0) 或种子 |
| 代理自动降级（连续 N 月未达标） | ❌未实现（规划中） | 无定时评估/降级任务 |
| 阶梯/固定金额/按模型差异化佣金规则 | ❌未实现（规划中） | 仅单一 commission_rate 比例 |
| 提现冷却（24h）/ 佣金冻结期（7 天）/ 风控标注 | ❌未实现（规划中） | 当前仅最低 ¥100，无频率/冻结约束 |
| 多到账方式（支付宝/微信） | ❌未实现（规划中） | withdraw method 硬编码 'bank' |
| 报备保护期 30 天 / 到期自动释放 | ❌未实现（规划中） | 有重复报备拦截，无保护期计时 |
| 客户预警（余额不足/调用骤降/流失） | ❌未实现（规划中） | 无 /agent/alerts/* |
| 自定义定价倍率（1.0-2.0x） | ❌未实现（规划中） | 无代理对客户设倍率能力 |
| 等级权益展示 / 升级进度 / 收益预估 | ❌未实现（规划中） | commission-rules 静态展示在，无进度条/预估 |
