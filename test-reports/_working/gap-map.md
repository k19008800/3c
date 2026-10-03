# 需求 → 测试覆盖映射与缺口清单（gap-map）

- 仓库：`C:\Users\ZH\.openclaw\workspace\3cloud`（main，工作区未提交新增功能批次 0042–0048）
- 基准文档：`docs/02-requirements/PRD-§*.md`（品牌浩寅云，基线 `91f62d3`）、`docs/ref-5.4/5.5/24/25`、`docs/07-quality-and-acceptance/*`、`docs/00-index/*`
- 盘点方式：测试侧按文件名 + describe/it 标题级扫描（api/test 55 个、api/src 邻近 47 个、e2e 4 个，共 106 个）；未逐行精读用例正文。
- 状态口径：`covered` = 需求点名行为有直接测试断言；`partial` = 仅服务/纯函数层有测试，HTTP 契约或集成链路缺位；`uncovered` = 零测试。
- 纪律：缺口仅收录「需求文档点名 + 代码已实现 + 当前零覆盖」的条目；PRD 自身标 ❌ 的未实现项不列为缺口（无对象可测）。

---

## 1. 功能清单表（功能域 → 需求来源 → 现有测试 → 覆盖状态）

### 1.1 新功能域（a–h，git 新增批次）

| 功能域 | PRD/SPEC 来源 | 现有测试文件（精确路径） | 状态 | 说明 |
|---|---|---|---|---|
| a. 用户预算设置 user-budget-settings（migration 0042） | `PRD-§20-用户安全与预算.md` §20.1.1/20.1.2；`ref-5.5-user-quota-budget.md` | `api/src/services/billing/budget.test.ts`（decideBudget 10 例 + assertWithinBudget 5 例） | **partial** | 纯函数判定（硬阻断/阈值告警/fail-open/月限额）齐全；`routes/me-budget.ts` 的 GET/PUT HTTP 契约零测试；pipeline `steps/budget-check.ts` 集成位置未测 |
| b. API Key 权限 key-permissions（0043） | `PRD-§20` §20.4.1–20.4.5 | `api/src/services/security/key-permissions.test.ts`（checkModelAccess/checkIpAccess/checkRefererAccess/enforceKeyPermissions 26 例） | **partial** | 判定逻辑（白/黑名单、CIDR、Referer 子串、日 Token、RPM/TPM、Redis fail-open）齐全；网关 HTTP 403/429 端到端未测；`routes/apikeys.ts` 新字段读写持久化未测 |
| c. 平台台账 platform-ledger（0044） | `routes/admin-ledger.ts` 头注引 PRD §29.1；`ADR-0012-platform-ledger-scope.md` | `api/src/services/finance/platform-ledger.test.ts`（成对分录写入、listLedger 分页、summary 恒等式 4 例） | **partial** | service 读写与恒等式已测；`GET /admin/finance/ledger[/summary]` 路由鉴权（admin/超管）、查询参数解析零测试 |
| d. 代理通知偏好 agent-notif-prefs（0045） | `PRD-§3-代理商体系.md` §3.2.4；`PRD-§19` §19.2.1/19.4.1 | `api/src/routes/me-agent.test.ts`（notif-prefs 块 2 例：默认返回、PUT 保存回读） | **partial** | 默认合并 + 读写闭环已测；PUT 对未知 key/非布尔值的过滤契约未测 |
| e. 供应商门户 vendor-portal（0046） | `PRD-§25-渠道供应商增强.md` §25.2.1–25.2.5；`ref-25-vendor-enhance.md` §25.4 | `api/src/routes/vendor.test.ts`（登录/鉴权隔离/dashboard/settlements/request 409/notifications/models 10 例） | **partial** | 后端 6 端点全有覆盖；前端 `web-portal/src/app/vendor/{login,dashboard,settlements}/page.tsx` 零 e2e 覆盖 |
| f. 销售 CRM sales-crm（0047） | `PRD-§11-业务员CRM.md` §11.2/11.3/11.4；`PRD-§24` §24.11–24.13 | `api/src/routes/me-crm.test.ts`（鉴权/线索→商机→报价主链路/归属隔离/admin 跨看/非法输入 9 例）；`api/src/routes/sales-support.test.ts`（me-sales 14 端点） | **partial** | 主链路 happy path + 归属隔离 + 版本自增/总额重算已测；备注上限、audit_logs 落账未测 |
| g. 告警中心 alert-rules（0048） | `ref-5.4-alert-rules.md`；`routes/admin-alerts.ts` 头注引 PRD §5.4 | `api/src/services/monitoring/alert-engine.test.ts`（evaluateRules：error_rate 建警/去重/回落 resolve、latency、cache、vendor_health 空值跳过 8 例） | **partial** | 引擎状态机已测；`routes/admin-alerts.ts` 的规则 CRUD（super_admin 权限边界、metric/window_sec 校验）、ack、事件列表筛选零路由测试 |
| h. 品牌改名 3Cloud→浩寅云 + 全站设计整改 | `PRD-§21-Portal门户增强.md` §21.3/§21.9；`docs/design-system/DESIGN-GUIDE-2026-10.md` | `api/test/2fa.test.ts`（otpauth issuer=浩寅云 1 例）；`api/test/i18n-blog.test.ts`、`api/src/lib/i18n-langs.test.ts`（i18n 范围） | **uncovered**（前端） | 仅 TOTP issuer 一处品牌断言；`web-portal` 新增 `/privacy`、`/terms`、`/docs` 三个 page.tsx 无任何可达性测试；全站文案/设计整改无测试条目 |

