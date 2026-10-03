# 销售 CRM 零覆盖契约测试补全报告（G7 / G8）

- 日期：2026-10-03
- 范围：仅修改 `api/src/routes/me-crm.test.ts`（追加 3 个用例 + 删除第 53 行未使用的 `now` 变量）
- 生产代码 `api/src/routes/me-crm.ts`：只读，未做任何提交级修改（仅 RED 证明时做临时变异并已恢复，哈希校验一致）
- 未执行任何 git 操作

## 一、修改文件（绝对路径）

- `C:\Users\ZH\.openclaw\workspace\3cloud\api\src\routes\me-crm.test.ts`

## 二、追加用例清单

新增一个 describe：`G7/G8 契约补全（备注上限 / 审计留痕）`，共 3 个 `it`：

| # | 用例名 | 契约来源 | 行为断言 |
|---|---|---|---|
| G7-1 | 备注 note 超过 1000 字 → 400 | PRD §11.2.2「单条 ≤1000 字」 | `POST /leads/:id/notes`，body.note = `'字'.repeat(1001)` → `statusCode === 400` |
| G7-2 | 已有 200 条备注再追加 → 仍 200 条且最旧条被 shift | PRD §11.2.2「notes 数组追加，上限 200 条」 | `__seed` 200 条后追加 1 条 → 返回数组长度 200、`notes[0]==='备注#002'`（最旧 `备注#001` 被丢弃）、末位为新条 |
| G8 | 创建线索/转商机/创建商机/创建报价后 audit_logs 留痕 | PRD §11 关键架构「写操作全部落 audit_logs」 | `__rows(schema.auditLogs).map(r=>r.action)` 含 `sales.lead.create`、`sales.lead.convert`、`sales.opportunity.create`、`sales.quote.create` |

> 说明：convert 端点（me-crm.ts:351）实际审计 action 为 `sales.lead.convert`（属 `sales.lead.*` 命名空间）；`sales.opportunity.create` 由直接 `POST /opportunities`（me-crm.ts:433）发出。G8 用例同时跑 convert 与直接录入商机，故四个 action 全部真实落库并断言。

## 三、唯一错误实现表（测试 | 输入轨迹 | 唯一错误实现）

| 测试 | 输入轨迹 | 唯一错误实现（会让该用例变红） |
|---|---|---|
| G7-1 | 建线索 → POST notes(1001 字) | me-crm.ts:292 `note.length > 1000` 被删/放宽为 `> 1001` → 1001 字放行返回 200 |
| G7-2 | seed 200 条 → POST 1 条 | me-crm.ts:301 `if (notes.length > 200) notes.shift()` 被删 → 数组变 201 且头元素仍为最旧条 |
| G8 | 建线索→convert→建商机→建报价 | 任一处 `writeAudit(...)` 调用被删 / action 字符串改错 → 对应 action 行缺失 |

三个用例的错误实现互不重复，分别绑定 me-crm.ts 不同代码行，删除任一例不影响其余两例的击穿能力。

## 四、聚焦运行 vitest 统计（GREEN）

命令（仓库根 `C:\Users\ZH\.openclaw\workspace\3cloud`）：

```
pnpm --filter @3cloud/api exec vitest run src/routes/me-crm.test.ts
```

- 基线（补测试前）：`Test Files 1 passed (1)`，`Tests 7 passed (7)`
  - 注：现有文件实际为 7 个 `it`（鉴权 2 + leads/quotes 流程 5），以 runner 真实发现数为准（非预估的 9）。
- 补测试后：`Test Files 1 passed (1)`，`Tests 10 passed (10)`（原 7 例回归 + 新增 3 例），退出码 0。

## 五、GREEN → RED 证据与哈希恢复

生产文件基线哈希（SHA256）：

```
98975F4C845DE97E80DA2909195BEAE9C3D07FB7969049C72B699B5D99E99F81
```

流程：`Copy-Item me-crm.ts me-crm.ts.bak` → 单行变异 → 聚焦运行（期望指定断言失败）→ `Copy-Item me-crm.ts.bak me-crm.ts -Force` 恢复 → 删 `.bak` → 重算哈希。

| 变异 | me-crm.ts 改动 | 聚焦命令 | RED 结果（行为失败，非编译/fixture 错误） |
|---|---|---|---|
| 1 | :292 `> 1000` → `> 1001` | `-t "G7-1"` | `FAIL G7-1: expected 200 to be 400`（me-crm.test.ts:295）；1 failed / 9 skipped |
| 2 | :301 注释掉 `notes.shift()` | `-t "G7-2"` | `FAIL G7-2: expected 200, received 201`（me-crm.test.ts:325）；1 failed / 9 skipped |
| 3 | :627 注释掉 `sales.quote.create` 的 writeAudit | `-t "G8"` | `FAIL G8: expected [...] to include 'sales.quote.create'`（me-crm.test.ts:382）；1 failed / 2 passed / 7 skipped |

恢复后校验：

```
RESTORED_HASH=98975F4C845DE97E80DA2909195BEAE9C3D07FB7969049C72B699B5D99E99F81
HASH_MATCH=OK
```

`.bak` 已删除（`Test-Path ...me-crm.ts.bak = False`）。恢复后重跑整文件：`Tests 10 passed (10)`，回 GREEN。

## 六、lint 修复确认

- 删除第 53 行 `const now = new Date();`（未使用变量，eslint `no-unused-vars`）。
- 命令：`pnpm --filter @3cloud/api exec eslint src/routes/me-crm.test.ts`
- 结果：退出码 0，无任何输出 → 该文件 **0 error / 0 warning**。
- 其余 4 处生产源码 lint 问题按授权未触碰。

## 七、typecheck 结果

- 命令：`pnpm --filter @3cloud/api typecheck`（即 `tsc --noEmit`）
- 结果：退出码 0，无类型错误 → **GREEN**。

## 八、自检结论

- [x] 3 个新用例均被 vitest 发现并执行（10/10 通过，非 not_discovered）。
- [x] me-crm.test.ts 文件级回归全绿（原 7 例 + 新增 3 例）。
- [x] 该文件 eslint 0 error。
- [x] 全 api typecheck 绿。
- [x] me-crm.ts 未提交级改动，变异后哈希与基线一致，`.bak` 已清理。
- [x] 仅触碰 `me-crm.test.ts` 一个文件，未执行 git 操作。
