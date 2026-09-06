# 3cloud 真实发布基线 — 全量重跑报告（2026-09-06）

- 文档 ID：BASELINE-EVIDENCE-2026-09-06
- 状态：证据留档（结论 **`ready`**，见 §7 判定；R2 修复后全绿，R3 测试增强复验全绿）
- 证据目录：`ops/baseline-2026-09-06/`
- 候选提交：`8d3cad7017d3d1bf70f58a5aea89ec470fb2ecb3`（chore(release): 候选发布提交 - 需求文档收口与证据留痕（单一提交），工作区 0 未提交）+ 测试增强提交（verify 注释修正 + E2E ③ mock 断言，见提交链）
- 关联：`docs/07-quality-and-acceptance/release-baseline.md`、`docs/00-index/open-issues.md` #27（已关闭）

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
| 7 | `cd e2e && pnpm test`（全量 37 例） | **37** | 0 | ✅ R1 37/37；R4（测试增强后，服务重启）**37/37**（1.3m，含 fullflow ③ 真实上游 + `mock !== true` 新断言）。R2/R3 曾现偶发 flake（fullflow① / console API Key / user-features 仪表盘），隔离均通过、服务重启后全绿——判定为 dev server 长时运行的环境不稳定，非代码回归 |
| 8 | `node scripts/test-integration.cjs`（verify） | **17** | **0** | ✅ **R1 16/17**（chat mock 回退，§4 根因）→ **R2 修复后 17/17**（chat 真实上游：11 tokens·1 out，计费 ¥0.000052 正确）→ **R3 注释修正后 17/17** |

## 4. verify 唯一失败项根因与修复（chat 真实上游）

### R1 现象与根因（两层，均已修复）
- 现象：`POST /v1/chat/completions`（model `DeepSeek-V4-Flash-0731`）返回 `{"mock":true}` 占位响应；脚本断言 `mock !== true` 判失败 → verify R1 16/17。
- 根因①（数据层）：`api/src/services/upstream/routing.ts` `selectChannel` 以 `vendor_pricing.status='active'` 为必要条件（innerJoin），而本地库 `vendor_pricing` 中 wanwu（supplier 2633，supplier_model 2317）无定价记录 → 路由 null → mock 回退。
- 根因②（渠道映射层，修复①后暴露）：上游请求 model 使用 `supplier_models.platform_model` 转发（`api/src/routes/chat.ts` `buildUpstreamBody(req, channel.modelMapping.platformModel)`），而 2317 的 `platform_model='deepseek-v4-flash'` 与 wanwu 渠道实际模型名 `DeepSeek-V4-Flash-0731` 不一致 → wanwu 上游返回 503 `model_not_found`（"分组 default 下模型 deepseek-v4-flash 无可用渠道（distributor）"）。

### 修复动作（2026-09-06，本地库数据修复，附证据）
1. **补定价**：`INSERT INTO vendor_pricing (supplier_model_id, pricing_group, input_price, output_price, output_multiplier, currency, status, effective_from) VALUES (2317, 'default', '0.004', '0.012', '1.0', 'CNY', 'active', NOW())` → id=4128。
   - 裁定依据：计费单元为 **¥/1K tokens**（`api/src/services/billing/pricing.ts`，曾有 ¥/M 误填 1000× 事故，`validatePricingUnit` 上限 ¥10）；wanwu 上游成本 ¥2/¥8 per 1M = ¥0.002/¥0.008 per 1K（`supplier_models.input_price/output_price`）；平台售价取 **¥0.004/¥0.012（per 1K）**——约 1.5× 覆盖成本，与本地 default 档既有价格点（0.004/0.012，48 条在用）一致，且 < ¥10 不触发单位校验红线。
2. **修模型映射**：`UPDATE supplier_models SET platform_model='DeepSeek-V4-Flash-0731' WHERE id=2317`（wanwu 渠道实测仅认该模型名）。
3. **验证**：直连 chat → HTTP 200 真实 completion（mock 消失，prompt 10 + completion 8 tokens）；R2 verify **17/17**，计费 ¥0.000052（10×0.004/1000 + 1×0.012/1000）与余额扣减（¥10 → ¥9.999948）精确吻合。

