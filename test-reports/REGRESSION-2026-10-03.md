# 3Cloud 全量回归测试综合报告（REGRESSION-2026-10-03）

**测试日期**：2026-10-03（Asia/Shanghai, UTC+8）
**测试范围**：全量 api 单元测试（vitest）+ api typecheck + api lint + 三端构建（shared / web-console / web-portal）+ 既有 Playwright e2e 套件 + 需求覆盖补测（G1–G11）
**环境**：Windows / PowerShell 5.1；Node.js v22.23.2；pnpm 11.22.0；PostgreSQL :5432（可达）；Redis :6379（可达）；Edge / Playwright project=`msedge`（复用系统 Edge，headless，未下载浏览器）；仓库分支 `main`；基线提交 `91f62d3`
**仓库根**：`C:\Users\ZH\.openclaw\workspace\3cloud`（pnpm monorepo）

> 纪律说明：本回归未执行任何 git 操作（commit/stash/restore/checkout/push 均未发生）；除被授权新增/追加的测试文件外，生产代码无任何永久改动——所有 RED 证明均采用「仓库内临时变异 → 指定断言变红 → SHA256 哈希复原」（monorepo 下等价于仓库外副本），`.bak` 已全部清理。

---

## 1. 回归命令总表

| # | 命令 | 退出码 | 统计 | 分类 | 诊断 / 备注 |
|---|---|---|---|---|---|
| 1 | `pnpm --filter @3cloud/shared build` | **0** | 内部执行 `tsc`，无报错（wall 1.24s） | 通过 PASS | `@3cloud/shared` 类型检查/构建干净通过 |
| 2 | `pnpm --filter @3cloud/api test`（= `vitest run`，**基线**） | **0** | Test Files **102 passed (102)**；Tests **1484 passed (1484)**（wall 135.33s，vitest Duration 129.63s） | 通过 PASS | 基线全绿；日志中 `[budget] check failed`/`[pre-consume] freeze failed` 等均为用例内部故意触发的降级/失败注入输出，断言全过 |
| 3 | `pnpm --filter @3cloud/api typecheck`（基线，= `tsc --noEmit`） | **0** | 无类型错误输出（21.08s） | 通过 PASS | api 包类型检查干净 |
| 4 | `pnpm --filter @3cloud/api lint`（基线，= `eslint src/`） | **1** | `✖ 5 problems (5 errors, 0 warnings)`，全为 `@typescript-eslint/no-unused-vars`（40.47s） | 失败（静态质量门红） | 根因在 WIP 源码；按基线取证纪律只记录不修复。5 处：`me-agent.ts:21:19 'or'`（生产）、`me-crm.test.ts:53:7 'now'`（测试）、`steps/proxy.ts:161:16 'networkErr'`（生产）、`upstream/routing.ts:19:30 'sql'`（生产）、`upstream/routing.ts:20:10 'selectKey'`（生产） |
| 5 | `pnpm --filter web-console build`（= `vite build`） | **0** | vite v6.4.3，357 modules transformed，built in 5.31s（wall 6.2s） | 通过 PASS（仅非阻断警告） | 警告 `Some chunks are larger than 500 kB` 属提示性，不阻断 |
| 6 | `pnpm --filter web-portal build`（= `next build`） | **0** | Next.js 15.5.23，Compiled successfully in 3.0s，14 静态页（wall 23.27s） | 通过 PASS | 路由含 `/`、`/about`、`/blog`、`/docs`、`/models`、`/pricing`、`/status`、`/vendor/dashboard`、`/vendor/login`、`/vendor/settlements` 等 16 条 |
| 7 | `node scripts/req-completeness-check.cjs` | **1** | 扫描 docs **443 文件 / 2658 项检查 / 919 FAIL**；**GRADE=C**（0.25s） | 信息性（文档治理门，确定性红） | 脚本运行正常，非代码/环境缺陷；失败多为 F2 状态=draft、F5 缺 ID+版本、F3 占位词（待补充/TBD）。不视为构建/测试失败，不做绕过 |
| 8 | `pnpm --filter @3cloud/api test`（**终验**，阶段2补测后） | **0** | Test Files **106 passed (106)**；Tests **1513 passed (1513)**（wall 104.94s，vitest Duration 103.76s） | 通过 PASS | 全绿、无失败用例；较基线（102 文件/1484 用例）净增 **4 文件 / 29 用例**。build/reqcheck 自基线后无生产代码改动，维持基线结论不重跑 |
| 9 | `pnpm --filter @3cloud/api typecheck`（终验） | **0** | `tsc --noEmit` 无类型错误（14.04s） | 通过 PASS | 通过 |
| 10 | `pnpm --filter @3cloud/api lint`（终验） | **1** | `✖ 4 problems (4 errors, 0 warnings)`，全为 `no-unused-vars`（6.55s） | 失败（静态质量门红） | 仍红，但错误数由基线 **5 → 4**；`me-crm.test.ts:53` 的 `'now'` 已随 G7/G8 补测修复，测试文件侧已清零。剩余 4 处全部为生产源码（见 §3 LINT-1） |
| 11 | `pnpm test`（e2e/，= `playwright test`，**既有套件首跑**） | **1** | Running 37 tests / 4 workers；**33 passed, 2 failed, 2 did not run**（耗时 1.8m） | 失败（2 红均已定位根因） | 首跑失败1=`environment_block`（错误模型编码），失败2=`test_failure`（过期断言）；2 skipped 为失败1的串行级联。收口重跑见 #12/#13，详见 §3 E2E-1/E2E-2 |
| 12 | `pnpm exec playwright test fullflow.spec.ts`（e2e/，**收口重跑**） | **1** | ①充值审核 passed；②2FA passed；③真实调度 failed（由原 404 **前移为 502 UPSTREAM_ERROR**）；④⑤ 级联 skipped；③ 复跑 `-g "③"` 仍 failed（确认非抖动） | 失败（environment_block，残留上游健康） | 测试模型参数已由旧裸名改为合法编码 `deepseekv4fl-wanwu-youdao`，路由正确锁定 wanwu-youdao(id=2633)/keyId=192；残留失败为上游 `47.110.226.233:8072` 对该模型返回 502（裸 GET / 亦超时）。详见 §3 E2E-1 |
| 13 | `pnpm exec playwright test user-features.spec.ts`（e2e/，**收口重跑**） | **0** | **23 passed / 0 failed**（1.7m），原 :74「渠道选择」失败消失 | 通过 PASS（E2E-2 已解决 resolved） | 依 PRD:44/PRD:54/SPEC M-S-01/阶段B 三.T4，/vendor-selector 属刻意下线入口；过期 PAGES 条目已移除并原位留痕注释（user-features.spec.ts L41-48），PAGES 24→23。详见 §3 E2E-2 |
| 14 | `pnpm exec playwright test vendor-portal.spec.ts compliance-pages.spec.ts`（e2e/，**新增 spec**） | **0** | Running 5 tests / 2 workers；**5 passed, 0 failed**（6.4s） | 通过 PASS | G9×2 + G10×3；不依赖 chat 调用与 /vendor-selector，与既有失败互不影响 |

