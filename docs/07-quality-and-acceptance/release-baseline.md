# 发布测试基线登记

- 文档 ID：TEST-RELEASE-002
- 状态：draft
- 生效版本：v0.1.0
- 上游 ADR：ADR-0029、ADR-0026、ADR-0028

## 当前状态
已在本机真实执行首轮基线（2026-09-04，见下方「实跑基线记录」）；历史资料中的 1159/1132/808 仍不构成正式基线。2026-09-06 收口：API 生产构建产物已可运行（#22）、2 项 flaky 已关闭（#23/#24）、结算资金操作独立 2FA 已闭环（#26）、备份恢复演练已真实 PASS（见下）。2026-09-06 二次收口：候选发布提交 `a7958ad`（应用源码）已确定并复验；T-04 补账/核销事务证据已闭环。**2026-09-06 三次收口（全量重跑）**：在 `feat/impersonation` 上形成新的单一候选提交 **`8d3cad7`**（文档/证据/工具收口批次，工作区 0 未提交），并以该 SHA 全量重跑基线（见实跑记录第 13–16 行）：代码门禁全绿（typecheck/lint/API 1327/web-console 46/build 4 端/E2E 37），**verify 16/17**——唯一失败为 chat 真实上游（根因：本地 `vendor_pricing` 缺 wanwu 渠道定价记录导致 mock 回退，wanwu 上游实测可达、key 有效；补 pricing 后即可真实调度，见 open-issues #27）。整体判定 **`not_ready`（按门禁严格口径：verify 未全绿，失败项不得隐式扣除）**；代码层面无回归，转 ready 仅需产品/发布裁决定价后补 `vendor_pricing` 记录并重跑 verify（修复路径见 open-issues #27）。

## 基线必填字段

| 字段 | 当前值 |
|---|---|
| 版本号 | v0.1.0（候选） |
| 提交 SHA | `8d3cad7`（2026-09-06 单一候选提交，`feat/impersonation`，工作区 0 未提交） |
| 依赖锁文件摘要 | `pnpm-lock.yaml` SHA-256 `F94CC2196875316C4563C338A0622CBCC85CC2D13BCF940A93D0B94A9FF00535` |
| 执行命令 | `pnpm install --frozen-lockfile` / `pnpm -r typecheck` / `pnpm -r lint` / `pnpm --filter @3cloud/api test` / `pnpm --filter web-console test` / `pnpm build` / `cd e2e && pnpm test` / `node scripts/test-integration.cjs` |
| 测试范围 | lint/typecheck/build/unit/API/migration/security/E2E/verify |
| 通过数 | typecheck 3 包 + lint 4 包 + API 1327 + web-console 46 + build 4 端 + E2E 37 + verify 16 |
| 失败数 | verify 1（chat 真实上游 mock 回退，根因=本地 `vendor_pricing` 缺 wanwu 定价记录，见 open-issues #27） |
| 跳过数 | 0 |
| 执行时间 | install 5s / typecheck ~40s / lint ~15s / API 98.94s / web-console 32.70s / build ~3min / E2E 1.2m / verify ~40s |
| Node/pnpm/Vitest 版本 | Node `v22.23.2` / pnpm `11.22.0` / vitest `3.2.7` |
| PostgreSQL/Redis 环境 | PostgreSQL 17.10 @ `threecloud_v3`（5432，Running）；Redis 7-alpine @ 6379（docker，Up） |
| 发布负责人确认 | TBD（待 BOSS） |
| 最近成功备份与恢复演练检查 | ✅ **PASS（2026-09-06 真实执行，release v0.1.0）**：pg_dump custom 归档（8757017 B，SHA-256 一致）→ 隔离库 `threecloud_restore_drill` → pg_restore --exit-on-error → 103 public 表、行数一致（users=15854、balance_transactions=27424）、演练库已删；证据 `evidence/finance/v0.1.0/restore/`（详见 `docs/08-operations-and-deployment/backup-and-restore.md` 与 `TEST-BILLING-003`） |
| 五大资金主题追溯 | `TEST-BILLING-003-traceability.md`：已建立映射；退款/红冲、部分补偿/状态机和真实迁移/恢复证据仍待补 |
| 整体结果 | `not_ready`（2026-09-06 全量重跑：代码门禁全绿 + verify 16/17，唯一失败=chat 真实上游，根因=本地 `vendor_pricing` 缺 wanwu 定价记录；修复路径见 open-issues #27） |

