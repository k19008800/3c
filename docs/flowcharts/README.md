# 3cloud 核心业务流程泳道图

> 最后更新：2026-07-28
> 格式：Mermaid 泳道图（嵌入 `.md` 文件，在支持 Mermaid 的 Markdown 渲染器中直接查看）
> 用途：快速理解各角色间的职责边界、状态流转、关键决策点

---

## 泳道图索引

| # | 流程名称 | 涉及角色 | 文件 |
|---|---------|---------|------|
| 1 | 充值流程 | 用户 → 系统 → 支付网关 → 财务/运营 | [`01-recharge.md`](01-recharge.md) |
| 2 | 代理提现双审流程 | 代理 → 财务初审 → 财务复审 → 系统 → 支付平台 | [`02-agent-withdraw.md`](02-agent-withdraw.md) |
| 3 | 实名审核流程 | 用户 → 系统 → 安全/运营 | [`03-real-name-review.md`](03-real-name-review.md) |
| 4 | 供应商状态切换流程 | 系统(限流/预算) → 运营 → 系统 | [`04-vendor-status-switch.md`](04-vendor-status-switch.md) |
| 5 | 自动对账流程 | 系统(定时任务) → 对账引擎 → 财务 | [`05-auto-reconciliation.md`](05-auto-reconciliation.md) |
| 6 | 代理晋升审核流程 | 代理 → 系统 → 代理管理 → 运营 | [`06-agent-upgrade.md`](06-agent-upgrade.md) |

---

## 渲染方式

这些文件使用 Mermaid 的 `sequenceDiagram` 或 `flowchart` 语法编写，支持：

- **GitHub**：原生渲染
- **VS Code**：安装 Markdown Preview Mermaid Support 插件
- **Obsidian**：原生支持
- **在线查看**：https://mermaid.live/（粘贴后渲染）

如果 PRD-README.md 需要引用，使用图片链接指向 GitHub 或本地的渲染截图。