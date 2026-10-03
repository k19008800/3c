# 差距矩阵 D：代理商体系（§3 / §19 / §24）

> 生成方式：从当前代码（git HEAD 实际实现）反向梳理，对照 `SPEC-§3`、`SPEC-§19`、`SPEC-§24`、`ref-3`、`ref-24`、`PRD-代理商体系-后台主导版`。
> 生成时间：2026-10-02。范围：`api/src/routes/{agent,agent-console,admin-agents,admin-affiliate-coupons,admin-withdrawals,me-sales,admin-misc-missing,admin-adjust}.ts`、`api/src/services/agent/*`、`web-console/src/pages/*`。
> 状态约定：✅已实现 / 🟡部分实现 / ❌未实现 / 📄文档超前（文档有、代码无）。

---

## A. 代码实际端点清单

### A.1 代理商端（`/api/v1/agent/*`，jwtAuth + requireAgent）

| # | 路由文件 | 方法 | 路径 | 功能 |
|---|---|---|---|---|
| 1 | agent.ts | GET | /api/v1/agent/commission | 佣金记录分页 + 汇总（total/pending/settled/本月，分） |
| 2 | agent.ts | GET | /api/v1/agent/withdraw/balance | 可提现余额（=已结算佣金−未拒绝提现） |
| 3 | agent.ts | GET | /api/v1/agent/withdraw/bank-info | 收款银行账户 |
| 4 | agent.ts | PUT | /api/v1/agent/withdraw/bank-info | 保存收款银行账户（upsert） |
| 5 | agent.ts | POST | /api/v1/agent/withdraw/apply | 申请提现（建单 pending + 扣减 available_balance 冻结，硬编码 ≥¥100） |
| 6 | agent.ts | GET | /api/v1/agent/withdraw/records | 提现记录列表 |
| 7 | agent.ts | GET | /api/v1/agent/settlements | 月度结算单列表（按 YYYY-MM 聚合已结算佣金） |
| 8 | agent.ts | GET | /api/v1/agent/settlements/:period | 单期结算单明细 + 汇总 |
| 9 | agent.ts | POST | /api/v1/agent/settlements/:period/confirm | 代理确认结算（system_config KV，幂等） |
| 10 | agent.ts | GET | /api/v1/agent/ranking | 业绩 Top 榜（month/total，含 my_rank） |
| 11 | agent.ts | GET | /api/v1/agent/invite/code | 当前有效邀请码 |
| 12 | agent.ts | POST | /api/v1/agent/invite/code/regenerate | 重新生成邀请码（旧码置 disabled） |
| 13 | agent.ts | GET | /api/v1/agent/invite/records | 全部邀请码 + 使用情况 |
| 14 | agent.ts | GET | /api/v1/agent/materials | 营销素材库（读 site_content type=marketing-material/published） |
| 15 | agent-console.ts | GET | /api/v1/agent/dashboard | 看板 KPI（累计/本月佣金、客户数、消费、排名） |
| 16 | agent-console.ts | GET | /api/v1/agent/consumption/recent | 名下客户最近消费动态（近 10 条） |
| 17 | agent-console.ts | GET | /api/v1/agent/customers | 名下客户列表（搜索/分页/余额/累计消费/累计佣金） |
| 18 | agent-console.ts | GET | /api/v1/agent/consumption | 名下客户消费明细（客户名+日期范围筛选+今日/本月统计） |

### A.2 管理端 — 代理商与报备

