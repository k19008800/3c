# 3cloud 迭代落实方案 v2（P0–P3）

> **日期**：2026-08-17
> **定位**：P0→P3 四档迭代的可执行落实方案，每项任务含目标/实现文件/测试要求/Gate/派发方式，可直接按 `kb/3cloud/spawn-protocol.md` 派发子代理执行。
> **前置结论**：基于 `iteration-plan-v1.md`（2026-07-30 差距分析）+ 2026-08-16/17 Batch 1-4 完成后的代码现状（HEAD `2286ac1`，全量测试 463/463、verify 17/17、E2E 10/10、tsc 0 错误）。

---

## 0. 总则（先读）

### 0.1 部署闸门（最高优先级，本方案所有阶段适用）

> **本地未验证通过前，禁止向生产服务器部署任何 3cloud 版本。**

- 生产服（117.78.2.66 主 / 123.60.55.62 备）已清空，处于"空白待部署"状态。
- 每个 P 档完成后，必须通过 §0.4 的**本地验收基线与回归 Gate**，才允许进入下一档；**全部 P0–P3 完成后**才进入部署准备（Phase 10 交付物，见 P3-3）。
- 部署前动作（闸门内）：生产级 JWT secret / 加密密钥 / 数据库迁移备份策略 / nginx vhost（`deploy/api.unmisa.com.conf` 已备）/ DNS / SSL。禁止复用开发配置。

### 0.2 环境前提（执行前必须就绪）

| # | 前提 | 当前状态 | 动作 |
|---|------|---------|------|
| 1 | PostgreSQL 17 @ localhost:5432（库 `threecloud_v3`，51 表，seed 已跑） | ✅ 就绪 | — |
| 2 | **Redis @ localhost:6379（Docker 容器）** | ✅ **已就绪**（2026-08-17 启动：Docker Desktop + `redis` 容器 Up，`PING → PONG` 验证通过） | 若 Redis 掉线，开工前先 `docker start redis` 并 PING 验证；P0-1（Redis Lua 预扣）、P0-3（幂等 SETNX）、四级限流 Redis 计数均依赖它 |
| 3 | 未提交改动收尾 | ⚠️ Playground 多 Tab 重构（`web-console/src/components/playground/` 9 文件 + 4 个路由文件 + `docs/api-contract.md`）未 commit | **先提交**（`git add` + commit + push），保持基线干净再开工 |
| 4 | 价格数据单位校验 | ⚠️ 8/17 曾踩 1000× 偏差（¥/M 误填 ¥/1K 字段） | P1-4 一并加管理端定价录入单位校验 |

### 0.3 每项任务的统一执行协议（派发模板）

派发任何编码子代理前，按 `kb/3cloud/spawn-protocol.md` §一 检查清单执行，task 中必须包含：

```
## 启动必读（按顺序）
1. kb/3cloud/tech-stack-decision.md
2. kb/3cloud/coding-standards-api-db-test.md
3. kb/3cloud/coding-standards-control-logic.md（P0 类任务必读）
4. kb/3cloud/newapi-migration-guide.md [对应章节]
5. kb/3cloud/development-plan.md [对应子任务] + docs/iteration-plan-v2.md [对应任务]

## 任务 / 源码参照 / 测试要求（从本文档摘取）/ Gate 条件 / 输出要求 / 禁止事项
```

### 0.4 本地验收基线与回归 Gate（每档必跑）

```bash
# 1. 类型检查全绿
pnpm -r typecheck                      # api + web-console + web-portal 均 0 错误

# 2. 全量单测
pnpm -w api test                       # 基线 463/463，新增任务后必须 ≥ 基线 + 新增用例全过

# 3. API 集成
pnpm verify                            # 基线 17/17

# 4. E2E（浏览器全流程，需全栈起）
cd e2e && pnpm test                    # 基线 10/10（fullflow 三角色 + console 核心链路）

# 5. 记账一致性（如有资金改动）
node scripts/verify-fullflow-data.cjs  # 消费 sum == 流水 sum == 余额差值

# 6. 构建
pnpm build                             # 三端构建通过
```

> 回归 Gate 未全绿 → 该档不得宣告完成，修复后再验。

---

## P0 — 网关可靠性补全（🔴 最高优先级，先做）

