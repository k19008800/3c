# 代理商通知偏好 — 零覆盖契约测试补充（G11）

- 日期：2026-10-03
- 范围纪律：仅改动 `api/src/routes/me-agent.test.ts`（在现有 `notif-prefs` describe 块内追加 1 个用例）；生产文件 `me-agent.ts` 全程只读（RED 证明用临时变异后已按哈希复原）。未做任何 git 操作。
- 契约来源：PRD §3.2.4「通知偏好读写 agent_notif_prefs 表；customer_alert/commission_notify/audit_notify」+ G11。

## 1. 被测行为（契约）

PUT `/api/v1/me/agent/notif-prefs` 处理器（me-agent.ts:287–306）：
- 第 293–295 行遍历 body，**仅当 `typeof v === 'boolean'` 才落库**（无 key 白名单，但非布尔一律过滤）。
- `onConflictDoUpdate` 对 `prefs` 字段为**整体替换**（非 merge）。
- GET 返回 `{...DEFAULT_PREFS, ...stored}`，默认 `customer_alert/commission_notify/audit_notify = true`。

G11 输入轨迹：`PUT {commission_notify:false, bogus:"x", audit_notify:"yes"}` → 随后 GET。

## 2. 追加用例清单

仅 1 个新 `it`（追加在 `notif-prefs` describe 末尾，原 2 例不动）：

| # | 用例名 | 位置 |
|---|---|---|
| T1 | `混合类型/未知键被过滤：仅持久化布尔值，非布尔一律不落库（G11）` | me-agent.test.ts notif-prefs describe 内第 3 例 |

T1 断言（同一轨迹合并断言）：
1. PUT `statusCode === 200`
2. GET `data.commission_notify === false`（唯一布尔值落库，`false` 不被当假值丢弃）
3. GET `data.customer_alert === true`（整体替换 + 过滤，未提交项回落默认，不残留前序用例值）
4. GET `data.audit_notify === true`（字符串 `"yes"` 被过滤，回落默认，不被污染）
5. GET `data.bogus === undefined`（未知键非布尔，不入库，响应中不出现）

## 3. 唯一错误实现表

| 测试 | 输入轨迹 | 唯一错误实现 | 击穿断言 |
|---|---|---|---|
| T1 | PUT 混合类型 → GET | E-A：删掉 boolean 守卫（`prefs[k]=v` 无过滤） | 断言④ `audit_notify` 收到 `"yes"`；断言⑤ `bogus` 收到 `"x"` |
| T1（同轨迹合并） | 同上 | E-B：过滤写成只保留真值（如 `if (v===true)`），`false` 被丢 | 断言② `commission_notify` 回落默认 `true` |
| T1（同轨迹合并） | 同上 | E-C：`onConflictDoUpdate` 改为 merge（`set:{prefs:{...existing,...prefs}}`），不清空前序 `customer_alert:false` | 断言③ `customer_alert` 残留为 `false` |

三个错误实现互不重复，均落在同一 PUT→GET 轨迹，按纪律合并为 1 个用例、分组断言。

## 4. 聚焦运行统计

命令（仓库根，api 包相对路径）：
`pnpm --filter @3cloud/api exec vitest run src/routes/me-agent.test.ts`

| 阶段 | 结果 |
|---|---|
| 基线（追加前） | Test Files 1 passed；**Tests 15 passed**（含原 notif-prefs 2 例） |
| GREEN（追加后） | Test Files 1 passed；**Tests 16 passed (16)**，499ms |
| 恢复后复跑 GREEN | Test Files 1 passed；**Tests 16 passed (16)** |

原 notif-prefs 两例（`GET 返回默认偏好`、`PUT 保存后 GET 读到新值`）在 GREEN/RED/复跑各轮均通过，回归无破坏。

## 5. RED 证明方式与结果

- 备份：`Copy-Item me-agent.ts me-agent.ts.bak`，备份哈希 = 基线哈希。
- 最小变异（仅 me-agent.ts 第 293–295 行）：删除 `if (typeof v === 'boolean')` 守卫 → `prefs[k] = v;`（对应错误实现 E-A）。
- 聚焦运行结果：**Tests 1 failed | 15 passed (16)**，退出码 1。
  - 仅新 G11 例失败；15 例原用例（含原 notif-prefs 2 例）全部通过。
  - 失败断言（me-agent.test.ts:174）：`expected 'yes' to be true // Object.is equality`，即 `data.audit_notify` 收到字符串 `"yes"`。这是由目标行为（布尔过滤）触发的有效 RED，非编译/fixture/环境错误。
- 恢复：`Copy-Item me-agent.ts.bak me-agent.ts -Force` → `Remove-Item me-agent.ts.bak`。

哈希核对（SHA256）：
- 基线（变异前）：`6752A6C47F0A03E8D25F592545D64191C2EA14EAF67AA1B453148BC1BF40C06E`
- 备份文件：`6752A6C4...0C06E`（与基线一致）
- 恢复后生产文件：`6752A6C4...0C06E`（与基线逐字节一致）
- `.bak` 存在性：`False`（已清理）

E-B / E-C 两个错误实现未逐一生成变异（避免对生产文件多次临时改写），其→断言映射见上表第 3 节；探针 E-A 的 GREEN/RED 已实证过滤守卫为受保护的最高风险契约。

## 6. Lint / Typecheck

| 项 | 命令 | 结果 |
|---|---|---|
| ESLint（仅测试文件） | `pnpm --filter @3cloud/api exec eslint src/routes/me-agent.test.ts` | exit 0，无输出（干净） |
| Typecheck（全 api） | `pnpm --filter @3cloud/api typecheck`（`tsc --noEmit`） | exit 0（绿） |

> 说明：仓库基线 lint 全局红来自生产文件 `me-agent.ts:21` 未使用变量 `or`（hint 已确认，属生产源码、不在本次授权范围，未触碰）；本次只对改动的测试文件做定向 eslint，结果干净。

## 7. 自检结论

- [x] 新测试被 vitest 发现并执行（15 → 16）。
- [x] me-agent.test.ts 文件级回归全绿（原 15 例 + 新增 1 例 = 16 passed）。
- [x] ESLint 测试文件干净；typecheck 绿。
- [x] 生产文件 me-agent.ts 哈希复原至基线，临时备份已删除。
- [x] 未做任何 git 操作；未改动除 me-agent.test.ts 外的任何文件。