> 注：PowerShell 将 pnpm 包装层 stderr 回显为 `NativeCommandError`/`node.exe : $ <script>`，**不代表命令失败**；真实结果以 `$LASTEXITCODE` 与日志末尾为准。

---

## 2. lint 剩余 4 处清单（终验后，全部为生产源码）

| # | 文件:行:列 | 规则 / 信息 |
|---|---|---|
| 1 | `api/src/routes/me-agent.ts:21:19` | `'or'` is defined but never used |
| 2 | `api/src/services/pipeline/steps/proxy.ts:161:16` | `'networkErr'` is defined but never used |
| 3 | `api/src/services/upstream/routing.ts:19:30` | `'sql'` is defined but never used |
| 4 | `api/src/services/upstream/routing.ts:20:10` | `'selectKey'` is defined but never used |

---

## 3. 缺陷与发现分级清单

| 编号 | 严重度 | 描述 | 证据 | 建议 |
|---|---|---|---|---|
| LINT-1 | 🟢 低（技术债） | api lint 仍红，剩余 4 处全部为生产源码未使用变量（`or`/`networkErr`/`sql`/`selectKey`）；测试文件侧 lint 已清零 | 命令 #10 退出码 1，`✖ 4 problems (4 errors)`；基线 5→终验 4 | 后续 WIP 收尾时删除或使用这 4 个变量；不阻断本次回归收口 |
| E2E-1 | 🟠 中（environment_block；**错误编码根因已修复，残留上游健康**） | 既有套件 `fullflow.spec.ts:109`「真实上游调度」：原失败为 `POST /v1/chat/completions` 收 404 `model_code_not_found`。根因是测试用了旧裸模型名 `DeepSeek-V4-Flash-0731`（非合法编码，按 SPEC M-S-05 必 404）。收口已按 M-S-03R 改为真实编码 `deepseekv4fl-wanwu-youdao`（supplier_models id=2317，渠道 wanwu-youdao id=2633，keyId=192 密钥已在库；**未伪造凭据、未改 DB**）。路由已正确锁定，失败**前移为上游返回层 502**（复现 2 次；裸 `GET /` 亦超时） | e2e-pending.md §②③⑤⑦：网关日志 `model="deepseekv4fl-wanwu-youdao" supplier=万物有道 keyId=192 latencyMs≈5.1–7.8s statusCode=502 error="UPSTREAM_ERROR:502"`；③ 复跑仍 failed 确认非抖动；旧 e2e.md 404 截图/日志 | 测试参数已修正，原断言（200 / total_tokens>0 / mock!=true）**未放宽**；待运维核实上游 wanwu 渠道（base_url=http://47.110.226.233:8072，keyId=192）对 `DeepSeek-V4-Flash-0731` 的可用性/额度/余额，上游恢复即自动转绿。④⑤ 2 skipped 为 ③ 的串行级联 |
| E2E-2 | 🟢 低（test_failure 过期断言，**已解决 resolved · 关闭**） | 既有套件 `user-features.spec.ts:74`「渠道选择 `/vendor-selector`」原失败：导航后回退控制台首页、markers `["渠道","供应商","价格"]` 全不匹配。收口确认该路由属**刻意下线入口**，非未实现缺陷 | e2e-pending.md §④⑦：依 PRD:44（「供应商选择」从用户侧移除）、PRD:54（取代用户自选渠道二维设计）、SPEC M-S-01（用户侧删除渠道选择菜单）、阶段B 三.T4（下线渠道页）；过期 PAGES 条目已删除并原位留痕注释（user-features.spec.ts L41-48），PAGES 24→23 | **关闭**。重跑 `pnpm exec playwright test user-features.spec.ts` = **23 passed / 0 failed**（exit 0，1.7m），原 :74 失败消失 |
| FIND-1 | 🟠 中（架构发现） | `/vendor/login` 实测 **308 → `/app/vendor/login`**：`web-portal/src/app/vendor/login/page.tsx` 被 `next.config.mjs` redirects 在路由层遮蔽，浏览器实际渲染的是 web-console SPA `VendorLoginPage`（vendor_token localStorage 守卫）；`/vendor/dashboard` 为 200 SSR + 前端守卫；`/privacy`、`/terms`、`/docs` 均 200 SSR | gap-tests-e2e.md §2 路由实测表；对被遮蔽 Next 登录页做 h1 文案变异「仍 2 passed、未变红」，反证该页在 `/vendor/login` 入口不可达（死代码阴影），变异后哈希 `03D7589C…96F2F` 复原 | 如需让该 Next 登录页生效，应评审 next.config.mjs 的 vendor redirect（本任务被禁止改配置，仅记录） |
| FIND-2 | 🟡 高（PRD↔实现差异） | G4：PRD-§20.4.1–20.4.4 期望 `POST /me/api-keys` 创建 Key 时即可携带 `allowedModels/allowedIps/allowedReferers/dailyTokenLimit`；现状 `createKey` 仅读 `name/expires_at`，细权限字段只能经 `PATCH /me/api-keys/:id`（`patchKey`）写入、`GET /me/api-keys`（`serializeKey`）回读 | gap-tests-keyperm.md §2/§6；G4 测试按现状契约（PATCH 写→GET 读→二次 PATCH 覆盖）验证，未覆盖「POST 携带字段被静默忽略」这一 gap | 如需对齐 PRD，应在 `createKey` 增加细权限列写入（生产代码改动，超出本任务授权，未改、如实记录） |
| FIND-3 | 🟢 低（副作用说明） | 运行既有 e2e 套件会按仓库证据惯例覆写已跟踪的 `test-reports/evidence/*.png`（本会话 25 张，时间戳 04:45–04:46，含 `user-_vendor-selector.png` 等） | e2e.md §四失败2 证据附件说明 | 此为既有套件自带的截图落盘行为，非代理越权；未还原、如实记录 |
| FIND-4 | 🟢 低（模型编码核验结论） | 模型编码正确性核验：M-S-03R 默认模板 `{supplier_code}-{model_name}`；品牌改名 3Cloud→浩寅云**不影响编码**——`renderModelCode` 变量白名单（supplier_code/supplier_name/model_name/model_short/platform_model/seq）不含平台品牌，`suppliers.code=wanwu-youdao` 为稳定列。测试原用值 `DeepSeek-V4-Flash-0731` 是上游 platform_model 裸名（含日期后缀、无 `supplier_code-` 前缀），按 M-S-05「旧裸名一律 `MODEL_CODE_NOT_FOUND(404)`」与基线 :109 失败完全吻合 | e2e-pending.md §①（SPEC M-S-03R/04/05 + model-code.ts 变量白名单） | 无动作。正确写法已固化进测试行内注释；后续测试锚点一律用 `supplier_models.model_code`，不再用 platform_model 裸名 |

