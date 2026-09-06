# 3cloud 幂等/资金整改治理证据文档（2026-09）

- 文档 ID：GOVERNANCE-IDEMPOTENCY-FINANCE-2026-09
- 状态：**draft / 结构化待填表**（尚未执行验证，仅登记与证据引用）
- 建立日期：2026-09
- 上级文档：
  - 发布日期基线：[`release-baseline.md`](release-baseline.md)（TEST-RELEASE-002，2026-09-04 已实跑首轮，整体 `not_ready`）
  - 未决事项：[`docs/00-index/open-issues.md`](../00-index/open-issues.md)
  - 开发计划：[`kb/3cloud/development-plan.md`](../../kb/3cloud/development-plan.md)（Phase 1 幂等守卫 / 集成链路 Gate 6）
  - 首轮执行报告：[`ops/baseline-2026-09-04/REPORT.md`](../../ops/baseline-2026-09-04/REPORT.md)
  - 资金幂等裁决：[`docs/09-decisions/ADR-0009-fund-idempotency.md`](../09-decisions/ADR-0009-fund-idempotency.md)
  - 五资金主题测试包：[`finance-test-package.md`](finance-test-package.md)（TEST-BILLING-FIVE-THEMES-001）
- 关联审计：`audit/03-logic/LOGIC-010-idempotency.md`、`audit/08-deployment/document-decision-log.md#dec-009`

> **证据纪律声明（本文件硬约束）**
> 本文件是资源治理证据文档，**只登记已留痕的证据并建立待填表**。未在本文件「待执行验证」部分之外取得真实运行证据的命令，一律标记为 `未验证`，**不得默认通过、不得按"应有通过"推断**。任何 `通过` 必须同时给出：命令文本、执行时间、退出状态、证据文件路径三要素（时间/退出状态/证据文件），缺一则降级为 `未验证`。
> 本文件建立时不声称任何本阶段验证命令已执行；仅引用既有基线证据（`ops/baseline-2026-09-04/`）与资金 TEST 登记。

---

## 1. 阶段目标

本阶段聚焦 **幂等（idempotency）与资金（finance）整改的治理取证**，目标可验证、可审计：

1. **幂等契约落地核验**：依据 ADR-0009，核验创建类资金操作（`POST /api/v1/recharge`、`/api/v1/admin/manual-topup`、`/api/v1/admin/adjust`）的 `Idempotency-Key` 语义（同摘要回放、异摘要 `409`、Redis 不可用 `503`）在实现与测试中的真实覆盖。
2. **财务整改链路取证**：面向 open-issues #14/#15/#17/#21/#22/#23/#24 及 finance-test-package 五资金主题 TEST ID，登记每条命令的真实执行结果（通过/失败/未验证/blocked），不虚报。
3. **失败-问题-任务闭环**：每条 `失败` 命令必须映射到 issue 编号与明确修复任务；未完成修复不得标为闭环。
4. **发布门禁判定**：按 release-baseline 门禁规则汇总，给出整体 `ready / not_ready / failed` 判定及候选发布提交状态。
5. **可追溯性**：命令 → 结果 → 证据文件 → issue → 任务 全链可复验。

> 本文件**不修改任何应用代码**，只负责证据建立与治理追踪。

---

## 2. 相关方与既定判定基线（引用，不重算）

- **发布基线状态**：`not_ready`（release-baseline TEST-RELEASE-002，2026-09-04 首轮实跑）。原因：候选提交未定 + API `dist` 生产不可运行 + 2 项 flaky（#23/#24）。
- **ADR-0009（幂等）**：状态 `accepted`（2026-08-29）。强幂等规范见 ADR-0009 全文。
- **资金五主题 TEST 包**：finance-test-package 共 37 个唯一 TEST/AC ID，其中大量 `已存在文件（待执行）/待新增/blocked`，整体 `review` 未 approved。
- **评审结论**：`REVIEW-release-baseline-audit-2026-09.md` 确认 `not_ready` 判定证据充分，并指出 `pnpm verify` **声明未执行**、lint 计数瑕疵、工作区未提交数与现场不符、#22 现场状态需裁决等问题。
- **上游文档 ID/口径**：`release-baseline.md` 明确历史 1159/1132/808 等不构成正式基线（ADR-0029）。

---

