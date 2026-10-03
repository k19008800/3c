# Playwright E2E 全量回归取证报告

- 仓库：`C:\Users\ZH\.openclaw\workspace\3cloud`
- 套件目录：`e2e`（独立 package，`@playwright/test ^1.62.1`，`scripts.test = playwright test`）
- 执行时间：2026-10-03（Asia/Shanghai, UTC+8）
- 运行 project：`msedge`（channel: "msedge"，复用系统 Edge，headless，未下载任何浏览器）
- 报告人：自动化回归取证

## 一、环境核验

| 项 | 结果 | 证据 |
|---|---|---|
| 系统 Edge | 存在 | `Test-Path 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' = True`；注册表 `HKLM\...\App Paths\msedge.exe` 指向该路径。x64 路径不存在。 |
| Playwright 浏览器缓存 | 未使用 | `%LOCALAPPDATA%\ms-playwright` 不存在；全程 `CI` 未置 true，触发本地 `msedge` project，未走 chromium-ci、未下载浏览器。 |
| PostgreSQL :5432 | 监听中 | `TcpTestSucceeded = True`（既有服务，非本次启动）。 |
| Redis :6379 | 监听中 | `TcpTestSucceeded = True`（既有服务，非本次启动）。 |
| API :3000（启动前） | 未监听 | `False`。 |
| Portal :5177（启动前） | 未监听 | `False`。 |

### DB 种子核验（global-setup 前置）

- `e2e/global-setup.cjs` 逻辑：读 `api/.env` 的 `DATABASE_URL`，查 `users` 是否存在 `admin@3cloud.dev`，不存在则抛错；存在则为其写入操作级 2FA（`user_2fa.totp_enabled=true`，密钥 RFC6238 测试值）。
- 实测（独立只读脚本，连 `api/node_modules/postgres`）：`admin rows: [{"id":58,"email":"admin@3cloud.dev"}]`。
- 结论：admin 已存在，**未执行 `pnpm db:seed`**（幂等前置已满足，按纪律不改库）。
- globalSetup 实跑输出：`[e2e setup] operation 2FA ready for admin@3cloud.dev`。

## 二、服务栈启停记录

| 阶段 | 时间 | 记录 |
|---|---|---|
| 启动 | 04:42:49 | 仓库根 `Start-Process cmd /c "pnpm dev > logs\dev.log 2>&1"`，**根 PID = 22500**（cmd.exe）。`dev = pnpm --parallel --filter @3cloud/api --filter web-portal dev`，predev 跑 `scripts/prepare-app.cjs`。 |
| 就绪 | 04:43:58 | 轮询 ~69s 后 `:3000 = True`、`:5177 = True`。日志：`web-portal dev: ✓ Ready in 38.2s`；api(tsx watch src/index.ts, PID 10920) 各 Worker 已起。 |
| HTTP 冒烟 | — | `GET http://localhost:5177/app/` → 308（正常重定向，Playwright 跟随）；`GET http://localhost:3000/` → 404（API 无 `/` 路由，正常）。 |
| 停止 | 回归后 | `taskkill /PID 22500 /T /F`，整树 12 个进程全部 SUCCESS 终止。 |

停止前已确认进程树归属（均为本次启动）：
`22500(cmd) → 11060(pnpm dev) → 6176(cmd parallel) → 15784(pnpm --parallel) → {13552(cmd tsx)→19380(node tsx)→10920/20476, 10004(cmd next)→22096(node next)} → esbuild 19112`。

停止后复核：`:3000 = False`、`:5177 = False`；`11060/15784/19380/22096/10920/20476/19112` 均已不存在。**PostgreSQL/Redis 为既有服务，未终止。**

## 三、命令块

| 命令 | 工作目录 | 退出码 | 统计 | 分类 | 诊断 |
|---|---|---|---|---|---|
| `pnpm test`（= `playwright test`） | `e2e` | **1** | Running 37 tests / 4 workers；**33 passed, 2 failed, 2 did not run**（耗时 1.8m） | 见下 | 2 失败均已定位根因，非 flaky、非 not_discovered。 |

> 说明：PowerShell 将 pnpm.ps1 的 stderr 头打印为 "NativeCommandError"（即 `node.exe : $ playwright test`），属 pnpm 包装层的正常 stderr 回显，不影响退出码判定；真实退出码取自 `$LASTEXITCODE = 1` 与日志末尾 `[ELIFECYCLE] Test failed`。

## 四、失败清单（逐条分类 + 因果诊断）

### 失败 1 — `tests/fullflow.spec.ts:109` › ③ 普通用户：余额到账 ¥510 → 建 Key → 真实调度 → 消费核对

- **断言点**：`expect(chat.status()).toBe(200)` → Expected 200 / **Received 404**（spec 第 153 行）。
- **请求**：`request.post("/v1/chat/completions")`，`Authorization: Bearer <新建 3c_ Key>`，`model: "DeepSeek-V4-Flash-0731"`，`stream:false`。
- **网关实证（dev.log）**：请求确实到达 api，`"url": "/v1/chat/completions"`、`model: "DeepSeek-V4-Flash-0731"`，随后：
  - `error: "model_code_not_found"`
  - `"statusCode": 404`
