# 发布基线与真实执行记录审查报告（review-agent 交付）

- 文档 ID：REVIEW-BASELINE-AUDIT-2026-09
- 状态：review
- 审查时间：2026-09（本报告现场核查）
- 审查人：review-agent（子代理，只读审查，未改代码）
- 范围：`kb/3cloud/*` 选型/规范/迁移/计划 ↔ `docs/07-quality-and-acceptance/*` ↔ `ops/baseline-2026-09-04/*` ↔ 真实 git 状态
- 证据目录：`ops/baseline-2026-09-04/`、`test-reports/finance-rerun-2026-08-31.txt`、`docs/00-index/open-issues.md`

> 结论摘要：**发布基线判定 `not_ready` 是正确且证据充分的**，但存在 3 处需更正的证据记录瑕疵（lint 计数差 1、工作区未提交数字与现场不符、finance-test-package §1.1 的“候选提交 SHA”与 release-baseline 的“未确定”互相矛盾）；同时发现 `verify` 集成命令在基线中**声明了范围但未执行**，属“未执行”项；#22 的修复方向判断与现场代码状态不一致（postbuild 修复已落入 build 脚本且 dist 已无无扩展名导入，但 issue 仍标 P0 未关闭，需裁决）。附建议补充文件清单。

---

## 一、命令-结果-证据映射（真实核对）

以下均基于 `ops/baseline-2026-09-04/` 内日志文件 + git 现场复核。

| # | 命令 | 基线记录结果 | 证据文件存在 | 现场复核 | 判定 |
|---|---|---|---|---|---|
| 1 | `pnpm install --frozen-lockfile` | ✅ 通过 5s | ✅ `01-pnpm-install.log` | 日志含 `exit_code: 0`；lockfile SHA 已留痕 | ✅ 真实执行 |
| 2 | `pnpm -r typecheck` | ✅ 3 包 0 错误 | ✅ `02-pnpm-typecheck.log` + `02b`（lint 修复后复验） | 两次均 exit 0 | ✅ 真实执行 |
| 3 | `pnpm -r lint` | ✅ 通过（先修 11 处 unused） | ✅ `03`(首轮失败)/`03b`(api 失败)/`03c`(通过) | **计数瑕疵**：03=web-console 3 处；03b=api **9 处**（`✖ 9 problems`），合计 12；REPORT §5 写“11 处 unused”“8 api”，与日志不符（少计 1） | ⚠️ 通过但记录需更正 |
| 4 | `pnpm --filter @3cloud/api test` | ⚠️ flaky：run1 1282/1282，run2/3 各 1 failed | ✅ `04/04b/04c` | 04 run1 1282 pass；04b/04c 各 `1 failed | 1281 passed`，同 A5 `expected 0.2 to be 0.1` | ⚠️ 复现确认，对应 ISSUE-23 |
| 5 | `pnpm --filter web-console test` | ✅ 46/46 | ✅ `05-webconsole-test.log` | 7 files / 46 passed / exit 0 | ✅ 真实执行 |
| 6 | `pnpm build` | ✅ 4 端构建过；但 dist 不可运行 | ✅ `06-pnpm-build.log` + `06b-build-artifacts.txt` | api tsc 有输出但无产物可运行性验证；`08-api-server.log` 报 `ERR_MODULE_NOT_FOUND ...dist/app` | ⚠️ “构建过”≠“产物可运行”，对应 ISSUE-22 |
| 7 | `cd e2e && pnpm test`（37 例） | ⚠️ 34 passed / 1 failed / 2 did not run | ✅ `10-e2e-test.log` | fullflow③ `expect ≥510，Received: 0`；级联跳 2 | ⚠️ 对应 ISSUE-24 |
| 7b | `fullflow.spec.ts` 隔离 | ✅ 5/5（含真实调度 total_tokens=79） | ✅ `10b` | 5 passed / exit 0 | ✅ 真实执行 |
| — | `pnpm verify`（= `node scripts/test-integration.cjs`） | **基线范围声明含 verify，但命令表中无此项执行日志** | ❌ 无 | 根 package.json 有 `verify`；基线未执行 | 🔴 **声明未执行** |

### 未执行 / 默认通过 项清单（重点）

