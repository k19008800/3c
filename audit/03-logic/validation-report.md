# audit/03-logic 只读验证报告

验证范围：LOGIC-001 至 LOGIC-015 共 15 个审计文件；需求文档、真实 API、前端与测试路径均进行了只读检查。审计文件读取方式为 Python `encoding="utf-8-sig"`。除本报告外未修改任何文件。

## 总结结论

- **总体：不通过（P0）**。15/15 个文件存在断言或证据质量问题。
- **单一断言检查：不通过**。14/15 个文件的全部原子行使用了禁止模板 `Requirement quote is independently verifiable`；LOGIC-010 虽改成了 `Requirement source line ...`，但仍不是业务行为断言。
- **复杂逻辑条数：部分通过**。总计 780 条原子行。LOGIC-007、008、012、013、014、015 各 64 条，达到 `>=60`；其余 001–006、009、010、011 各 44 条，未达到门槛。
- **引用路径存在性：通过（按字段中解析出的路径）**。15 个文件中的前端、后端、DB、测试路径均存在；但证据均带有未确认占位，不能视为有效证据。
- **证据具体性：不通过（P0）**。所有文件的证据字段使用 `line unconfirmed`、`schema location unconfirmed` 或 `case unconfirmed` 等泛化占位。没有真实行号、符号、函数或测试用例定位。
- **source_quote 对应性：不通过（P1；作为验收依据时升为 P0）**。大量表格行的 quote 将原文 Markdown 的 `|` 错写成 `/`；逐文件不匹配数量见下表。
- **编码：通过**。15 个审计文件均可由 Python UTF-8-SIG 正确读取，中文内容无解码错误；本报告也以 UTF-8 写入。

## 分文件结果

| 文件 | 原子行 | 模板断言 | 泛化证据字段 | 缺失路径 | quote 不匹配 | 严重度 |
|---|---:|---:|---:|---:|---:|---|
| `LOGIC-001-auth-session.md` | 44 | 44 | 176 | 0 | 24 | P0 |
| `LOGIC-002-apikey-lifecycle.md` | 44 | 44 | 176 | 0 | 23 | P0 |
| `LOGIC-003-model-routing.md` | 44 | 44 | 176 | 0 | 10 | P0 |
| `LOGIC-004-rate-limit.md` | 44 | 44 | 176 | 0 | 2 | P0 |
| `LOGIC-005-circuit-breaker.md` | 44 | 44 | 176 | 0 | 2 | P0 |
| `LOGIC-006-token-metering.md` | 44 | 44 | 176 | 0 | 23 | P0 |
| `LOGIC-007-balance-preconsume.md` | 64 | 64 | 256 | 0 | 27 | P0 |
| `LOGIC-008-settlement-refund.md` | 64 | 64 | 256 | 0 | 27 | P0 |
| `LOGIC-009-consumption-log.md` | 44 | 44 | 176 | 0 | 28 | P0 |
| `LOGIC-010-idempotency.md` | 44 | 0 | 176 | 0 | 30 | P0 |
| `LOGIC-011-recharge-order.md` | 44 | 44 | 176 | 0 | 15 | P0 |
| `LOGIC-012-recharge-approval.md` | 64 | 64 | 256 | 0 | 11 | P0 |
| `LOGIC-013-manual-topup.md` | 64 | 64 | 256 | 0 | 11 | P0 |
| `LOGIC-014-balance-adjustment.md` | 64 | 64 | 256 | 0 | 11 | P0 |
| `LOGIC-015-reversal.md` | 64 | 64 | 256 | 0 | 40 | P0 |

## 失败示例

### 1. 断言使用禁止模板（P0）

- `LOGIC-001-auth-session.md:15`，`LOGIC-001-001` 的断言是 `Requirement quote is independently verifiable: ?# 安全与风控 — 深化参考文档?`。这是文档标题和元话术，不是可执行的单一业务要求。
- `LOGIC-004-rate-limit.md:15`，`LOGIC-004-001` 的断言是 `Requirement quote is independently verifiable: ?# 3cloud 限流引擎（Rate Limiter）深化文档?`，同样不构成行为、状态、约束或结果断言。
- 修订建议：改为具体、可测试且只包含一个要求的句子，例如“有效 QPS 取全局、用户、Key、模型四级非空限制的最小值”。标题、章节名、表头、版本信息不得直接作为逻辑断言；不得以模板话术包装 quote。

