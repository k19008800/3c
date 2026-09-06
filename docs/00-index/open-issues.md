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

---

### 2026-09-04 追加未决（真实发布基线执行时登记，见 `docs/07-quality-and-acceptance/release-baseline.md` 实跑记录）

22. **🔴 P0 阻断：API 生产构建产物不可运行**：`pnpm --filter @3cloud/api start`（`node dist/index.js`）启动即抛 `ERR_MODULE_NOT_FOUND: Cannot find module '.../dist/app'`。根因：`tsconfig.base.json` 使用 `moduleResolution: "bundler"`（允许无扩展名相对导入），`tsc` 输出的 ESM `.js` 保留 `from './app'` 等无扩展名导入（全量 846 处），Node ESM 无法解析。影响 `deploy/ecosystem.config.js`（`script: 'api/dist/index.js'`）与 `pnpm start` 生产路径；dev（tsx）不受影响。**修复方向**：以 Node 可运行的模块解析（`NodeNext` + 相对导入补 `.js`，或 `rewriteRelativeImportExtensions`）重新编译并验证 `node dist/index.js` 可启动、`/health` 200。**未修复前禁止部署生产。**

23. **🟠 API 全量单测存在非确定性 flaky（`admin-competitive-marketplace.test.ts` A5）**：全量跑 3 次中 2 次失败 `expected 0.2 to be 0.1`（`src/routes/admin-competitive-marketplace.test.ts:140`）。根因：A5 测试假设市场卡片按模型唯一（`list.find(m => m.model_name === MODEL)` 取到 sell 价 0.10），但 `/admin/marketplace` 端点**按供应商×模型出卡片**（本测试为 `MODEL` 建了供应商 A=0.10 与 B=0.20 两张卡），`.orderBy(modelName)` 对同名键无确定性次序 → 并发/并行执行计划下可能先取到 0.20 卡。单文件隔离每次 7/7 通过。**修复方向**：使 A5 断言对多卡取价保持确定性（如按供应商名定位目标卡，或断言该模型 `min(sell_input_price)===0.10`），保持端点行为不变；禁用"改断言掩盖"。

24. **🟠 E2E fullflow.spec.ts ③ 已知 balance 渲染 flake**：全量 e2e（37 例）中 1 失败 `expect(received).toBeGreaterThanOrEqual(510)` `Received: 0`（`fullflow.spec.ts:123`），因余额下拉在并发时序下未及时渲染；fullflow 为 serial 模式故级联跳过 ④⑤（2 did not run）。该用例隔离跑 5/5 通过（含真实上游调度 `total_tokens=79`），属已登记预置数据/时序 flake，非 app 回归。**修复方向**：加强余额元素等待/重试或改用 JSON 响应断言以消除时序依赖；关闭前 e2e 全量不能宣告全绿。

25. **~~🔴 P0 生产阻断：ADR-0008 操作级 2FA 三缺口~~：已关闭（2026-09-06 收口）**。原阻断的三缺口已全部实现并测试闭环：
    - **operation-summary 绑定**：令牌绑定 canonical SHA-256 摘要（`api/src/lib/operation-summary.ts` canonicalize/hash/assert）；签发端点缺/空 `operation_summary` → `400 VALIDATION_ERROR`；请求缺 summary、空摘要、摘要不匹配、旧格式（无 summaryHash）令牌 → `403 OPERATION_2FA_INVALID`。
    - **一次性消费 / replay protection**：仅 confirmed 轮消费令牌（探测轮不消费），消费标记基于 Redis jti；同令牌二次 confirmed → `403 OPERATION_2FA_REPLAYED`。
    - **fail-closed**：Redis 不可用（连接失败 / get 抛错）且已 confirmed → `403 OPERATION_2FA_UNAVAILABLE`；未 confirmed → `403 OPERATION_CONFIRM_REQUIRED`，不静默放行。
    证据：`require-operation-2fa.test.ts`（三缺口专项 9 用例 + 旧用例适配一次性消费）、`2fa-operation.test.ts`（签发/校验契约）、`operation-summary.test.ts`（canonical/hash/assert 单测）；全部资金端点测试的操作令牌改为工厂函数（每请求新令牌，适配一次性消费语义）。API 全量回归 **90 文件 / 1321 测试全绿**，`tsc --noEmit` 通过。**#25 三缺口部分关闭**；「结算/对账资金操作的独立 2FA、补账/核销事务及 TEST/OPS 实跑证据」未完成，拆分为 **#26** 跟踪。

26. **🟠 结算/对账资金操作的独立 2FA 与补账/核销事务证据**（2026-09-06 自 #25 拆分）：差异处理端点已接入操作级 2FA（`requireOperation2fa`），但结算/对账资金操作（补账/核销事务）的独立 2FA 专项证据、真实迁移/备份恢复证据仍未完成。实现 open / TEST/OPS evidence open，不得与 #25 相互替代。

> 以上 #22–26 为真实执行结果或 accepted ADR 对照实现后显示的生产阻断/失败项。修复任务均已给出方向；在 #22、#26 关闭与 #23/#24 flaky 稳定或取证前，发布基线保持 `not_ready`。