| # | 路由文件 | 方法 | 路径 | 功能 |
|---|---|---|---|---|
| 19 | admin-agents.ts | GET | /api/v1/admin/agents | 代理列表（join users + 客户数 + 佣金汇总 + 月度佣金 + 全局 summary） |
| 20 | admin-agents.ts | PUT | /api/v1/admin/agents/:id | 改佣金率(0-100) / 状态(active/disabled)。**不能改 level** |
| 21 | admin-misc-missing.ts | GET | /api/v1/admin/agents/approvals | 报备审核列表（四态 pending/approved/bound/rejected + summary） |
| 22 | admin-misc-missing.ts | POST | /api/v1/admin/agents/approvals | 创建报备（**仅 adminAuth，供联调/种子**；代理端无自助报备入口） |
| 23 | admin-misc-missing.ts | POST | /api/v1/admin/agents/approvals/:id/approve | 通过并自动划拨（写 agent_customers，pending→bound） |
| 24 | admin-misc-missing.ts | POST | /api/v1/admin/agents/approvals/:id/reject | 驳回（reason 必填，pending→rejected） |
| 25 | admin-misc-missing.ts | POST | /api/v1/admin/agents/approvals/:id/re-review | 重新审核（rejected/approved→pending） |
| 26 | admin-misc-missing.ts | POST | /api/v1/admin/agents/approvals/:id/unbind | 解绑（删 agent_customers，bound→approved） |

### A.3 管理端 — 提现审核

| # | 路由文件 | 方法 | 路径 | 功能 |
|---|---|---|---|---|
| 27 | admin-withdrawals.ts | GET | /api/v1/admin/agent-withdrawals | 提现申请列表（按状态筛选分页） |
| 28 | admin-withdrawals.ts | GET | /api/v1/admin/agent-withdrawals/:id | 提现详情 |
| 29 | admin-withdrawals.ts | POST | /api/v1/admin/agent-withdrawals/:id/review | 初审（approve→processing / reject→rejected+解冻，reason 必填） |
| 30 | admin-withdrawals.ts | POST | /api/v1/admin/agent-withdrawals/:id/transfer | 打款确认（success→completed / fail→rejected+解冻） |

### A.4 管理端 — 推广返利 / 兑换码 / 佣金工作台

| # | 路由文件 | 方法 | 路径 | 功能 |
|---|---|---|---|---|
| 31 | admin-affiliate-coupons.ts | GET | /api/v1/admin/affiliate/config | 读取通用推荐返利配置（system_config） |
| 32 | admin-affiliate-coupons.ts | PUT | /api/v1/admin/affiliate/config | 保存返利配置（requireNotImpersonated + 审计） |
| 33 | admin-affiliate-coupons.ts | GET | /api/v1/admin/affiliate/records | 返利记录（邀请 + 返佣） |
| 34 | admin-affiliate-coupons.ts | GET | /api/v1/admin/coupons | 兑换码批次列表 |
| 35 | admin-affiliate-coupons.ts | POST | /api/v1/admin/coupons/generate | 创建批次并批量生成兑换码（写审计） |
| 36 | admin-finance.ts | GET | /api/v1/admin/commission/flow | 佣金工作台（全局概览 + 代理账本 + 明细流水） |

### A.5 业务员支撑（`/api/v1/me/*`，sales/admin/super_admin；与代理商共用 agent_customers）

| # | 路由文件 | 方法 | 路径 | 功能 |
|---|---|---|---|---|
| 37 | me-sales.ts | GET | /api/v1/me/customer-tags | 可选客户标签预设（6 个固定枚举） |
| 38 | me-sales.ts | GET | /api/v1/me/customers | 名下客户列表（keyword/status/tag） |
| 39 | me-sales.ts | POST | /api/v1/me/customers/:id/assign | 认领客户（写 agent_customers source='sales'） |
| 40 | me-sales.ts | GET | /api/v1/me/customers/:id | 客户详情 |
| 41 | me-sales.ts | POST | /api/v1/me/customers/:id/contacts | 写联系记录（customer_notes） |
| 42 | me-sales.ts | PUT | /api/v1/me/customers/:id/status | 变更客户状态（lead/trial/active/silent/churned） |
| 43 | me-sales.ts | PUT | /api/v1/me/customers/:id/tags | 全量替换客户标签 |
| 44 | me-sales.ts | GET | /api/v1/me/customers/:id/consumption | 客户消费聚合/明细 |
| 45 | me-sales.ts | GET | /api/v1/me/customers/:id/recharges | 客户充值记录 |
| 46 | me-sales.ts | GET | /api/v1/me/follow-reminders | 跟进提醒列表 |
| 47 | me-sales.ts | POST | /api/v1/me/follow-reminders | 新增跟进提醒 |
| 48 | me-sales.ts | POST | /api/v1/me/follow-reminders/:id/complete | 完成提醒 |
| 49 | me-sales.ts | POST | /api/v1/me/follow-reminders/:id/ignore | 忽略提醒 |
| 50 | me-sales.ts | GET | /api/v1/me/sales-performance | 业绩看板（含同组销售排名） |

