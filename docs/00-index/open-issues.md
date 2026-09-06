# 未决事项

- 文档 ID：INDEX-ISSUES-001
- 状态：review
- 生效版本：v0.3.0
- 建立日期：2026-08-29

以下问题在正式章节同步前必须解决，当前不得自行用代码现状替代业务裁决：

1. ~~退款类型是原路退款、余额退费还是分型处理；是否允许负余额~~：**已解决，见 ADR-0020**。当前版本按业务类型分流，禁止负余额。
2. ~~充值/人工上账审批阶段的 API 展示字段与数据库存储字段~~：**已解决，见 ADR-0021**。业务 `status` 与 `approval_phase` 分离，管理端返回 `status + approval_phase + approval_required`，用户端只返回业务状态。
3. ~~24 小时限额的配置键名、soft/hard 与 `exceed_action` 优先级~~：**已解决，见 ADR-0022**。统一使用 `limits.operator_24h`、`limits.recipient_24h`、`limits.exceed_action`，并冻结优先级。
4. ~~API reference 旧路径的兼容窗口与废止日期~~：**已解决，见 ADR-0023**。`/api/v1/v1/*` 兼容至 `v1.x`，在 `v2.0.0` 移除；错误的单层 `/api/v1/*` 历史路径不作为 alias。
5. ~~canonical 角色枚举与权限 grant/deny 优先级~~：**已解决，见 ADR-0024**。当前角色固定为 `customer/agent/sales/admin/super_admin`，显式 deny 优先，默认拒绝。
6. ~~SSO callback 域名及会话交换方式~~：**已解决，见 ADR-0025**。统一使用 API 域名 callback、一次性短时 code 和 Secure/HttpOnly/SameSite Cookie。
7. ~~手写迁移唯一执行入口、回滚方式和测试基线~~：**已解决，见 ADR-0026**。统一使用 `pnpm run db:migrate:manual`，custom dump 使用 `pg_restore`，正式测试基线须带完整元数据。
8. ~~出站 Webhook 与入站 Webhook 是否拆为独立能力~~：**已解决，见 ADR-0027**。出站投递与入站接收独立定义，失败状态和安全校验不混用。
9. ~~备份定时、保留、异地副本和恢复演练责任组件~~：**已解决，见 ADR-0028**。唯一任务执行者每日 04:00 备份，本机 7 天、异地 30 天，并按月执行独立恢复演练。
10. ~~全量发布测试唯一基线（当前资料出现 1159、1132、808）~~：**已解决，见 ADR-0029**。历史数字不作为正式基线；唯一基线文件为 `docs/07-quality-and-acceptance/release-baseline.md`。

每项必须关联 ADR 或标记 `CONFLICT`，在解决前不得标记相关正式章节为 `approved`。

---

### 2026-08-30 人工上账上限裁决（已解决）

13. ~~人工上账单笔上限是 ¥50,000 还是 ¥1,000,000~~：**已解决，见 ADR-0001 及 BOSS 2026-08-30 人工确认（选择 A）**。人工上账单笔上限固定为 ¥50,000，超过即拒绝，不进入人工上账终审档；大额对公入账走充值订单路径。用户自助充值单笔上限保持 ¥1,000,000，两者为独立业务对象，不得混同。

### 2026-08-30 追加未决（治理加固，见 `document-inventory.md`）

11. **supplement/01–09 从"悬空来源"纳入正式评审**：`supplement/` 内容自述为"重写直接可开发不踩坑"的最终规格依据，但此前游离于权威入口之外。已纳入 `document-inventory.md` 登记补充对象与状态。**待办**：逐份纳入对应模块联合评审，通过后升为正式 SPEC 章节或标注 `superseded`；`09-遗漏补丁.md` 的补丁 A/B/C/D 归属逐条核对。
12. **用户体系 PRD 恢复裁决**：**已完成本轮人工裁决（仍为 review，未 approved）**。恢复裁决记录见 [`_recovered/PRD-用户体系-recovery-decision-2026-08-31.md`](../_recovered/PRD-用户体系-recovery-decision-2026-08-31.md)，正式审阅稿见 [`02-requirements/02-user-system/PRD-用户体系-v1.0.0-review.md`](../02-requirements/02-user-system/PRD-用户体系-v1.0.0-review.md)。原始 1326 行中 610 行仍不可安全逆转；无法可靠恢复项已明确废弃或列为 `BLOCKED-USER-RECOVERY`，不得猜测。恢复草稿继续保留在 `_recovered/`，不作为 canonical 来源。

