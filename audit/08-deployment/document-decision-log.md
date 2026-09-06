# 文档核对决策记录（进行中）

> 本记录用于保存 BOSS 已确认的文档口径；正式 ADR 文件将在全部逐项核对完成后统一生成，当前不修改现有需求正文。

## DEC-001 金额上限与审批阈值

> **人工确认补充（2026-08-30 17:13，BOSS）：选择 A。** 人工上账单笔上限固定为 ¥50,000，超过即拒绝；不得以分级审批放开至 ¥1,000,000。用户自助充值单笔上限仍为 ¥1,000,000，两者业务边界独立。

- 确认时间：2026-08-29 21:20 Asia/Shanghai
- 状态：confirmed，正式 ADR 已生成（v1.0.0）
- 决策：
  - 用户自助充值单笔上限：¥1,000,000；
  - 管理员人工上账单笔上限：¥50,000；
  - 管理员调账单笔上限：¥50,000；
  - 审批阈值与单笔上限独立定义：≤¥10,000 单人审批；>¥10,000 且≤¥100,000 双人审批；>¥100,000 追加 super_admin 终审；
  - 24 小时累计限额另行定义，不与单笔上限混用。
- 影响文档：充值、人工上账、调账、资金风控、API、权限、测试、部署文档。
- 待同步动作：建立正式 ADR；统一 PRD/SPEC/ARCH/API/TEST/OPS；补充人工上账/调账超过 ¥50,000 的拒绝规则和用户充值大额审批路径。

## DEC-002 金额精度与舍入

- 确认时间：2026-08-29 21:21 Asia/Shanghai
- 状态：confirmed，正式 ADR 已生成（v1.0.0）
- 决策：
  - 余额与 Token 消费内部统一使用 `numeric(18,8)`；
  - 充值、人工上账、调账、退款、红冲的业务输入限制为 2 位小数；
  - 用户展示金额固定 2 位小数；
  - 代理佣金使用 `numeric(18,4)`；
  - Token 消费在最终结算时按 8 位小数舍入；
  - 禁止使用 JavaScript `Number` 作为金融最终计算依据，采用 Decimal 或数据库 numeric 运算；
  - 价格字段按统一内部精度改造为 `numeric(18,8)`，输入价和输出价分开保存。
- 影响文档：计费、财务、价格、渠道、代理佣金、数据字典、数据库、API、测试、对账文档。
- 待同步动作：建立正式 ADR；核对现有 schema/migrations 中所有金额字段；定义展示格式、尾差、对账和迁移策略。

## DEC-003 统一资金状态机

- 确认时间：2026-08-29 22:30 Asia/Shanghai
- 状态：confirmed，正式 ADR 已生成（v1.0.0）
- 决策：
  - 充值订单/人工上账：`pending → pending_level2 → pending_super → paid`；按实际审批级别跳过不适用中间状态；任意待审核状态可转 `rejected`；入账执行异常转 `failed`；不使用 `approved` 作为中间状态。
  - 调账：`pending → pending_level2 → pending_super → approved`；按实际审批级别跳过不适用中间状态；任意待审核状态可转 `rejected`；`approved → reversed`。
  - 退款：`pending → approved → processing → completed`；审核驳回转 `rejected`；执行异常转 `failed`。
  - 红冲：生成独立反向资金记录；原单金额不可修改、不可删除；反向记录成功生效后原单才转 `reversed`；红冲失败不得标记原单为 `reversed`。
  - `approved` 仅表示调账已生效或退款已审核通过待执行，不作为充值订单/人工上账的中间状态。
- 影响文档：充值、人工上账、调账、退款、红冲、数据字典、API、数据库、测试、对账、运维文档。
- 待同步动作：建立状态机专章和正式 ADR；统一数据库枚举、API 响应、前端文案及迁移/兼容策略。

## DEC-004 后端统一权限点鉴权

- 确认时间：2026-08-29 21:25 Asia/Shanghai
- 状态：confirmed，正式 ADR 已生成（v1.0.0）
- 决策：
  - 后端统一按权限点鉴权；角色只作为权限聚合，不作为业务路由唯一判断条件。
  - 前端按权限点控制入口和按钮显隐，但前端隐藏不替代后端安全校验。
  - 无权限统一返回 HTTP 403 `PERMISSION_DENIED`。
  - `super_admin` 的 `*` 通配权限仅由统一权限守卫解释。
  - `finance` 可创建和审核人工上账，但创建人不得审批自己创建的单据。
  - `admin` 可执行调账权限；`super_admin` 具备全权限。
  - 审批职责分离单独强制：创建人≠审批人、一级审批人≠二级审批人、终审人不与前级重复。
  - 数据范围与操作权限分开定义；权限变更不追溯影响已完成资金记录。
  - 权限拒绝不写业务成功审计，但可写安全拒绝日志。
