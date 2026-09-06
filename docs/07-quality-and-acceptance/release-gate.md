# 发布门禁

- 文档 ID：TEST-RELEASE-001
- 状态：draft
- 生效版本：v0.1.0
- 上游 ADR：ADR-0007、ADR-0014

## 顺序
环境检查 → 发布包/提交与依赖校验 → 真实备份 → Drizzle 迁移 → 手写迁移 → 结构校验 → 构建 → 启动/reload → 健康检查 → 集成测试/E2E → 发布后验收。

## 唯一基线
唯一基线文件为 `release-baseline.md`。必须绑定同一提交 SHA、锁文件和环境快照，并覆盖 lint、typecheck、build、单测、API 集成、迁移、安全、E2E、verify。

## 当前结论
未通过。`release-baseline.md` 当前为 `not_ready`；历史 1159、1132、808 不构成正式发布基线，禁止据此部署生产。
