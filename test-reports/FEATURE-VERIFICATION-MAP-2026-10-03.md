# 3Cloud 逐功能验证映射报告（FEATURE-VERIFICATION-MAP-2026-10-03）

**测试日期**：2026-10-03（Asia/Shanghai, UTC+8）
**基准**：需求文档 `docs/02-requirements/PRD-§*.md`（品牌浩寅云，基线 `91f62d3`）、`docs/ref-5.4/5.5/24/25`、`docs/07-quality-and-acceptance/*`
**口径**：`covered` = 需求点名行为有直接测试断言；`partial→补测后 covered` = 原仅纯函数/服务层有测试，本批补 HTTP 契约/集成链路后闭环；e2e 数字来自 Playwright project=`msedge`。
**说明**：本表以 `_working/gap-map.md` 功能清单为基础扩展，每行结论均带测试文件与数字出处；所有数字交叉自 `_working/` 取证文件，未做推断。

---

## 一、新功能域（a–h）逐条映射

### a. 用户预算设置 user-budget-settings（migration 0042）→ G1 + G2

- **需求出处**：`PRD-§20-用户安全与预算.md` §20.1.1「用户日/月消费预算设置 `me-budget.ts`：GET/PUT /api/v1/me/budget」；§20.1.2「网关 pre-consume 前预算熔断…超额即拒绝，不进入余额预扣」。
- **现有测试（补测前）**：`api/src/services/billing/budget.test.ts`（decideBudget 10 例 + assertWithinBudget 5 例）——纯函数判定齐全，但路由契约与 pipeline 集成位置未测。状态 **partial**。
- **本批新增测试**：
  - G1 → `api/src/routes/me-budget.test.ts`（新建，6 例：无 token GET→401；未设置 GET→默认值+usage；PUT 负限额→400；PUT alertThreshold=150→400；PUT {}→400；合法 PUT→GET 回读）。
  - G2 → `api/src/services/pipeline/integration.test.ts`（追加 2 例：日硬限额→429 且 preConsume/fetch/recordConsumption 未调用；未设置预算→200 放行）。
- **运行结果**：G1 文件 6/6 passed；integration.test.ts 16/16（原 14+新 2）；两文件合并 22/22；RED 变异 `me-budget.ts:119`、`budget-check.ts:29` 均按指定断言变红、哈希复原。
- **结论**：**partial → 补测后 covered**。pipeline 装配顺序已读码核实（chat.ts:340 budgetCheckStep 位于 :343 preConsumeStep 之前，与 PRD §20.1.2 一致）。

### b. API Key 权限 key-permissions（migration 0043）→ G3 + G4

- **需求出处**：`PRD-§20` §20.4.1「创建/编辑 Key 时可配模型范围，网关校验 MODEL_NOT_ALLOWED」；§20.4.2「非白名单 IP 拦截」；§20.4.1–20.4.4「api_keys.modelWhitelist/allowedIps/allowedReferers/dailyTokenLimit」。
- **现有测试（补测前）**：`api/src/services/security/key-permissions.test.ts`（checkModelAccess/checkIpAccess/checkRefererAccess/enforceKeyPermissions 26 例）——判定矩阵齐全，但网关切面被 integration 测试整体 mock、Key CRUD 字段持久化未测。状态 **partial**。
- **本批新增测试**：
  - G3 → `api/test/key-permissions-gateway.test.ts`（新建，3 例：allowedModels=['model-a'] 请求 model-b→403 且上游未调用；allowedIps 白名单外 IP→403；dailyTokenLimit 今日累计超限→429）。
  - G4 → `api/test/me-endpoints.test.ts`（追加 2 例：PATCH 写 allowedModels/allowedIps/allowedReferers/dailyTokenLimit→GET 列表原样回读；二次 PATCH 覆盖→GET 回读新值）。