> 目标：消除"底层核心逻辑名不副实"的四个空洞，全部为 `development-plan.md` Phase 1 验收闸门项的真实落地。

### P0-1 余额预扣 + 冻结（Redis Lua 原子预扣，**阈值旁路模式**）

- **现状**：`balance.ts` 仅"余额 > 0 放行 + 事后按实际扣费"，无预扣冻结；流式扣费失败只记日志（存在透支窗口）。注释自认 "Phase 4+ 升级 Redis Lua"。
- **策略（BOSS 拍板 2026-08-17）**：**纯阈值旁路**。
  - 余额 **> 阈值（默认 ¥100，后台可配 `billing.balance_threshold`）** → **旁路**：不预扣，直接转发，响应后按实际用量扣费（零延迟）。
  - 余额 **≤ 阈值** → **预扣**：Redis Lua 冻结 + 多退少补。
  - **设计依据**：单次请求费用天然有上限（`max_tokens` 封顶），阈值本身即防打爆屏障，无需额外"单次预估上限"判定层。
  - **免费兜底（保留）**：旁路扣费后余额 < 0（极端并发竞态）→ 允许记负 + 写 `risk_events`，该用户后续请求自动转预扣直到充值回正。
  - **⚠️ risk_events 依赖（审阅 2026-08-17）**：`risk_events.rule_id` 为 NOT NULL → 需在 `seed.ts` 预置一条规则 `negative-balance-force-preconsume`（rule_type=balance），负余额兜底写入时引用该 rule_id；`risk_rules` 表目前无任何种子记录。
- **⚠️ 关键约束（审阅 2026-08-17）**：`settleBilling`/`getPricingForModel`/`computeCost` 在 **8 处重复实现**（chat / messages / responses / anthropic / openai-compat / rerank 各 1 份 + ws-relay 的 `settleWsBilling` + task-relay 任务型变体）。预扣动作若逐路由插入，需改 8 处且易漏 → **P0-1 前置抽取共享服务**：
  - 新增 `api/src/services/billing/settle.ts`：统一 `settleBilling(ctx, input, output, cost, channel, opts)`（从 chat.ts 抽离，其余 7 处改 import）
  - 新增 `api/src/services/billing/pricing.ts`：统一 `getPricingForModel(model)` + `computeCost(...)`（从 8 处抽离）
  - **预扣判定与冻结只写在这两个共享服务里** → 8 个入口一次生效，无遗漏
  - task-relay（任务型计费）单独评估：任务单价=outputPrice 固定，可沿用"余额预检+事后扣费"（任务失败有退款），**暂不接入预扣**（文档标注豁免）
- **实现文件**：
  - 新增 `api/src/services/billing/pre-consume.ts`：`shouldBypass(ctx)`（阈值旁路判定，读 system_config）+ `preConsume(ctx, estimatedAmount)` + `settlePreConsume(ctx, actualAmount)` + `releasePreConsume(ctx)`（冻结/结算/解冻，对齐 `coding-standards-control-logic.md` §五 Redis Lua 原子预扣）
  - 新增 `api/src/services/billing/settle.ts` + `pricing.ts`（共享服务抽取，见上方约束）
  - 新增 `api/src/scripts/pre-consume.lua`：Lua 脚本（冻结余额原子操作，参考规范 §五 脚本结构：余额检查/幂等/原子 DECRBY）
  - 改 `api/src/services/billing/balance.ts`：余额结构区分 available/frozen（`customer_balances.frozen_balance` 已存在，直接启用）
  - 改 `api/src/routes/admin-settings.ts`：`PUT /admin/settings/billing`（写 `billing.balance_threshold`，写审计）
  - 改 8 处路由（chat / messages / responses / anthropic / openai-compat / rerank / ws-relay / task-relay）：settle/pricing helper 改为 import 共享服务；预检 → 旁路判定 →（预扣 或 直通）→ 转发 → 结算/解冻
  - 改 `api/src/lib/errors.ts`：`PreConsumeFailedError`（402）
  - 前端：`web-console/src/pages/AdminSettingsPage.tsx` 新增「计费」tab（阈值设置）