### 2. 证据是泛化占位（P0）

- `LOGIC-001-auth-session.md:15` 的前端、后端、DB、测试字段分别使用 `line unconfirmed`、`schema location unconfirmed`、`case unconfirmed`；该文件 44 行共 176 个证据字段均为此类占位。
- `LOGIC-007-balance-preconsume.md:15` 使用 `api/src/services/billing/pre-consume.ts (line unconfirmed)`，64 行的证据字段均未给出真实定位。
- 修订建议：证据必须给出具体文件及真实行号、函数/符号或测试用例名称。DB 证据应指向实际 schema 定义或迁移，而不是统一指向未确认的 `api/src/db/index.ts`。找不到证据时填写 `MISSING`，不要声称已核验。

### 3. source_quote 与需求原文行不一致（P1，验收场景 P0）

- `LOGIC-001-auth-session.md:17` 标注 `docs/ref-4.6-security.md:59`，quote 为 `/ 表名 / 用途 / 引擎层 /`；需求原文第 59 行是 `| 表名 | 用途 | 引擎层 |`。
- `LOGIC-001-auth-session.md:18` 标注第 61 行，quote 为 `/ security_events / 安全事件记录 / Layer 4 /`；原文是 `| security_events | 安全事件记录 | Layer 4 |`。
- 这表明 Markdown 表格竖线在生成或转义时被批量失真。修订建议：按需求文档真实行重新提取 quote，保留原始 Markdown 字符，并自动校验 `source_quote.strip() == source_line.strip()`。

### 4. 复杂逻辑条数不足（P1）

- `LOGIC-001-auth-session.md`、`LOGIC-002-apikey-lifecycle.md`、`LOGIC-003-model-routing.md`、`LOGIC-004-rate-limit.md`、`LOGIC-005-circuit-breaker.md`、`LOGIC-006-token-metering.md`、`LOGIC-009-consumption-log.md`、`LOGIC-010-idempotency.md`、`LOGIC-011-recharge-order.md` 均只有 44 条，低于 `>=60`。
- 修订建议：按真实需求补充分支，优先覆盖失败补偿、事务提交/回滚、并发、幂等首次/重复请求、缓存失效、审计、通知、重试、超时可恢复性与测试证据；禁止复制模板行凑数。

## 逐文件失败摘要

- `LOGIC-001-auth-session.md`：44/44 模板；176 个泛化证据字段；24 个 quote 不匹配；条数不足。
- `LOGIC-002-apikey-lifecycle.md`：44/44 模板；176 个泛化证据字段；23 个 quote 不匹配；条数不足。
- `LOGIC-003-model-routing.md`：44/44 模板；176 个泛化证据字段；10 个 quote 不匹配；条数不足。
- `LOGIC-004-rate-limit.md`：44/44 模板；176 个泛化证据字段；2 个 quote 不匹配；条数不足。
- `LOGIC-005-circuit-breaker.md`：44/44 模板；176 个泛化证据字段；2 个 quote 不匹配；条数不足。
- `LOGIC-006-token-metering.md`：44/44 模板；176 个泛化证据字段；23 个 quote 不匹配；条数不足。
- `LOGIC-007-balance-preconsume.md`：64/64 模板；256 个泛化证据字段；27 个 quote 不匹配。
- `LOGIC-008-settlement-refund.md`：64/64 模板；256 个泛化证据字段；27 个 quote 不匹配。
- `LOGIC-009-consumption-log.md`：44/44 模板；176 个泛化证据字段；28 个 quote 不匹配；条数不足。
- `LOGIC-010-idempotency.md`：176 个泛化证据字段；30 个 quote 不匹配；条数不足；断言仍非业务语义断言。
- `LOGIC-011-recharge-order.md`：44/44 模板；176 个泛化证据字段；15 个 quote 不匹配；条数不足。
- `LOGIC-012-recharge-approval.md`：64/64 模板；256 个泛化证据字段；11 个 quote 不匹配。
- `LOGIC-013-manual-topup.md`：64/64 模板；256 个泛化证据字段；11 个 quote 不匹配。
- `LOGIC-014-balance-adjustment.md`：64/64 模板；256 个泛化证据字段；11 个 quote 不匹配。
- `LOGIC-015-reversal.md`：64/64 模板；256 个泛化证据字段；40 个 quote 不匹配。