- **运行结果**：key-permissions-gateway.test.ts 3/3 passed；me-endpoints.test.ts 48/48（原 46+新 2）；回归 key-permissions.test.ts 26/26；RED 变异 `checkModelAccess`、`apikeys.ts` patchKey 数组循环均变红、哈希复原。
- **结论**：**partial → 补测后 covered**（现状契约）。**残留差异**：PRD 期望 POST 建 Key 即带细权限字段，现状 `createKey` 仅读 name/expires_at，只能 PATCH 写入——未改生产代码，如实记录（见 REGRESSION 报告 FIND-2）。

### c. 平台台账 platform-ledger（migration 0044）→ G5

- **需求出处**：`routes/admin-ledger.ts` 头注引「PRD §29.1：GET /admin/finance/ledger 分页查询；GET …/summary 会计恒等式校验」；ADR-0012。
- **现有测试（补测前）**：`api/src/services/finance/platform-ledger.test.ts`（成对分录、listLedger 分页、summary 恒等式 4 例）——service 层已测，路由鉴权与查询参数解析未测。状态 **partial**。
- **本批新增测试**：G5 → `api/src/routes/admin-ledger.test.ts`（新建，6 例：无 token→401；customer 角色→403；account+user_id 筛选；direction=debit 筛选；start/end_date 区间筛选；非法日期串被忽略；summary 科目借/贷恒等式）。
- **运行结果**：admin-ledger.test.ts 6/6 passed（与 G6 合并 12/12）；RED 变异 direction 透传→`undefined` 时「direction=debit 筛选」变红（expected 4 to be 2），哈希 `FF33EBBD…` 复原。
- **结论**：**partial → 补测后 covered**。注：ADR-0012 仍登记「当前版本不启用 platform_ledger」，代码侧 postLedgerEntries 无生产主链路调用方，故「主链路写分录」不列为缺口（架构预留）。

### d. 代理通知偏好 agent-notif-prefs（migration 0045）→ G11

- **需求出处**：`PRD-§3-代理商体系.md` §3.2.4「通知偏好读写 agent_notif_prefs 表；customer_alert/commission_notify/audit_notify」。
- **现有测试（补测前）**：`api/src/routes/me-agent.test.ts` notif-prefs 块 2 例（默认返回、PUT 保存回读）——默认合并+读写闭环已测，PUT 对非布尔/未知 key 过滤未测。状态 **partial**。
- **本批新增测试**：G11 → `api/src/routes/me-agent.test.ts` notif-prefs 块追加 1 例（PUT {commission_notify:false, bogus:"x", audit_notify:"yes"} → 仅布尔落库、非布尔回落默认、未知键不出现）。
- **运行结果**：me-agent.test.ts 16/16（原 15+新 1）；RED 变异 `me-agent.ts:293-295` 删除 boolean 守卫时新例变红（expected 'yes' to be true；1 failed/15 passed），哈希 `6752A6C4…` 复原。
- **结论**：**partial → 补测后 covered**。

### e. 供应商门户 vendor-portal（migration 0046）→ G9

- **需求出处**：`PRD-§25-渠道供应商增强.md` §25.2.1–25.2.5；新增 `web-portal/src/app/vendor/{login,dashboard,settlements}/page.tsx`。
- **现有测试（补测前）**：`api/src/routes/vendor.test.ts`（登录/鉴权隔离/dashboard/settlements/request 409/notifications/models 10 例）——后端 6 端点全覆盖，前端零 e2e。状态 **partial**。
- **本批新增测试**：G9 → `e2e/tests/vendor-portal.spec.ts`（新建，2 例：/vendor/login→308→收敛到登录路由并渲染登录表单；未登录 /vendor/dashboard→收敛/跳转登录页）。
- **运行结果**：vendor-portal.spec.ts 2/2 passed（与 G10 合并 5/5，exit 0，6.4s）；RED 变异 dashboard 守卫删收敛跳转时 G9-2 变红（password 输入框超时 element not found；1 failed/1 passed），哈希 `8F22EA59…` 复原。
- **结论**：**partial → 补测后 covered**（按实际实现断言）。**架构发现**：`/vendor/login` 被 next.config 308 遮蔽，真实登录在 web-console SPA（vendor_token localStorage 守卫）；对被遮蔽 Next 登录页做 h1 变异「无效」（仍绿），已记录为死代码阴影。