---

### 2026-08-30 追加未决（充值主题真实测试映射，治理加固）

14. **充值/人工上账主题的真实测试映射差额（分级审批等）**：`docs/06-data-and-architecture/state-machines/recharge-order.md` §7 已建立源自 `docs/ARCH-整改R1-R4-技术方案.md` §8 的真实测试优先级映射。T-02 已补齐用户自助充值创建的 Redis/DB 幂等接入、请求指纹隔离与管理端审批专项回归（当前 7/7）；仍缺支付回调契约/验签/金额核对/重复回调幂等、渠道熔断、三级审批逐级边界及 `approval_phase` 序列化的独立测试证据。**待办**：待正式支付回调契约确定后继续补测并回填状态机 §7 与充值 PRD/SPEC §验收标准；该项为登记待办，**不阻断** recharge-order.md 等其余 `approved` 内容作为开发依据。

> 以上未决项未解决前，对应章节不得标记 `approved`。第 14 项为已登记的**后续执行待办**（映射差额），其父文档 recharge-order.md 已 `approved`，该项不阻断准入。

15. **退款/红冲完整执行链路差额（T-03）**：余额退款已从“审核即入账”改为 `pending → approved → processing → completed/failed`，并新增 `POST /api/v1/admin/refunds/:id/execute`；相关集成回归 30/30。仍缺三类退款分流、原路支付通道适配、失败注入/重试、执行并发、outbox 通知和 processing 崩溃恢复证据。待后续按正式支付契约与独立演练环境补齐，发布基线继续 `not_ready`。

---

### 2026-08-31 追加未决（数据/API 契约补齐时登记，见 `05-api/errors.md` §4、`05-api/README.md` §三、`06-data-and-architecture/migration-design.md` §2）

15. ~~**`INSUFFICIENT_BALANCE` 双语义（HTTP 402 vs 422）**~~：**已解决，见 ADR-0030**。兼容 API 模型消费采用 `PAYMENT_REQUIRED`=402，平台业务资金操作采用 `INSUFFICIENT_BALANCE`=422；实现层旧码映射仍作为 `DOC_CODE_GAP` 待整改，保留真实差距。
16. ~~**分页字段实现差异**~~：**契约已解决，见 ADR-0030**。正式请求/响应统一为 `page`、`page_size` 与 `data.items/page/page_size/total`，`pageSize` 仅作 v1.x 兼容别名；历史端点 `list`/`pagination` 实现差异作为 `DOC_CODE_GAP` 待整改，保留真实差距。
17. **迁移 runner 加固（代码已落地，演练证据待补）**：`api/run-manual-migrations.cjs` 已按 ADR-0007/0026 加固：元数据记录 checksum/状态/错误/耗时，使用 PostgreSQL advisory lock 单执行者，checksum 变化报警并失败，失败即停且不自动回滚；针对性纯逻辑测试已通过。**仍待**：在独立全新库执行 0000–0032 演练，并补充真实备份恢复证据后正式关闭本项（禁止编造）。不阻断迁移设计文档作为开发依据。
18. ~~API 文档 ID 冲突~~：**已解决，见 `docs/_draft-rulings-D01-D08-2026-09.md` D-04（2026-09）**。`user/recharge.md`→`API-BILLING-USER-RECHARGE`、`admin/manual-topup.md`→`API-BILLING-MANUAL-TOPUP`，已同步 `document-inventory.md`、`05-api/README.md` §三。无两文件共用同一 ID。
19. ~~**结算/对账权限点绑定**~~：**已解决，见 ADR-0030**。`RECONCILIATION_VIEW` 负责报告/结算查看、运行、导出；`FINANCE_RECON_APPROVE` 负责差异处理、补账、核销及复核关闭；`settlement.generate` 负责生成结算周期/结算单；`settlement.adjust` 负责调整结算金额并受操作级 2FA 与职责分离约束；财务规则配置使用独立 `finance.rule_config`。代码守卫与测试映射仍属实现差距待办。
20. ~~**`finance` 角色聚合态 vs 数据库角色枚举**~~：**已解决，见 ADR-0030**。`finance` 是权限包而非数据库角色枚举；`users.role` 仅允许 `customer/agent/sales/admin/super_admin`，`finance.*` 通过权限记录授予 canonical 用户。代码与测试仍需按该口径整改/核验，保留真实差距。

