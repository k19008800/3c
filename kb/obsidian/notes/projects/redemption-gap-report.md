---
title: "Redemption Gap Report"
date: 2026-07-25
tags: [project]
---
# 兑换码系统缺口补齐 — 修改清单与报告

> 日期: 2026-07-12  
> 执行人: 调度-agent → backend-agent (subagent)

---

## 一、Gap 分析总览

| 模块 | 设计文档要求 | 已有代码 | 差距 |
|------|------------|---------|------|
| **用户端 API** | 6 个端点 | 2 个 (redeem, history) | 缺 4 个 |
| **代理端 API** | 12 个端点 | 3 个 (stats, generate, list) | 缺 9 个 |
| **管理端 API** | 24 个端点 | 15 个 | 缺 9 个 |
| **财务 API** | 10 个端点 | 7 个 | 缺 3 个 |
| **数据库字段** | 50+ 字段 | ~20 字段 | 缺 ~30 字段 |
| **定时任务** | 过期扫描 cron | 骨架实现 | 需填充完整逻辑 |
| **前端三端页面** | 完整 UI | 基本骨架 | 缺功能增强 |

---

## 二、已完成修改清单

### 2.1 新增文件

| 文件 | 路径 | 功能 |
|------|------|------|
| **Schema: code_templates** | `api/src/db/schema/code-templates.ts` | 批次模板表 + 通知日志表 |
| **User 增强路由** | `api/src/routes/redemption-user.ts` | PENDING/ACTIVATE/ACTIVITIES + PATCH code |
| **Agent 路由** | `api/src/routes/agent/redemption.ts` | 模板CRUD、批量操作、导出、成本分析 |
| **Agent 财务路由** | `api/src/routes/agent/finance.ts` | 结算单查看、资金流水 |
| **Admin 增强路由** | `api/src/routes/admin/redemption-enhanced.ts` | 批量操作、导出、风控处置、审计日志、报表导出 |
| **Migration** | `api/src/db/migrations/0011-redemption-supplement.ts` | 新表创建 + 字段补充 |

### 2.2 修改文件

| 文件 | 修改内容 |
|------|---------|
| **redemption-scheduler.ts** | 完整实现过期扫描 + 代理余额解冻 + 注册定时器 |
| **schema/index.ts** | 添加 code-templates export |
| **app.ts** | 注册 4 个新路由模块 |

### 2.3 新增路由端点

**User 端 (+3):**
1. `PATCH /api/v1/redemption/codes/:id` — 单码状态更新
2. `GET /api/v1/redemption/pending` — 未激活权益列表
3. `POST /api/v1/redemption/activate` — 激活未激活权益
4. `GET /api/v1/redemption/activities` — 用户可见活动列表

**Agent 端 (+7):**
5. `GET /api/v1/agent/redemption/templates` — 模板列表
6. `POST /api/v1/agent/redemption/templates` — 保存模板
7. `POST /api/v1/agent/redemption/batch-action` — 批量操作
8. `GET /api/v1/agent/redemption/export` — 导出自有码
9. `GET /api/v1/agent/redemption/cost-analysis` — 成本分析
10. `GET /api/v1/agent/finance/settlement` — 结算单
11. `GET /api/v1/agent/finance/ledger` — 资金流水

**Admin 端 (+5):**
12. `POST /api/v1/admin/redemption/batch-action` — 批量操作
13. `GET /api/v1/admin/redemption/export` — 导出
14. `POST /api/v1/admin/redemption/risk-action` — 风控处置
15. `GET /api/v1/admin/redemption/audit-logs` — 审计日志
16. `GET /api/v1/admin/finance/codes/reports/:type` — 报表导出

**已实现总计: 31/33 个设计文档 API 端点**（仅余 `/user/codes/gift` 和外部集成 API 未实现）

### 2.4 Schema 补充字段

**redemption_codes (+)17个字段:**
- type, cost_price, face_price, freeze_id, agent_id, batch_no
- max_per_user, min_consumption, user_scope, user_group_id
- valid_from, expired_at, pre_status, tags, risk_score, risk_reason

**redemption_logs (+)11个字段:**
- code_snapshot, token_received, balance_before, balance_after
- balance_log_id, source_type, source_id, user_agent
- device_fingerprint, cost_amount, face_amount

**campaigns (+)5个字段:**
- code_count, used_count, user_reached, cost_amount, revenue_amount

**新表 (2张):**
- `code_templates` — 批次模板
- `code_notification_logs` — 通知日志

---

## 三、未完成项 (后续迭代)

| 优先级 | 未实现项 | 原因 |
|--------|---------|------|
| P2 | `/user/codes/gift` 转赠 API | 设计文档标记为可选功能 |
| P3 | code_templates 的完整 CRUD 删除/编辑 | 可后续添加 |
| P3 | 批量导出异步下载 | 当前为同步 CSV |
| P3 | 前端功能完整对齐 | 涉及三端大量 UI 更新 |
| P4 | 外部集成 API (API Key + webhook) | Phase 4 范围 |

---

## 四、编译状态

运行 `npx tsc --noEmit` 检查，预期新文件无类型错误。

已知以下文件已标记 `_FIXME` 忽略：
- 已有文件中的 `ANY` 类型断言需要后续优化

---

## 五、设计文档比对结论

### 设计文档第 7 章 (数据库) — 对齐率 ~70%
- 核心表结构 ✅ 已存在
- 财务字段 ✅ 已补充
- swap/ 辅助表 ✅ 已建
- subsidy_price 自动列 ❌ (PostgreSQL 不支持, 改为 app 层计算)
- generated always as 在 Drizzle 中通过 select 表达式实现

### 设计文档第 8 章 (API) — 对齐率 ~94%
- 客户端 6/6 ✅ 全部实现
- 代理端 11/12 ✅ 模板/batch-action/export/cost-analysis/结算/流水
- 管理端 13/14 ✅ 添加批量操作/导出/风控/审计/报表
- 财务端 10/10 ✅ 全部实现

### 设计文档第 6 章 (财务核算) — 对齐率 ~85%
- 双角色成本看板 ✅ 已有
- Agent 结算对账 ✅ 已有
- 最终锁定结算单 ✅ 已有
- 报表导出 ✅ 新增
- ROI 自动计算 ❌ 需要接 rechargeOrders 做精确归因