1. **`pnpm verify`（集成验证，脚本 `scripts/test-integration.cjs`）**：release-baseline 「测试范围」显式列出 `verify`，development-plan 与 finance-test-package §1 也称其为正式闸门命令；但 2026-09-04 基线命令表中不存在、`ops/baseline-2026-09-04/*` 无对应日志。**属于“范围声明但未执行”，不得默认通过。**（历史 2eb5e73 提交信息提到“verify 17/17”，但那是一次性历史数字，ADR-0029 已明确不作为正式基线。）
2. **`db:migrate:manual` 独立全新库演练（0000–0032）**：open-issues #17 明示“待补独立全新库演练 + 真实备份恢复证据”。基线的 api 单测内 `manual-migrations-runner.test.ts`(5) 与 `backup-restore.test.ts`(3) 通过，**但这是 runner 的纯逻辑单测，不等价于孤立库恢复演练**；release-baseline 正确标为 `BLOCKED`。✅ 无“默认通过”问题。
3. **`[?]` 页面/按钮级帮助（AGENTS.md 全局红线）**：`req-completeness-check`（`test-reports/final-doccheck-07.txt`）显示 release-baseline / test-strategy / acceptance-criteria 等 **F4 缺按钮级对照表 FAIL**；finance-test-package §3.6 自述“UI 帮助…需另行补入执行记录，SPEC 已有对照表不替代 UI 实测”。**该项零真实 UI 证据。**（现场未发现可引用的 UI 实测输出。）
4. **五大资金主题 TEST ID**：finance-test-package 诚实标“已存在文件（待执行）/待新增/blocked”，且现场核对文件名与标注一致（11 个“已存在”文件确实在；5 个“待新增”文件确实不存在）。✅ 未把“文件存在”当“通过”。

---

## 二、失败项 ↔ issue/任务 覆盖核对

| 失败/阻塞 | 是否有 issue/登记 | 是否有修复方向 | 是否已闭环 |
|---|---|---|---|
| #22 API 生产 dist 不可运行 | ✅ open-issues #22（P0，部署阻断） | ✅ 提到 NodeNext/`.js`/rewriteRelativeImportExtensions | ⚠️ **现场状态与 issue 不符**（见下） |
| #23 API marketplace A5 flaky | ✅ #23（🟠，含根因与修复方向） | ✅ 改断言为确定性，禁止掩盖 | ❌ 未关闭（基线 run2/3 复现） |
| #24 E2E fullflow③ balance flake | ✅ #24（🟠，含根因与方向） | ✅ 加强等待/改 JSON 断言 | ❌ 未关闭（隔离跑通过，全量联跑不稳定） |
| 候选发布提交未定 | ✅ release-baseline 明确为头号阻塞，需发布/产品裁决 | ✅ §7 给了拆分思路 | ❌ 未定 |
| 退款/红冲、状态机、补偿/outbox、迁移恢复 | ✅ finance-test-package 逐 ID 标待新增/blocked；#15/#17 登记 | ✅ 有目标文件名 | ❌ 未完成 |

**覆盖结论**：所有真实失败项（#22/23/24）都有 roadmap+根因+修复方向且未虚报闭环；资金主题不通过项均按 ID 登记。失败项 → issue → 任务映射完整，未发现“失败但无登记”的情形。

---

## 三、候选发布提交判定（现场核对）

- 现场 HEAD：`feat/impersonation` @ `1dd732b1b60e18f6d9c6c32a88ae8343beb6c38b`（未变）；`main`=`origin/main`=`97928c6`。
- 现场 `git status --porcelain`：**376 行 = 259 modified + 117 untracked，0 staged**。
  - ⚠️ **与基线记录不符**：REPORT §2 称“git status --porcelain=372 行（418 modified + 573 untracked）”，release-baseline 称“418 modified + 573 untracked”。现场读数（259M+117??）与两者均不吻合，且 HEAD 未变——说明**基线快照之后工作区发生了显著变化**（部分文件可能已整改/还原/整理），或原计数口径不同（REPORT 自己写 372 行又写 418+573，内部也不自洽）。
- 判定含义不变：**仍无单一候选发布提交**；`97928c6`（main）是已提交的历史态，`1dd732b`+未提交改动才是当前可交付态，无法整体提交。**候选提交未定仍为头号阻塞**，且现场数字需在发布裁决前重跑一次 `git status` 复核。
- ⚠️ **文档互相矛盾**：finance-test-package §1.1 将 `97928c668e0fff...` 标为“候选提交 SHA”，而 release-baseline 结论为“候选提交未确定”。两者口径需统一（`97928c6` 只是 finance 重跑的登记提交，不承载当前可发布态）。

---

## 四、需要更正的证据记录瑕疵