### 2026-08-31 T-04 P0 状态更新

21. **T-04 P0 正式对账最小闭环已落地，完整结算/对账仍阻断**：已新增 `reconciliation_reports`、`reconciliation_mismatches`、0034 手写迁移及正式管理端点；报告状态为 `pending→running→completed/failed`，差异显式经过 `pending→processing→resolved/false_positive/ignored`，供应商结算确认增加 `draft→confirmed` 原子状态守卫。真实 Fastify + PostgreSQL 专项已扩展至 `6/6`（连同供应商结算及相关专项证据合计 `31/31`），API 串行全量 `81/81` 文件、`1189/1189` 测试通过；TypeScript、ESLint、diff、迁移语法检查通过。**该项仅关闭原型替代 P0 差距，不关闭完整 T-04**：Redis 分布式锁、异步任务/失败补偿、outbox、外部供应商账单导入、真实跨系统对账、资金补账/核销事务、代理正式结算周期、差异处理端点已接入操作级 2FA（`requireOperation2fa`，默认 mandatory_admin），并有专项令牌/确认标记回归；补账/核销资金事务及其独立 2FA 证据仍未完成，真实迁移/备份恢复证据仍未完成；发布基线继续 `not_ready`。

> **2026-09-06 收口更新（T-04 补账/核销证据已闭环）**：对账差异处理端点 `POST /api/v1/admin/reconciliation/diffs/:id/:op`（前端 AdminReconciliationDiffPage 实际使用的 resolve/ignore 差异处理，即补账/核销资金操作入口）已挂载 `requireOperation2fa`（`[adminAuth, requireOperation2fa]`），前端已接入 withOperation2fa + 操作摘要两步弹窗；专测 `admin-settlement-2fa.test.ts` 新增 diffs 端点用例并 5/5 通过（缺 token 403 REQUIRED + 带 token 200 + 同 token 重放 403 REPLAYED）。备份恢复演练已真实 PASS（2026-09-06，见 #26 下方总结与 release-baseline）。发布基线剩余项（候选提交/T-04）已全部解决，整体 `ready`（见 release-baseline）。T-04 长线项（Redis 分布式锁、异步补偿、outbox、外部账单导入、真实跨系统对账、正式结算周期）仍为开放项，但不阻塞发布准入。

---

### 2026-09-04 追加未决（真实发布基线执行时登记，见 `docs/07-quality-and-acceptance/release-baseline.md` 实跑记录）

22. **~~🔴 P0 阻断：API 生产构建产物不可运行~~：已关闭（2026-09-06）**。根因 `moduleResolution: "bundler"` 使 tsc 输出无扩展名相对导入（846+ 处），Node ESM 无法解析。修复：`api/tsconfig.json` 改为 `module/moduleResolution: NodeNext`，源码全部相对导入补 `.js`（899 处文件导入 + 151 处目录导入改 `/index.js`，脚本 `fix-nodenext-imports.cjs` / `fix-dir-imports.cjs` 一次性完成，可删）；ioredis 默认导入改 named（`import { Redis } from 'ioredis'`，NodeNext CJS interop）；src 内测试文件 pino 改 named。验证：`pnpm build` 成功（postbuild-fix-imports patched 0，无残留）、`node dist/index.js` 启动正常、`/api/v1/health` → 200、API 全量回归 90 文件 / 1321 测试全绿、`tsc --noEmit` 通过。`postbuild-fix-imports.mjs` 保留为幂等兜底。