- **测试要求**（`api/src/services/billing/pre-consume.test.ts` + 集成）：
  - ☐ 余额 > 阈值 → 旁路：不冻结，事后按实际扣费
  - ☐ 余额 ≤ 阈值 → 预扣成功，frozen 增加、available 减少
  - ☐ 预扣时余额不足 → 402，不调上游
  - ☐ 实际消费 < 预扣 → 解冻差额（多退）
  - ☐ 实际消费 > 预扣 → 补扣差额（少补），不足时 402 + 解冻全部
  - ☐ 并发预扣（10 并发同用户）→ Lua 原子性，不超扣
  - ☐ 异常中断 → 超时 TTL 后自动解冻（redis TTL 兜底）
  - ☐ 旁路扣费后余额 < 0 → 记负 + risk_events + 后续请求强制预扣（直到充值回正）
  - ☐ 阈值后台可配置：改 `billing.balance_threshold` 后判定即时生效
  - ☐ 流式场景：转发完成后按 `determineStreamBilling` 结果结算
- **Gate**：`pnpm -w api test`（新增用例全过）+ verify 回归 + 记账一致性脚本。
- **依赖**：§0.2 前提 2（Redis 必须运行）。
- **工时**：后端 2.5d + 前端 0.5d。

### P0-2 四级限流强制落地（全局/用户/Key/模型）

- **现状**：只有全局 600/min（`app.ts` @fastify/rate-limit）+ Key 级 60/min（各路由 `rateLimit` 配置）；`model_rate_limits`、`user_groups.rate_limit_qps/tpm`、`quota_exception_rules`、`rate_limit_entries` 四表仅 CRUD（admin-credit/admin-groups），**网关路径完全不读**。
- **目标**：在网关 preHandler 强制四级限流：全局 → 用户（组 QPS/TPM）→ Key（RPM）→ 模型（cap_rpm/cap_tpm 硬顶）；超限 429；`quota_exception_rules`（客户例外）在模型级生效（effective = min(例外 ?? 组默认, 模型硬顶)）。
- **⚠️ 与现有限流的职责划分（关键，防双重限流冲突）**：
  - **保留** @fastify/rate-limit：全局 600/min 兜底 + Key 级 60/min（现行为，改动最小）。
  - **新增** enforcer：只负责 **用户组 QPS/TPM + 模型硬顶 cap_rpm/cap_tpm + 客户例外** 三层（现状完全缺失的部分），与 fastify 插件**计数维度不重叠**（fastify 按 keyHash/IP，enforcer 按 userId+model）。
  - 文档 `docs/api-contract.md` §5.3 与 `SPEC-§5.3` 中"四级限流"描述同步更新为实际实现分层。
  - **⚠️ 现状澄清（审阅 2026-08-17）**：`admin-credit.ts` 只透传 `cap_rpm/cap_tpm/base_rpm`，**`effective() = min(例外 ?? 默认, 硬顶)` 计算逻辑并不存在**（仅 schema 注释描述）。enforcer 需要**新实现**该算法，不能"对齐现有代码"。
- **实现文件**：
  - 新增 `api/src/services/rate-limit/enforcer.ts`：`enforceRateLimit(ctx)`（Redis INCR + 窗口，读 user_groups / model_rate_limits / quota_exception_rules；**quota_exception 需校验 period/status：仅 `status=active` 且 period=forever 或在 start/end 区间内才生效**；effective 算法新实现：`effective = min(例外 ?? 用户组默认 ?? 平台默认, 模型硬顶)`，并抽成纯函数便于单测）
  - 新增 `api/src/services/rate-limit/effective.test.ts`（effective 算法专项测试）
  - 新增 `api/src/services/rate-limit/index.ts` + `enforcer.test.ts`
  - 改 `api/src/routes/chat.ts` 等 6 个网关路由：preHandler 链中插入 `enforceRateLimit`
  - 改 `api/src/app.ts`：全局兜底限流配置保留
- **测试要求**：
  - ☐ Key 超 RPM → 429
  - ☐ 模型超 cap_tpm → 429（截断）
  - ☐ 客户例外生效：例外客户模型级上限放宽；**过期的 range 例外（end_date 已过）不生效**
  - ☐ 分组 QPS 生效
  - ☐ 与 @fastify/rate-limit 共存：两者独立计数，不互相覆盖
  - ☐ Redis 不可用 → 静默放行（不阻断主链路，与 `lib/redis.ts` 降级语义一致）
- **Gate**：`pnpm -w api test`（`--grep "rate-limit"` 全过）+ verify 回归。
- **依赖**：§0.2 前提 2。
- **工时**：后端 2d。

