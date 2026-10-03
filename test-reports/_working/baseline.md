# 3Cloud monorepo 全量基线回归取证（既有套件取证）

> 性质：既有测试与构建的 **基线取证**。本环节只运行与记录，不新增测试、不修改任何源代码；本文件为唯一写入物。
> 生成时间（本机）：2026-10-03（Asia/Shanghai, UTC+8）
> 仓库根：`C:\Users\ZH\.openclaw\workspace\3cloud`（pnpm monorepo，分支 main）

---

## 1. 环境信息

| 项 | 值 |
|---|---|
| 操作系统 / Shell | Windows，PowerShell 5.1（Bash 不可用，全程经 PowerShell 执行） |
| Node.js | v22.23.2 |
| pnpm | 11.22.0 |
| PostgreSQL 5432 | 可达（TcpTestSucceeded = True） |
| Redis 6379 | 可达（TcpTestSucceeded = True） |
| 工作目录 | 仓库根 `C:\Users\ZH\.openclaw\workspace\3cloud` |
| Git 状态 | 保持原样，未做任何 git 操作（commit/stash/restore/checkout/push 均未执行） |

说明：`@3cloud/shared` 在 vitest 中经别名 `packages/shared/src` 解析，故 api 单测不依赖 shared 构建产物；Step1 仍按要求先构建 shared。
所有 pnpm 命令日志中出现的 `node.exe : $ <script>` / `NativeCommandError` 行为 PowerShell 将原生命令 stderr 误判为错误流所致，**不代表命令失败**；真实结果以 `$LASTEXITCODE` 为准。

---

## 2. 逐命令取证

### Step 1 — `pnpm --filter @3cloud/shared build`

| 项 | 值 |
|---|---|
| 命令原文 | `pnpm --filter @3cloud/shared build` |
| 退出码 | **0** |
| 耗时 | 1.24 s（wall，含 pnpm 启动） |
| 关键统计 | 内部执行 `tsc`，无报错、无输出诊断；构建成功 |
| 分类 | 通过（PASS） |
| 因果诊断 | 无。`@3cloud/shared` 类型检查/构建干净通过 |

---

### Step 2 — `pnpm --filter @3cloud/api test`（= `vitest run`）

| 项 | 值 |
|---|---|
| 命令原文 | `pnpm --filter @3cloud/api test` |
| 退出码 | **0** |
| 耗时 | 135.33 s（wall）；vitest 自报 Duration = 129.63 s（transform 16.63s / collect 313.19s / tests 405.89s / prepare 51.82s） |
| 关键统计 | **Test Files：102 passed (102)**；**Tests：1484 passed (1484)**；Start at 04:42:53 |
| 分类 | 通过（PASS） |
| 因果诊断 | 无失败。日志中大量 `[budget] check failed ... fail-open`、`[pre-consume] freeze failed ... fallback to bypass`、`connection refused`、`[Pipeline] Rollback failed` 等均为 **用例内部故意触发的降级/失败注入路径的 console 输出**，对应断言全部通过，非测试失败。 |

> 关于品牌改名（3Cloud→浩寅云）预期风险：本次 1484/1484 全绿，**未出现**任何因 `3Cloud` 文案断言导致的失败。

#### vitest 失败清单

无。Test Files 失败 0、Tests 失败 0。

---

### Step 3 — `pnpm --filter @3cloud/api typecheck`（= `tsc --noEmit`）

| 项 | 值 |
|---|---|
| 命令原文 | `pnpm --filter @3cloud/api typecheck` |
| 退出码 | **0** |
| 耗时 | 21.08 s |
| 关键统计 | `tsc --noEmit` 无类型错误输出 |
| 分类 | 通过（PASS） |
| 因果诊断 | 无。api 包类型检查干净通过 |

---

### Step 4 — `pnpm --filter @3cloud/api lint`（= `eslint src/`）

| 项 | 值 |
|---|---|
| 命令原文 | `pnpm --filter @3cloud/api lint` |
| 退出码 | **1** |
| 耗时 | 40.47 s |
| 关键统计 | `✖ 5 problems (5 errors, 0 warnings)`，全部为 `@typescript-eslint/no-unused-vars` |
| 分类 | **失败 — 静态质量门（lint）红**。根因位于当前 WIP 源码；按基线取证纪律（不改任何代码）只记录不修复。 |
| 因果诊断（首条错误摘录） | `api/src/routes/me-agent.ts  21:19  error  'or' is defined but never used  @typescript-eslint/no-unused-vars`；末尾 `[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @3cloud/api@0.1.0 lint: Exit status 1` |