23. **~~🟠 API 全量单测存在非确定性 flaky（`admin-competitive-marketplace.test.ts` A5）~~：已关闭（2026-09-06 收口）**。修复方向按 issue 建议落地：A5 断言改为双重限定 `list.find(m => m.model_name === MODEL && m.vendor_name === 'RaceSupA-...')`（按供应商名定位目标卡），保持端点行为不变、未用"改断言掩盖"。取证：A5 文件 5 轮循环 5/5 通过 + 四文件（A5/admin-manual-topup/admin-finance-rules/admin-adjust）并行压力 3 轮 3/3 通过（后台任务 e771816d/9954067d）。

24. **~~🟠 E2E fullflow.spec.ts ③ 已知 balance 渲染 flake~~：已关闭（2026-09-06 收口）**。修复落地：③ 改为「reload/进入充值页 + 至多 5 次 ×1.5s 轮询余额直至 `balance>=510`」；轮询等待端点为充值页真实数据源 `/api/v1/me/balance`（issue 建议的 JSON 响应断言方向），并断言页面「当前余额」文本，消除并发时序依赖。验证：fullflow 5/5 全过（含 ② 操作级 2FA 两步流程、③ 真实上游调度 `total_tokens=79`）；**全量 e2e 37/37 全绿**（2026-09-06，1.2m）。

25. **~~🔴 P0 生产阻断：ADR-0008 操作级 2FA 三缺口~~：已关闭（2026-09-06 收口）**。原阻断的三缺口已全部实现并测试闭环：
    - **operation-summary 绑定**：令牌绑定 canonical SHA-256 摘要（`api/src/lib/operation-summary.ts` canonicalize/hash/assert）；签发端点缺/空 `operation_summary` → `400 VALIDATION_ERROR`；请求缺 summary、空摘要、摘要不匹配、旧格式（无 summaryHash）令牌 → `403 OPERATION_2FA_INVALID`。
    - **一次性消费 / replay protection**：仅 confirmed 轮消费令牌（探测轮不消费），消费标记基于 Redis jti；同令牌二次 confirmed → `403 OPERATION_2FA_REPLAYED`。
    - **fail-closed**：Redis 不可用（连接失败 / get 抛错）且已 confirmed → `403 OPERATION_2FA_UNAVAILABLE`；未 confirmed → `403 OPERATION_CONFIRM_REQUIRED`，不静默放行。
    证据：`require-operation-2fa.test.ts`（三缺口专项 9 用例 + 旧用例适配一次性消费）、`2fa-operation.test.ts`（签发/校验契约）、`operation-summary.test.ts`（canonical/hash/assert 单测）；全部资金端点测试的操作令牌改为工厂函数（每请求新令牌，适配一次性消费语义）。API 全量回归 **90 文件 / 1321 测试全绿**，`tsc --noEmit` 通过。**#25 三缺口部分关闭**；「结算/对账资金操作的独立 2FA、补账/核销事务及 TEST/OPS 实跑证据」未完成，拆分为 **#26** 跟踪。

26. **~~🟠 结算/对账资金操作的独立 2FA 与补账/核销事务证据~~：已关闭（2026-09-06 收口）**。结算资金写端点独立 2FA 已全部挂载并测试闭环：
- 4 个资金写端点挂 `requireOperation2fa`：`POST /admin/vendor-settlements/:id/confirm`（`[adminAuth, requireOperation2fa]`）、`POST /admin/finance/close/execute`、`POST /admin/finance/close/:period/unlock`（`[superAdminAuth, requireOperation2fa]`）、`POST /admin/settlements/:id/settle`。
- 前端 3 页已适配 withOperation2fa+summary 两步弹窗：AdminVendorSettlementsPage（结算单·确认/标记打款/标记争议）、AdminClosePage（月结·结账锁定/临时解锁）、AdminSettlementPage（供应商结算·标记已结算）。
- 专项测试 `api/src/routes/admin-settlement-2fa.test.ts` 4/4 通过（缺 token 403 REQUIRED + 带 token 200 + 同 token 重放 403 OPERATION_2FA_REPLAYED；close/execute、close/unlock、settle 各缺 token/带 token）。
- **过程中定位并修复一个生产级缺陷（E2E ② 真实暴露）**：Chromium XHR 会剥离 HTTP 头中的非 ASCII 字符，导致中文 `X-Operation-Summary` 传输后与 verify body 摘要不一致 → 重放 403 `OPERATION_2FA_INVALID`。修复：前端 `operation2faHeaders` 以 `encodeURIComponent` 编码摘要头，后端中间件 `decodeURIComponent`（未编码 ASCII 兼容 + latin1→utf8 兜底）；新增中文摘要绑定专项用例。修复后 fullflow ② 两步 2FA 真实通过、全量 e2e 37/37 全绿。
- **遗留（未实现）**：前端「标记打款 paid / 标记争议 dispute」按钮对应后端路由与表列（`vendor_settlements` 仅 status、无 paid_at 列）缺失，点击会请求不存在的 `/admin/vendor-settlements/:id/paid|dispute`；如需收口需先补后端端点 + 迁移。
- **2026-09-06 二次收口（补账/核销已闭环）**：前端实际使用的对账差异处理端点 `POST /admin/reconciliation/diffs/:id/:op`（resolve/ignore，补账/核销资金操作入口）此前未挂 2FA——本轮挂载 `[adminAuth, requireOperation2fa]` 并前端接入 withOperation2fa；专测 `admin-settlement-2fa.test.ts` 扩至 5/5。至此结算/对账资金写端点操作级 2FA 全覆盖（结算确认/月结锁账/解锁/标记结算/人工上账/调账/冲正/对账差异处理）。