### P0-3 幂等守卫（request_id 三层去重）

- **现状**：无任何幂等实现（Phase 1 §1.7 要求）；重复提交同一请求会重复计费。
- **目标**：三层幂等：Redis SETNX（首层，同 request_id 立即去重）→ consumption_records 唯一约束（**DB 层兜底已存在**：`consumption_records.request_id` 有 `unique()`，第 10 行）→ 幂等命中返回首次处理结果、不重复扣费。
- **幂等键来源**：优先 `Idempotency-Key` 请求头；无则用 `request_id`（chat.ts 已有 `crypto.randomUUID()` 生成的 `pipelineCtx.requestId`，客户端未传时以它为准）。
- **幂等命中响应策略（关键决策）**：
  - 同步返回首次结果：需 Redis 缓存首次响应体（流式不适用）→ **非流式**请求缓存响应 JSON（TTL 如 24h），命中直接回放；
  - 流式请求：无法回放完整 SSE，**命中时返回首次的 usage/cost 摘要 + `X-Idempotent-Replay: true` 头**，不重复计费；
  - 首层 Redis 失效（崩溃/重启）→ DB 唯一约束兜底：重复 insert 冲突 → 返回 409/幂等提示而非 500。
- **实现文件**：
  - 新增 `api/src/services/idempotency.ts`（Redis SETNX + 响应缓存 + `idempotency.test.ts`）
  - 改 `api/src/routes/chat.ts` 等 6 个网关路由：接入幂等守卫（非流式缓存响应、流式摘要）
  - `consumption_records.request_id` 唯一约束已存在，无需 migration
- **测试要求**：
  - ☐ 同 request_id 二次提交（非流式）→ 返回首次响应，不重复扣费，`X-Idempotent-Replay` 标记
  - ☐ 同 request_id 二次提交（流式）→ 不重复计费，返回摘要 + 标记
  - ☐ 不同 request_id → 正常处理
  - ☐ 幂等命中不触发佣金二次生成（`agent_commissions.consumption_record_id` 唯一索引兜底）
  - ☐ DB 唯一约束兜底：Redis 失效时重复 insert → 幂等提示而非 500
  - ☐ Redis 不可用 → 降级放行（首层失效，DB 唯一约束兜底）
- **Gate**：`pnpm -w api test`（`--grep "idempoten"` 全过）+ verify 回归。
- **依赖**：§0.2 前提 2。
- **工时**：后端 1.5d。

### P0-4 Pipeline 真正接入 + 多模态预处理挂载

- **现状**：`services/pipeline/executor.ts`（`runPipeline`/`createStep` 带回滚）有测试但**从未被路由使用**（各路由手写 try/catch，只 import 类型）；`body-preprocessor.ts`（大 base64→临时文件）实现且导出但**无任何路由调用**（Gate 5 实际未生效）。
- **目标**：把网关路由的调用链改写为 pipeline steps（auth → idempotency → rate-limit → pre-consume → routing → proxy → settle），让回滚机制真实生效；`body-preprocessor` 挂到多模态请求路径（chat/messages/responses/anthropic）。
- **⚠️ 依赖 P0-1 的共享服务抽取（审阅 2026-08-17）**：P0-1 已抽 `settle.ts`/`pricing.ts`/`pre-consume.ts` 共享服务 → P0-4 的 step 实现直接基于共享服务，避免"pipeline 接入后仍有 8 份重复逻辑"。
- **⚠️ ws-relay 豁免（2026-08-18 决策）**：`ws-relay.ts` 为事件驱动 socket 编排（心跳/方案 A 上游 WS 双向透传/方案 B HTTP SSE→WS/断开触发结算），非一次性 step 执行器可表达；其失败路径已等价执行 `releasePreConsume`（防资金卡死）与结算幂等守卫，回滚语义等效 → **不入 pipeline**，保持依赖注入式编排（文档标注豁免）。
- **实现文件**：
  - 新增 `api/src/services/pipeline/steps/{auth,idempotency,pre-consume,rate-limit,route,proxy,settle}.ts`（各 step 调用 P0-1/P0-2/P0-3 共享服务）
  - 改 `api/src/routes/chat.ts` 等：`runPipeline(ctx, steps)` 替换手写链路（保留现有行为等价，逐步替换保证回归；其余 7 处路由按同样模式跟进，可逐路由渐进）
  - 改 `api/src/routes/chat.ts`：请求体经 `preprocessRequestBody` 后再转发（大 base64 走临时文件）
  - 新增 `api/src/services/pipeline/integration.test.ts`（完整链路用例）
