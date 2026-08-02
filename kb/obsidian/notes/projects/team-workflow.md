---
title: "多 Agent 团队协作工作流"
date: 2026-07-11
tags: [project, workflow, multi-agent]
aliases: [团队工作流, 多Agent协作, team-workflow]
---

# 多 Agent 团队协作工作流

> 7 Agent 全自动串联流程 + 内容自动分发路由

---

## 路由系统

dispatch-agent 已启用内容自动分发路由。

| 组件 | 位置 |
|------|------|
| 路由配置 | `routing/routing-config.json` |
| 分发协议 | `routing/dispatch-flow.md` |
| 系统总览 | `routing/README.md` |

## Agent 对照表

| Agent ID | 角色 | 核心产出 |
|----------|------|---------|
| dispatch-agent 📋 | 项目总调度 | WBS、风险台账、进度报告 |
| product-agent 🧾 | 业务产品经理 | PRD、功能清单、验收标准 |
| arch-agent 🏛️ | 系统架构总设计师 | 架构方案、ADR |
| backend-agent 💻 | 后端研发工程师 | 微服务代码、接口文档 |
| test-agent 🎯 | 专职测试工程师 | 测试用例、缺陷台账 |
| ops-agent 🔧 | DevOps/集群运维 | CI/CD、部署脚本、监控 |
| delivery-agent 📦 | 现场实施交付 | 部署方案、培训手册 |

## 全自动串联流程

```
用户需求 → dispatch-agent（拆解）
  → 并行：product-agent (PRD) + arch-agent (架构)
  → 双审定稿 → backend-agent (开发)
  → test-agent (测试) → BUG 回 backend 修复
  → ops-agent (打包部署)
  → delivery-agent (现场交付)
  → dispatch-agent (归档反馈)
```

## 需求变更流程

变更提出 → dispatch 评估影响 → product 更新 PRD → arch 评审 → dispatch 更新排期

## 交接协议

所有 Agent 交接必须包含：
1. 完成摘要
2. 产出物路径（`shared/...`）
3. 验证方式
4. 已知风险
5. 下一步指令

## 参考
- [[3cloud|3cloud 项目总览]]
- [[projects/INDEX|项目索引]]