- 影响文档：角色模型、权限专章、所有资金 PRD/SPEC/API/ARCH/TEST/OPS。
- 待同步动作：建立权限矩阵 ADR；逐端点绑定权限点；移除后端重复角色白名单；补齐权限拒绝、职责分离和前端显隐测试。

## DEC-005 API 路径与版本

- 确认时间：2026-08-29 21:26 Asia/Shanghai
- 状态：confirmed，正式 ADR 已生成（v1.0.0）
- 决策：
  - `/v1/*` 为对外 OpenAI 兼容 API 正式路径。
  - `/anthropic/v1/*` 为对外 Anthropic 兼容 API 正式路径。
  - `/api/v1/*` 为平台业务 API 正式路径。
  - `/api/v1/v1/*` 仅作为兼容别名，标记 `deprecated`，不得用于新集成和新 SDK 示例。
  - 兼容别名必须与 canonical 路径指向同一 handler，并保持认证、权限、计费和错误响应一致。
  - 每个 API 文档必须标注 canonical/alias、版本、适用对象、是否推荐、废止日期和对应正式路径。
- 影响文档：API 总览、API reference、API contract、SDK 示例、前端 Playground、测试和部署检查。
- 待同步动作：建立 API 版本 ADR；清理新文档中的双 `v1` 正式路径表述；保留兼容别名的迁移说明。

## DEC-006 余额账本与配置表

- 确认时间：2026-08-29 22:34 Asia/Shanghai
- 状态：confirmed，正式 ADR 已生成（v1.0.0）
- 决策：
  - `customer_balances` 是当前余额唯一事实来源，字段包括 `total_balance`、`available_balance`、`frozen_balance`、`currency`、`version`。
  - `balance_transactions` 是每笔余额变动流水。
  - `call_logs` 记录 API 请求及实际 Token/费用；`billing_logs` 记录预扣、结算、退款等计费过程。
  - `platform_ledger` 作为独立财务总账对象，启用时点另行明确。
  - `users.balance` 作为历史兼容对象，迁移后禁止新增业务引用。
  - `system_configs` 是唯一系统配置表；`site_configs` 作为历史名称，禁止新增业务引用。
  - 配置缓存只作为读取加速，不作为事实来源；配置变更必须记录操作人、前后值和生效时间。
  - 资金操作链路为：业务操作 → 原子更新 `customer_balances` → 写入 `balance_transactions` → 记录业务关联 → 写入 `audit_logs`。
- 影响文档：数据字典、计费、财务、价格、配置、API、数据库、测试和部署文档。
- 待同步动作：建立账本/配置 ADR；核对现有 schema/migrations；制定 `users.balance`、`site_configs` 的兼容迁移和禁止引用检查。

## DEC-007 迁移体系与执行顺序

- 确认时间：2026-08-29 22:35 Asia/Shanghai
- 状态：confirmed，正式 ADR 已生成（v1.0.0）
- 决策：
  - 先执行 Drizzle journal 的 0000–0016 基础迁移；
  - 再按编号顺序执行手写迁移 0017–0032；
  - 使用 `_3cloud_manual_migrations` 记录手写迁移的编号、文件名、校验和、执行时间、状态、错误和耗时；
  - 迁移完成后校验表、字段、索引、枚举、分区结构及关键业务约束；
  - 任一迁移失败立即停止，不启动 PM2，不执行后续迁移；
  - 生产迁移前必须完成真实备份；
  - 已成功迁移需安全跳过，文件 checksum 变化必须报警；
  - 禁止迁移脚本自动删除业务数据；破坏性变更必须单独审批并提供恢复方案；
  - 全部迁移和结构校验通过后，才允许启动 API 与 Portal。
- 影响文档：数据库迁移、部署脚本、部署清单、Runbook、备份恢复、回滚、测试文档。
- 待同步动作：建立迁移 ADR；验证 0025 分区迁移、0030 枚举迁移和全新数据库执行顺序；补充 checksum 和失败恢复测试。

## DEC-008 资金写操作强制操作级 2FA

