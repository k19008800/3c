# §19 代理商支撑增强（第一批）

- 品牌：浩寅云
- 代码基线：git HEAD `91f62d3`（2026-10-03，含 Step 4）
- 权威源：`api/src/routes/{agent,agent-console,me-agent,admin-misc-missing}.ts`、`services/agent/*`
- 状态图例：✅ 已实现 / 🟡 部分实现 / ❌ 未实现（规划中）

## 19.1 代理端自助能力

| 编号 | 能力 | 代码落点 | 状态 | 差距说明 |
|---|---|---|---|---|
| 19.1.1 | 代理自助报备客户 | `me-agent.ts`：`POST /agent/reports`、`GET /agent/reports`；管理端四态审核 `admin-misc-missing.ts` `/admin/agents/approvals[/:id/{approve,reject,re-review,unbind}]` | ✅ | Step 4 已上线：代理自助提交报备 + 后台审核划拨（写 agent_customers，pending→bound） |
| 19.1.2 | 报备保护期 30 天 / 防重复 / 到期自动释放 | — | ❌ | 重复报备检查有；无保护期字段、无到期释放定时任务、无"保护中/已过期"态 |
| 19.1.3 | 报备转化统计 | 后台 summary 已有 | 🟡 | 代理端看不到自己的报备列表转化率 |
| 19.2.1 | 代理设置中心（资料/佣金规则/提现汇总/通知偏好） | `me-agent.ts`：`/me/agent/{profile,commission-rules,withdraw-summary,notif-prefs,commissions,withdrawals,withdraw}` | ✅ | Step 4 已上线，AgentSettingsPage 死代码消除（smoke 15 测试通过） |
| 19.3.1 | 名下客户消费明细（筛选/今日本月统计） | `agent-console.ts`：`GET /agent/consumption`、`/consumption/recent` | 🟡 | 明细+筛选齐；缺趋势图、模型分布、CSV 导出 |
| 19.4.1 | 代理消息通知与偏好 | `me-agent.ts`：`/me/agent/notif-prefs` | ✅ | Step 4 已上线；通知列表/未读徽标复用站内通知体系 |
| 19.5.1 | 等级权益展示 / 升级条件进度 / 收益预估 | — | ❌ | 无等级对比页、无升级进度 |
| 19.6.1 | 代理财务中心（冻结/待结算/趋势/结算单下载） | 分散在 `agent.ts` `/agent/{commission,withdraw/*,settlements*}` | 🟡 | 余额/记录/月度结算单可查可确认；无冻结余额概念、无 6 月趋势、无结算单下载/导出 |

## 19.2 关键架构

- 报备链路：代理提交（source=agent）→ 后台审核（approve 即划拨 `agent_customers`）→ 消费实时计佣（`generateCommissionForConsumption` 命中 active 绑定直接 settled）。
- 模型层级：`agents.level = junior/senior/partner`（无"预备代理"态区分），佣金=消费×单一 `commission_rate` 固定比例；阶梯/按模型差异化佣金未实现（见 §24）。
- 结算单为 on-the-fly 聚合（按 YYYY-MM 聚合已结算佣金），代理确认结果写 `system_config` KV 幂等；无持久化 settlement_cycles 表。

## 19.3 未实现项

| 优先级 | 事项 |
|---|---|
| P1 | 报备保护期计时与到期释放调度 |
| P1 | 消费趋势图 / 模型分布 / CSV 导出 |
| P2 | 等级权益页与升级进度、收益预估 |
| P2 | 代理财务中心聚合页 + 结算单下载 |

> 提现约束以代码为准：最低 ¥100、仅银行卡、两步审核（review→transfer）；旧文档"最低 ¥10/24h 冷却/7 天冻结"未实现，见 §3 代理商体系章。