### 1.2 既有核心域（回归敏感，保持原覆盖）

| 功能域 | 需求来源 | 现有测试 | 状态 |
|---|---|---|---|
| 网关主链路（chat/messages/anthropic/responses/rerank/openai-compat/ws-relay/task-relay） | `PRD-§5-核心引擎.md`；SPEC-§5 | `api/test/{messages,anthropic,openai-compat,responses,rerank,ws-relay,task-relay,sse-stream,pipeline}.test.ts`、`api/src/services/pipeline/{integration,steps/proxy.failover}.test.ts` | covered |
| 计费/余额/预扣/缓存定价 | PRD-核心引擎、`PRD-模型缓存定价与缓存计量.md`、`test-plans/TC_P0` | `api/test/{billing,cache-billing,cache-pricing-explicit,consumption-log-cache,settle-cache-write,pricing-unit,multimodal-counter,token-count}.test.ts`、`api/src/services/billing/{balance,credit-limit,pre-consume,pricing}.test.ts`、`api/src/lib/finance-rules.test.ts` | covered |
| 限流/熔断/路由选择 | PRD-§5 | `api/test/{rate-limit,rate-limit.integration,circuit-breaker,routing,key-selector}.test.ts` | covered |
| 认证/2FA/幂等 | PRD-§2、`PRD-§20` §20.2 | `api/test/{auth,auth-invite,jwt,2fa,idempotency-gateway,oauth,oauth-bindings,body-preprocessor}.test.ts`、`api/src/{middleware/require-operation-2fa,middleware/require-perm,routes/2fa-operation,services/idempotency}.test.ts` | covered |
| 资金管理（人工上账/调账/充值审核/退款/结算/对账） | `02-requirements/03-billing-and-finance/*`、ADR-0001..0030 | `api/src/routes/{admin-adjust,admin-manual-topup,admin-recharge-audit,admin-recharge-orders,admin-risk-finance,admin-settlement-2fa,admin-vendor-settlement-ops,admin-finance-rules,me-recharge-endpoints}.test.ts`、`api/test/{agent-settlement,vendor-settlement,reconciliation-t04,supplier-ops}.test.ts` | covered |
| 管理后台（用户/角色权限/impersonate/公告/票务） | PRD-§4、PRD-§30 | `api/src/routes/{admin-impersonate,admin-tickets,announcements-gap,me-gap-endpoints,me-gap-knowledge-base,me-consent,me-onboarding-tags,models-endpoints,admin-model-codes}.test.ts` | covered |
| 代理商（佣金/提现/素材/排行榜） | PRD-§3、§24 | `api/test/{agent-commission,agent-materials,agent-settlement}.test.ts`、`api/src/routes/agent-console.test.ts` | covered |
| 供应商主数据/渠道 Key/别名 | PRD-§25.1 | `api/test/{suppliers,supplier-ops,admin-marketplace}.test.ts`、`api/src/routes/{vendor-alias,admin-competitive-marketplace}.test.ts` | covered |
| 用户体系（删除/数据导出/通知偏好用户侧/分组） | PRD-§2、§18、§22 | `api/test/{deletion,data-requests,data-export-grants,user-groups,me-endpoints,i18n-scope}.test.ts`、`api/src/lib/{password,operation-summary}.test.ts` | covered |
| 系统基础（健康/IP 黑名单/备份恢复/迁移/合规报告） | PRD-§7、§33 | `api/test/{health,ip-blacklist,backup-restore,manual-migrations-runner,compliance-report,api-domain,model-status,model-sync}.test.ts` | covered |
| E2E 主流程 | `test-plans/TC_00~TC_29` | `e2e/tests/{console,fullflow,user-features,user-real-flow}.spec.ts` | covered（既有页面；不含新 vendor/合规页） |

