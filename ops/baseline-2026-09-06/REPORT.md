# 3cloud 真实发布基线 — 全量重跑报告（2026-09-06）

- 文档 ID：BASELINE-EVIDENCE-2026-09-06
- 状态：证据留档（结论 `not_ready`，见 §7 判定）
- 证据目录：`ops/baseline-2026-09-06/`
- 候选提交：`8d3cad7017d3d1bf70f58a5aea89ec470fb2ecb3`（chore(release): 候选发布提交 - 需求文档收口与证据留痕（单一提交），工作区 0 未提交）
- 关联：`docs/07-quality-and-acceptance/release-baseline.md`、`docs/00-index/open-issues.md` #27

## 1. 执行环境

- Node `v22.23.2` / pnpm `11.22.0` / vitest `3.2.7` / Windows 10
- PostgreSQL 17.10 @ `threecloud_v3`（5432，服务 Running）；Redis 7-alpine @ 6379（docker，Up，PONG）
- E2E 栈实测：API `:3000`（tsx 启动，`/api/v1/health` 200，db up/redis up），Portal `:5177`（next dev，`/`、`/app/index.html` 200）
- 注：上次基线（2026-09-04）记录 Node `v24.18.0`，本次 PATH 下实测 `v22.23.2`；以本次实测为准

## 2. Git / 依赖基线

- HEAD `8d3cad7017d3d1bf70f58a5aea89ec470fb2ecb3` @ `feat/impersonation`；`main` = origin/main = `97928c6`
- 工作区：`git status --porcelain` = 0 行 → **单一候选提交已形成**（见 §6）
- `pnpm-lock.yaml` SHA-256 `F94CC2196875316C4563C338A0622CBCC85CC2D13BCF940A93D0B94A9FF00535`
- `api/.env` SHA-256 `38697701DCC6F9D883AA6C7ECCC818AF50AF6639D2D8CC28E92AD7BEA009565C`
- 证据文件：`00-git-baseline.txt`、`01-pnpm-install.log`、`01-lockfile-digest.txt`、`02-pnpm-typecheck.log`、`03-pnpm-lint.log`、`04-api-test.log`、`05-webconsole-test.log`、`06-pnpm-build.log`、`06b-build-artifacts.txt`、`08-api-server.log`、`09-portal-server.log`、`10-e2e-test.log`、`11-verify.log`

## 3. 命令真实结果

| # | 命令 | 通过 | 失败 | 结果 |
|---|---|---|---|---|
| 1 | `pnpm install --frozen-lockfile` | — | 0 | ✅ 通过（Lockfile up to date） |
| 2 | `pnpm -r typecheck` | 3 包 0 错误 | 0 | ✅ 通过（api / web-console / web-portal） |
| 3 | `pnpm -r lint` | 4 包 | 0 | ✅ 通过（shared / api / web-console / web-portal） |
| 4 | `pnpm --filter @3cloud/api test` | **91 文件 / 1327 测试** | 0 | ✅ 通过（98.94s） |
| 5 | `pnpm --filter web-console test` | **7 文件 / 46 测试** | 0 | ✅ 通过（32.70s） |
| 6 | `pnpm build` | **4 端** | 0 | ✅ 通过（shared/api/web-console/web-portal；api/dist 1088 文件 6.34MB，portal .next 114.78MB） |
| 7 | `cd e2e && pnpm test`（全量 37 例） | **37** | 0 | ✅ 通过（1.2m；fullflow ①–⑤ 含对公打款/审核到账/调度消费核对/财务/代理） |
| 8 | `node scripts/test-integration.cjs`（verify） | **16** | **1** | ❌ Chat completions (real upstream) — **mock 回退**（见 §4） |

## 4. verify 唯一失败项根因（chat 真实上游）

- 现象：`POST /v1/chat/completions`（model `DeepSeek-V4-Flash-0731`）返回 `{"mock":true}` 占位响应；脚本断言 `mock !== true` 判失败 → verify 16/17。
- 根因（已逐层定位到数据层）：
  1. `api/src/services/upstream/routing.ts` `selectChannel` 以 `vendor_pricing.status='active'` 为必要条件（innerJoin）；
  2. 本地库 `vendor_pricing` 中 **wanwu（supplier 2633，supplier_model 2317）与天翼云（2824，2503）均无任何定价记录**（wanwu pricing rows = 0；deepseek 系列 pricing 全表 0 条）；
  3. 故 `DeepSeek-V4-Flash-0731` 无候选渠道 → route 返回 null → proxy step mock 回退。