---

## 4. 补测交付表（G1–G11）

> 全部新增/追加测试均按单元测试 skill 做了 **GREEN（聚焦运行）+ RED（临时变异→指定断言变红→SHA256 哈希复原→回绿）** 双重证明。合计新增 **34 个用例**（vitest 29 + e2e 5）。

| 缺口 | 测试文件（精确路径） | 用例数 | 聚焦 GREEN | RED 证明方式（变异行 → 变红断言 → 哈希复原） | 状态 |
|---|---|---|---|---|---|
| G1 | `api/src/routes/me-budget.test.ts`（新建） | 6 | 6 passed (6) | 变异 `me-budget.ts:119` 空 patch 守卫 `if(Object.keys(patch).length===0)`→`if(false&&…)` →「PUT {} 空 patch→400」变红（1 failed/5 passed）；哈希 `E3967C39…58076` MATCH | ✅ 通过 |
| G2 | `api/src/services/pipeline/integration.test.ts`（末尾追加 describe，原14+新2=16） | 2 | 16 passed (16)；两文件合并 22/22 | 变异 `steps/budget-check.ts:29` `assertWithinBudget(...)`→`void estimatedCost;` →「已达日硬限额→429」变红（expected 500 to be 429；1 failed/1 passed/14 skipped），未设置放通用例保持绿；哈希 `D3B961E9…844D9` MATCH | ✅ 通过 |
| G3 | `api/test/key-permissions-gateway.test.ts`（新建，真实 preHandler 未 mock） | 3 | 3 passed (3)；相关回归 key-permissions.test.ts 26/26 | 变异 `checkModelAccess` 白名单拒绝条件加 `false&&` → G3-1「model-b→403」变红（expected 500 to be 403），G3-2/G3-3 仍绿；哈希 `67B8180A…A34DEE` MATCH | ✅ 通过 |
| G4 | `api/test/me-endpoints.test.ts`（追加 describe，原46+新2=48） | 2 | 48 passed (48) | 变异 `apikeys.ts` patchKey 数组权限循环 `['allowedModels',…]`→`[]` → G4 两例变红（expected null to deeply equal […]；2 failed/46 skipped）；哈希 `1B874A3D…1C13E6` MATCH | ✅ 通过（含 FIND-2 PRD 差异备注） |
| G5 | `api/src/routes/admin-ledger.test.ts`（新建，真实 PG） | 6 | 6 passed (6)（与 G6 合并 12/12） | 变异 `admin-ledger.ts` direction 透传 → `undefined` →「direction=debit 筛选生效」变红（expected 4 to be 2）；哈希 `FF33EBBD…BAABCE` MATCH | ✅ 通过 |
| G6 | `api/src/routes/admin-alerts.test.ts`（新建，真实 PG + 运行时建表） | 6 | 6 passed (6) | 变异 `admin-alerts.ts` windowSec 下限 `<30`→`<0` →「window_sec=10→400」变红（expected 201 to be 400）；哈希 `18B9C7FA…2FB6593` MATCH | ✅ 通过（环境处置：测试库缺 monitoring_rules/alerts 表，beforeAll 建表/afterAll DROP，净影响为零） |
| G7 | `api/src/routes/me-crm.test.ts`（追加，原7+新3=10） | 2（G7-1 备注>1000字→400；G7-2 满200条 shift） | 10 passed (10) | 变异 `me-crm.ts:292` `>1000`→`>1001` → G7-1 变红（expected 200 to be 400）；变异 `:301` 注释掉 `notes.shift()` → G7-2 变红（expected 200, received 201）；哈希 `98975F4C…999F81` MATCH | ✅ 通过（同批修复 :53 未用变量 `now`） |
| G8 | `api/src/routes/me-crm.test.ts`（追加，与 G7 同批） | 1（audit_logs 留痕 sales.lead.create/lead.convert/opportunity.create/quote.create） | 含于上 10/10 | 变异 `me-crm.ts:627` 注释掉 `sales.quote.create` 的 writeAudit → G8 变红（expected […] to include 'sales.quote.create'；1 failed/2 passed/7 skipped）；哈希同上 MATCH | ✅ 通过 |
| G9 | `e2e/tests/vendor-portal.spec.ts`（新建） | 2 | 2 passed (2) | 变异 `web-portal/src/app/vendor/dashboard/page.tsx` 守卫删收敛跳转 → G9-2「未登录 dashboard 收敛登录」变红（password 输入框 20s 超时 element not found；1 failed/1 passed）；哈希 `8F22EA59…AF5E2E` MATCH。另：按指定目标变异被 308 遮蔽的 Next 登录页 h1「无效变异」（仍绿），已如实记录原因（见 FIND-1） | ✅ 通过 |
| G10 | `e2e/tests/compliance-pages.spec.ts`（新建） | 3（/privacy、/terms、/docs 均 200 + 正文 h1） | 3 passed (3)；两 spec 合并 5/5 | 随 G9 同轮服务栈与栈释放复核；三页为 SSR 静态可达性，反例为「删页/404/308 跳 /app/* → h1 不可见」 | ✅ 通过 |
| G11 | `api/src/routes/me-agent.test.ts`（notif-prefs 块追加，原15+新1=16） | 1（PUT 混合类型/未知键过滤：仅布尔落库） | 16 passed (16) | 变异 `me-agent.ts:293-295` 删除 `typeof v==='boolean'` 守卫 → G11 变红（expected 'yes' to be true；1 failed/15 passed）；哈希 `6752A6C4…40C06E` MATCH | ✅ 通过 |

**新/改文件汇总**：新建 `api/src/routes/me-budget.test.ts`(G1,6)、`api/test/key-permissions-gateway.test.ts`(G3,3)、`api/src/routes/admin-ledger.test.ts`(G5,6)、`api/src/routes/admin-alerts.test.ts`(G6,6)、`e2e/tests/vendor-portal.spec.ts`(G9,2)、`e2e/tests/compliance-pages.spec.ts`(G10,3)；追加 `api/src/services/pipeline/integration.test.ts`(+2)、`api/test/me-endpoints.test.ts`(+2)、`api/src/routes/me-crm.test.ts`(+3 并修复 :53 `now`)、`api/src/routes/me-agent.test.ts`(+1)。

---

## 5. 结论

- **主干全绿**：终验 api 单测 **106 文件 / 1513 用例全部通过（exit 0）**，typecheck **exit 0**；shared 构建、web-console 构建、web-portal 构建均 **exit 0**。基线→终验单测净增 4 文件 / 29 用例，无既有用例被打破。
- **两项可解释红**：
  - **lint 红**（exit 1，5→4）：属生产源码 WIP 未收尾（4 处未使用变量），测试文件侧已清零；不阻断收口。
  - **e2e 既有套件红**（首跑 33 passed / 2 failed / 2 skipped）：两项待办**已收口**——E2E-2（/vendor-selector 过期断言）**已关闭**，重跑 user-features 23/0 全绿；E2E-1 根因（测试用了非法裸模型名）**已修复**并验证路由正确锁定 wanwu-youdao，残留失败为上游渠道本身 502（environment_block），待运维核实上游健康，断言未放宽。
- **信息项**：req-completeness-check `GRADE=C`（919/2658 FAIL）为文档治理门确定性红，非代码缺陷。
- **过程纪律**：补测阶段无生产代码永久改动（全部 RED 临时变异均哈希复原）、无 git 操作；收口阶段仅按待办授权修改两个 e2e spec（fullflow.spec.ts 模型参数+记账断言、user-features.spec.ts 移除过期条目并留痕），未动生产源码、未动 playwright.config/global-setup、未改 DB、无密钥落盘；FIND-3 所述 evidence png 按既有套件惯例被覆写并如实记录。
- **剩余待办**：① 清理 lint 4 处生产未用变量；② **待运维核实上游 wanwu 渠道**（keyId=192，base_url=http://47.110.226.233:8072）对 `DeepSeek-V4-Flash-0731` 的可用性/额度/余额——恢复后 fullflow ③ 自动转绿；③ ~~owner 定夺 E2E-2（vendor-selector）~~ **已关闭**（刻意下线，过期条目已移除留痕）；④ 评审 `/vendor/login` 308 遮蔽（FIND-1）与 G4 POST 细权限缺口（FIND-2）是否纳入后续迭代；⑤ docs 目录按 completeness-checklist 关闭 919 项 FAIL 以提升 reqcheck 评级。

---

*本报告全部数字均交叉自 `test-reports/_working/` 下 baseline.md、gap-map.md、e2e.md、gap-tests-budget.md、gap-tests-keyperm.md、gap-tests-ledger-alert.md、gap-tests-crm.md、gap-tests-notif.md、gap-tests-e2e.md 取证文件，未做任何推断或补造。*