> 历史测试数字不得代替真实结果；真实结果见下方「实跑基线记录（2026-09-04）」。

## 门禁规则
任一必选门禁失败则整体为 `failed`；flaky/blocked 必须单独登记，不得隐式从失败数中扣除。

---

## 实跑基线记录（2026-09-04 真实执行，区分于历史数字）

> 本节为本次在本机 **真实执行** 并留痕的命令与结果。历史 `1159/1132/808/792/685/463` 等数字不进入此处。
> 证据目录：`ops/baseline-2026-09-04/`（00–10 各命令日志 + 依赖摘要 + 构建产物摘要）。

### 基线参数

| 字段 | 值 |
|---|---|
| 版本号 | 未定（工作区非单一提交，见下"候选发布提交"） |
| 候选发布提交 | **未确定**：当前分支 `feat/impersonation` HEAD `1dd732b`，工作区另有 418 modified + 573 untracked 未提交改动，无单一提交承载当前可交付状态 |
| 分支 | `feat/impersonation`（main = origin/main = `97928c6`） |
| 依赖锁文件摘要 | `pnpm-lock.yaml` SHA-256 `F94CC2196875316C4563C338A0622CBCC85CC2D13BCF940A93D0B94A9FF00535`；`pnpm install --frozen-lockfile` 通过（Lockfile up to date，5s） |
| Node / pnpm / vitest | Node `v24.18.0` / pnpm `11.22.0` / vitest `3.2.7` |
| PostgreSQL / Redis | PostgreSQL 17.10 @ `threecloud_v3`（local:5432）；Redis 7-alpine @ 6379（docker，Up） |

### 命令与结果

| # | 命令 | 执行时间 | 通过 | 失败 | 结果 |
|---|---|---|---|---|---|
| 1 | `pnpm install --frozen-lockfile` | 5s | — | — | ✅ 通过 |
| 2 | `pnpm -r typecheck` | ~37s | 3 包 0 错误 | 0 | ✅ 通过 |
| 3 | `pnpm -r lint` | ~12–14s | 4 包 | 0 | ✅ 通过（修正 11 处 unused 后） |
| 4 | `pnpm --filter @3cloud/api test` | ~70–100s | 1281–1282 | 0–1 | ⚠️ **flaky**：run1 1282/1282；run2/3 各自 1 failed（`admin-competitive-marketplace` A5）→ 见 open-issues #23 |
| 5 | `pnpm --filter web-console test` | ~38s | 46 | 0 | ✅ 通过 |
| 6 | `pnpm build` | ~3min | 4 端 | 0 | ✅ 构建通过；**但 `api/dist/index.js` 不可直接运行**（见 open-issues #22） |
| 7 | `cd e2e && pnpm test`（全量 37 例） | ~1.3min | 34 | 1（2 skip 级联） | ⚠️ fullflow③ 已知 flake（见 open-issues #24） |
| 7b | `fullflow.spec.ts` 隔离 | ~16s | 5 | 0 | ✅ 通过（含真实上游调度 total_tokens=79） |
| 8（2026-09-06 收口复验） | `pnpm --filter @3cloud/api build` + `node dist/index.js` | ~30s | 1 | 0 | ✅ 构建产物可运行（#22 关闭后；postbuild patched 0） |
| 9（2026-09-06 收口复验） | `pnpm --filter @3cloud/api exec vitest run`（2FA 专项） | ~2.5s | 24 | 0 | ✅ require-operation-2fa 20/20 + admin-settlement-2fa 4/4（含中文摘要头绑定用例） |
| 10（2026-09-06 收口复验） | `e2e npx playwright test`（全量） | 1.2m | 37 | 0 | ✅ 全绿（#23/#24/#26 关闭依据；fullflow ①–⑤ 含 2FA 两步与真实调度） |
| 11（2026-09-06 二次收口） | `pnpm --filter @3cloud/api test`（全量） | ~104s | 1327 | 0 | ✅ 91 文件全绿；含补账/核销 diffs 2FA 专测 5/5（候选提交 a7958ad 复验） |
| 12（2026-09-06 二次收口） | `pnpm --filter @3cloud/api build` + `web-console pnpm build` | ~25s | — | 0 | ✅ API build patched 0（NodeNext 可运行）+ 前端 build 20.96s 通过 |
| 13（2026-09-06 全量重跑） | `pnpm install --frozen-lockfile` + `pnpm -r typecheck` + `pnpm -r lint` | ~60s | 3+4 包 | 0 | ✅ 全过（候选提交 `8d3cad7`，工作区 0 未提交） |
| 14（2026-09-06 全量重跑） | `pnpm --filter @3cloud/api test` + `pnpm --filter web-console test` | ~2.2min | 1327 + 46 | 0 | ✅ API 91 文件 1327/1327；web-console 7 文件 46/46 |
| 15（2026-09-06 全量重跑） | `pnpm build` + `cd e2e && pnpm test` | ~4min | 4 端 + 37 | 0 | ✅ 构建 4 端全过（api/dist 6.34MB）；E2E 37/37（1.2m） |
| 16（2026-09-06 全量重跑） | `node scripts/test-integration.cjs`（verify） | ~40s | 16 | 1 | ❌ Chat completions (real upstream) mock 回退 → 见 open-issues #27（根因=本地 `vendor_pricing` 缺 wanwu 定价记录；wanwu 上游实测 200、key 有效） |