### 渠道可达性实测
- wanwu `http://47.110.226.233:8072`：`supplier_keys.id=192`（wanwu-main，active）直调 `POST /v1/chat/completions`（model `DeepSeek-V4-Flash-0731`）→ **HTTP 200 真实 completion**；经 3cloud 网关（model `DeepSeek-V4-Flash-0731`）→ 200。
- 天翼云 `https://ai.ctaigw.cn/coding` 超时（不可用）；deepseek 官方 401（不可用）。
- 附注：verify 脚本第 8 项注释「天翼云 Coding 是本地当前可用的真实测试渠道」已过时（实际可用=wanwu），本轮未改脚本（断言与行为一致），建议后续顺手修正注释；`e2e/tests/fullflow.spec.ts` ③ 仅断言 `total_tokens>0` 不校验 `mock`（修复后已天然走真实上游，建议补 `mock !== true` 断言防回退假阳性）。

## 5. 环境健康（E2E 栈）

- API `http://localhost:3000`（`pnpm --filter @3cloud/api dev`，tsx）：`/api/v1/health` 200（db up / redis up）。
- Portal `http://localhost:5177`（`pnpm --filter web-portal dev`，next 15.5.23）：`/` 200、`/app/index.html` 200。
- 旧 dev 栈（旧 dist api :3000 + 旧 next :5177 + vite :5175）已停，本次以候选提交 `8d3cad7` 代码全新启动。

## 6. 候选发布提交

**已形成：`8d3cad7`**（2026-09-06，`feat/impersonation` 上 HEAD，工作区干净）。分桶依据（沿用 `ops/baseline-2026-09-04/REPORT.md` §7 组成分析）：可发布应用源码已由 `a7958ad` 纳入单一提交；本轮为**文档/证据/工具收口批次**单一提交——docs 00-index 体系 + 01–09 分层文档 + PRD/SPEC（渠道化/数据导出/i18n）+ 需求完整性审计、audit 审阅证据册（347 项）、docs 07/08 质量与部署文档、ADR-0001..0030、ops 基线/修复/备份恢复工具、test-reports 证据、scripts 工具（req-completeness-check、verify 增强）、e2e global-setup、.deploy-gate-approved、.gitignore（__pycache__）共 **617 文件（+113324/−1355）**。

## 7. 整体结论

**`ready`（R2 修复后 + R3 测试增强 + #17/#26 收口复验）**：代码门禁全绿（install/typecheck/lint/API 1337/web-console 46/build 4 端/E2E 37）；verify **R1 16/17 → R2 17/17 → R3 17/17**（chat 真实上游 wanwu 可用、计费精确）。修复为本地渠道数据（补 `vendor_pricing` id=4128 定价 ¥0.004/¥0.012 + 修正 supplier_model 2317 `platform_model`），已留痕 §4 并登记 open-issues #27（关闭）。**测试增强（#27 遗留建议一并处理）**：`scripts/test-integration.cjs` 第 8 项注释修正为 wanwu；`e2e/tests/fullflow.spec.ts` ③ 补 `mock !== true` 断言——全量 E2E R4 37/37 全绿（含真实上游 fullflow ③）。**#17/#26 收口（三次收口）**：#17 独立全新库迁移演练（drizzle 0000–0016 + manual 0017–0036，幂等重跑全 skip，库已清理）；#26 前端 paid/dispute 按钮后端缺口收口（迁移 0037 + paid/dispute 端点 + 操作级 2FA + 状态机 + 前端 `.items` 契约对齐）——API 全量 **92 文件/1337 测试全绿**、E2E R5 **37/37**。剩余非阻断项：T-04 长线项（Redis 分布式锁/异步补偿/outbox/外部账单导入/跨系统对账/正式结算周期）。

## 8. 日志文件清单

`00-git-baseline.txt`、`01-pnpm-install.log`、`01-lockfile-digest.txt`、`02-pnpm-typecheck.log`、`03-pnpm-lint.log`、`04-api-test.log`、`05-webconsole-test.log`、`06-pnpm-build.log`、`06b-build-artifacts.txt`、`08-api-server.log`、`09-portal-server.log`、`10-e2e-test.log`（R1 37/37）、`10-e2e-test-r4.log`（R4 37/37）、`10-e2e-test-r5.log`（R5 37/37）、`11-verify.log`（R1 16/17）、`11-verify-r2.log`（R2 17/17）、`12-migration-drill-drizzle.log`、`12-migration-drill-manual.log`、`12-migration-drill-idempotent.log`（#17 全新库演练）、`13-api-test-r5.log`（首轮 1337/1337 含 5 例 status 断言待更新）、`13-api-test-r5b.log`（最终 1337/1337）、`REPORT.md`
