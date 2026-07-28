# Sprint 1 — 需求文档索引

> **项目**：3cloud（3C）运营版 PRD
> **Sprint**：1/5 | **模块**：账号注销流程 + 代理结算对账
> **日期**：2026-07-27 | **版本**：V1.4

---

## 文件结构

```
docs/sprint-1/
├── README.md                              ← 本文件：索引 + 待确认问题 + 验收总纲 + 开发顺序
├── 01-account-deletion-overview.md         ← 账号注销：业务概述 + 数据表 + 7个后端API + 状态机 + 定时任务
├── 02-account-deletion-frontend.md         ← 账号注销：前端组件拆解 + 3种状态UI原型 + 交互规则 + 路由
├── 03-settlement-overview.md              ← 结算对账：业务概述 + 4张数据表 + 11个后端API + 核心流程图 + 定时任务
├── 04-settlement-frontend.md              ← 结算对账：管理端/代理端页面组件 + 弹窗原型 + API对接
└── 05-boundary-conditions.md              ← 边界条件 + 异常场景 + 安全审计 + QA测试用例清单
```

---

## 模块概览

| # | 模块 | 优先级 | 后端 API 数 | 前端组件数 | 数据表数 | 定时任务数 | 依赖 |
|---|------|--------|------------|-----------|---------|-----------|------|
| 1 | 账号注销流程 | P0 | 7 个 | 8 个 | 2 张 | 1 个 | 无 |
| 2 | 代理结算对账 | P0 | 11 个 | 10 个 | 4 张 | 2 个 | 无 |

两个模块**无依赖关系**，可并行独立开发。

---

## 开发顺序建议

### 后端开发顺序

```
Phase 1a: 账号注销（建议 6h）
  1. 编写 account-deletion schema + Drizzle 表定义（30min）
  2. 生成迁移 SQL + 执行（15min）
  3. 用户端 API：POST + GET + DELETE /me/deletion（2h）
  4. 管理端 API：GET 列表 + GET 详情 + POST reject + POST force（2h）
  5. 定时任务 auto-deletion cron（30min）
  6. 路由注册 + 编译验证（15min）

Phase 1b: 结算对账（建议 10h）
  1. 编写 agent-settlement schema + Drizzle 表定义（40min）
  2. 生成迁移 SQL + 执行（15min）
  3. Service 层：settlement-cycle.ts（关账逻辑 + 自动确认逻辑）（3h）
  4. 管理端 API：7 个 API（3h）
  5. 代理端 API：4 个 API（1.5h）
  6. 定时任务：auto-settlement-cycle + auto-confirm-settlements（1h）
  7. 路由注册 + 编译验证（15min）
```

### 前端开发顺序

```
Phase 2a: 账号注销-用户端（建议 5h）
  1. AccountDeletionPanel + 状态分发逻辑（1.5h）
  2. DeletionChecklist + 跳转入口（1h）
  3. DeletionCoolingTimer + 倒计时逻辑（1h）
  4. DeletionConfirmDialog（0.5h）
  5. 集成到设置页 + 联调（1h）

Phase 2b: 账号注销-管理端（建议 3h）
  1. AdminDeletionRequests + 列表+筛选+分页（1.5h）
  2. AdminDeletionDetail + 驳回弹窗 + 强制弹窗（1h）
  3. 路由注册 + 侧边栏入口（0.5h）

Phase 2c: 结算对账-管理端（建议 7h）
  1. SettlementCyclesList + 创建弹窗（1.5h）
  2. SettlementList + 筛选+分页（1.5h）
  3. SettlementDetail + 汇总+明细+日志（2h）
  4. SettlementAdjustDialog + 实时金额预览（1h）
  5. SettlementExportBtn CSV 导出（0.5h）
  6. 集成到现有 Finance 标签页（0.5h）

Phase 2d: 结算对账-代理端（建议 5h）
  1. AgentSettlementsList + 列表+统计（1.5h）
  2. AgentSettlementDetail + 明细（1.5h）
  3. AgentSettlementConfirmBtn + 弹窗（1h）
  4. AgentSettlementExportBtn（0.5h）
  5. 集成到代理财务标签页 + 联调（0.5h）
```