> 以上 #22–26 为真实执行结果或 accepted ADR 对照实现后显示的生产阻断/失败项。#22/#25/#23/#24/#26 均已关闭（2026-09-06）；备份恢复门禁已真实执行 PASS（证据 `evidence/finance/v0.1.0/restore/`，见 release-baseline）。2026-09-06 二次收口：候选发布提交 `a7958ad` 已确定（可发布源码与 evidence/audit/docs/test-reports 分离后提交，API 1327/1327 + build patched 0 + 前端 build 通过）；T-04 补账/核销事务证据已闭环（diffs 端点 2FA + 专测 5/5）。发布基线整体 `ready`（见 release-baseline）；非阻断登记项：#17 独立全新库迁移演练、前端 paid/dispute 按钮后端缺口、T-04 长线项（Redis 分布式锁/异步补偿/outbox/外部账单导入/跨系统对账/正式结算周期）。

---

### 2026-09-06 追加未决（候选提交 `8d3cad7` 全量基线重跑时登记，见 `ops/baseline-2026-09-06/REPORT.md`）

27. **🟠 verify chat 真实上游失败（本地渠道定价数据缺口，代码无回归）**：全量重跑 verify 16/17，唯一失败 `Chat completions (real upstream)`——`POST /v1/chat/completions`（model `DeepSeek-V4-Flash-0731`）返回 `{"mock":true}`。**根因（已定位到数据层）**：`api/src/services/upstream/routing.ts` `selectChannel` 以 `vendor_pricing.status='active'` 为必要条件（innerJoin），而本地库 `vendor_pricing` 中 wanwu（supplier 2633 / supplier_model 2317）与天翼云（2824 / 2503）**均无定价记录**（wanwu pricing rows=0，deepseek 系列全表 0 条）→ 路由返回 null → mock 回退。**可达性实测**：wanwu `http://47.110.226.233:8072` + `supplier_keys.id=192`（wanwu-main，active）直调 → HTTP 200 真实 completion（total_tokens=6）；天翼云超时、deepseek 官方 401。**转 ready 路径（需产品/发布裁决后执行）**：① 裁决 `DeepSeek-V4-Flash-0731`（wanwu）input/output 定价 → 补 `vendor_pricing`（supplier_model_id=2317，status=active，pricing_status 枚举 draft/active/archived）→ 重跑 verify 即全绿；② 修正 `scripts/test-integration.cjs` 注释（可用渠道=wanwu，非天翼云）；③ `e2e/tests/fullflow.spec.ts` ③ 增加 `mock !== true` 断言（当前仅断言 `total_tokens>0`，mock 计费也通过，fullflow ③ 的"真实调度"字样不构成真实上游证据）。**不影响**：代码门禁全绿（typecheck/lint/API 1327/web-console 46/build 4 端/E2E 37），发布基线按严格门禁口径 `not_ready`（见 release-baseline）。
