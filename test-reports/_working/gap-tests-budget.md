# 预算功能零覆盖契约测试补齐报告（PRD-§20）

日期：2026-10-03 ｜ 范围：G1 端点契约（§20.1.1）+ G2 熔断链路契约（§20.1.2）

## 1. 触碰文件（严格限定）

| 文件 | 操作 | 绝对路径 |
|---|---|---|
| api/src/routes/me-budget.test.ts | 新建 | C:\Users\ZH\.openclaw\workspace\3cloud\api\src\routes\me-budget.test.ts |
| api/src/services/pipeline/integration.test.ts | 末尾追加 describe | C:\Users\ZH\.openclaw\workspace\3cloud\api\src\services\pipeline\integration.test.ts |

生产代码零改动（仅临时变异做 RED 证据，已哈希校验恢复）。未做任何 git 操作。

## 2. G2 落点选择说明

选 `integration.test.ts`，未选 `api/test/messages.test.ts`：
- integration.test.ts 已注册 `chatRoutes` 真实 pipeline，并已 mock `preConsume/consumption/db/idempotency`，与本契约断言（pre-consume 未被调用、无消费记录、幂等锁回滚释放）同构，可直接复用 harness；
- messages.test.ts 是 Anthropic `/v1/messages` 路由的独立 harness，复用成本高，且 PRD-§20.1.2 描述的是 chat 链路装配顺序。

## 3. pipeline 顺序核实（读码确认）

`api/src/routes/chat.ts` 第 294-586 行步骤装配顺序：
`auth → idempotency → rate-limit → validate(写 estimatedCost) → budgetCheckStep()(L340) → preConsumeStep()(L343) → route → proxy → settle`。
即 budget-check 位于 validate 之后、pre-consume 之前，与 PRD-§20.1.2「pre-consume 之前执行」一致。

## 4. 新测试清单与唯一错误实现表

### G1（me-budget.test.ts，6 用例）

| # | 测试 | 输入轨迹 | 唯一错误实现（该测试能抓住、其他抓不住） |
|---|---|---|---|
| G1-1 | 无 token GET → 401 | GET 不带 Authorization | jwtAuth preHandler 缺失，路由裸奔 |
| G1-2 | 未设置用户 GET → 默认值+usage | select→[]，execute→0.50/2.00 元 | 默认回退错误（hardBlock/alertThreshold 错或缺 usage 字段） |
| G1-3 | PUT dailyLimitCents=-1 → 400 | PUT {dailyLimitCents:-1} | parseLimitCents 放行负数限额 |
| G1-4 | PUT alertThreshold=150 → 400 | PUT {alertThreshold:150} | 阈值上限校验缺失（可设 >100） |
| G1-5 | PUT {} → 400 | PUT 空对象 | 空 patch 被当作合法 upsert 写入空行 |
| G1-6 | 合法 PUT→GET 回读 | PUT{500,90,false} → GET | upsert 未写库 / PUT 后回读仍是默认值 |

### G2（integration.test.ts 追加，2 用例）

| # | 测试 | 输入轨迹 | 唯一错误实现 |
|---|---|---|---|
| G2-1 | 日硬限额 → 429 且 preConsume/fetch/recordConsumption 未调用 | settings dailyLimitCents=100 分，用量聚合 today=150 分 | budget-check 未注册或排在 pre-consume 之后 |
| G2-2 | 未设置预算 → 200 放行 | select→[]（无预算行） | 未设置用户被误熔断（fail-closed 破坏向后兼容） |

## 5. 聚焦运行统计（GREEN）

命令（仓库根）：`pnpm --filter @3cloud/api exec vitest run <path>`

| 运行 | 结果 |
|---|---|
| src/routes/me-budget.test.ts | 6 passed (6) |
| src/services/pipeline/integration.test.ts（含原 14 + 新 2） | 16 passed (16) |
| 两文件合并复跑 | 22 passed (22) |
| 全量 api vitest 回归 | Test Files 106 passed；Tests 1513 passed；exit 0（Duration ~118s） |

## 6. RED 变异证据（GREEN → 变异 → RED → 恢复 → 哈希一致）

### 变异 1（G1-5）
- 文件：`api/src/routes/me-budget.ts`，L119 `if (Object.keys(patch).length === 0)` → `if (false && ...)`（空 patch 守卫失效）。
- 结果：`Tests 1 failed | 5 passed`，变红用例恰为「PUT {} 空 patch → 400」；其余 5 条不变。
- 恢复：`.bak` 覆盖回写并删除备份；哈希前后一致：
  - 基线 `E3967C395E6F39670753DB6FA26862FC9607A30D6A07C92C03FE6DB265558076`
  - 恢复后 `E3967C395E6F39670753DB6FA26862FC9607A30D6A07C92C03FE6DB265558076`（MATCH=True）

### 变异 2（G2-1）
- 文件：`api/src/services/pipeline/steps/budget-check.ts`，L29 `await assertWithinBudget(...)` → `void estimatedCost;`（熔断调用置空）。
- 结果：聚焦 `-t 预算熔断` → `1 failed | 1 passed | 14 skipped`，变红用例恰为「已达日硬限额 → 429…」（断言 `expected 500 to be 429`）；G2-2 放通用例保持绿，证明两条测试对应不同错误实现。
- 恢复：哈希前后一致：
  - 基线 `D3B961E9BF21269A2FB080E98B5868382C7288D56A2F5FBA7518A6EDDB4844D9`
  - 恢复后 `D3B961E9BF21269A2FB080E98B5868382C7288D56A2F5FBA7518A6EDDB4844D9`（MATCH=True）

## 7. lint / typecheck

- `eslint src/routes/me-budget.test.ts src/services/pipeline/integration.test.ts` → exit 0（首跑报 `describe` 未使用，已移除该导入后复跑干净）。
- `tsc --noEmit`（全 api）→ exit 0。
- 仓库既有 lint 基线红项（5 个未使用变量，含 me-crm.test.ts:53）未触碰，保持原样。

## 8. 自检结论

- 新测试被 vitest 发现：me-budget.test.ts 6 条 + integration.test.ts 新增 2 条，数量核对一致；
- 文件级与全量回归均绿；两处生产文件变异后哈希恢复一致；
- 新增测试风格贴近邻近测试（vitest globals、vi.hoisted mock、proxy 链式 fake db、真实 JWT + app.inject；G2 复用既有 preConsume/consumption fake 注入模式）。
