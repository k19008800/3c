# ADR-0029：全量发布测试唯一基线

- 状态：accepted
- 决策日期：2026-08-29
- 生效版本：v1.0.0
- 决策来源：BOSS 对 `open-issues.md` 项 10 的确认
- 关联 ADR：ADR-0014、ADR-0026、ADR-0028

## 决策
- 正式发布基线不采用历史文档中的 `1159`、`1132` 或 `808`。
- 每个发布候选版本生成唯一基线记录，必须包含版本号、提交 SHA、执行命令、测试范围、通过数、失败数、跳过数、执行时间、Node/pnpm/Vitest 版本及数据库/Redis 环境。
- 基线必须覆盖 lint、typecheck、build、单元测试、API 集成测试、数据库迁移测试、权限/2FA/幂等测试、E2E 和 `verify`。
- 所有结果必须来自同一提交 SHA、同一依赖锁文件和同一环境快照。
- 任一必选门禁失败，整体基线为 `failed`，不得用部分通过数宣称发布通过。
- flaky/blocked 测试必须单列、指定责任人和风险说明，不得从失败数中隐式扣除。
- 唯一基线文件为 `docs/07-quality-and-acceptance/release-baseline.md`；部署清单、报告和发布决策只能引用该文件。
- 提交、依赖、迁移或测试范围变化时必须重新生成基线；未生成并确认唯一基线前禁止生产部署。

## 影响与迁移
更新测试策略、release-gate、部署清单和发布报告；建立基线记录模板和证据留存；当前仍未生成实际发布基线，不得标记发布门禁通过。

## 关联文件
- `docs/07-quality-and-acceptance/release-baseline.md`
- `docs/07-quality-and-acceptance/release-gate.md`
- `docs/00-index/open-issues.md`
- `audit/08-deployment/document-decision-log.md#dec-029`