### f. 销售 CRM sales-crm（migration 0047）→ G7 + G8

- **需求出处**：`PRD-§11-业务员CRM.md` §11.2.2「备注 notes 数组追加，上限 200 条，单条 ≤1000 字」；§11 关键架构「写操作全部落 audit_logs（sales.lead.* / sales.opportunity.* / sales.quote.*）」。
- **现有测试（补测前）**：`api/src/routes/me-crm.test.ts`（实际 7 例：鉴权 + leads/quotes 主链路/归属隔离/非法输入）——主链路 happy path 已测，备注上限与审计落账未测。状态 **partial**。
- **本批新增测试**：
  - G7 → 追加 2 例：note 1001 字→400；已有 200 条再追加→仍 200 条且最旧条 shift。
  - G8 → 追加 1 例：建线索/convert/建商机/建报价后 audit_logs 含 sales.lead.create、sales.lead.convert、sales.opportunity.create、sales.quote.create。
- **运行结果**：me-crm.test.ts 10/10（原 7+新 3）；RED 变异 `:292 >1000→>1001`（G7-1 变红 expected 200 to be 400）、`:301` 删 shift（G7-2 变红 expected 200, received 201）、`:627` 删 quote writeAudit（G8 变红），哈希 `98975F4C…` 复原。
- **结论**：**partial → 补测后 covered**。同批修复该文件 :53 未用变量 `now`（lint 测试侧清零的来源）。

### g. 告警中心 alert-rules（migration 0048）→ G6

- **需求出处**：`ref-5.4-alert-rules.md`；`routes/admin-alerts.ts` 头注「POST/PUT/DELETE /admin/alerts/rules（super_admin）；POST /admin/alerts/:id/ack」（PRD §5.4）。
- **现有测试（补测前）**：`api/src/services/monitoring/alert-engine.test.ts`（evaluateRules：error_rate 建警/去重/resolve、latency、cache、vendor_health 空值跳过 8 例）——引擎状态机已测，路由 CRUD/权限/校验/ack 未测。状态 **partial**。
- **本批新增测试**：G6 → `api/src/routes/admin-alerts.test.ts`（新建，6 例：无 token→401；admin（非 super_admin）POST/PUT/DELETE→403；metric 不在白名单→400；window_sec=10 越界→400；ack 不存在 id→404；GET /alerts?status=firing&rule_id=mine 筛选+total 计数）。
- **运行结果**：admin-alerts.test.ts 6/6 passed（与 G5 合并 12/12）；RED 变异 `windowSec<30→<0` 时「window_sec=10→400」变红（expected 201 to be 400），哈希 `18B9C7FA…` 复原。
- **结论**：**partial → 补测后 covered**。环境处置：测试库缺 monitoring_rules/alerts 表，beforeAll 按 Drizzle schema 等价 DDL 建表、afterAll DROP，对共享库净影响为零。未测 resolve/batch-ack/alert-stats/notification-configs——代码未实现，不列为缺口。

### h. 品牌改名 3Cloud→浩寅云 + 全站设计整改 → G10

