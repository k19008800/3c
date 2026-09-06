# ADR-0023：API 旧路径兼容窗口与废止规则

- 状态：accepted
- 决策日期：2026-08-29
- 生效版本：v1.0.0
- 决策来源：BOSS 对 `open-issues.md` 项 4 的确认
- 关联 ADR：ADR-0005、ADR-0011

## 背景
既有 `api-reference.md` 将部分 OpenAI 兼容端点错误写为单层 `/api/v1/*`，而当前 API 版本规则区分 `/v1/*`、`/api/v1/*` 和 `/api/v1/v1/*`。

## 决策
- OpenAI 兼容 API canonical 路径为 `/v1/*`。
- Anthropic 兼容 API canonical 路径为 `/anthropic/v1/*`。
- 平台业务 API canonical 路径为 `/api/v1/*`。
- `/api/v1/v1/*` 仅保留为 deprecated alias，不用于新集成、SDK、示例、前端或测试。
- 旧 `api-reference.md` 中错误的单层 `/api/v1/models`、`/api/v1/chat/completions` 等路径不是兼容 alias，必须标记为错误历史内容并修正。
- deprecated alias 必须与 canonical 路径使用同一 handler，并保持认证、权限、计费、幂等、响应和错误行为一致。
- 兼容窗口持续至 `v1.x`；在 `v2.0.0` 移除 `/api/v1/v1/*`。
- alias 调用可通过响应头或日志发送弃用告警，但不得改变响应 envelope。
- 不新增其他兼容 alias；所有新文档只使用 canonical 路径，并标明 alias、canonical 路径、版本、适用对象、推荐性和废止版本。

## 影响与迁移
更新 API reference、API contract、SDK、前端调用、Playground、测试和部署检查；增加 alias/canonical 路径回归矩阵及 `v2.0.0` 移除检查。旧路径在兼容窗口内不得改变安全和计费语义。

## 关联文件
- `docs/05-api/conventions.md`
- `docs/05-api/user/recharge.md`
- `docs/05-api/admin/finance.md`
- `docs/00-index/open-issues.md`
- `audit/08-deployment/document-decision-log.md#dec-023`