### A.6 佣金/结算服务（`api/src/services/agent/`）

| 文件 | 导出 | 作用 |
|---|---|---|
| commission.ts | generateCommissionForConsumption | 消费实时计佣（命中 active 绑定 → 直接 settled，幂等 consumption_record_id 唯一） |
| commission.ts | cancelCommissionsForConsumption | 退款冲销佣金（settled→cancelled，回冲代理余额） |
| commission.ts | resolveConsumptionRecordId | request_id/数字 → consumption_records.id |
| settlement.ts | listAgentSettlements / getAgentSettlementDetail / confirmAgentSettlement | 月度结算单（on-the-fly 聚合，无持久化结算表） |
| settlement.ts | agentSettlementRanking | 业绩榜（按 settled 佣金排序） |
| settlement.ts | getActiveInviteCode / regenerateInviteCode / findInviteByCode / consumeInviteCode / listInviteRecords | 邀请码生命周期（**不写 agent_customers**，仅拉新激励） |
| commission-backfill.ts | startCommissionBackfillScheduler | 常驻 60s 扫描近 24h 缺佣金消费自愈回填 |

> 另：`admin-adjust.ts`（/api/v1/admin/adjust/*，7 端点）为**通用财务调账审批流**（ledger/pending/创建/approve/review/reject/reverse，requireOperation2fa），非代理商专属，但代理调账复用此通道。

---

## B. 前端页面清单（web-console/src/pages）

### B.1 代理商端页面

| 页面文件 | 调用 API | 与后端契约 |
|---|---|---|
| AgentDashboardPage.tsx | /agent/dashboard, /agent/consumption/recent | ✅ 对齐 |
| AgentCustomersPage.tsx | /agent/customers | ✅ 对齐 |
| AgentConsumptionPage.tsx | /agent/consumption | ✅ 对齐 |
| AgentCommissionPage.tsx | /agent/commission | ✅ 对齐 |
| AgentWithdrawPage.tsx | /agent/withdraw/balance,/records,/bank-info,/apply | ✅ 对齐 |
| AgentSettlementPage.tsx | /agent/settlements, /:period, /:period/confirm | ✅ 对齐 |
| AgentRankingPage.tsx | /agent/ranking | ✅ 对齐 |
| AgentInvitePage.tsx | /agent/invite/code,/records, /agent/materials, regenerate | ✅ 对齐 |
| **AgentSettingsPage.tsx** | **/me/agent/profile、/me/agent/commission-rules、/me/agent/withdraw-summary、/me/agent/notif-prefs、/me/agent/withdrawals、/me/agent/commissions、/me/agent/withdraw、/agent/reports** | ❌ **整页所调 8 个端点后端全部不存在，当前为死页面（全部请求 404）** |

### B.2 管理端页面