## 3. 工作区状态字段（如实登记，含 UNKNOWN / BLOCKED）

> 本表为发布基线记录的**引用与当前待复核**。值以最近一次已留痕快照为准；发布裁决前须重跑 `git status` 复核（REVIEW 建议）。**未知/待确认一律写 UNKNOWN/BLOCKED，不得猜测。**

| 字段 | 值 | 来源/备注 |
|---|---|---|
| 分支 | `feat/impersonation` | REPORT §2；`main` = origin/main = `97928c6` |
| HEAD 提交 | `1dd732b1b60e18f6d9c6c32a88ae8343beb6c38b` | REPORT §2 / REVIEW §三 |
| 依赖锁文件摘要 | `pnpm-lock.yaml` SHA-256 `F94CC2196875316C4563C338A0622CBCC85CC2D13BCF940A93D0B94A9FF00535` | 证据 `ops/baseline-2026-09-04/01-lockfile-digest.txt` |
| 工作区未提交（基线快照口径） | REPORT：418 modified + 573 untracked | ⚠️ REVIEW 现场复核为 259 modified + 117 untracked，数值矛盾；**发布裁决前须重跑 `git status` 并以现场为准** |
| 工作区未提交（现场复核口径） | 259 modified + 117 untracked，0 staged | REVIEW §三 现场读数 |
| 候选发布提交 | **未确定（BLOCKED）** | 头号阻塞项。见第 6 节候选发布提交判定 |
| PostgreSQL / Redis | PostgreSQL 17.10 @ `threecloud_v3`（5432）；Redis 7-alpine @ 6379（docker Up） | REPORT §1 |
| Node / pnpm / vitest | `v24.18.0` / `11.22.0` / `3.2.7` | REPORT §1 |

---

## 4. 执行命令登记表（结构化待填表）

### 4.1 状态枚举

| 状态 | 含义 |
|---|---|
| `未验证` | 尚未取得真实执行输出，或证据文件缺失/三要素不全。**不得默认通过** |
| `通过` | 有真实命令+时间+退出状态+证据文件，且退出码 0、无失败项 |
| `失败` | 有真实证据且存在失败项（失败数>0 或非零退出） |
| `blocked` | 前置裁决/环境/实现缺失，暂不能执行 |
| `flaky` | 多次运行结果不稳定（已登记 issue） |

### 4.2 命令登记表（目标命令集）

> 列结构：**# | 命令 | 目标时间 | 退出状态 | 结果 | 证据文件 | 对应 issue/TEST**。
> 执行时须回填「目标时间→实际时间」，「退出状态→实际值」，「结果→通过/失败/未验证/blocked」。
> 当前为**待填表**：除 `[已有证据]` 引用外，全部标 `未验证`。

