# 需求恢复与人工复核协议

版本：v1.0  
日期：2026-08-30  
适用范围：`reversible-recovery-review.csv`、`recovery-batches/`、`recovery-batches/manual-review/` 及 `*-atomic-reviewed-v1.csv`

## 1. 目标与边界

本协议的目标是把疑似编码损坏的需求字段，经过可追溯的人工核验后，形成独立的 reviewed 需求清单。机械转换只提供候选，不提供语义结论。

明确禁止：

- 覆盖 `core-finance-atomic-v2.csv`、`admin-portal-atomic-v2.csv`、`user-agent-atomic-v2.csv`；
- 依据乱码猜测原文；
- 用归档文档、辅助 SPEC、代码注释或实现现状替代当前 `source_path`；
- 把 `REVIEW_CANDIDATE`、`reviewed-v1` 或字符串匹配结果当作 `PASS`；
- 将 `UNKNOWN`、`PENDING` 或 `REJECT` 混入正式通过集；
- 在需求内容门禁通过前修改业务源码、部署配置或生产环境。

## 2. 产物层级与唯一事实来源

| 层级 | 产物 | 可否作为正式需求 |
|---|---|---|
| Canonical 底稿 | `*-atomic-v2.csv` | 当前基线；未经批准不得覆盖 |
| 候选分流 | `reversible-recovery-review.csv` | 否，仅记录机械候选和人工待审状态 |
| 批次输入 | `recovery-batches/*batch-*.csv` | 否，仅用于分批复核 |
| 人工工作表 | `recovery-batches/manual-review/*-review.csv` | 否，人工签核记录 |
| 机械草稿 | `*-atomic-reviewed-v1.csv` | 否，不能作为验收或 PASS 证据 |
| 正式 reviewed | 经审批另行生成的版本 | 仅 APPROVE 条目可进入 |

当不同产物统计不一致时，以最新运行的生成脚本输出和 canonical v2 行数为准，并在报告中记录生成时间；不得手工把旧统计改成通过结论。

## 3. 单条复核流程

每条记录必须按以下顺序处理：

### 3.1 确认源文件

1. 打开 `source_path` 指向的当前文件。
2. 确认文件存在、可读、编码明确。
3. 若文件本身仍有乱码，不能把乱码行当作可靠原文；转入 `UNKNOWN` 或 `MANUAL_REBUILD`。

### 3.2 确认章节

将 `recovered_section` 与 `section_source_lines` 对照当前源文档：

- 必须是实际章节标题、表格所在章节或可明确解释的源位置；
- 标题层级、编号、前后文必须一致；
- 不能只因为字符串能在转换后的行中匹配就通过；
- 找不到真实章节或章节边界不明确时，`section_check=REJECT` 或 `UNKNOWN`。

### 3.3 确认引用

将 `recovered_quote` 与 `quote_source_lines` 对照当前源文档：

- 引用必须完整表达原文，不得截断关键条件、数值、范围、例外或结果；
- 行号必须指向当前源文档，而不是归档或辅助文件；
- Markdown 标记、反引号、路径、接口、参数、单位和标点必须逐项核对；
- 仅能定位到乱码行、拼接行或多个不连续片段时，不得通过；
- 不确定原文是否完整时保持 `UNKNOWN`。

### 3.4 确认原子断言

将 `recovered_assertion` 拆成“条件—动作—结果”检查：

- 是否只有一个可独立验证的条件、动作或结果？
- 是否隐藏了第二个动作、通知、审计、状态变更或副作用？
- 是否包含“以及、同时、并且”等连接的多个验收点？命中不必然拆分，但必须人工判断；
- 若需拆分，原始 `req_id` 保留为 `derived_from`，每个新断言必须有独立引用、证据和编号；
- 语义不完整或依赖猜测时，`assertion_check=REJECT` 或 `UNKNOWN`。

### 3.5 确认格式风险

逐项检查：

- 全角/半角标点是否改变语义；
- 路径、URL、HTTP 方法、字段名、枚举值、正则、代码标识是否准确；
- 数值、单位、比较符号、百分比、时间和边界是否准确；
- Markdown 标题、表格、列表、粗体、反引号是否保持结构；
- 转义符、箭头、括号和引号是否需要解释。

无法解释的差异填 `format_risk_check=REVIEW`，不得填写 `NONE`。

## 4. 状态机

```text
PENDING
  ├─ 证据充分，四项检查通过且有依据 → APPROVE
  ├─ 证据不足，无法证明语义或原文 → UNKNOWN
  └─ 发现错配、残余乱码、复合断言或格式错误 → REJECT
```

`APPROVE` 的必要条件：

```text
section_check=PASS
quote_check=PASS
assertion_check=PASS
format_risk_check=NONE
review_notes 非空且可追溯
review_decision=APPROVE
```

任何一项不满足，最终结论都不能是 `APPROVE`。

## 5. 正式 reviewed 清单闸门

正式 reviewed 清单生成前必须确认：

- 所有纳入条目均来自人工复核表的 `APPROVE`；
- 每条保留原始 `req_id`、`source_path`、源行号和复核依据；
- `UNKNOWN`、`REJECT`、`PENDING` 不进入通过集；
- 拆分项保留 `derived_from` 关系；
- canonical v2 行数、字段列、编号唯一性和未处理问题统计均有对照；
- 运行编译、审计门禁、报告重建和源完整性检查；
- 门禁仍失败时，报告必须如实写明 `FAIL` 和剩余 findings。

## 6. 复核交付记录

每完成一个批次，记录：

- 批次文件名、源文档、处理日期；
- `PENDING`、`APPROVE`、`UNKNOWN`、`REJECT` 数量；
- 被拒原因分类；
- 拆分数量及 `derived_from`；
- 门禁、报告重建和源完整性命令结果；
- 下一批次入口。
