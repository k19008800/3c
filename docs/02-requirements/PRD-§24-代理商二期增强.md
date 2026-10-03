# §24 代理商增强（第二批）

- 品牌：浩寅云
- 代码基线：git HEAD `91f62d3`（2026-10-03，含 Step 4 me-crm）
- 权威源：`api/src/routes/{agent,me-crm,me-sales,admin-affiliate-coupons}.ts`、`services/agent/*`
- 状态图例：✅ 已实现 / 🟡 部分实现 / ❌ 未实现（规划中）

## 24.1 功能清单

| 编号 | 能力 | 代码落点 | 状态 | 差距说明 |
|---|---|---|---|---|
| 24.1 | 邀请裂变（拉新激励） | `agent.ts`：`/agent/invite/{code,code/regenerate,records}` | ✅ | 按 D2 决策：邀请码仅拉新激励，`consumeInviteCode` **不绑定客户**；无链接点击统计 |
| 24.2 | 营销素材库 | `agent.ts`：`GET /agent/materials`（读 site_content type=marketing-material/published） | 🟡 | 仅 published 文本素材读取；无独立 agent_materials 表、无 admin 上传/编辑/删除、无文件下载/下载量/分类 |
| 24.3 | 排行榜 | `agent.ts`：`GET /agent/ranking`（month/total，含 my_rank、客户数、消费） | 🟡 | 基础榜齐；无奖励配置（/admin/agent-ranking-config）、无季度榜、无上期对比、无每日快照/自动发奖 |
| 24.4 | 客户预警（余额不足/调用骤降/流失） | — | ❌ | 无 `/agent/alerts/*`；通用消费异常（admin-consumption）不面向代理 |
| 24.5 | 多级佣金 | —（无 parent_agent_id） | ✅ | 按 D1 决策：单级佣金，不实现多级抽成 |
| 24.6 | 自定义定价（对客户设 1.0–2.0x 倍率） | — | ❌ | 无代理对客户设倍率能力 |
| 24.7 | 佣金实时结算 + 退款冲销 + 自愈回填 | `services/agent/commission.ts` + `commission-backfill.ts`（60s 扫描近 24h） | ✅ | 命中 active 绑定直接 settled，幂等 consumption_record_id 唯一；退款 cancelled 回冲 |
| 24.8 | 佣金工作台（管理员全局视图） | `admin-finance.ts`：`GET /admin/commission/flow` | ✅ | |
| 24.9 | 业务员 CRM | `me-sales.ts` 14 端点（客户/标签/联系记录/跟进提醒/业绩） | ✅ | sales 角色，与代理共用 agent_customers |
| 24.10 | 通用推荐返利 + 兑换码批次 | `admin-affiliate-coupons.ts`：config/records/coupons/generate | ✅ | 与代理佣金两套独立机制 |
| 24.11 | 线索管理（leads CRUD/备注/转换） | `me-crm.ts`：`/me/crm/leads` CRUD + `/:id/notes` + `/:id/convert` | ✅ | Step 4 已上线 |
| 24.12 | 商机管理（opportunities CRUD） | `me-crm.ts`：`/me/crm/opportunities` CRUD | ✅ | Step 4 已上线 |
| 24.13 | 报价管理（quotes CRUD） | `me-crm.ts`：`/me/crm/quotes` CRUD | ✅ | Step 4 已上线 |
| 24.14 | 合同管理（模板/生成/审批/签章/续签） | — | ❌ | 无合同表/端点（依赖 §16 电子签章） |
| 24.15 | 团队协作与客户交接 | — | ❌ | 无客户批量转移/团队视图/组长分配线索 |
| 24.16 | 销售知识库 | 复用客服知识库 `admin-support-missing.ts` | 🟡 | 无销售专属分类 |

## 24.2 关键架构

- 线索→商机→报价主链路已通（me-crm），但未串合同与 PDF 导出；leads convert 动作写客户认领（agent_customers source=sales）。
- 旧 ref-3 的 commission_rules（阶梯/固定金额/按模型）、settlement_cycles 持久化表、子代理体系**均不实现**，文档重写时已删除。

## 24.3 未实现项

| 优先级 | 事项 |
|---|---|
| P1 | 客户预警 agent_alerts + 通知联动 |
| P2 | 素材库管理端闭环、排行榜奖励配置、自定义定价倍率 |
| P2 | 合同管理（依赖电子签章）、团队客户交接 |