5 个未通过项（文件:行:列 — 信息）：

| # | 文件:行:列 | 规则 | 说明 | 归属 |
|---|---|---|---|---|
| 1 | `api/src/routes/me-agent.ts:21:19` | no-unused-vars | `'or'` 定义未使用 | 生产源码 |
| 2 | `api/src/routes/me-crm.test.ts:53:7` | no-unused-vars | `'now'` 赋值未使用 | **测试文件** |
| 3 | `api/src/services/pipeline/steps/proxy.ts:161:16` | no-unused-vars | `'networkErr'` 定义未使用 | 生产源码 |
| 4 | `api/src/services/upstream/routing.ts:19:30` | no-unused-vars | `'sql'` 定义未使用 | 生产源码 |
| 5 | `api/src/services/upstream/routing.ts:20:10` | no-unused-vars | `'selectKey'` 定义未使用 | 生产源码 |

> 说明：按任务允许范围本可仅修改测试文件（#2），但本任务为“既有套件基线取证”，且明确“不写任何新测试、不改任何代码 / 唯一写入物为证据报告”，故**保留现状、不做任何修复**，以忠实记录基线。4/5 位于生产源码，本就超出可修复范围。

---

### Step 5 — `pnpm --filter web-console build`（= `vite build`）

| 项 | 值 |
|---|---|
| 命令原文 | `pnpm --filter web-console build` |
| 退出码 | **0** |
| 耗时 | 6.2 s（wall）；vite 自报 built in 5.31 s |
| 关键统计 | vite v6.4.3，357 modules transformed；产物 `dist/index.html 0.43 kB`、`assets/index-*.css 70.82 kB`、`assets/index-*.js 1,948.03 kB（gzip 493.22 kB）` |
| 分类 | 通过（PASS，仅非阻断警告） |
| 因果诊断 | 无失败。警告：`Some chunks are larger than 500 kB after minification`（建议 code-split/manualChunks），属提示性，不阻断构建。 |

---

### Step 6 — `pnpm --filter web-portal build`（= `next build`）

| 项 | 值 |
|---|---|
| 命令原文 | `pnpm --filter web-portal build` |
| 退出码 | **0** |
| 耗时 | 23.27 s（wall）；Next 自报 Compiled successfully in 3.0s |
| 关键统计 | Next.js 15.5.23；`Skipping linting`；类型检查通过；静态页 `Generating static pages (14/14)`；共享 First Load JS 102 kB；Middleware 34.1 kB。路由含 `/`、`/about`、`/blog`、`/docs`、`/models`、`/pricing`、`/status`、`/vendor/dashboard`、`/vendor/login`、`/vendor/settlements` 等 16 条 |
| 分类 | 通过（PASS） |
| 因果诊断 | 无失败。 |

---

### Step 7 — `node scripts/req-completeness-check.cjs`（信息性附加命令）

| 项 | 值 |
|---|---|
| 命令原文 | `node scripts/req-completeness-check.cjs` |
| 退出码 | **1** |
| 耗时 | 0.25 s |
| 关键统计 | 扫描 docs 共 **443 文件 / 2658 项检查 / 919 FAIL**；**GRADE = C** |
| 分类 | 信息性（文档治理门，确定性红）。非代码/环境缺陷——脚本运行正常，按其规则如实判定 docs 目录尚未达到“可开发”准入。 |
| 因果诊断（首条/结论摘录） | 结论行：`GRADE=C  (443 files, 2658 checks, 919 FAIL)`；`有任一 FAIL → 该目录不满足'可开发'准入，按 completeness-checklist.md 逐项关闭。` 失败多为：`F2 状态=draft`、`F5 ID+版本 — ID:false 版本:false`、`F3 无空壳占位 — 命中:待补充/待核验/TBD/待迁移` 等文档规范问题。 |

> 该命令与需求完整性相关，按要求作为信息项记录；不视为构建/测试失败，亦不做绕过。

---

## 3. 总体基线结论表