- **需求出处**：`PRD-§21-Portal门户增强.md` §21.9「合规页 /privacy /terms Footer 死链 P0 修复」；§21.3「/docs 开发者文档页 P0」；`docs/design-system/DESIGN-GUIDE-2026-10.md`。
- **现有测试（补测前）**：`api/test/2fa.test.ts`（otpauth issuer=浩寅云 1 例）；i18n 范围由 i18n-blog/i18n-langs 间接覆盖——前端三个新 page.tsx 零可达性测试。状态 **uncovered（前端）**。
- **本批新增测试**：G10 → `e2e/tests/compliance-pages.spec.ts`（新建，3 例：/privacy、/terms、/docs 均返回 200 且渲染正文 h1，不 404、不 308 跳 /app/*）。
- **运行结果**：compliance-pages.spec.ts 3/3 passed（与 G9 合并 5/5，exit 0）；三页实测均 200 SSR（h1「隐私政策」「服务条款」「开发者文档」）。
- **结论**：**uncovered → 补测后 covered**（三页可达性）。全站「八维设计整改（Awwwards 基准）」属视觉层，无可自动化断言条目，不入缺口清单。

---

## 二、既有核心域概览表（回归敏感，保持原覆盖）

| 功能域 | 需求来源 | 现有测试（精确路径） | 状态 | 本批变动 |
|---|---|---|---|---|
| 网关主链路（chat/messages/anthropic/responses/rerank/openai-compat/ws-relay/task-relay） | PRD-§5-核心引擎；SPEC-§5 | `api/test/{messages,anthropic,openai-compat,responses,rerank,ws-relay,task-relay,sse-stream,pipeline}.test.ts`、`api/src/services/pipeline/{integration,steps/proxy.failover}.test.ts` | covered | integration.test.ts +2（G2），文件 16/16 绿 |
| 计费/余额/预扣/缓存定价 | PRD-核心引擎、模型缓存定价与计量、TC_P0 | `api/test/{billing,cache-billing,cache-pricing-explicit,consumption-log-cache,settle-cache-write,pricing-unit,multimodal-counter,token-count}.test.ts`、`api/src/services/billing/{balance,credit-limit,pre-consume,pricing,budget}.test.ts`、`api/src/lib/finance-rules.test.ts` | covered | 无（budget.test.ts 纯函数保持原样） |
| 限流/熔断/路由选择 | PRD-§5 | `api/test/{rate-limit,rate-limit.integration,circuit-breaker,routing,key-selector}.test.ts` | covered | 无 |
| 认证/2FA/幂等 | PRD-§2、§20.2 | `api/test/{auth,auth-invite,jwt,2fa,idempotency-gateway,oauth,oauth-bindings,body-preprocessor}.test.ts`、`api/src/{middleware/require-operation-2fa,middleware/require-perm,routes/2fa-operation,services/idempotency}.test.ts` | covered | 无 |
| 资金管理（人工上账/调账/充值审核/退款/结算/对账） | 02-requirements/03-billing-and-finance、ADR-0001..0030 | `api/src/routes/{admin-adjust,admin-manual-topup,admin-recharge-audit,admin-recharge-orders,admin-risk-finance,admin-settlement-2fa,admin-vendor-settlement-ops,admin-finance-rules,me-recharge-endpoints}.test.ts`、`api/test/{agent-settlement,vendor-settlement,reconciliation-t04,supplier-ops}.test.ts` | covered | 无 |
| 管理后台（用户/角色权限/impersonate/公告/票务） | PRD-§4、§30 | `api/src/routes/{admin-impersonate,admin-tickets,announcements-gap,me-gap-endpoints,me-gap-knowledge-base,me-consent,me-onboarding-tags,models-endpoints,admin-model-codes}.test.ts` | covered | 新增 admin-ledger.test.ts(G5)、admin-alerts.test.ts(G6) 两个邻近管理路由测试 |
| 代理商（佣金/提现/素材/排行榜/通知偏好） | PRD-§3、§24 | `api/test/{agent-commission,agent-materials,agent-settlement}.test.ts`、`api/src/routes/{agent-console,me-agent}.test.ts` | covered | me-agent.test.ts +1（G11），文件 16/16 绿 |
| 供应商主数据/渠道 Key/别名/门户 | PRD-§25 | `api/test/{suppliers,supplier-ops,admin-marketplace}.test.ts`、`api/src/routes/{vendor,vendor-alias,admin-competitive-marketplace}.test.ts` | covered | 新增 e2e/vendor-portal.spec.ts(G9) |
| 用户体系（删除/数据导出/通知偏好/分组/me 端点/Key CRUD） | PRD-§2、§18、§22 | `api/test/{deletion,data-requests,data-export-grants,user-groups,me-endpoints,i18n-scope}.test.ts`、`api/src/lib/{password,operation-summary}.test.ts` | covered | 新增 me-budget.test.ts(G1)；me-endpoints.test.ts +2（G4），文件 48/48 绿 |
| 系统基础（健康/IP 黑名单/备份恢复/迁移/合规报告） | PRD-§7、§33 | `api/test/{health,ip-blacklist,backup-restore,manual-migrations-runner,compliance-report,api-domain,model-status,model-sync}.test.ts` | covered | 无 |

---

## 三、E2E 覆盖映射（既有 4 spec + 新增 2 spec）

| spec 文件 | 用例 | 运行结果 | 结论 / 备注 |
|---|---|---|---|
| `e2e/tests/console.spec.ts`（既有） | 含于既有 37 例 | 套件合计 **33 passed / 2 failed / 2 skipped**（exit 1） | covered；本批未改动 |
| `e2e/tests/fullflow.spec.ts`（既有） | 真实调度链路 | 收口重跑：①充值审核 passed；②2FA passed；③真实调度 failed（由原 404 前移为 **502 UPSTREAM_ERROR**）；④⑤ 级联 skipped；③ 复跑 `-g "③"` 仍 failed（确认非抖动） | partial（**错误编码根因已修复**：模型参数改为合法编码 `deepseekv4fl-wanwu-youdao`，路由正确锁定 wanwu-youdao/id=2317/keyId=192；残留 environment_block = 上游渠道本身 502，待运维核实上游健康，断言未放宽） |
| `e2e/tests/user-features.spec.ts`（既有） | 用户端逐页渲染 | 收口重跑 **23 passed / 0 failed**（exit 0，1.7m），原 :74「渠道选择」失败消失 | covered（**resolved · 关闭**：/vendor-selector 属 PRD:44/PRD:54 + SPEC M-S-01 + 阶段B 三.T4 刻意下线入口，过期 PAGES 条目已移除并原位留痕注释 L41-48，PAGES 24→23） |
| `e2e/tests/user-real-flow.spec.ts`（既有） | 真实流程 | passed（计入 33 passed） | covered；本批未改动 |
| `e2e/tests/vendor-portal.spec.ts`（**新增**，G9） | 2 例（登录表单收敛、未登录 dashboard 收敛） | **2 passed / 0 failed**（合并 G10 共 5 passed, exit 0, 6.4s） | covered；RED 经 dashboard 守卫变异实证 |
| `e2e/tests/compliance-pages.spec.ts`（**新增**，G10） | 3 例（/privacy、/terms、/docs 200+正文） | **3 passed / 0 failed** | covered；三页实测均 200 SSR |

**e2e 合计**：既有 4 spec 首跑 37 例 → 33 passed / 2 failed / 2 skipped；收口阶段重跑两条失败 spec——`user-features` **23 passed / 0 failed**（exit 0，E2E-2 关闭），`fullflow` ③ 由 404 修复为正确编码 `deepseekv4fl-wanwu-youdao` 后残留上游 502（environment_block，待运维核实上游 wanwu 渠道健康，断言未放宽）。新增 2 spec（G9/G10）共 5 例 → 5 passed / 0 failed；新增两 spec 不依赖 chat 调用与 /vendor-selector。

---

## 四、G1–G11 覆盖闭环自检

| 缺口 | 需求原文摘录（出处） | 契约 | 测试文件 | 用例数 | 结果 | 结论 |
|---|---|---|---|---|---|---|
| G1 | §20.1.1「GET/PUT /api/v1/me/budget；表 user_budget_settings」 | 路由鉴权/默认值/入参校验/upsert 回读 | `api/src/routes/me-budget.test.ts` | 6 | 6/6 GREEN，RED 哈希复原 | covered |
| G2 | §20.1.2「pre-consume 前预算熔断…不进入余额预扣」 | 429 时 preConsume/fetch/recordConsumption 不触发 | `api/src/services/pipeline/integration.test.ts` | +2 | 文件 16/16 GREEN | covered |
| G3 | §20.4.1「网关校验 MODEL_NOT_ALLOWED」；§20.4.2「非白名单 IP 拦截」 | 网关切面真实拦截（403/429） | `api/test/key-permissions-gateway.test.ts` | 3 | 3/3 GREEN | covered |
| G4 | §20.4.1–20.4.4「api_keys.*细权限字段」 | Key CRUD 字段持久化回读 | `api/test/me-endpoints.test.ts` | +2 | 文件 48/48 GREEN | covered（现状 PATCH-only，PRD POST 差异已记录） |
| G5 | §29.1「GET /admin/finance/ledger 分页；…/summary 会计恒等式」 | 只读路由鉴权+查询参数解析 | `api/src/routes/admin-ledger.test.ts` | 6 | 6/6 GREEN | covered |
| G6 | §5.4「POST/PUT/DELETE /admin/alerts/rules（super_admin）；ack」 | 写权限边界/入参校验/ack/事件筛选 | `api/src/routes/admin-alerts.test.ts` | 6 | 6/6 GREEN | covered |
| G7 | §11.2.2「备注上限 200 条，单条 ≤1000 字」 | 长度硬校验+条数溢出 shift | `api/src/routes/me-crm.test.ts` | +2 | 文件 10/10 GREEN | covered |
| G8 | §11「写操作全部落 audit_logs」 | CRM 写动作审计留痕 | `api/src/routes/me-crm.test.ts` | +1 | 含于 10/10 GREEN | covered |
| G9 | §25.2.1「vendor 自助门户（登录/看板）」 | 前端可达性+未登录收敛 | `e2e/tests/vendor-portal.spec.ts` | 2 | 2/2 GREEN | covered（/vendor/login 308 遮蔽已记录） |
| G10 | §21.9「/privacy /terms Footer 死链 P0」；§21.3「/docs P0」 | 合规/文档页非 404/非跳 /app | `e2e/tests/compliance-pages.spec.ts` | 3 | 3/3 GREEN | covered |
| G11 | §3.2.4「通知偏好读写 agent_notif_prefs 表」 | PUT 过滤非布尔/未知 key | `api/src/routes/me-agent.test.ts` | +1 | 文件 16/16 GREEN | covered |

**合计**：11 条缺口全部补测闭环，新增 34 用例（vitest 29 + e2e 5）；终验 api 单测 106 文件 / 1513 用例全绿（exit 0），typecheck exit 0。

---

## 五、自检结论

- 新功能域 a–h 共 8 个域、11 条缺口（G1–G11）已逐条映射到需求出处、测试文件、用例数与运行结果，**无遗漏**；每条关键结论均带测试文件路径与数字出处。
- 既有核心域 10 个域保持 covered，本批仅在其邻近追加 G2/G4/G5/G6/G11 用例，回归无破坏。
- e2e 既有 4 spec（首跑 37 例：33/2/2）+ 新增 2 spec（5 例：5/0）均已映射；收口阶段 E2E-2（/vendor-selector 过期断言）**已关闭**（user-features 重跑 23/0 全绿），E2E-1 根因（错误裸模型名）**已修复**、残留为上游 wanwu 渠道本身 502（environment_block，待运维核实上游健康）。
- 所有数字与 `_working/` 取证文件交叉一致，未做推断或补造；未覆盖任何既有文件，未做 git 操作。