- **分类：`environment_block`（前置数据缺失）**。
- **因果诊断**：①对公下单、②管理员审核入账、③余额到账、创建 API Key（3c_ 前缀）均通过；唯一失败在「真实上游调度」。代码中该模型对应本地真实验收渠道 wanwu（万物有道 `http://47.110.226.233:8072`）。网关对未在本地 catalog/渠道表注册的 `model_code` 正确返回 `model_code_not_found`(404)——即**当前本地库未配置该上游渠道/模型映射**，属上游数据前置未满足，非产品代码回归、非 flaky、非环境（Edge/端口）问题。
- **处置**：按纪律不硬改测试断言、不改 `playwright.config.ts`、不绕过（该断言含「防 mock 回退」设计 #27，改绿即失真）。需在本地库配置 wanwu 渠道并映射 `DeepSeek-V4-Flash-0731` 后该用例方可通过。
- **证据附件**：`e2e/test-results/fullflow-...真实调度-...-msedge/{test-failed-1.png, error-context.md, trace.zip}`。

### 失败 2 — `tests/user-features.spec.ts:74` › 用户端功能逐页渲染 › 渠道选择 (`/vendor-selector`)

- **断言点**：`if (!matched) throw`（spec 第 112 行），markers = `["渠道","供应商","价格"]`。
- **页面实证（error-context snapshot）**：导航到 `/app/vendor-selector` 后，`<main>` 实际渲染的是**控制台首页**——heading「控制台」、`账户余额 ¥1,000.00`、本月消费/今日调用卡片、模型 Token 消耗曲线、最近消费表格。左侧导航**无「渠道选择」入口**。`errors=[]`，未落入 Portal 首页、未落入 Next 404、页面非空白。
- **分类：`test_failure`（枚举了当前产品未挂载的 SPA 路由）**；备注：若「渠道选择」是**规划中/应存在**的功能，则应改判 `behavior_failure`（路由缺失/未注册）。
- **因果诊断**：`PAGES` 列表含 `{ name:"渠道选择", route:"/vendor-selector", markers:["渠道","供应商","价格"] }`，但当前 web-console 构建未注册该路由，未知路由被 SPA 回退到 `/`（控制台首页），故 markers 全部匹配不到。这是测试清单与产品路由不一致，而非页面渲染崩溃。
- **处置**：未擅自删除该用例（删除覆盖属产品范围判断，需 owner 确认）。建议二选一：① 若该页已下线/更名，从 `PAGES` 移除该条目；② 若属应交付功能，则补实现 `/app/vendor-selector` 路由与「渠道/供应商/价格」内容。
- **证据附件**：`e2e/test-results/user-features-...vendor-selector-...-msedge/{test-failed-1.png, error-context.md, trace.zip}`；全页截图 `test-reports/evidence/user-_vendor-selector.png`。

### 连带跳过（did not run = 2）

- `tests/fullflow.spec.ts:166` › ④ 后台管理员：财务工作台 + 消费追踪
- `tests/fullflow.spec.ts:180` › ⑤ 代理商：代理工作台
- 原因：二者与 ③ 同属一个 describe 且在 ③ 之后，③ 失败导致串行后续用例被跳过（标记 `-`）。属失败 1 的级联，非独立缺陷。

### 非致命告警（不计失败）

- 仪表盘 `[console.error] Failed to load resource ... 404`；安全中心 SVG `<path>` console error；账号注销资源 404 —— 均被 `[warn]` 记录，未触发断言。
- dev.log：`[alert-engine] 启动评估失败: 关系 "monitoring_rules" 不存在` —— app 启动期告警，不阻塞本次套件。

## 五、修正轮次

本次未对 `e2e` 测试或 `playwright.config.ts` 做任何修改：
- 失败 1 为 `environment_block`（上游渠道数据缺失），按纪律如实记录、不绕过。
- 失败 2 的修复涉及「删除覆盖 vs 补实现」的产品范围判断，需 owner 确认后再动，未越权改测试。
- 未触及生产代码、未改部署配置、未下载浏览器、无 git 操作。

## 六、结论

- 套件退出码 **1**；**33 passed / 2 failed / 2 skipped(cascade)**，共 37。
- 失败 1（真实调度 404 `model_code_not_found`）= `environment_block`，根因是本地库缺 wanwu 渠道/模型映射，补齐上游数据即可转绿。
- 失败 2（`/vendor-selector` 无匹配内容）= `test_failure`（当前产品未挂载该路由，回退控制台首页），需 owner 确认是清理测试清单还是补实现该页。
- 服务栈已整树终止，:3000/:5177 已释放，无自启进程残留；统计与 `e2e.log` 输出一致。