### 环境健康（E2E 栈）

- API `http://localhost:3000`（via `tsx src/index.ts`）：`/health`、`/api/v1/health` 200；admin/demo/verify-user 登录 200。
- Portal `http://localhost:5177`：`/`、`/app`、`/app/index.html` 200。
- 上游可达性：wanwu `http://47.110.226.233:8072` 200（真实调度走此）；天翼云 `https://ai.ctaigw.cn/coding` 超时；deepseek 401。

### 候选发布提交

**最新候选：`8d3cad7`**（2026-09-06 全量重跑，`feat/impersonation` 上 HEAD，工作区 0 未提交）。分桶沿用 `ops/baseline-2026-09-04/REPORT.md` §7 组成分析：应用源码候选已由 `a7958ad`（107 文件，+5763/−1087）纳入；本轮 `8d3cad7` 为**文档/证据/工具收口批次**单一提交（docs 00-index 体系 + 01–09 分层文档 + PRD/SPEC 渠道化/数据导出/i18n + audit 审阅证据册 347 项 + ADR-0001..0030 + ops 基线/修复/备份工具 + test-reports 证据 + scripts 工具 + e2e global-setup + .deploy-gate-approved + .gitignore），共 **617 文件（+113324/−1355）**。证据：`ops/baseline-2026-09-06/00-git-baseline.txt`（SHA/分支/锁文件/.env 快照）。

### 整体结果

`not_ready`（2026-09-06 全量重跑，严格门禁口径）：代码门禁**全绿**（typecheck/lint/API 1327/web-console 46/build 4 端/E2E 37）；**verify 16/17**——唯一失败项 chat 真实上游（根因=本地 `vendor_pricing` 缺 wanwu 渠道定价记录 → 路由 null → mock 回退；wanwu 上游 `47.110.226.233:8072` 实测 200、`supplier_keys.id=192` 有效）。**转 ready 路径**：产品/发布裁决 `DeepSeek-V4-Flash-0731`（wanwu）定价 → 补 `vendor_pricing`（supplier_model_id=2317，status=active）→ 重跑 verify 即全绿；同步修正 verify 脚本注释（可用渠道=wanwu）与 E2E ③ `mock !== true` 断言（消除假阳性），见 open-issues #27。非阻断登记项：#17 独立全新库迁移演练、前端 paid/dispute 按钮后端缺口（#26 遗留）。