- 确认时间：2026-08-29 22:33 Asia/Shanghai
- 状态：confirmed，正式 ADR 已生成（v1.0.0）
- 决策：
  - 所有资金写操作由后端强制操作级 2FA；`super_admin` 不默认豁免。
  - 登录 2FA 与操作级 2FA 分离。
  - 操作 token 必须一次性使用、短时有效，并绑定操作者和操作摘要。
  - 权限不足返回 `403 PERMISSION_DENIED`；未启用或缺少 2FA 返回 `403 OPERATION_2FA_REQUIRED`；错误、过期、重放分别返回对应固定错误码。
  - 前端二次确认不能替代后端 2FA 校验。
  - 适用人工上账、充值订单审核、调账发起/审批/红冲及退款审核/执行等资金写端点。
- 影响文档：安全、权限、所有资金 PRD/SPEC/API/ARCH/TEST/OPS、E2E。
- 待同步动作：建立操作级 2FA ADR；冻结 token 请求/响应与错误码契约；补充未启用、缺失、错误、过期、重放和职责分离测试。

## DEC-009 资金操作幂等

- 确认时间：2026-08-29 22:33 Asia/Shanghai
- 状态：confirmed，正式 ADR 已生成（v1.0.0）
- 决策：
  - 创建类资金操作强制 `Idempotency-Key`：`POST /api/v1/admin/manual-topup`、`POST /api/v1/admin/adjust`、`POST /api/v1/recharge`。
  - 审批、红冲、退款等资金写操作纳入统一幂等规范；审批同时必须使用状态条件更新，幂等键不能替代状态守卫。
  - Key 绑定操作者、HTTP 方法、canonical 路径和请求摘要；相同 Key/相同摘要返回首次结果，相同 Key/不同摘要返回 `409 IDEMPOTENCY_CONFLICT`。
  - `transfer_no`、`order_no`、原单关联等业务唯一约束继续保留。
  - Redis 仅作为加速锁；数据库唯一约束、事务和状态条件是最终安全边界。
  - Redis 不可用时资金写操作不得静默绕过幂等保护，返回受控错误或按另行 ADR 定义受控降级。
  - 重复业务凭证返回 `409 DUPLICATE_BUSINESS_REFERENCE`；已处理单据返回 `409 ORDER_ALREADY_PROCESSED`；幂等基础设施不可用返回 `503 IDEMPOTENCY_UNAVAILABLE`。
- 影响文档：所有资金 PRD/SPEC/API/ARCH/TEST/OPS、幂等专章、错误码规范。
- 待同步动作：建立幂等 ADR；取消“R10 全部后置”的模糊表达，明确各端点版本；冻结失败重试、响应回放、TTL 和数据摘要规则。

## DEC-010 通知与用户偏好

- 确认时间：2026-08-29 22:36 Asia/Shanghai
- 状态：confirmed，正式 ADR 已生成（v1.0.0）
- 决策：
  - 资金类站内通知强制发送，用户不可关闭：`recharge_success`、`manual_topup_paid`、`balance_adjustment_applied`、`refund_completed`、`reversal_completed`。
  - email、SMS、Webhook 等其他渠道按用户偏好发送。
  - 资金事务与通知发送解耦；余额、流水、业务状态和审计事件提交成功后，写入 outbox/event，再异步发送通知。
  - 通知失败不回滚已经完成的资金事务；资金事务失败不得产生到账成功通知。
  - 通知事件带业务唯一键；重试不得产生重复用户可见通知。
  - 通知发送状态必须可查询、可告警、可人工补发，并记录 `queued/sent/failed/skipped`。
  - 资金通知事件统一包含 event_id、event_type、aggregate_type、aggregate_id、user_id、amount、currency、occurred_at、idempotency_key。
- 影响文档：通知、用户偏好、充值、人工上账、调账、退款、红冲、审计、API、数据库、测试和运维文档。
- 待同步动作：建立通知/outbox ADR；统一事件名称和发送状态；补充通知幂等、失败重试、人工补发和事务提交边界测试。

## DEC-011 API 响应与错误码