- **测试要求**：
  - ☑ 正常链路：6 step 顺序执行全部成功
  - ☑ 第 N 步失败 → 前 N-1 步 rollback 按逆序调用（幂等）
  - ☑ noRollbackOn 标记步骤失败 → 不触发回滚
  - ☑ 余额不足（pre-consume 失败）→ 402 且未调上游
  - ☑ 上游全部不可用 → 502 + 解冻预扣
  - ☑ 大 base64（>10MB）→ 上传临时文件、替换为内网 URL；小 base64 原样转发
  - ☑ 现有 chat/messages/rerank/responses 行为回归（等价性）→ chat 已回归（idempotency-gateway 7 用例 + verify 17/17）；messages/rerank/responses 全部路由接入后全量回归通过
- **Gate**：`pnpm -w api test` 全量（含 pipeline 集成）+ verify 17/17 + E2E 10/10。→ **P0-4 完成：574/574 单测、api/console/portal 三端 tsc 0 错、verify 17/17、E2E 10/10（含真实上游调度）**
- **依赖**：P0-1、P0-2、P0-3 完成后做（steps 复用其服务：pre-consume / rate-limit / idempotency）。
- **工时**：后端 3d（重构风险最高，回归测试为主）。

**P0 验收**：四空洞关闭；`pnpm -r typecheck` 0 错、全量测试 ≥ 基线、verify 全过、E2E 10/10、记账一致性通过 → **宣告 P0 完成**。

---

## P1 — 契约收口 + 资金闭环（🟡 重要）

> 目标：按 `docs/api-contract.md` §2 的 253 端点地图消灭 ⬜，优先用户高频项；补齐资金闭环。

### P1-1 用户高频端点补齐

- **范围**（api-contract §2.1/§2.2 标 ⬜ 的高频项）：
  - `/me/change-password`、`/me/change-email`（改密改邮箱）
  - `/me/invoices` + `/me/invoices/:id/download`（发票；`invoices` 表已有 ✅：user_id/invoice_no/amount/tax/status/title/tax_id/recipient/issued_at，字段齐全）
  - `/me/redemption/redeem`（兑换码）→ **⚠️ 表语义注意（审阅 2026-08-17）**：`coupon_codes` 是**批次模板**（batch_code/face_value/total_count/used_count），`campaign_coupon_codes` 才是**单个码**（code/status/used_by/used_at）——`/me/redemption/redeem` 应操作 `campaign_coupon_codes`（按 code 查 + 原子占用 used_by/used_at），兑换后余额入账走 `addBalance(recharge)`；批次扣减 `used_count`
  - `/me/tickets` + `/reply` + `/resolve`（用户端工单；`tickets` 表已有 ✅：user_id/status/priority/assigned_to/resolution，**目前只有管理端读路由** `admin/customers/:id/tickets`，用户端 CRUD 全缺）
  - `/me/webhooks` + `/me/webhooks/:id`（用户 Webhook CRUD）→ **⚠️ 无对应表**：仅管理端 `webhook_retry_config`（重试策略，非用户订阅）；**需新增 `user_webhooks` 表**（user_id/url/events/secret/status）+ migration 0008（订阅事件、HMAC 签名投递，对齐 SPEC §32）
  - `/me/api-keys/revoke-all`（全部 Key 吊销）
  - `/auth/forgot-password` + `/auth/reset-password` + `/auth/send-email-code`（找回密码/邮箱验证码）
- **实现文件**：改 `api/src/routes/me.ts` / `auth.ts` / `recharge.ts` / 新增 `api/src/routes/webhooks.ts`（用户侧）+ `api/src/db/schema/user-webhooks.ts` + migration 0008；`mailer.ts` 已有。
- **测试要求**：每端点 ≥ 3 用例（成功/参数非法/越权 403）。
- **Gate**：`pnpm -w api test` 新增用例全过 + verify 回归。
- **工时**：后端 3d（可并行拆 3 个子代理）。

### P1-2 代理商结算单 + 提现闭环补全

