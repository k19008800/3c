# 零覆盖契约测试补测 — 平台台账只读路由（G5）+ 告警中心路由（G6）

- 日期：2026-10-03
- 范围：仅新建两个测试文件，未改动任何生产代码，未做 git 操作。
- 基线：api vitest 102 文件 / 1484 用例全绿；typecheck 绿；lint 基线 5 个未使用变量（未动）。

## 一、交付文件（绝对路径）

| 编号 | 文件 |
|---|---|
| G5 | `C:\Users\ZH\.openclaw\workspace\3cloud\api\src\routes\admin-ledger.test.ts` |
| G6 | `C:\Users\ZH\.openclaw\workspace\3cloud\api\src\routes\admin-alerts.test.ts` |

> 环境事实：测试库 `threecloud_v3` 仅有 `platform_ledger`/`users`，**无** `monitoring_rules`/`alerts`（对应迁移未落到本测试库）。G6 路由硬编码全局 `db`，故在 `beforeAll` 按 Drizzle schema 等价 DDL 建表（`CREATE TABLE IF NOT EXISTS`），`afterAll` `DROP TABLE`，对共享测试库净影响为零（无其它测试引用这两张表）。

## 二、新测试清单

### G5 admin-ledger.test.ts（6 例，真实 PG）
- 鉴权：无 token → 401；customer 角色 → 403。
- GET /ledger：account+user_id 筛选生效（total=4）。
- GET /ledger：direction=debit 筛选生效（total=2，全部 debit）。
- GET /ledger：start_date/end_date 区间筛选生效（2026-01 窗口命中 2 行）。
- GET /ledger：非法日期串被忽略不报错（start_date=not-a-date → total=4）。
- GET /ledger/summary：按科目返回 debitCents/creditCents（探针科目借 1500=贷 1500，净额 0）+ 恒等式结构。

探针隔离：魔法科目名 `__probe_ledger__` 全表唯一，list/summary 按该科目定位，不受并行测试数据影响。

### G6 admin-alerts.test.ts（6 例，真实 PG + 运行时建表）
- 无 token → 401。
- admin（非 super_admin）POST/PUT/DELETE 规则 → 403。
- metric 不在白名单 → 400（super_admin POST）。
- window_sec=10（越界 30–86400）→ 400。
- ack 不存在 id → 404。
- GET /alerts?status=firing&rule_id=mine → total=2，全部 firing 且 ruleId=mine。

> 未测：ref-5.4 中 resolve / batch-ack / alert-stats / notification-configs —— 代码未实现（无对象）。

## 三、唯一错误实现表

| 测试 | 输入轨迹 | 唯一错误实现（删该测试才会被击穿的反例） |
|---|---|---|
| L1 鉴权 | GET /ledger 无 header / customer token | adminAuth 不校验 token 存在性或放行 customer |
| L2 account+user_id | ?account=probe&user_id=uid | listLedger 不按 account/userId 拼 where |
| L3 direction=debit | ?account=probe&direction=debit | 路由不把合法 direction 透传 / listLedger 不拼 direction 条件 |
| L4 日期区间 | ?start_date=2026-01-01&end_date=2026-01-31 | parseDate 未产出 Date / gte,lte 未拼条件 |
| L5 非法日期忽略 | ?start_date=not-a-date | parseDate 未校验正则，把 Invalid Date 拼进 where → 报错或查空 |
| L6 summary | GET /ledger/summary | ledgerSummary 未按科目聚合或未输出 debitCents/creditCents |
| A1 无 token | GET /alerts 无 header | adminAuth 不校验 token |
| A2 写规则 403 | admin POST/PUT/DELETE /rules | superAdminOnly 把 admin 也放行 |
| A3 metric 白名单 | super POST metric=bogus | parseRuleBody 不校验 ALLOWED_METRICS |
| A4 window 边界 | super POST window_sec=10 | 窗口下限校验缺失/边界写成 0 |
| A5 ack 404 | POST /alerts/999999/ack | ack 不检查 update 返回行（空结果当成功 200） |
| A6 列表筛选+计数 | ?status=firing&rule_id=mine | parseAlertFilters 漏拼条件，或 count SQL 与 list where 不一致 |

## 四、聚焦运行统计（GREEN）

命令（仓库根）：`pnpm --filter @3cloud/api exec vitest run src/routes/admin-ledger.test.ts src/routes/admin-alerts.test.ts`

- Test Files：2 passed (2)
- Tests：12 passed (12)
- 发现证据：两文件各 6 例均出现在通过清单（exit 0，非 not_discovered）。

## 五、RED 证据（最小变异 + 哈希恢复）

流程：`Copy-Item <file> <file>.bak` → Edit 变异单行 → 聚焦运行（期望指定断言失败）→ `Copy-Item <file>.bak <file> -Force` 恢复并删 `.bak` → SHA256 前后一致 → 重跑回 GREEN。

### 变异 A — G5 direction 过滤（admin-ledger.ts）
- 变异行：`direction: q.direction==='debit'||... : undefined` → `direction: undefined`。
- 结果：`direction=debit 筛选生效` 用例 **RED** — `AssertionError: expected 4 to be 2`（其余 5 例保持绿）。
- 恢复后哈希：`FF33EBBDBB6532E4B5ED6069AAB069726DDE049885EDF28F8E82074965BAABCE`，与基线一致。

### 变异 B — G6 window_sec 下限（admin-alerts.ts）
- 变异行：`windowSec < 30` → `windowSec < 0`。
- 结果：`window_sec=10 → 400` 用例 **RED** — `AssertionError: expected 201 to be 400`（其余 5 例保持绿）。
- 恢复后哈希：`18B9C7FAD5BD13ECEEE640F7507B20149DDCA37C92EABD4A713D20CB22FB6593`，与基线一致。

变异恢复后重跑两文件：12 passed (12)，exit 0。无 `.bak` 残留（已复查 routes 目录）。

## 六、lint / typecheck

- ESLint（两个新文件）：`pnpm --filter @3cloud/api exec eslint src/routes/admin-ledger.test.ts src/routes/admin-alerts.test.ts` → exit 0（干净）。
- typecheck：`pnpm --filter @3cloud/api typecheck`（tsc --noEmit）→ exit 0（绿）。
- 注：基线既有 5 个未使用变量 lint 红为历史遗留，本次未触碰。

## 七、自检结论

- 两文件被 vitest 发现并执行（各 6 例，共 12）。
- 文件级聚焦回归全绿；生产文件哈希与变异前一致（净改动零）。
- lint（新文件）/ typecheck 绿。
- 状态：**通过**。
