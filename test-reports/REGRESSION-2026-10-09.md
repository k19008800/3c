# 3Cloud 功能验证测试报告（单元测试与回归验证）REGRESSION-2026-10-09

**测试日期**：2026-10-09（Asia/Shanghai, UTC+8）
**测试范围**：api 全量单元测试（vitest）+ api typecheck + api lint + web-console 组件测试（vitest）+ e2e 回归套件（收口套件 / user-features / fullflow）
**基线对照**：`test-reports/REGRESSION-2026-10-03.md`（106 文件 / 1513 用例全绿）
**环境**：Windows / PowerShell；node v22.23.2（PATH，与基线一致）；pnpm 11.22.0；PostgreSQL :5432 可达；Redis :6379（**本次恢复后可达**）；Edge / Playwright project=`msedge`
**仓库根**：`C:\Users\ZH\.openclaw\workspace\3cloud`；分支 `main`
**git 基线**：自 10-03 回归报告提交 `4bbef25` 以来仅一个提交 `ff4a3c6`（纯新增 6 个 schema 定义文件，440 行，未接入 index、无生产逻辑改动）；工作区无生产代码变更

> 纪律说明：本次验证执行了 **0 次 git 操作**，未修改任何生产代码、配置、数据库或凭据；仅执行环境恢复动作（启动本地便携 Redis、临时启动 dev 栈并已停止）。

---

## 1. 验证命令总表

| # | 命令 | 退出码 | 统计 | 分类 | 诊断 / 备注 |
|---|---|---|---|---|---|
| 1 | `pnpm --filter @3cloud/api test`（vitest run，**首次**） | **1** | Test Files 16 failed / 90 passed (106)；Tests 101 failed / 1412 passed (1513) | 失败（**environment_block，非代码回归**） | 全部失败命中 Redis 依赖链路：`[pre-consume] freeze failed … Redis unavailable for balance locking`、`r.exists is not a function`、budget `fail-open` TypeError。根因：**Redis 未运行**（TCP 6379 CLOSED，进程/服务均不存在），与 10-03 基线（Redis 可达）环境漂移 |
| 2 | `pnpm --filter @3cloud/api typecheck`（= `tsc --noEmit`） | **0** | 无类型错误 | 通过 PASS | 覆盖 ff4a3c6 新增 6 个 schema 文件，类型干净 |
| 3 | `pnpm --filter @3cloud/api lint`（= `eslint src/`） | **1** | `✖ 4 problems (4 errors, 0 warnings)` | 失败（静态质量门，与基线一致） | 与 10-03 终验**完全一致**，无新增：`me-agent.ts:21 'or'`、`proxy.ts:161 'networkErr'`、`routing.ts:19 'sql'`、`routing.ts:20 'selectKey'`（全为生产源码 WIP 未用变量） |
| 4 | `pnpm --filter @3cloud/api test`（**Redis 恢复后重跑**） | **0** | Test Files **106 passed (106)**；Tests **1513 passed (1513)**（wall 128.01s） | 通过 PASS | **与 10-03 终验基线完全一致**；日志中 `[budget] check failed` / `[pre-consume] freeze failed` / failover 等均为用例内部故意注入的降级输出，断言全过 |
| 5 | `pnpm --filter web-console test`（vitest run） | **0** | Test Files **11 passed (11)**；Tests **68 passed (68)**（49.53s） | 通过 PASS | 组件/页面测试全绿 |
| 6 | `pnpm exec playwright test vendor-portal.spec.ts compliance-pages.spec.ts`（e2e/，**首次**） | **1** | 5 failed | 失败（**environment_block**） | 全部 `net::ERR_CONNECTION_REFUSED at localhost:5177` —— dev 栈（api@3000 + web-portal@5177）未启动；playwright.config 前置要求 `pnpm dev` 已启动 |
| 7 | `pnpm dev`（临时启动 dev 栈） | — | api@3000 + web-portal@5177 就绪 | 环境恢复 | 验证完成后已停止，端口已关闭（TCP 3000/5177 CLOSED） |
| 8 | 同 #6（**dev 栈就绪后重跑**） | **0** | **5 passed (5)**（25.0s） | 通过 PASS | G9×2 + G10×3 全绿，与 10-03 一致 |
| 9 | `pnpm exec playwright test user-features.spec.ts`（e2e/） | **0** | **23 passed (23)**（1.3m） | 通过 PASS | E2E-2（/vendor-selector 下线）保持关闭状态，与 10-03 收口一致 |
| 10 | `pnpm exec playwright test fullflow.spec.ts`（e2e/） | **1** | 2 passed / 1 failed / 2 skipped（19.8s） | 失败（**environment_block，与基线一致**） | ③ 真实调度仍 **502 UPSTREAM_ERROR**（Expected 200, Received 502）：上游 wanwu 渠道（keyId=192, base_url=http://47.110.226.233:8072）对 `DeepSeek-V4-Flash-0731` 仍不可用，10-03 遗留待运维项**未恢复**；①② 通过，④⑤ 级联 skipped。测试参数已修正（M-S-03R 编码）、断言未放宽，路由锁定正确 |