- 确认时间：2026-08-29 22:36 Asia/Shanghai
- 状态：confirmed，正式 ADR 已生成（v1.0.0）
- 决策：
  - 平台业务 API `/api/v1/*` 统一成功响应包装：`{ code: 0, message: "ok", data, request_id }`。
  - 列表接口统一使用 `items/page/page_size/total`，不再新增 `list/rows/records/count/total_count` 等同义字段。
  - 平台业务 API 错误统一使用 `code/message/details/request_id`，错误响应不返回业务 `data`。
  - HTTP 状态码统一按成功、参数错误、认证、权限、资源不存在、冲突、限流、上游失败、超时、依赖不可用和内部错误分类。
  - 资金固定错误码纳入统一错误码专章；新增、废止和兼容关系必须登记。
  - `/v1/*` 与 `/anthropic/v1/*` 继续遵循 OpenAI/Anthropic 原协议，不强制平台包装。
  - `/api/v1/v1/*` 与对应 canonical 别名保持完全一致的响应和错误行为。
  - `request_id` 必须进入日志、审计和错误响应；前端不得将不同 HTTP 错误统一显示为无信息的“请求失败”。
- 影响文档：API、错误码、所有业务 SPEC/ARCH/TEST、SDK、前端客户端和兼容别名说明。
- 待同步动作：建立 API 响应 ADR；盘点现有端点包装差异；冻结分页字段、错误码及状态码；补充契约测试。

## DEC-012 platform_ledger 启用范围

- 确认时间：2026-08-29 22:38 Asia/Shanghai
- 状态：confirmed，正式 ADR 已生成（v1.0.0）
- 决策：
  - 当前版本不启用、不写入 `platform_ledger`。
  - 充值、扣费、退款、调账和红冲不得依赖 `platform_ledger` 才能完成。
  - 当前余额与对账依据为 `customer_balances`、`balance_transactions`、业务单据和 `billing_logs`。
  - `platform_ledger` 仅保留架构预留和未来迁移说明。
  - 启用前必须另行完成总账科目、借贷方向、资金事件映射、期初余额迁移、对账、重复记账/补账规则、独立 ADR 和迁移方案。
- 影响文档：财务、计费、对账、数据架构、API、测试、部署和运维文档。
- 待同步动作：建立总账预留 ADR；从当前生效文档和代码中移除“本期写入 platform_ledger”的表述，保留明确的 future scope 标记。

## DEC-013 24 小时累计限额

- 确认时间：2026-08-29 22:40 Asia/Shanghai
- 状态：confirmed，正式 ADR 已生成（v1.0.0）
- 决策：
  - 操作人维度和被入账用户维度分别设置 24 小时滚动累计限额，默认均为 ¥50,000。
  - 仅统计管理员加钱方向运营操作：人工上账创建、调账调增发起、红冲加钱方向发起。
  - 用户自助充值、调账调减、充值订单审核和兑换码入账默认不计入。
  - 统计窗口为 `now - 24h ≤ created_at ≤ now`，不按自然日重置。
  - 在申请创建成功时计入额度；驳回、失败、红冲、取消不回退已计入额度。
  - 任一维度超限默认将本笔升级为至少双人审批；允许通过配置切换为直接拒绝。
  - 每笔必须记录触发维度、触发前累计、本笔金额、限额和最终处置；并发计算必须原子化。
- 影响文档：资金风控、充值、人工上账、调账、红冲、权限、API、数据库、缓存、测试、对账和运维文档。
- 待同步动作：建立累计限额 ADR；冻结计数时点、并发原子化方案、Redis/DB 一致性和限额配置变更生效规则。

## DEC-014 部署环境、进程与发布顺序

- 确认时间：2026-08-29 22:41 Asia/Shanghai
- 状态：confirmed，正式 ADR 已生成（v1.0.0）
- 决策：
  - API 与 Portal 由 PM2 托管；API 监听 3000，Portal 监听 3100。
  - Console 作为前端构建产物由统一入口提供。
  - `/` 和 `/dashboard` 进入 Portal；`/app/*` 进入 Console；`/api/v1/*` 进入平台业务 API；`/v1/*` 进入 OpenAI 兼容 API；`/anthropic/v1/*` 进入 Anthropic 兼容 API。
  - 发布顺序为：生产环境变量检查 → 发布包校验 → 真实数据库备份 → Drizzle 0000–0016 → 手写 0017–0032 → 结构/约束校验 → 构建 → 启动或 reload API/Portal → 路由与健康检查 → 集成测试和发布后验收。
  - 任一步失败立即停止，不启动新版本进程，保留备份、日志和失败编号，按回滚方案恢复。
  - 禁止只启动 API、不启动 Portal；禁止迁移失败后启动 PM2；禁止使用开发环境 `.env`；禁止用文字声明替代真实 `pg_dump` 文件。