| # | 命令 | 实际时间 | 退出状态 | 结果 | 证据文件 | issue / TEST |
|---|---|---|---|---|---|---|
| 1 | `pnpm install --frozen-lockfile` | 2026-09-04（基线） | 0 | `通过`（[已有证据]） | [`ops/baseline-2026-09-04/01-pnpm-install.log`](../../ops/baseline-2026-09-04/01-pnpm-install.log) | 基线 |
| 2 | `pnpm -r typecheck` | 2026-09-04（基线） | 0 | `通过`（[已有证据]） | `02-pnpm-typecheck.log`（+`02b` 复验） | 基线 |
| 3 | `pnpm -r lint` | 2026-09-04（基线） | 首轮非 0，修复后 0 | `flaky→已修复通过`（[已有证据]；需按 REVIEW 更正计数为 12 处） | `03`/`03b`/`03c` | REVIEW §四.1 |
| 4 | `pnpm --filter @3cloud/api test` | 2026-09-04 run1/2/3 | 0 / 1 / 1 | `flaky`（run1 1282/1282；run2/3 各 1 failed） | `04`/`04b`/`04c` | **#23** |
| 5 | `pnpm --filter web-console test` | 2026-09-04（基线） | 0 | `通过`（46/46） | `05-webconsole-test.log` | 基线 |
| 6 | `pnpm build` | 2026-09-04（基线） | 0（构建） | `通过`（构建）；**产物不可运行为 `失败`（#22）** | `06-pnpm-build.log`、`06b-build-artifacts.txt`、`08-api-server.log` | **#22** |
| 7 | `cd e2e && pnpm test`（37 例） | 2026-09-04（基线） | 非 0 | `flaky`（34 pass / 1 fail / 2 did not run） | `10-e2e-test.log` | **#24** |
| 7b | `fullflow.spec.ts` 隔离 | 2026-09-04（基线） | 0 | `通过`（5/5，total_tokens=79） | `10b-e2e-fullflow-isolated.log` | #24 隔离口径 |
| 8 | `api build + postbuild fix`（`tsc && node scripts/postbuild-fix-imports.mjs`） | 2026-09-04T09:51 | 0 | `通过`（[已有证据]；patched 202/269 files） | `11-fix22-api-build.log` | #22 修复方向（需裁决） |
| 9 | `node dist/index.js` 启动验证 | 2026-09-04T09:52 | 非 0 | `失败`（`ERR_MODULE_NOT_FOUND ...dist/db.js`） | `11b-fix22-dist-start.log` | **#22** |
| 10 | `node scripts/req-completeness-check.cjs docs/07-quality-and-acceptance` | 2026-08-31 | 非 0 | `未验证/失败`（[已有证据] 6 文件 36 检查 11 FAIL，GRADE=C） | `test-reports`（final-doccheck-07） | F4 `[?]` 帮助 |
| 11 | `pnpm verify`（`node scripts/test-integration.cjs`） | — | — | **`未验证`（声明未执行）** | 无对应日志 | REVIEW §四（声明未执行，不得默认通过） |
| 12 | 资金候选回归（8 文件命令，见 finance-test-package §1） | — | — | **`未验证`（本次未运行）** | 待补 | 充值/人工上账/调账/结算 TEST |
| 13 | `db:migrate:manual` 独立全新库演练（0000–0032） | — | — | **`blocked`** | 待补（无恢复演练证据） | **#17** |
| 14 | 迁移/备份恢复演练（`pg_dump/pg_restore`） | — | — | **`blocked`**（本机无 `pg_dump/pg_restore`、无独立库） | — | #17、backend-restore 相关 |
| 15 | 幂等专项（`api/src/services/idempotency.test.ts`、`idempotency-gateway.test.ts`） | — | — | **`未验证`（本次未按这些 id 运行）** | 文件存在不构成通过 | ADR-0009、RECH-AC-007、MT-AC-005 |

> **待新增任务的命令（写入第 5 节任务表执行命令）：**
> `api/test/refund-reversal.test.ts`、`refund-state-machine.test.ts`、`refund-permissions.test.ts`、`refund-contract.test.ts`、`refund-concurrency-compensation.test.ts`、`manual-topup-compensation.test.ts`、`reconciliation-compensation.test.ts`、`migrations-finance.test.ts`（finance-test-package 逐 ID 标 `待新增`，REVIEW 建议 D）。

---

## 5. 失败项 → issue 编号 → 修复任务映射