- **现状**：`/agent/commission`、`/agent/withdraw/*` 已有；`/agent/settlements`、`/agent/ranking`、`/agent/invite/*` 未实现（前端页面已有）。
- **范围**：`/agent/settlements`（月度结算单）+ `/:id/confirm`（确认结算）；`/agent/ranking`（业绩排名）；`/agent/invite/code` + `/records` + `/code/regenerate`（邀请码，`agent_invitations` 表未建 → 新增 migration）。
- **⚠️ 周期锚点（审阅 2026-08-17）**：`accounting_periods` 表已存在（`period` 'YYYY-MM' 唯一 + open/locked/unlocked 状态机）✅ → 代理结算单按 `period` 汇总 `agent_commissions`（status=settled）生成，确认结算写入时标记周期锁定，避免跨期重复结算。
- **实现文件**：改 `api/src/routes/agent.ts`；新增 `api/src/db/schema/agent-invitations.ts` + migration 0009；`api/src/services/agent/settlement.ts`。
- **测试要求**：结算单生成（按会计期汇总佣金）、确认幂等、邀请码唯一/再生成/注册关联、排名计算。
- **Gate**：`pnpm -w api test` + verify 回归。
- **工时**：后端 2.5d。

### P1-3 供应商结算自动对账（SPEC §25 增强）

- **范围**：`/admin/vendor-settlements/generate`（月度结算单自动计算：按供应商聚合 consumption）、`/admin/supplier-bill-match`（账单匹配差异标记）；供应商结算单下载。
- **实现文件**：改 `api/src/routes/admin-finance.ts` / `admin-vendor-settlements.ts`（新增）；`api/src/services/finance/vendor-settlement.ts`。
- **测试要求**：结算单生成金额=sum(consumption cost)，对账差异标记正确。
- **Gate**：`pnpm -w api test` + verify 回归。
- **工时**：后端 2d。

### P1-4 管理端定价录入单位校验 + 数据治理

- **范围**：`/admin/pricing` 创建/更新时校验 `input_price/output_price` 单位语义（¥/1K，> 10 视为疑似 ¥/M 误填 → 400 或二次确认）；`public/pricing` 展示不变。
- **实现文件**：改 `api/src/routes/suppliers.ts`（pricing handler）+ 前端 `web-console/src/pages/AdminPricingPage.tsx`（单位提示）。
- **测试要求**：非法单位拒绝、合法通过、前端提示展示。
- **Gate**：`pnpm -w api test` + web-console typecheck。
- **工时**：后端 0.5d + 前端 0.5d。

**P1 验收**：api-contract §2 高频 ⬜ 清零（其余 ⬜ 标注"开发中"而非假数据）；回归 Gate 全绿 → **宣告 P1 完成**。

---

## P2 — 商业化与运营增强（🟢 增强）

### P2-1 定价引擎接入 L3–L5（代理价/分组价/活动价）

- **现状**：`getPricingForModel` 只读 vendor_pricing（**且 8 处重复实现**：chat/messages/responses/anthropic/openai-compat/rerank/ws-relay/task-relay），campaigns/coupons/discount 表仅 CRUD。
- **⚠️ 前置（审阅 2026-08-17）**：P0-1 已抽 `services/billing/pricing.ts` 共享服务 → P2-1 只需改这一处，8 入口自动生效。
- **⚠️ 已存在的数据载体**：`vendor_pricing.pricing_group` 字段已存在（默认 'default'，admin/pricing 创建/更新已支持）→ **L4 分组价只需网关按 pricing_group 匹配**，无需新表；L3 代理价（`agents` 表按层级配置折扣率）、L5 活动价（`campaigns.config` jsonb）需新增解析逻辑与可能的配置字段。
- **范围**：定价解析链路升级为六层匹配（L5 活动价 → L4 分组价 → L3 代理价 → L2 模型覆盖价 → L1 平台标准价），网关 `getPricingForModel`（共享 `pricing.ts`）接收 userId/groupId/agentId 上下文。
- **实现文件**：改 `api/src/services/billing/pricing.ts`（分层解析 + `pricing.test.ts` 每层用例）；`api/src/routes/chat.ts` 等传上下文（8 处 import 处传参）；前端 `AdminPricingPage` 支持层级配置（分组价已有字段，补代理价/活动价 UI）。
- **测试要求**：每层优先级命中/降级、活动价有效期、分组价、代理价（绑定代理的客户）。
- **Gate**：`pnpm -w api test` + verify（真实计费回归，防 1000× 类偏差）。
- **工时**：后端 2.5d。