---

## 2. 新功能域（a–h）逐条映射详查

### a. user-budget-settings（migration 0042）
- 已测：`budget.test.ts` 覆盖「未设置放通 / 日限额硬阻断 / 80% 阈值告警 / hardBlock=false 仅告警 / 月限额阻断 / DB 异常 fail-open / 预估≤0 不查库」。
- 未测（需求点名）：① `GET/PUT /api/v1/me/budget` 路由契约（默认值、负数/越界 alertThreshold/空 patch 的 400、未登录 401）；② `budgetCheckStep()` 在 pipeline 中的相对位置——PRD §20.1.2 明文「预扣前执行，超额即拒绝，不进入余额预扣」，当前无任何用例断言 429 时不产生消费记录/pre-consume 不触发。→ G1、G2。

### b. key-permissions（migration 0043）
- 已测：`key-permissions.test.ts` 覆盖判定矩阵与编排（含 Redis 不可用 fail-open、纯配置优先不读 Redis）。
- 未测：① 网关 HTTP 层真实拦截（带 modelWhitelist 的 Key 打白名单外模型 → 403；IP 白名单外 → 403），`integration.test.ts:68` 直接把 `enforceKeyPermissionsPreHandler` mock 掉；② `routes/apikeys.ts` 第 160/173 行实现的 allowedModels/allowedIps/allowedReferers/dailyTokenLimit/rpmLimit/tpmLimit 字段在 Key 创建/更新/回读中的持久化。→ G3、G4。

### c. platform-ledger（migration 0044）
- 已测：`platform-ledger.test.ts` 覆盖成对分录（充值/消费借贷方向）、listLedger 科目筛选分页、summary 会计恒等式。
- 未测：`routes/admin-ledger.ts` 的 `GET /admin/finance/ledger` 与 `/summary`——非 admin 403、query 参数（account/direction/user_id/起止日期/page）解析零测试。
- 备注：ADR-0012 仍登记「当前版本不启用、不写入 platform_ledger，充值/扣费/退款不得依赖该表」；代码侧 `postLedgerEntries` 目前无生产主链路调用方（仅 service 自测），故「主链路写分录」不列为缺口（未启用，属架构预留）。→ G5。

### d. agent-notif-prefs（migration 0045）
- 已测：`me-agent.test.ts` notif-prefs 块 2 例（默认值返回、PUT 后 GET 回读）；同文件其余 20 例覆盖 profile/commission-rules/withdraw-summary/commissions/withdrawals/withdraw/reports。
- 未测：PUT 全量保存时对非布尔值/未知 key 的过滤（`me-agent.ts:292-294` 只收 `typeof boolean`）。→ G11。

### e. vendor-portal（migration 0046）
- 已测：`vendor.test.ts` 10 例覆盖 login 失败 401/成功 200、无 token 401、用户 JWT 越权 401、dashboard、settlements 本渠道隔离、request 首次 200/重复 pending 409、notifications 置顶、models 本渠道。
- 未测：前端三页 `web-portal/src/app/vendor/{login,dashboard,settlements}/page.tsx`——e2e 4 个 spec 均不含 vendor 用例（grep privacy|terms|/docs|vendor/ 在 e2e 零命中）。→ G9。

### f. sales-crm（migration 0047）
- 已测：`me-crm.test.ts` 覆盖线索创建→列表→详情→备注→转商机（自动置 qualified）→报价（total 后端重算、version 自增）→商机详情聚合报价、draft→sent、sales2 归属隔离 403、admin 跨看、缺公司/非法状态/空行项 400、商机不存在 404。
- 未测：① PRD §11.2.2「备注上限 200 条，单条 ≤1000 字」（`me-crm.ts:292/301` 已实现校验与 shift）；② PRD §11 关键架构「写操作全部落 audit_logs（sales.lead.* / sales.opportunity.* / sales.quote.*）」。→ G7、G8。

### g. alert-rules（migration 0048）
- 已测：`alert-engine.test.ts` 8 例覆盖 error_rate 建警/未解决去重/回落自动 resolve、latency P99、cache_hit_rate、vendor_health 空值跳过、全健康静默。
- 未测：`routes/admin-alerts.ts` 全部 HTTP 契约——super_admin 写权限边界（admin 角色 POST/PUT/DELETE → 403）、metric 白名单与 window_sec 30–86400 校验 400、ack 不存在 404、事件列表 status/rule_id 筛选与 total 计数。注意：ref-5.4 中的 resolve/batch-ack/alert-stats/notification-configs 端点代码未实现，不列为缺口。→ G6。