- 影响文档：部署脚本、PM2 配置、Nginx/统一入口、环境变量、迁移、备份恢复、测试和发布清单。
- 待同步动作：建立部署 ADR；将端口/路由/进程写入环境矩阵；补充失败即停、备份存在性和发布后路由验收。

## DEC-015 文档正式生效与迁移规则

- 确认时间：2026-08-29 22:42 Asia/Shanghai
- 状态：confirmed，正式 ADR 已生成（v1.0.0）
- 决策：
  - 只有内容完成、冲突关联 ADR、术语/金额/状态/权限/API/数据库统一、链接有效并通过 product/arch/backend/test/review 联合复核的文档，才可标记 `approved`。
  - `draft`、`review`、`ref` 和历史审计报告不能作为开发和验收的唯一依据。
  - 不直接覆盖现有文档；先冻结快照、建立新目录和索引、生成 ADR，再拆分正文、清理重复规则、更新链接、联合评审、标记 approved，最后将旧文档标记 `superseded` 并移入 `99-archive`。
  - 文档整理阶段不修改业务代码，不把代码现状自动升格为需求；文档与代码差异单独标记 `DOC_CODE_GAP` 或 `CODE_DOC_DRIFT`。
  - 采用语义化版本；规则变化必须记录前后规则、生效时间、影响文档/代码/测试/迁移和部署窗口。
  - 在 `document-map`、`glossary`、`decision-register`、资金章节、状态机专章、API conventions 和错误码专章完成前，不进入代码修复。
- 影响文档：全部 docs、审计、开发任务、测试和部署资料。
- 待同步动作：建立正式目录、索引、术语表和 ADR；完成文档审批状态和归档迁移检查。

## DEC-016 第一批正式整理范围

- 确认时间：2026-08-29 22:43 Asia/Shanghai
- 状态：confirmed，正式 ADR 已生成（v1.0.0）
- 决策：
  - 第一批优先整理核心资金文档：充值、人工上账、调账、退款/红冲、结算/对账，以及配套权限、状态机、API、数据、测试、部署文档。
  - 第一批建立 `00-index`、`01-product`、`02-requirements/03-billing-and-finance`、`03-functional-spec/03-billing-and-finance`、`05-api`、`06-data-and-architecture`、`07-quality-and-acceptance`、`08-operations-and-deployment` 目录和文件。
  - 代理商、业务员、供应商、营销、客服、SSO、完整 Portal 和历史 ref/审计资料暂不迁移正文，保留现有位置，待核心资金批次通过联合复核后再扩展。
  - 第一批必须打通 PRD → SPEC → 状态机 → 权限 → API → 数据库 → 测试 → 部署链路。
- 影响文档：核心资金相关现有 PRD/SPEC/ref/ARCH/API/TEST/OPS。
- 待同步动作：建立第一批文档索引和源文件映射；确定每个新文件的唯一权威来源后再拆分正文。

## DEC-017 章节权威来源映射

- 确认时间：2026-08-29 22:43 Asia/Shanghai
- 状态：confirmed，正式 ADR 已生成（v1.0.0）
- 决策：
  - 每个新章节必须指定一个主权威来源；其他来源按辅助、技术参考、冲突来源和历史来源分级引用。
  - 冲突来源不能直接合并进 `approved` 正文，必须先登记 ADR 或冲突表。
  - ARCH 的实现代码不得复制进 PRD；ref 的历史建议不得自动升格为正式规则；历史资料只能通过 archive 引用。
  - 第一批核心资金章节按已确认的来源映射执行：充值、人工上账、调账、退款/红冲、结算/对账、权限、精度、API、幂等、通知和迁移分别建立主权威来源。
- 影响文档：文档地图、第一批 PRD/SPEC/ARCH/API/TEST/OPS。
- 待同步动作：生成 `document-map.md`，为每个新章节登记主权威来源、辅助来源、冲突来源和状态。

## DEC-019 文件命名、文档编号、语义化版本与状态规则