### P2-2 代理增长机制（邀请/排行榜/素材库）

- **范围**：邀请链接落地（P1-2 的 invite 端点 + 注册关联 + 佣金率继承）；`/agent/ranking` 排行榜页增强；营销素材库（文件管理/模板下载，`site_contents` 表复用）。
- **实现文件**：改 `api/src/routes/agent.ts`、`auth.ts`（注册携带 invite_code）；前端 `AgentInvitePage`/`AgentRankingPage`。
- **测试要求**：邀请注册链路端到端、排行榜数据正确。
- **Gate**：`pnpm -w api test` + E2E 回归。
- **工时**：后端 2d + 前端 1.5d。

### P2-3 Portal 商业化（i18n / SEO / 博客）

- **范围**：Portal i18n 方案（`/admin/i18n/entries` CRUD + 前端语言切换）；SEO/OG 元数据（`metadata` + sitemap.ts 已有骨架）；博客/新闻模块（`site_contents` 类型扩展 + `/blog` 路由）。
- **实现文件**：改 `web-portal/src/app/*`；新增 `api/src/routes/admin-i18n.ts`、`web-portal/src/app/blog/`。
- **测试要求**：i18n 条目 CRUD、切换渲染、sitemap 输出完整。
- **Gate**：web-portal typecheck + build；`pnpm -w api test`。
- **工时**：后端 1d + 前端 2.5d。

### P2-4 安全合规（数据导出/删除/IP 黑名单/合规报告）

- **现状（审阅 2026-08-17 核实）**：IP 黑名单、数据导出、账号删除**均无任何表与路由**（grep 零命中）→ 全部新建。
- **范围**：`/me/data-export/request` + `/admin/data-requests/:id(approve|reject|export)`（数据导出流转）；`/me/deletion/*` 账号删除流转（`users` 表无软删除字段，需 migration 加 `deleted_at` 或独立 deletion 请求表）；**IP 黑名单**：新增 `ip_blacklist` 表（ip/status/reason/expires_at）+ 管理端 CRUD + `app.ts` onRequest hook 强制网关（`/v1/*` 请求前查，命中 403）；合规审计报告生成（对话留痕导出已有，补报表）。
- **实现文件**：新增 `api/src/routes/data-requests.ts`、`deletion.ts`、`api/src/db/schema/ip-blacklist.ts`（+ migration 0011）+ `api/src/routes/admin-security.ts`（黑名单 CRUD）；改 `api/src/app.ts`（IP 黑名单 onRequest hook）；`api/src/services/compliance/report.ts`。
- **测试要求**：导出流转状态机、删除级联、黑名单 IP 403、报告生成。
- **Gate**：`pnpm -w api test` + verify 回归。
- **工时**：后端 3d。

**P2 验收**：六层定价/邀请闭环/Portal 增强/合规闭环落地；回归 Gate 全绿 → **宣告 P2 完成**。

---

## P3 — 工程与可观测性（⚪ 收尾）

### P3-1 压测与性能验证

- **范围**：跑通 `scripts/stress-chat.cjs` 并发一致性（N 并发同用户计费不超扣/不漏账）；**大表分区落地**：当前无任何分区表，方案目标为 `consumption_records` + `balance_transactions` 按月分区（**⚠️ 实际表名，非 PHASE0-INIT 旧计划中的 `call_logs`/`billing_logs`**；`customer_balances` 单行/用户不分区）；对齐 `PHASE0-INIT.md` §3.5.1 pg_partman 方案（PARTITION BY RANGE(created_at) + 复合主键/唯一约束含分区列）；大表索引审查。
- **实现文件**：新增 migration 0010（分区改造，需手工 DDL：`consumption_records` 的分区列 `created_at` 须纳入唯一约束，`request_id` 唯一约束需改为 `(request_id, created_at)` 复合）；`api/src/db/migrate.ts` 处理；压测报告 `test-reports/stress-YYYYMMDD.md`。
- **⚠️ 分区改造与 P0-3 幂等兜底冲突注意**：`consumption_records.request_id` 现有 `unique()` 在分区表上必须改为复合唯一 `(request_id, created_at)`，P0-3 的 DB 兜底逻辑同步适配。
- **测试要求**：并发计费一致性脚本断言通过；分区查询命中正确分区；幂等 DB 兜底在分区表下仍生效。
- **Gate**：压测报告 + 记账一致性；回归 Gate 全绿。
- **工时**：后端 2d + 验证 1d。

