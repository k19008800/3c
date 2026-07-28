# 3cloud 系统升级 — 详细设计方案

> 基于 2026-07-16 全量代码分析，覆盖 18 个升级模块的详细设计。

---

## 模块索引

### Phase 1 — 速赢（第 1 周）

| # | 模块 | 文件 | 后端(人天) | 前端(人天) |
|---|------|------|-----------|-----------|
| 1 | 页面状态持久化引擎 | [phase1-quickwins/01-page-state-persistence.md](phase1-quickwins/01-page-state-persistence.md) | — | 2 |
| 2 | 一键复制增强 | [phase1-quickwins/02-oneclick-copy.md](phase1-quickwins/02-oneclick-copy.md) | 0.5 | 1 |
| 3 | 智能表单提示系统 | [phase1-quickwins/03-smart-form-hints.md](phase1-quickwins/03-smart-form-hints.md) | — | 1.5 |
| 4 | 仪表盘改造 | [phase1-quickwins/04-dashboard-redesign.md](phase1-quickwins/04-dashboard-redesign.md) | 0.5 | 1.5 |
| 5 | 轻量化操作链路 | [phase1-quickwins/05-lightweight-ops.md](phase1-quickwins/05-lightweight-ops.md) | 1 | 2 |
| 6 | 加载性能优化 | [phase1-quickwins/06-load-performance.md](phase1-quickwins/06-load-performance.md) | 1 | 1.5 |

### Phase 2 — 核心功能（第 2-3 周）

| # | 模块 | 文件 | 后端(人天) | 前端(人天) |
|---|------|------|-----------|-----------|
| 7 | 上游 AK 分组管理 | [phase2-core/07-upstream-key-groups.md](phase2-core/07-upstream-key-groups.md) | 2 | 1 |
| 8 | 时长配额管控 | [phase2-core/08-time-quota.md](phase2-core/08-time-quota.md) | 1.5 | 0.5 |
| 9 | 批量操作体系 | [phase2-core/09-batch-operations.md](phase2-core/09-batch-operations.md) | 2 | 1.5 |
| 10 | 超时重试机制 | [phase2-core/10-timeout-retry.md](phase2-core/10-timeout-retry.md) | 1 | — |
| 11 | 请求内容过滤 + 敏感词拦截 | [phase2-core/11-content-filtering.md](phase2-core/11-content-filtering.md) | 1.5 | 1 |
| 12 | 调用大盘升级 | [phase2-core/12-log-dashboard-upgrade.md](phase2-core/12-log-dashboard-upgrade.md) | 1 | 1 |

### Phase 3 — 体验深化（第 4-6 周）

| # | 模块 | 文件 | 后端(人天) | 前端(人天) |
|---|------|------|-----------|-----------|
| 13 | 内置调试面板 | [phase3-experience/13-debug-playground.md](phase3-experience/13-debug-playground.md) | 1 | 2 |
| 14 | 模板一键导入 | [phase3-experience/14-template-import.md](phase3-experience/14-template-import.md) | 0.5 | 1 |
| 15 | 操作撤销机制 | [phase3-experience/15-undo-system.md](phase3-experience/15-undo-system.md) | 1 | 0.5 |
| 16 | 新手引导系统 | [phase3-experience/16-onboarding-wizard.md](phase3-experience/16-onboarding-wizard.md) | 0.5 | 2 |
| 17 | 术语解释系统 | [phase3-experience/17-terminology-system.md](phase3-experience/17-terminology-system.md) | — | 1 |
| 18 | 用户端体验增强 | [phase3-experience/18-user-portal-enhance.md](phase3-experience/18-user-portal-enhance.md) | 0.5 | 1.5 |

---

## 设计模板说明

每个模块的详细设计文档遵循统一结构：

```
1. 背景与目标         — 为什么要做、做什么
2. 数据库设计          — 新增/修改的表、字段、索引
3. API 设计           — 端点、请求/响应 Schema、状态码
4. 核心逻辑            — 服务层实现细节、流程图
5. 前端组件            — 组件树、状态管理、交互流程
6. 配置项              — 环境变量 / 系统配置表
7. 边界与异常处理       — 错误场景、降级策略
8. 与现有系统的关系      — 依赖模块、影响范围
9. 验收标准            — 可测试的完成条件
10. 安全注意事项        — 权限、数据隔离、防滥用
```