---

## 2. 环境处置记录（本次唯一干预，均为恢复而非修改）

| 项 | 处置 | 结果 |
|---|---|---|
| Redis 未运行（TCP 6379 CLOSED，进程/服务不存在） | 启动便携 Redis（`C:\Users\ZH\.redis-portable\redis-server.exe`，bind 127.0.0.1，默认 6379，`--save "" --appendonly no` 禁用持久化，无数据文件产生；`.env` REDIS_URL=redis://localhost:6379 无密码，完全匹配） | `redis-cli ping` → **PONG**；重跑 vitest 106/1513 全绿。验证后保留运行（测试基线依赖，与 10-03 环境一致），如需关闭可随时停止 |
| dev 栈未启动（e2e 前置要求） | 临时 `pnpm dev`（api@3000 + web-portal@5177） | 就绪后 e2e 通过；**验证完成后已停止**，3000/5177 已关闭，无残留进程 |
| Docker daemon 未运行 | 无需处置（本地便携 Redis 已满足连接需求） | — |

---

## 3. 缺陷与发现清单

| 编号 | 严重度 | 描述 | 证据 | 状态 |
|---|---|---|---|---|
| ENV-1 | 🟠 中（环境漂移） | Redis 未运行导致 16 文件 / 101 用例首次失败（pre-consume 冻结降级 bypass、rate-limit、budget fail-open、admin-manual-topup 等全为 Redis 链路）。启动便携 Redis 后全部恢复 | #1 首次 16F/101F → #4 重跑 106P/1513P，差异完全可归因于 Redis 可达性 | ✅ 已恢复（报告时 Redis 运行中） |
| ENV-2 | 🟠 中（环境漂移） | dev 栈未启动导致收口套件 5 用例首次全部 `ERR_CONNECTION_REFUSED`；启动 `pnpm dev` 后 5/5 通过 | #6 首次 5F → #8 重跑 5P | ✅ 已恢复（dev 栈验证后已停止） |
| E2E-1 | 🟠 中（environment_block，**10-03 遗留，未恢复**） | fullflow ③ 真实调度仍 502：上游 wanwu 渠道对 `DeepSeek-V4-Flash-0731` 不可用（复现 2 次，非抖动） | #10：Expected 200 Received 502；与 10-03 报告 §3 E2E-1 结论一致 | ⏳ 待运维核实上游 47.110.226.233:8072 / keyId=192 的可用性/额度/余额；恢复后自动转绿，断言未放宽 |
| LINT-1 | 🟢 低（技术债，**10-03 遗留**） | api lint 4 处生产源码未使用变量（`or`/`networkErr`/`sql`/`selectKey`） | #3：`✖ 4 problems (4 errors)`，与 10-03 终验逐项一致，无新增 | ⏳ 待 WIP 收尾时清理；不阻断功能验证收口 |
| FIND-3' | 🟢 低（副作用说明） | user-features 套件按仓库惯例覆写已跟踪的 `test-reports/evidence/*.png`（本次 3 张：user-_billing / user-_real-name / user-_security） | git status `M test-reports/evidence/…` | 既有套件自带行为，非越权，未还原（与 10-03 FIND-3 一致） |

---

## 4. 结论

- **无代码回归**：自 10-03 回归后唯一提交 `ff4a3c6`（纯 schema 定义新增）未破坏任何测试。api 单测 **106 文件 / 1513 用例全绿（exit 0）**，与基线完全一致；typecheck exit 0；web-console 组件测试 11 文件 / 68 用例全绿；e2e 收口套件 5/5、user-features 23/23 全绿。
- **两项环境漂移已定位并恢复**：Redis 未运行（启动便携 Redis，全量测试从 101 失败恢复为 0 失败）、dev 栈未启动（临时启动后 e2e 通过并已停止）。**未修改任何代码、配置、DB、凭据**。
- **两项遗留红（与 10-03 一致，非本次引入）**：lint 4 处生产未用变量（技术债）；fullflow ③ 上游 wanwu 渠道 502（environment_block，待运维）。
- **过程纪律**：0 次 git 操作；无生产代码/配置/DB/密钥改动；Redis 保留运行（测试基线依赖）；dev 栈已停止无残留。

## 5. 剩余待办（与 10-03 一致的延续项）

1. ⏳ 运维核实上游 wanwu 渠道（keyId=192）可用性 → fullflow ③ 自动转绿；
2. ⏳ 清理 api lint 4 处生产未用变量（WIP 收尾）；
3. 💡 提示：复跑 e2e 前需 `pnpm dev` 启动服务栈；复跑 api 单测需 Redis 运行（当前已运行中）。

---

*本报告全部数字交叉自本次实际运行日志（`$env:TEMP\3cloud-*.log` 与 vitest/playwright 输出），与 10-03 基线报告逐项比对，未做推断。*