| 页面文件 | 调用 API | 与后端契约 |
|---|---|---|
| AdminAgentsPage.tsx | /admin/agents, PUT /admin/agents/:id | ✅ 对齐 |
| admin/AdminAgentApprovalsPage.tsx | /admin/agents/approvals + approve/reject/re-review/unbind | ✅ 对齐 |
| AdminWithdrawalsPage.tsx | /admin/agent-withdrawals + review/transfer | ✅ 对齐 |
| AdminAffiliatePage.tsx | /admin/affiliate/config,/records | ✅ 对齐 |
| AdminCouponPage.tsx | /admin/coupons, /admin/coupons/generate | ✅ 对齐 |
| admin/AdminCommissionFlowPage.tsx | /admin/commission/flow | ✅ 对齐 |
| admin/AdminSettlementPage.tsx | /admin/settlements, /admin/settlements/:id/settle | ⚠️ 实为**供应商结算**（admin-finance-stats.ts），与代理结算无关，命名易混 |
| SalesCustomersPage / SalesCustomerDetailPage / SalesPerformancePage / SalesRemindersPage | /me/customers/*, /me/follow-reminders/*, /me/sales-performance | ✅ 对齐（业务员 CRM） |

---

## C. 功能点差距矩阵

| 编号 | 功能点 | 代码位置 | 文档位置 | 状态 | 差距说明 |
|---|---|---|---|---|---|
| C-01 | 三级代理层级（预备/一级/高级） | agents.ts level=junior/senior/partner | SPEC-§3.0, ref-3 §1.1 | 🟡 | 表有 3 级枚举；但无"预备代理不可提现"语义区分（所有 active 均可提现），无 audit_status/account_manager/priority_support 字段 |
| C-02 | 后台「设为代理商」创建代理 | 无 POST 端点；仅 me-sales resolveAgentId 自动建 junior(rate=0) | SPEC-§3.0, PRD-后台主导版 | ❌ | **无创建代理端点**，admin 只能 PUT 改已有记录；新代理身份无法由后台主动创建 |
| C-03 | 等级由后台调整 | PUT /admin/agents/:id 仅改 commissionRate/status | SPEC-§3.0（等级仅后台可调） | 🟡 | 不能改 level；无 /admin/agents/:id/audit 端点 |
| C-04 | 代理自动降级（连续 3 月未达标） | 无 | SPEC-§3.1 | ❌ | 无定时评估/降级任务 |
| C-05 | 佣金规则：固定比例/阶梯/固定金额/混合/按模型差异化 | agents.commission_rate 单一字段 | SPEC-§3.2, ref-3 §2 | ❌ | 无 commission_rules 表；无阶梯/固定金额/按模型/混合；佣金=消费×单一 rate |
| C-06 | 佣金规则变更审计/生效时间/追溯 | admin-agents.ts PUT 未写 audit_logs | SPEC-§3.2 | ❌ | 改佣金率无审计、无生效时间、无追溯开关 |
| C-07 | 代理端仪表盘 6 KPI + 趋势图 | agent-console.ts /agent/dashboard | SPEC-§3.3 | 🟡 | KPI 齐全（8 指标）；**无近 7/30 天消费/佣金/客户增长趋势数据接口** |
| C-08 | 提现双审（财务初审+运营复审） | admin-withdrawals.ts review+transfer | SPEC-§3.4, ref-3 §4 | 🟡 | 有两步（pending→processing→completed），但 review 与 transfer 同为任意 admin，无角色分离、无 first/second_review_note 字段、无打款凭证 URL |
| C-09 | 到账方式：银行卡/支付宝/微信 | withdraw method 硬编码 'bank' | SPEC-§3.4 | 🟡 | 仅银行卡 |
| C-10 | 提现约束：最低¥10 / 24h 一次 / 冻结 7 天 | agent.ts 硬编码 ≥¥100 | SPEC-§3.4 | ❌ | 最低额 ¥100（与文档 ¥10 不符）；**无 24h 频率限制、无 7 天佣金冻结期**；无 agents.minWithdrawAmount/cooldown/freezeDays 字段 |
| C-11 | 提现风控 + 近 7 日消费异常标注 | 无 | SPEC-§3.4, ref-3 §4.2 | ❌ | 无 riskCheckResult、无异常趋势标注 |
| C-12 | **代理端自助报备客户** | 无；仅 POST /admin/agents/approvals(adminAuth) | SPEC-§19.1, PRD-后台主导版 D2 | ❌ | **核心缺口**：代理无法自助报备；AgentSettingsPage 调 POST /agent/reports 后端不存在 |
| C-13 | 报备保护期 30 天 / 防重复 / 到期自动释放 | agent_approvals 无保护期字段；重复报备检查有 | SPEC-§19.1, AGT-001/002 | ❌ | 无保护期计时、无到期释放定时任务、未注册客户等待匹配逻辑 |
| C-14 | 报备列表多状态 + 转化统计 | admin-misc-missing 四态列表（后台） | SPEC-§19.1 | 🟡 | 后台有 pending/approved/bound/rejected + summary；**代理端看不到自己的报备**；无"保护中/已过期"态、无转化率统计 |
| C-15 | 代理商财务中心（冻结/待结算/6 月趋势/用户贡献排名/结算单下载） | 分散在 commission/withdraw/settlements 端点 | SPEC-§19.2 | 🟡 | 余额/记录可查；无冻结余额概念、无 6 月趋势图、无结算单下载、无统一财务中心页 |
| C-16 | 客户消费明细（趋势图/模型分布/CSV 导出） | agent-console.ts /agent/consumption | SPEC-§19.3 | 🟡 | 明细+筛选+今日/本月统计有；**无趋势图、无模型分布、无 CSV 导出** |
| C-17 | 代理端消息通知（5 类/偏好/未读徽标/安全告警强制） | 无（/me/agent/notif-prefs 不存在） | SPEC-§19.4, AGT-006 | ❌ | AgentSettingsPage 调 notif-prefs 后端缺失；无代理通知列表/偏好接口 |
| C-18 | 等级权益展示/升级条件进度/收益预估 | 无 | SPEC-§19.5 | ❌ | 无等级对比页、无升级进度、无收益预估 |
| C-19 | 移动版适配 | 前端未验证 | SPEC-§19.6, AGT-005 | ❓ | 未做响应式验证，标注未验证 |
| C-20 | 24.1 邀请裂变（链接/二维码/转化统计） | agent.ts invite code/records | SPEC-§24.1（**已废弃 D2**） | ✅ | 与 D2 一致：邀请码仅拉新激励、consumeInviteCode 不绑定客户；无链接点击统计。**但 agent-nav.md 文案仍写"邀请链接/二维码/转化追踪"，文档与决策矛盾** |
| C-21 | 24.2 素材库（上传/分类/下载/下载量） | agent.ts GET /agent/materials（读 site_content） | SPEC-§24.2, ENH-006 | 🟡 | 仅 published 文本素材读取；**无独立 agent_materials 表、无 admin 上传/编辑/删除端点、无文件下载、无下载量统计、无分类** |
| C-22 | 24.3 排行榜（月/季/上期对比/奖励配置/自动发放） | agent.ts /agent/ranking(month/total) | SPEC-§24.3, ENH-002 | 🟡 | 基础榜（含 my_rank、客户数、消费）；**无 /admin/agent-ranking-config、无奖励自动计算、无季度、无上期排名对比、无每日快照** |
| C-23 | 24.4 客户预警（余额不足/调用骤降/流失） | 无 /agent/alerts/* | SPEC-§24.4, ENH-003 | ❌ | 无预警列表、无 dismiss、无触发通知；通用 consumption anomaly 不面向代理 |
| C-24 | 24.5 多级佣金 | 无 parent_agent_id | SPEC-§24.5（**已废弃 D1**） | ✅ | 单级佣金，与 D1 一致 |
| C-25 | 24.6 自定义定价（客户价格倍率 1.0-2.0x） | 无 | SPEC-§24.6, ENH-005 | ❌ | 无代理对客户设倍率能力；vendor_pricing 属供应商，不属此 |
| C-26 | 月度结算单 + 代理确认 | settlement.ts（on-the-fly + system_config KV） | ref-3 §5 | 🟡 | 代理可看/可确认；**无 settlement_cycles/agent_settlements 持久化表、无管理员侧结账/打款、无 48h 自动确认** |
| C-27 | 佣金实时结算 + 退款冲销 + 自愈回填 | commission.ts + commission-backfill.ts | ref-3 §6.1 | ✅ | 实时 settled、退款 cancelled 回冲、60s 回填，幂等完整 |
| C-28 | 佣金工作台（管理员全局视图） | admin-finance.ts /admin/commission/flow | admin-commission-flow.md | ✅ | 已实现并被 AdminCommissionFlowPage 调用 |
| C-29 | 业务员 CRM（客户/标签/跟进提醒/业绩） | me-sales.ts 14 端点 | SPEC-§11 | ✅ | 完整实现（sales 角色；与代理共用 agent_customers） |
| C-30 | 通用推荐返利配置 + 兑换码批次 | admin-affiliate-coupons.ts | SPEC-§8/§19 A3/A6 | ✅ | config/records/coupons/generate 完整（与代理佣金是两套独立机制） |
| C-31 | 结算单下载 / CSV 导出（代理端） | 无 | SPEC-§19.2/19.3 | ❌ | 无任何代理端导出 |

---

## D. 关键发现

1. **【最高优先·阻断】AgentSettingsPage.tsx 是整页死代码**。该页面按"后台主导版"完整规格写了一套 `/me/agent/*`（profile / commission-rules / withdraw-summary / notif-prefs / withdrawals / commissions / withdraw）+ `/agent/reports` 共 8 个端点，但后端只实现了简化版 `/agent/*`。当前代理打开此页所有请求 404。二选一：要么补这 8 个后端端点，要么废弃该页改由现有 8 个简单代理页承担。**这是前端契约与后端实现最大的断层。**

2. **【核心业务缺口】代理端无自助报备入口**。报备划拨制（D2）的客户归属唯一来源是"代理报备→后台审核→划拨"，但代码里创建报备只有 adminAuth 端点（admin-misc-missing.ts:894，注释自承"供联调/种子数据"）。代理无法自己提交报备，导致 §19.1 整条链路在代理端断裂。

3. **【契约简化】提现流程被简化**。文档要求三态机（pending_first_review→pending_second_review→pending_payment→paid）+ 最低¥10/24h 冷却/7 天冻结/风控；实际只有两步（review+transfer）+ 硬编码最低¥100，无冷却/冻结/风控/多到账方式。admin-withdrawals.ts 与 SPEC-§3.4 差距明显。

4. **【模型简化】佣金规则单一**。文档要求阶梯/固定金额/按模型/混合 + 审计 + 生效时间；实际只有 `agents.commission_rate` 一个固定比例字段，且修改无审计。

5. **【未实现模块】§24 增强项落地不全**：客户预警(C-23)、自定义定价(C-25)、消息通知(C-17)、等级权益展示(C-18) 完全未实现；素材库(C-21) 与排行榜(C-22) 仅基础读取，无管理端配置与文件/奖励闭环。

6. **【无创建代理能力】**：后台无法主动"设为代理商"（C-02），新代理身份只能靠 me-sales 自动建 junior(rate=0) 或种子数据。

7. **【文档与实现矛盾需在重写 PRD 时统一】**：
   - `agent-nav.md` 仍写"邀请链接/二维码/创建邀请链接"，与 D2（已废弃裂变）冲突；
   - `ref-3-agent-system.md` 整篇基于旧自助模型（三级审核晋升/子代理/多级抽成/commission_rules/settlement_cycles），与当前代码（junior/senior/partner、单级、无这些表）大面积不符，文档超前；
   - `admin/AdminSettlementPage.tsx` 指向供应商结算 `/admin/settlements`，与代理月度结算无关联，命名易误读。

8. **【已对齐项，无需补】**：佣金实时结算+退款冲销+自愈回填(C-27)、业务员 CRM(C-29)、通用返利+兑换码(C-30)、邀请码不绑客户(C-20 符合 D2)、单级佣金(C-24 符合 D1)、后台报备审核四态机(C-14 后台侧) 均已落地。

### 补全优先级建议（供第 4 步参考）
- **P0**：C-12 代理端自助报备 + C-02 后台创建代理 + C-08/C-10 提现约束补齐（或在 PRD 中显式降级当前简化版为正式契约）。
- **P1**：C-17 通知偏好、C-23 客户预警、C-07/C-16 趋势图与导出、AgentSettingsPage 去留决策。
- **P2**：C-05 阶梯佣金规则、C-21 素材库管理端、C-22 排行榜奖励配置、C-25 自定义定价。