### P3-2 链路追踪与结构化日志

- **范围**：request_id 全链路（已具备）补结构化日志字段（上游 supplier/key/model/latency/usage）；上游延迟指标（`lib/latency.ts` 已有）接入健康聚合；慢查询日志。
- **实现文件**：改 `api/src/app.ts`（pino serializer）、`api/src/lib/logger.ts`（新增）。
- **测试要求**：日志字段完整性断言（单测）。
- **Gate**：`pnpm -w api test`。
- **工时**：后端 1d。

### P3-3 部署准备（Phase 10 交付物，受部署闸门约束）

- **范围**：本地全量验收（§0.4 全绿）→ 生产配置生成（JWT secret / 加密密钥 / 数据库备份策略 / nginx vhost 复核 `deploy/api.unmisa.com.conf` / PM2 ecosystem / DNS / SSL）→ 部署演练文档。
- **交付物**：`deploy/` 脚本更新 + `ops-guide.md` 部署章节更新 + 部署检查清单。
- **Gate**：**仅当 P0–P3 全部本地验收通过后执行**；未通过前一律不部署。
- **工时**：1.5d。

**P3 验收**：压测通过、日志可观测、部署包就绪（不实际部署）→ **P0–P3 全部完成**。

---

## 执行顺序与依赖图

```
环境准备（§0.2：Redis 已就绪 ✅ + 提交未提交改动）
   ↓
P0-1 预扣（阈值旁路） ─┐
P0-2 四级限流 ────────┤（三个并行）
P0-3 幂等 ────────────┘
   ↓
P0-4 Pipeline 接入（依赖 P0-1/P0-2/P0-3）
   ↓ P0 验收（回归 Gate 全绿）
P1-1 用户高频 ─┐（可并行 3 子代理）
P1-2 代理结算 ─┤
P1-3 供应商对账 ┤
P1-4 定价校验 ─┘
   ↓ P1 验收
P2-1 定价层级 ─→ P2-2 代理增长（依赖 P1-2 邀请端点）──┐
P2-3 Portal ──────────────────────────────┤（P2 各项可并行）
P2-4 安全合规 ─────────────────────────────┘
   ↓ P2 验收
P3-1 压测/分区 ─→ P3-2 可观测（并行）──→ P3-3 部署准备（仅最后）
   ↓ P3 验收（本地全绿）
== 部署闸门判定：仅此时才允许进入部署流程 ==
```

**建议子代理分派**：
- P0：P0-1/P0-2/P0-3 三个并行 → P0-4 最后（依赖三者）
- P1：4 个子代理并行
- P2：4 个子代理并行
- P3：2 个子代理并行 + 调度方自验压测

---

## 风险与注意事项

| 风险 | 影响 | 缓解 |
|------|------|------|
| P0-4 Pipeline 重构破坏现有链路 | 高 | 逐步替换 + 每步 `pnpm verify` + E2E 回归；行为等价优先 |
| Redis 未启动导致 P0 联调失败 | 高 | §0.2 前提 2 开工前强制检查（`node -e` PING 脚本） |
| 预扣改变计费时序引入余额偏差 | 高 | 记账一致性脚本每任务后必跑；Lua 原子性单测 |
| 分区表改造（P3-1）DDL 风险 | 中 | 手工 DDL + 备份；先空库演练再动生产数据（生产未部署，实际无风险） |
| 契约 ⬜ 数量大（253 端点） | 中 | P1 只做高频；其余标注"开发中"；新增端点一律先对 api-contract 对账 |
| 部署闸门被跳过 | 中 | 本方案 §0.1 为强制约束；调度-agent 验收后才允许进入部署流程 |

---

> 关联文档：`docs/iteration-plan-v1.md`（差距分析）、`kb/3cloud/development-plan.md`（Phase 1 Gate）、`docs/api-contract.md`（253 端点契约）、`kb/3cloud/spawn-protocol.md`（派发协议）