| # | 失败/阻塞项 | 证据文件 | issue | 修复任务 | 状态 |
|---|---|---|---|---|---|
| F1 | API 生产 `dist` 不可运行（`ERR_MODULE_NOT_FOUND`） | `08-api-server.log`、`11b-fix22-dist-start.log` | **#22（P0，部署阻断）** | 以可运行产物为准：postbuild 修复（`11-fix22` 已扫到 SSL `ERR_MODULE_NOT_FOUND` 于 `node dist/index.js`）**未闭环**；须裁决 postbuild 修复是否接受为 #22 关闭动作，并以 `node dist/index.js` + `/health` 200 补真实启动验证后关闭；未验证前维持部署禁令 | **失败（未闭环）** |
| F2 | API marketplace A5 非确定性 flaky | `04b`/`04c`（expected 0.2 to be 0.1） | **#23** | 使 A5 断言对多卡取价确定性（按供应商名定位目标卡，或断言 `min(sell_input_price)===0.10`）；禁止"改断言掩盖" | **未关闭** |
| F3 | E2E fullflow③ balance 渲染 flake | `10-e2e-test.log`（expect≥510 Received:0） | **#24** | 加强余额元素等待/重试或改用 JSON 响应断言消除时序依赖；隔离跑通过不能关闭全量 | **未关闭** |
| F4 | 退款/红冲完整链路差额（T-03） | finance-test-package §2.4 全 `待新增` | **#15** | 按 finance-test-package REF-AC-001~007 新增测试：分流、原路支付通道、失败注入/重试、执行并发、outbox、processing 崩溃恢复 | **待新增** |
| F5 | 充值/人工上账映射差额（T-02） | finance-test-package §2.1/2.2 | **#14** | 补齐支付回调契约/验签/金额核对/重复回调幂等、渠道熔断、三级审批逐级边界、`approval_phase` 序列化 | **待补**（T-02 已 7/7，缺回调等专项） |
| F6 | 对账最小闭环已落地，完整结算/对账阻断 | finance-test-package §2.5 | **#21** | 补 Redis 分布式锁、异步任务/失败补偿、outbox、真实跨系统对账、资金补账/核销事务及 2FA、代理正式结算周期；补账/核销资金事务证据未完成 | **未关闭**（原型替代 P0 已关闭，完整 T-04 未关闭） |
| F7 | 迁移 runner 加固的演练/恢复证据待补 | finance-test-package §2.4/2.5 | **#17** | 在独立全新库执行 0000–0032 演练 + 真实备份恢复证据 | **blocked** |
| F8 | `pnpm verify` 声明未执行 | 无日志 | — | 执行并留痕 `pnpm verify`，补入 release-baseline 命令表 | **未执行** |
| F9 | `[?]` 页面/按钮级帮助零 UI 证据 | — | AGENTS.md 全局红线 | 为五资金主题页面/按钮补源码+运行态截图清单 | **未验证** |
| F10 | lint 计数瑕疵 | `03`/`03b`/`03c` | — | 更正为 12 处 unused（首轮 3 + api 9） | 记录待更正 |
| F11 | **模型网关幂等指纹缺失（新增，高危）** | 待取证（见 §11） | **#25（提议，待登记）** | 见 §11 修复任务 | **未验证（高危）** |

---

## 6. 候选发布提交判定

> **字段：候选发布提交 = `UNKNOWN`（未确定，`BLOCKED`）**

- 当前 **无单一候选提交** 承载可发布交付物：`feat/impersonation` HEAD `1dd732b` 之上另有大量未提交改动（REPORT §2：418 modified + 573 untracked；REVIEW 现场：259 modified + 117 untracked——两口径均非单一提交）。
- `97928c6`（main/origin）仅是 finance 重跑的登记 SHA，**不承载当前可发布态**；不得与"候选发布提交"混同（REVIEW §四.4）。
- 组成分析（REPORT §7）：573 untracked 中约 302 项为 `audit/` 证据册、上百项 `docs/`、多项 `test-reports/`、`e2e/test-reports/`；可发布应用源码（`api/src` 25、`web-console/src` 10、`api/test` 5、`e2e/tests` 2、`api/scripts` 2、`api/lib` 1）明显更小，含新路由/新测试。
- **待裁决动作**：发布/产品裁决把"可发布源码"从 evidence/audit/docs/test-reports 分离并纳入一组明确提交后复验，方存在候选提交；否则保持 **"无候选提交 / BLOCKED"**。
- **发布裁决前须重跑 `git status` 并以现场数为准**（REVIEW §四.2）。

---

## 7. 门禁判定规则（引用并固化）

按 `release-baseline.md` 门禁规则：

1. **任一必选门禁失败 → 整体 `failed`**（如 #22 产物不可运行、任一资金必选 TEST 失败）。
2. **flaky / blocked / 未验证 必须单独登记**，不得隐式从失败数中扣除，也不得默认通过。
3. **资金一致性**：余额、流水、业务单、审计、outbox 的提交/回滚边界必须有故障注入证据；通知失败不得伪装成资金事务通过（finance-test-package §3.3）。
4. **迁移与恢复**：必须在隔离环境验证迁移顺序/checksum、备份可恢复、失败即停、回滚准入；开发机一次 migrate 成功不等价恢复演练（§3.4）。
5. **发布门禁**：将各 TEST ID 结果汇总到 release-baseline；任一必选项未执行、失败或 blocked，整体不得 `ready`（§3.5）。
6. **UI 帮助**：五主题页面标题和每个操作入口 `[?]` 的源码/路由/API/权限与运行态证据须补入执行记录（§3.6，当前为 `未验证`）。