| 步骤 | 命令 | 退出码 | 耗时 | 关键统计 | 分类 | 结论 |
|---|---|---|---|---|---|---|
| 1 | `pnpm --filter @3cloud/shared build` | 0 | 1.24 s | tsc 无报错 | 通过 | ✅ 绿 |
| 2 | `pnpm --filter @3cloud/api test` | 0 | 135.33 s | Test Files 102/102；Tests 1484/1484 通过 | 通过 | ✅ 绿 |
| 3 | `pnpm --filter @3cloud/api typecheck` | 0 | 21.08 s | tsc --noEmit 无类型错误 | 通过 | ✅ 绿 |
| 4 | `pnpm --filter @3cloud/api lint` | **1** | 40.47 s | 5 errors / 0 warnings（全 no-unused-vars） | 失败（静态质量门红，根因在 WIP 源码） | ❌ 红 |
| 5 | `pnpm --filter web-console build` | 0 | 6.2 s | vite 357 模块，built 5.31s（chunk>500kB 警告） | 通过 | ✅ 绿 |
| 6 | `pnpm --filter web-portal build` | 0 | 23.27 s | Next 15.5.23，14 静态页，编译 3.0s | 通过 | ✅ 绿 |
| 7 | `node scripts/req-completeness-check.cjs` | **1** | 0.25 s | 443 文件 / 2658 检查 / 919 FAIL，GRADE=C | 信息性（文档治理门红） | ⚠️ 信息 |

### 基线判读

- **测试/类型/构建主干全绿**：shared 构建、api 单测（102 文件 / 1484 用例全通过）、api typecheck、web-console 构建、web-portal 构建均退出码 0。
- **两处退出码 1**：
  - Step4 lint：5 个 `no-unused-vars`，4 处在生产源码（`me-agent.ts`、`proxy.ts`、`routing.ts`），1 处在测试文件（`me-crm.test.ts`）。当前仓库含大量未提交 WIP（新路由/服务/迁移 0042-0048），属新增代码未收尾；按基线纪律未修复。
  - Step7 需求完整性脚本：文档治理门判定 docs 目录 GRADE=C（919 项 FAIL，多为 draft 状态/缺 ID+版本/占位词），信息性记录。
- **未触发 environment_block / not_discovered / flaky**：PG/Redis 均可达；vitest 真实发现并执行 102 文件、1484 用例（非 0，排除 not_discovered）；无外部凭据缺失导致的用例失败；结果确定性、无偶发。

---

## 4. 原始日志落盘位置

本目录 `test-reports\_working\` 下另存：
`step1.log/.result`、`step2.log/.result`、`step3.log/.result`、`step4.log/.result`、`step5.log/.result`、`step6.log/.result`、`step7.log/.result`（`.result` 仅含 `exit=<code> elapsed_s=<秒>`）。

---

## 5. 终验确认（阶段2补测后 · 全量回归唯一权威终验）

> 阶段 2 已补 11 条缺口（G1–G11）。本节为回归最后一遍收口数字，之后不再重跑。build（shared/console/portal）与 reqcheck 自基线后无生产代码改动，维持基线结论，按要求不重跑。

| 命令 | 退出码 | 统计 | 备注 |
|---|---|---|---|
| `pnpm --filter @3cloud/api test` | 0 | Test Files **106 passed (106)**；Tests **1513 passed (1513)**；vitest Duration 103.76s（wall 104.94s） | 全绿、无失败用例。较基线（102 文件/1484 用例）净增 4 文件 / 29 用例 |
| `pnpm --filter @3cloud/api typecheck` | 0 | tsc --noEmit 无类型错误（耗时 14.04s） | 通过 |
| `pnpm --filter @3cloud/api lint` | 1 | `✖ 4 problems (4 errors, 0 warnings)`，全为 `@typescript-eslint/no-unused-vars`（耗时 6.55s） | 仍红，但错误数由基线 5 → 4；`me-crm.test.ts:53` 的 `'now'` 已随补测修复，测试文件侧已清零 |

### lint 剩余 4 处（全部为生产源码，记录待后续清理）

| # | 文件:行:列 | 规则/信息 |
|---|---|---|
| 1 | `api/src/routes/me-agent.ts:21:19` | `'or'` defined but never used |
| 2 | `api/src/services/pipeline/steps/proxy.ts:161:16` | `'networkErr'` defined but never used |
| 3 | `api/src/services/upstream/routing.ts:19:30` | `'sql'` defined but never used |
| 4 | `api/src/services/upstream/routing.ts:20:10` | `'selectKey'` defined but never used |

### 终验结论

- 单测全绿：**106 文件 / 1513 用例全部通过，exit 0**；typecheck exit 0。
- lint 仍 exit 1，但仅剩 4 处生产源码未使用变量（测试文件侧已清零）；属待清理 WIP，不阻断本次回归收口。
- 本终验数字为全量回归的唯一权威结果。