- 确认时间：2026-08-29 22:28 Asia/Shanghai
- 状态：confirmed，正式 ADR 已生成（v1.0.0）
- 决策：
  - 采用已确认文档治理方案中的文件命名规则、文档编号规则、语义化版本规则和文档状态规则。
  - 正式文件按文档层级与业务域命名，使用小写 kebab-case；目录按既定编号和业务域组织。
  - 文档编号按类型、业务域和三位序号组成，例如 `PRD-BILLING-001`、`SPEC-BILLING-001`、`API-BILLING-001`、`SM-BILLING-001`、`ADR-0001`。
  - 版本使用语义化版本 `vMAJOR.MINOR.PATCH`：重大不兼容规则变更递增 MAJOR，向后兼容的规则/契约新增递增 MINOR，澄清、修订和非语义性修复递增 PATCH。
  - 状态统一使用 `draft`、`review`、`approved`、`superseded`；ADR 使用 `proposed`、`accepted`、`rejected`、`superseded`。只有 `approved`/`accepted` 文档可作为开发和验收依据。
  - 任何规则变更必须记录前后规则、生效版本、生效时间、影响范围、迁移方案和关联代码/测试；历史版本不得覆盖删除，必须标记 `superseded` 并归档。
- 影响文档：全部正式文档、索引、文档地图、变更记录、审计、开发任务、测试和部署资料。
- 待同步动作：建立命名/编号/版本/状态 ADR；更新文档治理规范、索引模板和迁移检查项；在正式文档创建时执行唯一编号与状态门禁。

## DEC-020 退款类型、资金方向与负余额规则

- 确认时间：2026-08-29 23:17 Asia/Shanghai
- 状态：confirmed，正式 ADR 已生成（v1.0.0）
- 决策：
  - 消费/API 失败退款退回用户余额，余额只增加一次；充值订单退款执行支付渠道原路退款，不同时余额回滚。
  - 调账/人工上账纠错不使用退款语义，统一通过独立反向资金记录红冲。
  - 同一业务事件禁止原路退款与余额回滚并行；当前版本不允许退款或红冲造成负余额。
  - 不引入平台垫付账户和下次充值优先抵扣；余额不足的扣减/纠错操作返回受控业务错误。
  - 退款状态为 `pending → approved → processing → completed`，并支持 `rejected`、`failed`；失败可按幂等规则重试。
  - 每类退款需有独立业务唯一键和金额上限，原单金额不可修改或删除。
- 影响文档：退款/红冲 PRD、SPEC、状态机、API、数据、测试、对账和运维。
- 待同步动作：已建立 ADR-0020；将旧冲突口径标记为 superseded，并补充退款边界和重试验收。

## DEC-021 充值与人工上账审批阶段字段表达

- 确认时间：2026-08-29 23:21 Asia/Shanghai
- 状态：confirmed，正式 ADR 已生成（v1.0.0）
- 决策：
  - 业务对象 `status` 仅表示 `pending/paid/rejected/failed`；审批阶段独立使用 `approval_phase=none/level1/level2/super/completed`。
  - 管理端响应返回 `status`、`approval_phase`、`approval_required`；用户端只暴露业务状态，不暴露内部审批阶段。
  - 审批人、审批时间、审批结果和审批历史单独记录。
  - `pending_level2`、`pending_super` 旧响应标记为 deprecated；状态机保留阶段流转语义，但持久化/API 必须拆分字段。
- 影响文档：充值、人工上账、状态机、API、数据库、前端、测试和迁移资料。
- 待同步动作：已建立 ADR-0021；同步新增正式章节并补充旧响应兼容说明。

## DEC-022 24 小时限额配置键名与优先级

- 确认时间：2026-08-29 23:24 Asia/Shanghai
- 状态：confirmed，正式 ADR 已生成（v1.0.0）
- 决策：
  - 对外配置键统一为 `limits.operator_24h`、`limits.recipient_24h`、`limits.exceed_action`；默认两个维度均为 `50000.00`。
  - `exceed_action` 为 `escalate` 或 `reject`；不采用 `soft_limit`/`hard_limit` 作为对外键，内部使用不得取代公开配置。
  - 操作人和被入账用户两个维度独立计算，任一超限即触发；`super_admin` 不得豁免。
  - 优先级为输入校验 → 单笔硬上限 → 24 小时累计限额 → 审批阈值 → 正常处理；单笔超限直接拒绝，累计超限按 `exceed_action` 处理。
  - `escalate` 不得降低原审批级别；配置变更记录操作人、前后值、生效时间并清理缓存。
- 影响文档：资金风控、调账、配置 API、数据、缓存、测试和运维。
- 待同步动作：已建立 ADR-0022；旧键名标记 superseded 或建立明确兼容映射。

## DEC-023 API 旧路径兼容窗口与废止规则

