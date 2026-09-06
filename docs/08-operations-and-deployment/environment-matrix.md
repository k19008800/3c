# 环境矩阵

- 文档 ID：OPS-BILLING-001
- 状态：draft
- 生效版本：v0.1.0
- 上游 ADR：ADR-0014

| 组件 | 端口/入口 | 规则 |
|---|---|---|
| API | 3000 | PM2 托管 |
| Portal | 3100 | PM2 托管 |
| Console | 统一入口 `/app/*` | 构建产物 |
| 平台 API | `/api/v1/*` | canonical |
| OpenAI API | `/v1/*` | canonical |
| Anthropic API | `/anthropic/v1/*` | canonical |

具体生产域名、环境变量和代理配置待发布前核验。