### h. 品牌与全站设计整改
- 已测：仅 `2fa.test.ts:249-255` 断言 otpauth URL `issuer=浩寅云`；i18n 词典范围由 `i18n-scope/i18n-blog/i18n-langs` 间接覆盖。
- 需求点名且零测试：PRD §21.9「/privacy、/terms Footer 死链 P0 修复」、§21.3「/docs 开发者文档页 P0」——三个 page.tsx 已存在（web-portal/src/app 下确认），但无任何路由可达性测试。全站「八维设计整改（Awwwards 基准）」属视觉层，无可自动化断言条目，不入缺口清单。→ G10。

---

## 3. 缺口清单

| 编号 | 需求来源（文件 + 条目原文摘录） | 契约描述 | 可观察结果（输入→期望输出） | 建议测试位置 |
|---|---|---|---|---|
| G1 | `PRD-§20-用户安全与预算.md` §20.1.1「用户日/月消费预算设置 `me-budget.ts`：GET/PUT /api/v1/me/budget；表 user_budget_settings」 | `/me/budget` 路由鉴权、默认值、入参校验、upsert 回读 | 未带 token GET → 401；从未设置用户 GET → dailyLimitCents/monthlyLimitCents=null、alertThreshold=80、hardBlock=true 且含 todayCents/monthCents；PUT dailyLimitCents=-1 → 400；PUT alertThreshold=150 → 400；PUT {} 空 patch → 400；合法 PUT 后再 GET 读到新值 | `api/src/routes/me-budget.test.ts`（新建，邻近路由） |
| G2 | `PRD-§20-用户安全与预算.md` §20.1.2「网关 pre-consume 前预算熔断…超额即拒绝，不进入余额预扣」 | budget-check 步骤位于 pre-consume 之前的熔断行为 | 已达日硬限额的用户请求 /v1/chat/completions → 429 BudgetLimitExceeded；断言 pre-consume 未被调用、用户余额不变、无消费记录产生；未设置预算用户同请求放行 | `api/test/messages.test.ts` 追加 describe（或 `api/src/services/pipeline/integration.test.ts`） |
| G3 | `PRD-§20` §20.4.1「创建/编辑 Key 时可配模型范围，网关校验 MODEL_NOT_ALLOWED」；§20.4.2「非白名单 IP 拦截」 | 细权限在网关切面的真实拦截（当前 preHandler 被 integration 测试整体 mock） | 持有 modelWhitelist=[A] 的 Key 请求模型 B → 403 且上游未被调用；持有 allowedIps 的 Key 从白名单外 IP 请求 → 403；日 Token 超限 → 429 | `api/test/openai-compat.test.ts` 追加，或新建 `api/test/key-permissions-gateway.test.ts` |
| G4 | `PRD-§20` §20.4.1–20.4.4「api_keys.modelWhitelist/allowedIps/allowedReferers/dailyTokenLimit」 | Key CRUD 新权限字段的持久化回读 | POST /me/api-keys 传 allowedModels/allowedIps/allowedReferers/dailyTokenLimit → 列表与详情原样返回；PUT 改字段后回读为新值 | `api/test/me-endpoints.test.ts` 追加 describe（或新建 `api/src/routes/apikeys.test.ts`） |
| G5 | `routes/admin-ledger.ts` 头注引「PRD §29.1：GET /admin/finance/ledger 分页查询；GET …/summary 会计恒等式校验」 | 台账只读路由鉴权与查询参数解析 | customer 角色或无 token 请求 → 401/403；?account=xxx&direction=debit&user_id=1&start_date/end_date= 筛选生效；非法日期串被忽略不报错；summary 返回各科目 debitCents/creditCents | `api/src/routes/admin-ledger.test.ts`（新建） |
| G6 | `routes/admin-alerts.ts` 头注「POST/PUT/DELETE /admin/alerts/rules（super_admin）；POST /admin/alerts/:id/ack」（PRD §5.4） | 告警规则写权限边界、入参校验、ack 与事件筛选 | admin（非 super_admin）POST 建规则 → 403；metric=unknown → 400；window_sec=10 → 400；ack 不存在 id → 404；GET /admin/alerts?status=firing&rule_id=2 仅返回匹配项且 total 计数正确 | `api/src/routes/admin-alerts.test.ts`（新建） |
| G7 | `PRD-§11-业务员CRM.md` §11.2.2「线索备注 notes 数组追加，上限 200 条，单条 ≤1000 字」 | 备注长度硬校验与条数溢出丢弃最旧 | POST notes body.note 为 1001 字 → 400；已有 200 条备注时再追加 → 返回数组仍 200 条且原最旧条被 shift | `api/src/routes/me-crm.test.ts` 追加 it |
| G8 | `PRD-§11` 关键架构「写操作全部落 audit_logs（action: sales.lead.* / sales.opportunity.* / sales.quote.*）」 | CRM 写动作审计留痕 | 创建线索 / convert 转商机 / 创建报价后，fakeDb 中 auditLogs 出现对应 action（sales.lead.create、sales.opportunity.create、sales.quote.create）记录 | `api/src/routes/me-crm.test.ts` 追加 it（断言 fakeDb.__rows(schema.auditLogs)） |
| G9 | `PRD-§25-渠道供应商增强.md` §25.2.1「vendor 自助门户（登录/看板）」；新增 `web-portal/src/app/vendor/{login,dashboard,settlements}/page.tsx` | vendor 门户前端可达性与未登录收敛 | 浏览器访问 /vendor/login → 200 渲染登录表单；未登录直接访问 /vendor/dashboard → 跳转/收敛到登录页 | `e2e/tests/vendor-portal.spec.ts`（新建） |
| G10 | `PRD-§21-Portal门户增强.md` §21.9「合规页 /privacy /terms Footer 硬编码…线上 404 死链，P0 修复」；§21.3「/docs 开发者文档页 整页缺失 P0」 | 合规/文档页非 404、非 redirect 到 /app | GET /privacy、/terms、/docs 均返回 200 且页面含正文（非 404、非 308 跳 /app/*） | `e2e/tests/user-features.spec.ts` 追加用例，或 web-portal 侧 page 组件渲染测试 |
| G11 | `PRD-§3-代理商体系.md` §3.2.4「通知偏好读写 agent_notif_prefs 表；customer_alert/commission_notify/audit_notify」 | PUT 全量保存时过滤非布尔与未知 key | PUT {commission_notify:false, bogus:"x", audit_notify:"yes"} → 持久化仅 commission_notify=false；随后 GET 中 customer_alert 仍为默认 true、bogkey 不出现 | `api/src/routes/me-agent.test.ts` notif-prefs 块追加 it |

共 **11 条**缺口（G1–G11）。

---

## 4. 现有测试已覆盖功能一览（回归报告引用）

- **网关与协议适配**：messages / anthropic / openai-compat / responses / rerank / ws-relay / task-relay / sse-stream（含真实上游 mock 计费精确断言）、pipeline 执行器与 proxy 故障转移、key-selector。
- **计费与资金**：balance、pre-consume、credit-limit、pricing、finance-rules、cache-billing / cache-pricing-explicit / consumption-log-cache / settle-cache-write / pricing-unit / multimodal-counter / token-count；人工上账、调账、充值审核、风险财务、结算 2FA、vendor 结算 ops、充值订单、reconciliation-t04。
- **安全与认证**：auth / invite / jwt / oauth / oauth-bindings、2FA（含操作级 2FA middleware 20 例、2fa-operation 路由）、require-perm、idempotency-gateway / idempotency service、IP 黑名单、body-preprocessor。
- **用户侧端点**：me-endpoints（含 api-keys revoke-all）、me-gap 系列（consent/onboarding-tags/knowledge-base/endpoints）、me-recharge-endpoints、模型端点、deletion、data-requests、data-export-grants、user-groups。
- **管理后台**：impersonate、tickets、announcements-gap、admin-model-codes、admin-affiliate-coupons、admin-competitive-marketplace、admin-marketplace。
- **代理与渠道**：agent-console、agent-commission、agent-materials、agent-settlement、suppliers、supplier-ops、vendor-alias（28KB 大文件）。
- **新功能骨架**（本批）：budget / key-permissions / platform-ledger / alert-engine / me-agent / vendor / me-crm / me-sales(sales-support) —— 详见 §2。
- **基础设试**：health、manual-migrations-runner、backup-restore、compliance-report、api-domain、model-status、model-sync、i18n-langs / i18n-scope / i18n-blog、operation-summary、password、upstream errors。
- **E2E**：console、fullflow、user-features、user-real-flow（37 例全绿基线，见 release-baseline）。

---

## 5. 自检结论

- 映射表中引用的测试文件路径均已在盘点命令输出中逐一核对存在（106 个文件）。
- 11 条缺口全部带需求出处（PRD 条目原文或路由头注引用的 PRD 编号），且代码对应契约已确认实现（me-crm.ts:292/301、admin-alerts.ts parseRuleBody、vendor.ts 6 端点、web-portal 三个 page.tsx 等）。
- 未做任何 git 操作、未改任何代码与测试；本文件为唯一写入物。
