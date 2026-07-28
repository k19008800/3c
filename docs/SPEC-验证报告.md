# SPEC 文档 — 流程图一致性校验报告

> 生成时间：2026-07-28T18:08:04.790Z
> 基于问题5 全局逻辑验证的需求

## 校验清单

| 流程图 | 对应 SPEC/PRD | 校验状态 | 备注 |
|--------|-------------|---------|------|
| flowcharts/01-recharge.md | PRD-§2.2.6 充值 + §4.4 财务 | ⏳ 待校验 | |
| flowcharts/02-agent-withdraw.md | PRD-§3.4 提现管理 + §4.4.4 提现审核 | ⏳ 待校验 | |
| flowcharts/03-real-name-review.md | PRD-§2.1.2 实名审核 | ⏳ 待校验 | |
| flowcharts/04-vendor-status-switch.md | PRD-§4.3.1 供应商状态切换 | ⏳ 待校验 | |
| flowcharts/05-auto-reconciliation.md | PRD-§5.2.4 自动对账 | ⏳ 待校验 | |
| flowcharts/06-agent-upgrade.md | PRD-§3.1 代理层级审核 | ⏳ 待校验 | |

## 校验方法
1. 流程图中的每个决策节点 → 在对应 SPEC 中找到对应的逻辑描述
2. 流程图中的异常分支 → 在 SPEC 边界条件中有对应覆盖
3. 流程图与 SPEC 中流程描述的文字版本对比，修正不一致之处
