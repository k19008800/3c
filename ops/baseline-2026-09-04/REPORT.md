# 3cloud 真实发布基线 — 首轮执行报告（2026-09-04）

- 文档 ID：BASELINE-EVIDENCE-2026-09-04
- 状态：证据留档（结论 `not_ready`）
- 证据目录：`ops/baseline-2026-09-04/`
- 关联：`docs/07-quality-and-acceptance/release-baseline.md`、`docs/00-index/open-issues.md` #22–24

## 1. 执行环境
- Node `v24.18.0` / pnpm `11.22.0` / vitest `3.2.7` / Windows 10（MS 10.0.26200）
- PostgreSQL 17.10 @ `threecloud_v3`（5432，服务 Running）；Redis 7-alpine @ 6379（docker Up）
- E2E 栈实测：API `:3000`（tsx 启动，`/health`、`/api/v1/health` 200），Portal `:5177`（`/`、`/app`、`/app/index.html` 200）；admin/demo/verify-user 登录 200

## 2. Git / 依赖基线
- HEAD `1dd732b1b60e18f6d9c6c32a88ae8343beb6c38b` @ `feat/impersonation`；`main`=origin=`97928c6`
- 工作区：`git status --porcelain` = 372 行（418 modified tracked + 573 untracked），0 staged → **无单一候选发布提交**
- `pnpm-lock.yaml` SHA-256 `F94CC2196875316C4563C338A0622CBCC85CC2D13BCF940A93D0B94A9FF00535`
- `api/.env` SHA-256 `38697701DCC6F9D883AA6C7ECCC818AF50AF6639D2D8CC28E92AD7BEA009565C`（`postgres:postgres@localhost:5432/threecloud_v3`）

## 3. 命令真实结果
| 命令 | 结果 | 失败证据 |
|---|---|---|
| `pnpm install --frozen-lockfile` | ✅ 通过（Lockfile up to date，5s） | — |
| `pnpm -r typecheck` | ✅ 通过（api/web-console/web-portal，0 错） | — |
| `pnpm -r lint` | ✅ 通过 | 首次 11 错误，已全部修复（见 §5） |
| `pnpm --filter @3cloud/api test` | ⚠️ run1 1282/1282；run2/3 1281/1282 | ISSUE-23（marketplace A5 flaky） |
| `pnpm --filter web-console test` | ✅ 46/46 | — |
| `pnpm build` | ✅ 4 端构建通过 | ISSUE-22（dist 不可运行） |
| `cd e2e && pnpm test`（37 例） | ⚠️ 34 passed / 1 failed / 2 did not run | ISSUE-24（fullflow③ flake） |
| `fullflow.spec.ts` 隔离 | ✅ 5/5（真实调度 total_tokens=79） | — |

## 4. 命令日志文件
- `00-git-baseline.txt`、`01-pnpm-install.log`、`01-lockfile-digest.txt`、`02-pnpm-typecheck.log`（`02b-…` 复验）
- `03-pnpm-lint.log`（首轮失败）`03b/03c-…`（修复后通过）、`04-api-test.log`（run1）`04b/04c-…`（run2/3）
- `05-webconsole-test.log`、`06-pnpm-build.log`、`06b-build-artifacts.txt`、`07-prepare-app.log`
- `08b-api-server.tsx.log`、`09-portal-server.log`、`10-e2e-test.log`、`10b-e2e-fullflow-isolated.log`

## 5. 本次修复（unused 变量，11 处，lint 收口）
- web-console：`AdminCustomerDetailPage.test.tsx`（toastSpies）、`AdminDataExportGrantPage.tsx`（ps）、`auth.impersonate.test.ts`（err）
- api：`admin-affiliate-coupons.ts`（page）、`admin-competitive.ts`（ilike/or）、`admin-finance-stats.ts`（operatorId）、`agent-console.test.ts`（eq）、`agent-console.ts`（total/totalRows 死查询）、`me-gap.ts`（AppError）、`me-onboarding.ts`（current）、`me-recharge-endpoints.test.ts`（eq）

## 6. 打开项 / 阻塞（详见 open-issues #22–24）
- #22 🔴 API 生产构建不可运行（部署阻断）
- #23 🟠 API marketplace A5 非确定性 flaky
- #24 🟠 E2E fullflow③ balance 渲染 flake
- 候选发布提交未定（工作区 418 modified + 573 untracked 未提交）

## 7. 工作区组成分析（候选提交判定的依据）
未提交内容按二级路径归类（`git ls-files --others` 573 项）：
- **audit/** ≈ 302 项（`01-requirements` 88、`02-pages` 164、`03-logic` 19、`08-deployment` 8、其余报告/脚本）：审阅与证据册，非可发布应用源码。
- **docs/** ≈ 上百项（`09-decisions` 30、`06/05/08/07/02/03` 等各若干，含 PRD/SPEC/状态机/审计）：需求与审计文档。
- **test-reports/**（evidence + 最终检查）：测试留痕。
- **e2e/test-reports/** 25 项：E2E 产物。
- **application 源码（真实可发布）**：`api/src` 25、`web-console/src` 10、`api/test` 5、`e2e/tests` 2、`api/scripts` 2、`api/lib` 1 —— 明显更小，但含新路由（admin-affiliate-coupons、admin-competitive、agent-console、me-onboarding…）、新测试（backup-restore、manual-migrations-runner…）。
- 另有 **418 modified tracked** 横跨 api/docs/e2e/web-console/web-portal/deploy。

**判定含义**：候选发布提交 = 可交付应用源码改动，但当前 418+573 中混杂证据/审阅/docs 与源码且全部未提交，无法无差别整体提交。需发布/产品裁决把"可发布源码"从"evidence/audit/docs/test-reports"中分离并纳入一组明确提交后复验，方存在可发布候选提交；否则**无候选提交**。此判定需人工/发布裁决，非本环境可单方定夺。

## 8. 结论
真实首轮基线已执行并留痕；整体 `not_ready`。历史 1159/1132/808/792/685/463 等数字不作为本次证据。