### 本阶段整体判定

| 判定 | 值 |
|---|---|
| 现有发布基线 | `not_ready`（2026-09-04 首轮，未关闭） |
| 本文件阶段验证 | **未执行 / 结构化待填表**（本文件建立时不声称任何验证命令已运行） |
| 候选发布提交 | `UNKNOWN / BLOCKED` |
| API 生产可运行 | `BLOCKED`（#22 未关闭） |
| 五资金主题 | `review`，大量 TEST 待执行/待新增/blocked，未 approved |
| 模型网关幂等指纹 | **高危新增，未验证**（§11；#25 待登记） |

---

## 8. 未验证项显式清单（不默认通过）

以下项目**均无本期真实执行证据**，标记 `未验证`/`blocked`，不作为通过依据：

1. `pnpm verify` —— `未验证`（声明未执行，无日志）。
2. 资金候选回归 8 文件命令 —— `未验证`（文件存在≠通过）。
3. 幂等专项（`idempotency.test.ts` / `idempotency-gateway.test.ts`）按 ADR-0009 语义再跑 —— `未验证`。
4. 退款/红冲 REF-AC-001~007 —— `待新增`。
5. 对账补偿/reconciliation-compensation —— `待新增`。
6. 人工上账补偿/manual-topup-compensation —— `待新增`。
7. 迁移/备份恢复演练 —— `blocked`（无 `pg_dump/pg_restore`、无独立库）。
8. `[?]` UI 帮助实测 —— `未验证`（零 UI 证据）。
9. #22 `node dist/index.js` + `/health` 200 关闭验证 —— `未验证`（`11b` 显示仍 `ERR_MODULE_NOT_FOUND`）。
10. #23 / #24 flaky 关闭取证 —— `未关闭`。
11. **模型网关幂等指纹缺失验证**（§11，#25 待登记）—— `未验证`（高危，无任何真实证据）。

> 以上任一项在发布裁决前未取得真实通过证据，均不得写入 `通过`。

---

## 9. 待办登记（下一步）

| 动作 | 责任方 | 交待 | 产物 |
|---|---|---|---|
| 重跑 `git status` 复核工作区未提交数并统一口径 | 发布/product-agent | 裁决候选发布提交 | release-baseline / REPORT 更正 |
| 执行并留痕 `pnpm verify` | ops/test-agent | 补命令表 | `release-verify-evidence-2026-09.md` |
| #22 关闭裁决：postbuild 修复是否接受 + 真实启动验证 | 发布/负责人 | `node dist/index.js` + `/health` 200 | 关闭记录 |
| #23/#24 修复 + 复验三连（确定性断言/时序消除） | backend/test-agent | 全量 3 连通过 | 对应证据日志 |
| 五资金补充 TEST 文件编写并执行 | test-agent | finance-test-package"待新增"落实 | 新测试文件 + 日志 |
| 独立全新库迁移 + 备份恢复演练 | ops-agent | 隔离环境 | 迁移/恢复证据 |
| `[?]` UI 帮助实测 | test-agent | 源码+截图清单 | 关闭 F4 FAIL |
| **模型网关幂等指纹修复 + 验证** | backend-agent / test-agent | 见 §11；修复+新增指纹校验后跑 §11 验证命令 | 指纹实现 + 验证证据 |

---

## 10. 关联证据清单

- `ops/baseline-2026-09-04/` —— 00–11c 全量命令日志与摘要（本次引用其既有结果）。
  - `11-fix22-api-build.log`（postbuild fix，20260904T09:51，patched 202/269）
  - `11b-fix22-dist-start.log`（node dist/index.js 仍失败，20260904T09:52）
  - `11c-fix22-api-build2.log`（build v2，20260904T09:53）
- `docs/07-quality-and-acceptance/release-baseline.md` —— 发布基线 TEST-RELEASE-002。
- `docs/00-index/open-issues.md` —— #14/#15/#17/#21/#22/#23/#24。
- `docs/09-decisions/ADR-0009-fund-idempotency.md` —— 幂等裁决。
- `docs/07-quality-and-acceptance/finance-test-package.md` —— 五资金主题 TEST 包。
- `docs/07-quality-and-acceptance/REVIEW-release-baseline-audit-2026-09.md` —— 审查报告（含 3 处记录瑕疵与 7 项建议）。
- `kb/3cloud/development-plan.md` —— Phase 1 幂等守卫/集成链路（Gate 6）。
- `docs/05-api/idempotency.md`、`audit/03-logic/LOGIC-010-idempotency.md` —— 模型网关幂等指纹核对（§11 引用）。
- 本文件 §11 新增风险（F11/#25）—— 模型网关幂等指纹缺失，验证命令 V1–V5。