---

## 待确认问题（开发前需要决策）

| # | 模块 | 问题 | 建议方案 | 影响范围 |
|---|------|------|---------|---------|
| Q1 | 账号注销 | 用户余额 > 0 是否可以注销？还是必须清零？ | **建议**：必须清零，余额为 0 才可通过检查。有余额时提示"当前余额 ¥X.XX，请先消费或申请退款" | 检查项 balance_cleared 的逻辑 |
| Q2 | 账号注销 | 用户是代理且有绑定客户时，是否可以注销？还是必须先转移？ | **建议**：必须先转移客户或解约。提示"您是代理，名下有 N 个客户，请先转移" | 检查项 no_active_agent 的 detail 文案 |
| Q3 | 账号注销 | 冻结期内用户是否允许登录？是否允许下载数据？ | **建议**：允许登录查看历史 + 下载消费记录；不允许 API 调用、充值、新建 Key | auth 中间件 + 前端入口隐藏 |
| Q4 | 账号注销 | 数据脱敏字段范围？ | **建议**：nickname → "已注销用户_{id}"，email → "deleted_{id}@internal.3cloud.ai"，phone/avatar_url → NULL | users 表 UPDATE |
| Q5 | 结算对账 | 自动关账定在何时？ | **建议**：每月 1 日 02:00（UTC+8） | 定时任务配置 |
| Q6 | 结算对账 | 调整后已确认的单据是否退回 pending？ | **建议**：仅 pending 状态可调整，已 settled 不可调 | adjust API 校验规则 |
| Q7 | 结算对账 | CSV 导出字段范围？ | **建议**：日期,客户ID,模型,Token数,佣金,佣金率 | export API 字段 |
| Q8 | 综合 | 前端入口路径？ | **建议**：注销→/console/settings（用户端）/admin/deletion（管理端）；结算→/admin/finance（管理端）/agent/finance（代理端） | 路由配置 |

---

## 交付验收标准

### 账号注销

| # | 验收项 | 预期结果 | 验证方式 |
|---|--------|---------|---------|
| 1 | 用户提交注销申请 | 执行 6 项检查 → 展示结果，通过/不通过都在前端明确展示 | 前端操作 |
| 2 | 条件全通过 → 冷却期 | status=cooling, cooling_deadline=7天后, Key 被禁用 | 检查 DB + API |
| 3 | 条件不通过 → 失败列表 | 返回每项 passed/detail，前端显示未通过项及跳转入口 | 前端操作 |
| 4 | 冷却期内撤销 | DELETE API → status=cancelled，恢复正常使用 | API 测试 |
| 5 | 冷却期到 → 自动注销 | 数据脱敏 + status=completed | 定时任务触发后检查 DB |
| 6 | 冷却期权限控制 | API 返回 403，充值/新建Key入口隐藏 | API + 前端验证 |
| 7 | 管理员驳回 | 需填写原因 → status=rejected | API 测试 |
| 8 | 管理员强制注销 | 跳过冷却期直接脱敏 | API 测试 |
| 9 | 管理端列表筛选 | 支持 status 筛选 + 分页 | 前端操作 |

### 结算对账

| # | 验收项 | 预期结果 | 验证方式 |
|---|--------|---------|---------|
| 1 | 管理员创建结算周期 | 自动关账 + 生成代理账单 | API 测试 |
| 2 | 仅结算正式活跃代理 | level=formal + status=active | 检查 SQL 查询条件 |
| 3 | 零佣金代理跳过 | 不生成结算单 | API 测试 |
| 4 | 代理查看自己结算单 | 列表 + 详情 + 明细 | 前端操作 |
| 5 | 代理确认结算单 | 金额转入 settled_commission | Check DB + API |
| 6 | 3 天未确认 → 自动确认 | 系统自动执行 + 日志记录 | 定时任务触发后检查 |
| 7 | 管理员调整金额 | pending 状态可调 | API 测试 |
| 8 | CSV 导出 | 管理端 + 代理端均可导出 | 前端操作 |
| 9 | 操作日志完整 | 生成/确认/自动确认/调整皆有记录 | 检查 DB |
| 10 | 重复关账防护 | 已关账报错 | API 测试 |