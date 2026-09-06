# ADR-0014：部署环境、进程与发布顺序

- 状态：accepted
- 决策日期：2026-08-29
- 生效版本：v1.0.0
- 决策来源：DEC-014

## 决策
- API/Portal 由 PM2 托管，分别监听 3000/3100；Console 使用构建产物由统一入口提供。
- `/`、`/dashboard` 到 Portal；`/app/*` 到 Console；业务、OpenAI、Anthropic 路径按 API 版本决策路由。
- 发布顺序：环境检查 → 包校验 → 真实备份 → 0000–0016 → 0017–0032 → 结构校验 → 构建 → 启动/reload → 路由健康检查 → 集成测试 → 发布验收。
- 任一步失败立即停止，不启动新版本，保留备份、日志和失败编号并按回滚方案处理。
- 禁止只启动 API、迁移失败后启动 PM2、使用开发 `.env` 或以文字替代真实备份。

## 关联
`audit/08-deployment/document-decision-log.md#dec-014`