- 渠道可达性实测：wanwu `http://47.110.226.233:8072` 用 `supplier_keys.id=192`（wanwu-main，active）直调 `POST /v1/chat/completions` → **HTTP 200 真实 completion**（content "你好"，total_tokens=6）；天翼云 `https://ai.ctaigw.cn/coding` 超时；deepseek 官方 401。
- 结论：**非代码缺陷**（代码门禁全绿）；是本地渠道定价数据缺口——补一条 `vendor_pricing`（supplier_model 2317，status=active）即可恢复真实路由。**价格属业务数据，需发布/产品裁决后补录，本环境不擅自代决。**
- 附注：verify 脚本注释「天翼云 Coding 是本地当前可用的真实测试渠道」与实际不符（天翼云超时、wanwu 才是可用渠道），应同步修正注释；`e2e/tests/fullflow.spec.ts` ③ 仅断言 `total_tokens>0` 不校验 `mock`，全绿结果不构成"真实上游调度"证据（本次 fullflow ③ 亦为 mock 计费）。

## 5. 环境健康（E2E 栈）

- API `http://localhost:3000`（`pnpm --filter @3cloud/api dev`，tsx）：`/api/v1/health` 200（db up / redis up）。
- Portal `http://localhost:5177`（`pnpm --filter web-portal dev`，next 15.5.23）：`/` 200、`/app/index.html` 200。
- 旧 dev 栈（旧 dist api :3000 + 旧 next :5177 + vite :5175）已停，本次以候选提交 `8d3cad7` 代码全新启动。

## 6. 候选发布提交

**已形成：`8d3cad7`**（2026-09-06，`feat/impersonation` 上 HEAD，工作区干净）。分桶依据（沿用 `ops/baseline-2026-09-04/REPORT.md` §7 组成分析）：可发布应用源码已由 `a7958ad` 纳入单一提交；本轮为**文档/证据/工具收口批次**单一提交——docs 00-index 体系 + 01–09 分层文档 + PRD/SPEC（渠道化/数据导出/i18n）+ 需求完整性审计、audit 审阅证据册（347 项）、docs 07/08 质量与部署文档、ADR-0001..0030、ops 基线/修复/备份恢复工具、test-reports 证据、scripts 工具（req-completeness-check、verify 增强）、e2e global-setup、.deploy-gate-approved、.gitignore（__pycache__）共 **617 文件（+113324/−1355）**。

## 7. 整体结论

`not_ready`（按门禁严格口径：任一必选门禁失败即整体 failed，失败项不得隐式扣除）——**verify 16/17**，唯一失败为 chat 真实上游（根因=本地 `vendor_pricing` 缺 wanwu 定价记录，见 §4）。代码门禁（install/typecheck/lint/API 1327/web-console 46/build 4 端/E2E 37）**全绿**。

**修复路径（裁决后即可转 ready）**：
1. 产品/发布裁决 `DeepSeek-V4-Flash-0731`（wanwu 渠道）定价 → 补 `vendor_pricing`（supplier_model_id=2317，status=active，含 input/output 价与缓存价）→ 重跑 verify（chat 走真实 wanwu）；
2. 同步修正 `scripts/test-integration.cjs` 注释（可用渠道=wanwu）与 `e2e/tests/fullflow.spec.ts` ③ 增加 `mock !== true` 断言（消除"真实调度"假阳性）。

## 8. 日志文件清单

`00-git-baseline.txt`、`01-pnpm-install.log`、`01-lockfile-digest.txt`、`02-pnpm-typecheck.log`、`03-pnpm-lint.log`、`04-api-test.log`、`05-webconsole-test.log`、`06-pnpm-build.log`、`06b-build-artifacts.txt`、`08-api-server.log`、`09-portal-server.log`、`10-e2e-test.log`、`11-verify.log`、`REPORT.md`