---

## 11. 新增风险：模型网关幂等指纹缺失（高危）

> **登记日期**：2026-09（本次追加）。**等级**：🔴 **高危（HIGH）**。

### 11.1 风险描述

- 依据 ADR-0009，幂等规范覆盖**创建类资金操作**（recharge / manual-topup / adjust）；但**模型网关（OpenAI 兼容 / `POST /v1/chat/completions` 等推理代理链路）的幂等指纹缺失**，未纳入统一 `Idempotency-Key` 摘要约束。
- **影响**：相同请求在网关层（上游中断重试、超时重放、客户端重复提交、Pipeline 重试）下无法被幂等去重，可能导致**重复计费 / 重复调用上游计费**、消费流水重复、余额重复预扣未正确结算——属资金一致性与成本风险，不亚于资金操作幂等。
- **现状证据**：development-plan.md Phase 1 §1.7 集成链路含 `idempotency.ts` 幂等守卫与"request_id 重复 → 幂等返回已有结果，不重复计费"；但**尚未见该能力覆盖模型网关请求指纹的真实验证证据**（§4 #15 幂等专项也标 `未验证`）。`docs/05-api/idempotency.md`、`LOGIC-010-idempotency.md` 需核对其是否涵盖推理代理链路。

### 11.2 修复任务（backend-agent）

1. **定义模型网关幂等指纹**：为 `POST /v1/chat/completions`（含流式/非流式）定义用 `Idempotency-Key`（或其请求体摘要）唯一标识请求的条件；绑定操作方 + 方法 + canonical 路径 + 请求摘要。
2. **网关幂等守卫接入 pipeline**：在 `idempotency.ts` 中支持按请求摘要做幂等判定，命中已处理/处理中请求时**返回已有结果并不重复计费**，不重复预扣。异常摘要返回 `409`、Redis 不可用返回 `503`（与 ADR-0009 语义对齐）。
3. **计费一致性**：预扣/结算与幂等判定同事务/同锁边界；重放不得产生第二笔消费流水或二次上游调用。
4. **兼容旧路径口径**：`DOC_CODE_GAP`（#16 相关）的分页/别名历史端点若涉及网关，一并核对其幂等行为。

### 11.3 验证命令（待新增待填 -> 执行后回填结果/时间/退出状态/证据文件）

| # | 验证命令（目标） | 通过判定 | 状态 |
|---|---|---|---|
| V1 | `pnpm --filter @3cloud/api exec vitest run src/services/idempotency.test.ts test/idempotency-gateway.test.ts` | 网关幂等指纹单测全通过（同摘要回放/异摘要 409/Redis 不可用 503） | **未验证** |
| V2 | 网关幂等集成测试（重复 `request_id` → 返回已有结果，不重复计费、不二次调用上游） | 集成用例通过，消费流水唯一 | **未验证** |
| V3 | 流式用例幂等：SSE 中断/重试下同摘要不重复入账 | 流式重复请求返回首次结果且仅一笔计费 | **未验证** |
| V4 | 并发幂等：10 并发同摘要请求只产生一笔消费/一次上游调用 | 并发表单仅 1 条计费 | **未验证** |
| V5 | 全量回归 `pnpm --filter @3cloud/api test` + `pnpm verify` | 回归通过且 `verify` 留痕 | **未验证** |

> **现状**：以上 V1–V5 均**无本期真实执行证据**，状态 `未验证`。任何一项未取得真实通过证据前，**不得标为通过**，也不得据此推进发布。

---

> 维护说明：本文档为资源治理证据文档，**不修改应用代码**。每完成一条命令的实跑，回填「实际时间/退出状态/结果/证据文件」，并为 `失败` 项补齐 issue 与修复任务状态。本阶段验证未执行前，整体判定保持 `not_ready`，候选发布提交保持 `UNKNOWN / BLOCKED`。