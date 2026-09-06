# ADR-0030：四项业务契约冻结

- 状态：accepted
- 决策日期：2026-08-31
- 生效版本：v1.0.0
- 决策来源：BOSS 明确确认 3cloud 需求文档整顿方案中的四项默认裁决
- 关联 ADR：ADR-0011、ADR-0012、ADR-0020、ADR-0024、ADR-0029

## 背景

审计发现错误码、分页、结算/对账权限和 platform_ledger 范围在来源文档与正式契约之间存在分歧。若不冻结，API、权限、测试和实现会继续分叉。

## 决策

### 1. 余额不足错误码按 API 表面和业务语义拆分

- OpenAI/Anthropic 兼容模型消费表面：使用 HTTP `402`，业务码为 `PAYMENT_REQUIRED`。
- 平台业务资金操作表面 `/api/v1/*`：余额扣减、补扣、红冲等禁负校验使用 HTTP `422`，业务码为 `INSUFFICIENT_BALANCE`。
- 两个 API 表面不得以同一错误码表达不同 HTTP 语义。
- 既有兼容客户端收到的上游原生错误可以继续透传；平台内部日志和契约按 `PAYMENT_REQUIRED` 归类。

### 2. 分页契约统一

- 请求参数正式名称：`page`、`page_size`。
- 响应正式结构：`data.items`、`data.page`、`data.page_size`、`data.total`。
- `pageSize` 仅作为 v1.x 兼容别名接收，不进入正式文档示例；新客户端不得使用。
- 历史 `list`、`pagination` 返回结构登记为代码/契约差距，必须按端点迁移，不能静默保留为新契约。

### 3. 结算/对账权限拆分

- `RECONCILIATION_VIEW`：对账报告、结算报告和明细的查看、运行、导出。
- `FINANCE_RECON_APPROVE`：差异处理、补账、核销及复核关闭；资金写操作继续受操作级 2FA 和职责分离约束。
- `settlement.generate`：生成结算周期和结算单。
- `settlement.adjust`：调整结算金额；需要操作级 2FA和职责分离。
- `finance.rule_config`：财务规则、限额、差异阈值配置；不并入通用 `sys.config`。
- 结算确认仍由代理本人执行，并受资源归属校验。

### 4. 当前版本不启用 platform_ledger

- 当前版本的资金事实来源为余额账户、资金流水、业务单据、审计日志和通知 outbox。
- `platform_ledger` 不进入当前版本的运行链路、验收范围或迁移范围。
- 总账、科目、借贷事件、期初迁移和锁账结转作为后续独立版本，必须另行提交 ADR、数据设计、迁移和测试方案。
- 当前文档中涉及 `platform_ledger` 的内容统一标记为后续范围，不得阻断本版本五大资金主题；不得把预留表或历史设计当作当前实现依据。

## 影响与迁移

1. 同步 `05-api/errors.md`、`05-api/conventions.md`、`06-data-and-architecture/permissions-and-authorization.md`、五大资金 PRD/SPEC、TEST 和 OPS 文档。
2. 代码中仍使用旧错误码或旧分页结构的端点登记为差距，按端点分批整改。
3. 更新 `00-index/open-issues.md`：四项裁决关闭；仅保留实现差距和测试/演练缺口。
4. 本 ADR 不代表五大资金主题已 approved，也不代表生产发布准入通过。

## 验收

- ADR 登记为 accepted，且唯一入口可追溯。
- 正式 API/权限/主题文档引用本 ADR。
- 兼容消费余额不足与平台资金余额不足分别有契约测试。
- 新增或修订的分页端点使用统一结构。
- 结算/对账权限矩阵可映射到权限守卫和测试。
- 当前版本测试与发布基线不包含 platform_ledger 运行要求。