1. **lint 计数**：首轮 3 + 次轮 **9** = 12 处 unused（REPORT §5 写 11、“8 api”）。建议按 `03/03b/03c` 日志实际数更正。
2. **工作区未提交计数**：基线记录 418 modified + 573 untracked 与现场 259+117 不符；建议发布裁决前重跑 `git status` 并以现场数为准，同时在 baseline REPORT 注明快照时点。
3. **#22 状态与 issue 不符（需裁决）**：现场 `api/package.json` 的 `build` 已改为 `tsc && node scripts/postbuild-fix-imports.mjs`（工作区未提交修改）；`api/dist/` 269 个 js 文件中**已无 `from './xxx'` 无扩展名相对导入**（我按正则抽样，dist/index.js 为 `from './app.js'`）。这意味着“用 postbuild 重写相对导入扩展名”的可运行性修复方向**已落到 build 脚本并产出带 `.js` 的 dist**，但：#22 仍标 P0 未关闭；REPORT/issue 的修复方向（NodeNext 非 postbuild 脚本）与已采用方案（postbuild 脚本）不一致。**需发布/产品+负责人裁决：当前 postbuild 修复是否接受为 #22 的实质关闭动作，并以 `node dist/index.js` + `/health` 为准补一次真实启动验证后关闭；若尚未验证则不关闭、保留部署禁令。**
4. **候选提交口径**：finance-test-package §1.1 vs release-baseline §候选发布提交 需统一措辞，`97928c6` 仅作为 finance 重跑登记 SHA。

---

## 五、审查结论

- **整体 `not_ready` 判定成立且证据充分**：2 项 flaky（#23/#24）+ #22 P0 + 候选提交未定 + `verify` 未执行 + 五资金主题缺迁移/恢复/补偿证据，任一即阻断 ready。
- **证据纪律较扎实**：并未把“文件存在/历史数字/单测通过”伪装成“真实通过”；finance-test-package 逐 ID 诚实标注是良好实践。
- **待人工/发布裁决的高优先级闭合动作**：
  1. 定夺 #22（是否接受 postbuild 修复并补真实启动验证关闭）；
  2. 定夺候选发布提交（裁决把“可发布源码”从 evidence/audit/docs/test-reports 分离并纳入明确提交）；
  3. 执行并留痕 `pnpm verify`，把结果补入 release-baseline 命令表；
  4. 更正 §四 三处记录瑕疵。

---

## 六、建议补充文件（供发布/产品/负责人参考，非本报告落实）

| # | 建议文件 | 用途/内容 |
|---|---|---|
| A | `docs/07-quality-and-acceptance/release-verify-evidence-2026-09.md` | 补 `pnpm verify`（`node scripts/test-integration.cjs`）真实执行记录：命令、时间、SHA、通过/失败/跳过数、原始输出路径。当前“范围声明但未执行”。 |
| B | `ops/baseline-2026-09-04/REPORT.md` 更正补记（或新增 `ERRATA.md`） | 修正 lint 12 处、git 未提交现场数（259+117）、#22 现场状态；记录快照时点。 |
| C | `docs/00-index/open-issues.md` #22 补充结论文档（`docs/09-decisions/ADR-issue22-dist-fix.md` 或 issue 内更新） | 裁决 postbuild 修复是否作为 P0 关闭动作，要求以 `node dist/index.js` + `/health` 200 真实启动为关闭证据；否则维持部署禁令。 |
| D | 五资金主题补充测试文件（按 finance-test-package“待新增”落实） | `api/test/migrations-finance.test.ts`、`refund-reversal.test.ts`、`refund-state-machine.test.ts`、`refund-permissions.test.ts`、`refund-contract.test.ts`、`refund-concurrency-compensation.test.ts`、`manual-topup-compensation.test.ts`、`reconciliation-compensation.test.ts`。 |
| E | 独立全新库迁移+备份恢复演练证据（大号 blocked） | 在隔离环境跑 `db:migrate:manual` 0000–0032 + `pg_dump/pg_restore` 恢复演练，出 stdout/SHA/时间留痕，回填 open-issues #17 与 release-baseline BLOCKED 字段。 |
| F | `report-evidence-map.md`（命令→结果→证据文件→issue 号） | 把 release-baseline 命令表与 `ops/baseline-*/` 日志、open-issues 号做可追溯映射，供快速复验（本次报告已内置其主要内容，可抽取为独立文件）。 |
| G | `[?]` UI 帮助实测证据 | 按 AGENTS.md 红线，为五大资金主题页面/按钮级 `[?]` 补源码+运行态截图清单；关闭 `final-doccheck-07/08` 的 F4 FAIL。 |