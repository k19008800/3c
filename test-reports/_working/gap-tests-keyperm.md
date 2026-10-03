# Key 细权限契约补测报告（PRD-§20.4）

- 日期：2026-10-03
- 范围：G3 网关卡面（新建）+ G4 CRUD 持久化回读（追加）
- 纪律：只改 2 个测试文件；未改生产代码；未做任何 git 操作。

## 1. 触碰文件（绝对路径）

| 文件 | 动作 |
|---|---|
| `C:\Users\ZH\.openclaw\workspace\3cloud\api\test\key-permissions-gateway.test.ts` | 新建（G3，3 用例） |
| `C:\Users\ZH\.openclaw\workspace\3cloud\api\test\me-endpoints.test.ts` | 追加 describe（G4，2 用例） |

临时变异用 `.bak` 均已删除，生产文件哈希前后一致（见 §4）。

## 2. G4 位置决策说明

二选一：追加 `api/test/me-endpoints.test.ts` 或新建 `api/src/routes/apikeys.test.ts`。
**选择追加 me-endpoints.test.ts**，理由：

- Key CRUD 端点虽在 `api/src/routes/apikeys.ts`，但 G4 契约要求「持久化回读」（POST/PATCH 写入 → GET 列表从 DB 读出）。
- `me-endpoints.test.ts` 已用 `buildApp({envOverrides})` 装配**真实 Fastify + 真实 PG(threecloud_v3) + 真实 Redis**，且已在测 `/api/v1/me/api-keys`（revoke-all）。沿用同一 harness 才能验证真实落库/回读。
- 若在 `src/routes/` 新建 colocated 测试，按仓库惯例需对 db/routing/balance 全量 `vi.mock`（见 openai-compat.test.ts），无法证明真实持久化。
- 补充事实：`createKey` 当前只接收 `name`/`expires_at`，细权限列（allowedModels 等）写入口是 `PATCH /me/api-keys/:id` 的 `patchKey`；读出口是 `GET /me/api-keys` 列表的 `serializeKey`。故 G4 以「POST 建 Key → PATCH 写入 → GET 回读 → 二次 PATCH 覆盖 → GET 回读新值」验证现状契约。

## 3. 新测试清单 + 唯一错误实现表

### G3（test/key-permissions-gateway.test.ts）
真实 `enforceKeyPermissionsPreHandler`（**未 mock**），仅 mock apiKeyContext 注入、上游 fetch、Redis 计数边界、跨切面守卫；bare Fastify + openaiCompatRoutes。

| # | 用例 | 输入轨迹 | 唯一错误实现（只它会变红） |
|---|---|---|---|
| G3-1（探针） | allowedModels=['model-a'] 请求 model-b → 403 且上游未调用 | apiKeyAuth 注入 ctx.allowedModels=['model-a-allowed']；POST /v1/embeddings {model:'model-b-denied',input} | 关掉 `checkModelAccess` 白名单拒绝分支 → 请求穿透（实测变 500）。G3-2/G3-3 的 allowedModels=null，不受影响 |
| G3-2 | allowedIps=['203.0.113.10'] 从 198.51.100.5 请求 → 403 | ctx.allowedIps=[...]；inject remoteAddress='198.51.100.5' | 关掉 `checkIpAccess` 逐条目匹配/拒绝 → 放通。G3-1/G3-3 的 allowedIps=null，早返回，不受影响 |
| G3-3 | dailyTokenLimit=10、今日累计 11 → 429 | ctx 仅 dailyTokenLimit=10；fake redis multi.exec→[[null,11]] | 关掉日 Token `daily>limit` 429 分支 → 放通。G3-1 在模型步、G3-2 在 IP 步即被拒，触达不到 daily |

### G4（me-endpoints.test.ts 追加）

| # | 用例 | 输入轨迹 | 唯一错误实现 |
|---|---|---|---|
| G4-1 | PATCH 写 4 字段 → GET 列表原样回读 | registerUser→POST 建 Key→按 keyPrefix 取 id→PATCH {allowedModels,allowedIps,allowedReferers,dailyTokenLimit=50000}→GET 列表断言 | 数组字段不写进 patch（实测 allowedModels 回读 null）。验证「首写落库+序列化回读」 |
| G4-2 | 二次 PATCH → 回读新值 | 首 PATCH {allowedModels:['old'],dailyTokenLimit:1000} → 再 PATCH {allowedModels:[...2个],allowedIps,dailyTokenLimit:99999}→GET 断言新值 | 更新不覆盖旧值/不执行 update → 回读仍旧值。验证「二次覆盖」，G4-1 不覆盖此路径 |

## 4. GREEN / RED 证据

### GREEN（聚焦运行，均退出码 0）
- `pnpm --filter @3cloud/api exec vitest run test/key-permissions-gateway.test.ts` → **1 file / 3 passed (3)**。
- `pnpm --filter @3cloud/api exec vitest run test/me-endpoints.test.ts` → **1 file / 48 passed (48)**（原 46 + G4 新增 2）。
- 相关回归 `src/services/security/key-permissions.test.ts` → **26 passed (26)**。

### RED 变异证明（探针先行）
- **G3-1**：备份 `key-permissions.ts` → 变异 `checkModelAccess` 白名单拒绝条件加 `false &&` → 跑聚焦：**G3-1 × expected 500 to be 403（RED），G3-2/G3-3 仍绿** → 恢复 → 重跑 3/3 绿。
  - 文件 SHA256 变异前 = 恢复后 = `67B8180AB6BBE43FA20AE070064D6477E525C8446A1017A2F6EEC12933A34DEE`（一致）。
- **G4**：备份 `apikeys.ts` → 变异 patchKey 数组权限循环 `['allowedModels',...as const]` → `[] as const` → 跑 `-t "§20.4"`：**2 failed / 46 skipped**，`expected null to deeply equal [...]`（allowedModels 未落库，RED）→ 恢复 → 重跑 2/2 绿。
  - 文件 SHA256 变异前 = 恢复后 = `1B874A3DE88726AEE0DA72D2FE5B0517D90BBFD7D45BC780B826AF854F1C13E6`（一致）。

## 5. lint / typecheck
- `pnpm --filter @3cloud/api exec eslint test/key-permissions-gateway.test.ts` → **exit 0（干净）**。
  - 注：新文件位于 `api/test/`，本就不在 `eslint src/` 覆盖范围；仍单独跑确认无问题。
- `pnpm --filter @3cloud/api typecheck`（`tsc --noEmit`）→ **exit 0（全 api 通过）**。

## 6. 状态与剩余 gap
- 状态：**通过**。
- 剩余 gap（不在本次授权范围，需改生产代码，未覆盖）：
  1. PRD-§20.4 期望 `POST /me/api-keys` 创建时即可携带 allowedModels/allowedIps/allowedReferers/dailyTokenLimit；现状 `createKey` 仅读 name/expires_at，细权限只能 PATCH 写入。本测试按现状契约（PATCH 写、GET 读）验证，未覆盖「POST 携带字段被静默忽略」这一 PRD↔实现 gap。
  2. rpmLimit/tpmLimit 网关拦截（429）与 Referer 白名单（403）本次未单独成用例（G3 仅覆盖模型/IP/日 Token 三项点名契约）；纯函数 `checkRefererAccess`/RPM/TPM 已有 `key-permissions.test.ts` 覆盖。