- 确认时间：2026-08-29 23:26 Asia/Shanghai
- 状态：confirmed，正式 ADR 已生成（v1.0.0）
- 决策：
  - OpenAI、Anthropic、平台业务 canonical 路径分别为 `/v1/*`、`/anthropic/v1/*`、`/api/v1/*`。
  - `/api/v1/v1/*` 仅为 deprecated alias，兼容至 `v1.x`，在 `v2.0.0` 移除；不得用于新集成、SDK、示例、前端或测试。
  - 旧 `api-reference.md` 中错误的单层 `/api/v1/models`、`/api/v1/chat/completions` 等不作为 alias，标记为错误历史内容并修正。
  - alias 与 canonical 必须共享 handler，并保持认证、权限、计费、幂等、响应和错误一致；可发弃用告警但不得改变响应 envelope。
  - 不新增其他 alias，新文档必须标注 canonical/alias、适用对象、推荐性和废止版本。
- 影响文档：API reference、API contract、SDK、前端、Playground、测试和部署检查。
- 待同步动作：已建立 ADR-0023；补充路径回归矩阵和 `v2.0.0` 移除检查。

## DEC-024 角色枚举与权限 grant/deny 优先级

- 确认时间：2026-08-29 23:27 Asia/Shanghai
- 状态：confirmed，正式 ADR 已生成（v1.0.0）
- 决策：
  - 当前正式角色仅保留 `customer`、`agent`、`sales`、`admin`、`super_admin`；`finance_ops`、`ops`、`support`、`auditor` 等需另行 ADR 和迁移。
  - `super_admin` 为最高权限；`admin` 不包含角色管理权限。
  - 权限优先级为显式 deny → 管理员强制策略 → 显式 grant → 角色权限并集 → 默认最小权限；多角色先取并集，最终 deny 优先，无授权默认拒绝。
  - 前后端 effective permission 必须一致；缓存仅作加速并在权限变更时失效。
  - `super_admin` 的 `*` 仅由统一权限守卫解释；最后一个 `super_admin` 不得删除、降权或锁定。
  - 权限变更不追溯已完成资金记录；拒绝统一返回 HTTP 403 `PERMISSION_DENIED`。
- 影响文档：角色、权限、API、ARCH、前端、缓存和测试资料。
- 待同步动作：已建立 ADR-0024；补充角色枚举、权限组合矩阵和最后一个 super_admin 保护测试。

## DEC-025 SSO Callback 域名与会话交换方式

- 确认时间：2026-08-29 23:29 Asia/Shanghai
- 状态：confirmed，正式 ADR 已生成（v1.0.0）
- 决策：
  - 统一 callback 为 `https://api.unmisa.com/api/v1/auth/sso/callback`；`admin.unmisa.com` 未完成 DNS/TLS/代理/发布前不得使用。
  - 回调使用 authorization code；后端验证 state、issuer、client_id、redirect_uri、PKCE，再签发一次性短时 code 供前端 HTTPS 兑换平台会话。
  - 服务端设置 Secure、HttpOnly、SameSite=Lax 或更严格 Cookie；长期 JWT 不得放入 URL、页面正文或前端持久化存储。
  - state/code 一次性、短时有效，并绑定用户、浏览器会话、redirect URI、PKCE verifier；失败返回固定错误码并记录 request_id，不泄露 provider token。
  - 登录 2FA 与资金操作级 2FA 分离。
- 影响文档：SSO、API、部署、会话安全、测试和 E2E。
- 待同步动作：已建立 ADR-0025；补充 state/PKCE/重放/redirect mismatch/Cookie 属性测试。

## DEC-026 手写迁移执行入口、回滚方式与测试基线

- 确认时间：2026-08-29 23:30 Asia/Shanghai
- 状态：confirmed，正式 ADR 已生成（v1.0.0）
- 决策：
  - 手写迁移唯一入口为 `3cloud/api` 下的 `pnpm run db:migrate:manual`，按编号执行 `0017–0032`，写入 `_3cloud_manual_migrations`。
  - 单执行者锁；记录编号、文件名、SHA-256、起止时间、状态、错误和耗时；成功且 checksum 未变可跳过，checksum 变化报警。
  - 失败立即停止，不执行后续迁移，不启动 PM2；迁移前必须有真实备份。
  - custom dump 使用 `pg_restore`，不得使用 `psql -f`；未经验证的破坏性回滚不得自动执行，无逆向脚本时只允许备份恢复。
  - 不采用 1159、1132、808 作为正式发布基线；正式基线必须包含 SHA、命令、范围、通过/失败数、时间、环境，并经发布负责人确认。
