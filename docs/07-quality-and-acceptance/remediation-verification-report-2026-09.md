# 2026-09 整改验证报告

- 文档 ID：REMEDIATION-VERIFY-2026-09
- 状态：review
- 验证日期：2026-09-05
- owner：dispatch-agent
- source_of_truth：`../00-index/governance-policy.md`、`release-baseline.md`、accepted ADR 与本报告列明的现场文件

> 本报告只登记本轮实际修改、实际完成的静态检查、无法执行的命令和仍未关闭的阻断。它不授予任何 PRD/SPEC `approved` 状态，也不改变当前发布结论 `not_ready`。

## 1. 实际整改

1. 将 `00-index/feature-package-matrix.md` 扩展为十四个核心主题，按 `ADR → PRD → SPEC → 状态机 → 权限/数据 → API → TEST → OPS` 登记单文档状态、业务裁决、证据和 owner；缺失项继续标记为缺失或来源资料。
2. 在 `00-index/open-issues.md` 登记 ADR-0008 操作级 2FA 的 P0 实现/证据阻断，明确区分业务裁决已 accepted、实现未闭环、TEST 未闭环、OPS 未闭环。
3. 将 `iteration-plan-v1.md`、`iteration-plan-v2.md` 标为历史计划，将 `api-contract.md` 标为历史汇总/迁移参考，并指向 `05-api/` canonical 契约。
4. 同步 KB 资金限额：人工上账单笔、操作员滚动 24 小时、收款人滚动 24 小时均为 ¥50,000；用户自助充值单笔为 ¥1,000,000；正式文档优先。
5. 修正人工上账生产界面的旧提示和生产代码注释，不改变校验逻辑：页面最高金额提示由 ¥1,000,000 改为 ¥50,000；后端注释改为 accepted 默认 ¥50,000。
6. 对无法可靠恢复的问号损坏内容不作猜测：充值 SPEC 的损坏标题及 `audit/03-logic/LOGIC-001..015`、`logic-rebuild-notes.md` 已增加醒目的 `CORRUPTED / NONCANONICAL` 警告。

## 2. 人工上账默认值核验

现场源文件静态检查确认：

- 后端生产默认：`api/src/lib/finance-rules.ts` 的 `MANUAL_TOPUP_MAX_AMOUNT = 50_000`。
- 后端执行路径：`api/src/routes/admin-finance-missing.ts` 调用 `getManualTopupMaxAmount()` 并拒绝超过有效上限的请求。
- 前端输入 `max` 与默认配置均为 `50000`；本轮同时清除了同页残留的 ¥1,000,000 操作员提示。
- 用户自助充值 `api/src/routes/recharge.ts` 的 `MAX_AMOUNT = 1_000_000` 是独立业务规则，不是人工上账默认值。
- `admin-manual-topup.test.ts` 与 `admin-adjust.test.ts` 中的 `1_000_000` 是显式提高配置上限的测试覆盖，用于验证可配置性/审批链，不代表生产默认。
- 静态检查未发现生产后端配置或可执行代码将人工上账默认设为 ¥1,000,000。未连接部署数据库，因此不能证明运行环境不存在数据库级覆盖。

## 3. 编码与损坏扫描

### 3.1 已完成的文本级检查

以正式文档清单和 `docs/00-index/` 为范围执行文本级模式检查，结果为：

- U+FFFD：0 个正式文件匹配。
- 常见 mojibake 标记：0 个正式文件匹配。
- 问号启发式：发现充值 SPEC 1 个真实损坏标题；另有治理扫描规则字面量及 `259M+117??` Git 状态记法，不作为编码损坏。
- `audit/03-logic/LOGIC-001..015` 与 `logic-rebuild-notes.md` 存在大范围问号替换损坏，合计扫描到 1,029 个匹配行，已标非 canonical，未盲目替换。

### 3.2 Git 恢复尝试

已尝试对充值 SPEC 与 `audit/03-logic/` 运行 Git 历史查询。现场 shell 在命令启动前持续报 `Workspace unavailable ... RPC pipe closed`，无法取得历史 blob；已有状态证据显示这些目录/文件为未跟踪内容，因此当前未建立可信的 exact-path 历史恢复源。现有 `audit/01-requirements/` 候选仍为 `PENDING`/需人工重建，不据此回写。

### 3.3 未能完成的字节级证明

同一 shell 故障阻止了 `read_bytes()` 严格 UTF-8 解码和逐字节 NUL 扫描。因此本轮不能宣称：

- 全库严格 UTF-8 已通过；
- 全库或全部正式文件无 NUL；
- 已识别并移除所有 NUL。

未取得精确受影响文件前没有改写任何文件来“清理”NUL，符合只移除已知 NUL、不得推测业务内容的约束。

## 4. 测试与命令执行

本轮尝试执行：

```bash
pnpm --filter @3cloud/api test -- src/lib/finance-rules.test.ts src/routes/admin-manual-topup.test.ts src/routes/admin-finance-rules.test.ts
pnpm --filter @3cloud/api typecheck
```

两条命令均在进程启动前因隔离工作区 `RPC pipe closed` 被阻断。本轮实际执行测试数为 0，当前工作树没有新的通过/失败计数。

历史证据仅作背景：2026-09-04 日志中上述三个测试文件分别为 10、35、8 个用例通过，共 53/53；历史 `pnpm -r typecheck` exit 0。它们早于本轮修改，不作为当前验证结论。

## 5. 未关闭阻断

1. 当前 release baseline 仍为 `not_ready`；候选发布提交未确定。
2. ADR-0008 业务裁决已 accepted，但 operation-summary 绑定、一次性消费、replay protection、依赖异常 fail-closed 的实现与 TEST/OPS 证据未闭环。
3. API 生产构建产物可运行性、API A5 flaky、E2E balance flake 仍按 `open-issues.md` #22–24 管理；历史审查发现可能存在未验证的 postbuild 修复，不得在真实启动与 `/health` 证据前关闭。
4. 全新数据库迁移、备份恢复、补偿/outbox 及部分退款/对账证据仍缺失。
5. 字节级 NUL/严格 UTF-8 扫描和当前工作树测试尚未成功执行。
6. 问号损坏审计产物尚待按引用源重建并人工复核，不能作为 canonical 验收证据。

## 6. 结论

本轮完成治理登记、资金规则同步、旧提示清理和损坏文档隔离标识；没有提升 PRD/SPEC 状态，没有修改已冻结的业务上限，也没有把历史或未执行结果记为通过。由于测试、字节级编码扫描、ADR-0008 实现证据及既有发布阻断未闭环，生产准入结论保持 `not_ready`。