- 影响文档：迁移 SPEC/ARCH、Runbook、部署清单、release-gate、CI 和恢复测试。
- 待同步动作：已建立 ADR-0026；补充 runner、checksum、pg_restore、备份恢复和唯一基线证据。

## DEC-027 出站与入站 Webhook 能力分离

- 确认时间：2026-08-29 23:32 Asia/Shanghai
- 状态：confirmed，正式 ADR 已生成（v1.0.0）
- 决策：
  - 出站与入站 Webhook 独立定义配置、密钥、日志、状态、测试和告警。
  - 出站由平台推送并生成签名；失败最多重试 3 次，连续 10 次失败暂停目标，进入死信并支持人工补发。
  - 入站由外部系统推送到专用 endpoint；平台验证签名、时间戳和重放保护，独立处理失败响应、限流和安全审计。
  - 入站签名失败不计入出站失败次数，不触发出站暂停；两类失败语义和状态不得混用。
- 影响文档：Webhook SPEC/API/ARCH/TEST/OPS、SSO/第三方集成和监控告警。
- 待同步动作：已建立 ADR-0027；旧混合失败语义标记 superseded。

## DEC-028 备份定时、保留、异地副本与恢复演练

- 确认时间：2026-08-29 23:33 Asia/Shanghai
- 状态：confirmed，正式 ADR 已生成（v1.0.0）
- 决策：
  - 由系统级 cron 或宝塔计划任务承担唯一备份执行责任，每日 04:00（Asia/Shanghai）执行 PostgreSQL 全量 custom archive。
  - 备份使用时间戳文件名并生成 SHA-256，记录数据库、版本、起止时间、文件大小和结果；本机保留 7 天，异地独立存储保留 30 天。
  - 备份成功后复制异地副本并校验 checksum；复制失败告警且不删除本地备份；单机磁盘不得作为唯一位置。
  - 每月独立环境恢复演练，使用 `pg_restore`，验证结构、关键余额/流水、应用连通性并记录结果，不覆盖生产库。
  - 发布前检查最近成功备份≤24 小时、文件/大小/checksum、最近恢复演练状态；任一失败禁止迁移和启动新版本。
  - 备份、部署检查、恢复演练、监控告警职责分离，`deploy.sh` 不替代定时备份。
- 影响文档：备份、部署、监控、恢复和测试资料。
- 待同步动作：已建立 ADR-0028；补充真实定时任务、异地副本和恢复演练证据。

## DEC-029 全量发布测试唯一基线

- 确认时间：2026-08-29 23:35 Asia/Shanghai
- 状态：confirmed，正式 ADR 已生成（v1.0.0）
- 决策：
  - 不采用历史文档中的 1159、1132 或 808；每个候选版本生成唯一基线。
  - 基线必须包含版本、提交 SHA、命令、范围、通过/失败/跳过数、时间、工具版本、数据库和 Redis 环境。
  - 必须覆盖 lint、typecheck、build、单测、API 集成、迁移、权限/2FA/幂等、E2E 和 verify；任一必选门禁失败则整体 failed。
  - flaky/blocked 单独登记责任人和风险，不得从失败数隐式扣除。
  - 唯一文件为 `docs/07-quality-and-acceptance/release-baseline.md`；提交、依赖、迁移或测试范围变化时重新生成；未确认前禁止生产部署。
- 影响文档：测试策略、release-gate、部署清单、发布报告和 CI。
- 待同步动作：已建立 ADR-0029 和基线登记模板；实际候选版本基线仍待生成。

## DEC-018 第一批核心资金文档目录

- 确认时间：2026-08-29 22:44 Asia/Shanghai
- 状态：confirmed，正式 ADR 已生成（v1.0.0）
- 决策：
  - 第一批按已确认目录建立索引、产品总览、核心资金 PRD、对应 SPEC、API 规范、数据/架构、状态机、测试验收、部署运维和 ADR 文件。
  - 资金业务拆为充值、人工上账、调账、退款/红冲、结算/对账五个独立主题。
  - `finance-overview.md` 只负责财务域地图、主题关系、术语和链接，不重复定义具体规则。
  - PRD、SPEC、API、ARCH、TEST、OPS 和 ADR 各自遵守已确认的内容边界，不混写。
  - 代理商、业务员、供应商、营销、客服、SSO、完整 Portal、历史 ref 和旧审计资料暂不迁移正文。
- 影响文档：第一批核心资金相关全部文档。
- 待同步动作：建立第一批目录、文档地图和源文件映射；逐章确认主权威来源后再迁移正文。

