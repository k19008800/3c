# 运营版 PRD 补充——可执行交付清单

> 从 `PRD-运营级-补充-SPEC.md` 映射到具体开发任务
> 按优先级分组，标注后端/前端/工作量预估值

---

## 📦 P0 — 核心缺失（业务运转必需）

### P0-1 账号注销流程

| 编号 | 任务 | 端 | 预估 | 说明 |
|------|------|----|------|------|
| P0-1-1 | 创建 `account_deletion_requests` 表 + migration | BE | 小 | 含索引和约束 |
| P0-1-2 | 创建 `deletion_checklist` 表 + migration | BE | 小 | |
| P0-1-3 | 实现 `POST /api/v1/me/deletion` — 提交注销 + 条件检查 | BE | 中 | 6 项检查逻辑 |
| P0-1-4 | 实现 `GET /api/v1/me/deletion` — 查询注销状态 | BE | 小 | |
| P0-1-5 | 实现 `DELETE /api/v1/me/deletion` — 撤销注销 | BE | 小 | |
| P0-1-6 | 实现 `GET/POST /api/v1/admin/users/:id/deletion` 系列 | BE | 中 | 驳回+强制注销 |
| P0-1-7 | 实现 cron 自动注销定时任务 (每日 03:00) | BE | 中 | 数据脱敏逻辑 |
| P0-1-8 | 用户端 Settings 页 — 注销账号区域 UI | FE | 中 | 条件勾选框+提交按钮 |
| P0-1-9 | 用户端 — 注销中状态页（冻结期提示+撤销按钮） | FE | 小 | |
| P0-1-10 | 管理端 — 用户详情页展示注销信息 | FE | 小 | |

**后端预估：中（3-4h）· 前端预估：中（3-4h）**

### P0-2 代理结算对账（端到端）

| 编号 | 任务 | 端 | 预估 |
|------|------|----|------|
| P0-2-1 | 创建 `settlement_cycles` 表 + migration | BE | 小 |
| P0-2-2 | 创建 `agent_settlements` 表 + migration | BE | 小 |
| P0-2-3 | 创建 `settlement_details` 表 + migration | BE | 小 |
| P0-2-4 | 创建 `settlement_confirm_logs` 表 + migration | BE | 小 |
| P0-2-5 | 实现随用随算的佣金归期逻辑（按消费时间） | BE | 中 |
| P0-2-6 | 实现 `GET /api/v1/admin/finance/settlement-cycles` | BE | 小 |
| P0-2-7 | 实现 `POST /api/v1/admin/finance/settlement-cycles/generate` (手动关账) | BE | 中 |
| P0-2-8 | 实现 `GET /api/v1/admin/finance/settlements` + 详情 | BE | 中 |
| P0-2-9 | 实现 `POST /api/v1/admin/finance/settlements/:id/adjust` | BE | 小 |
| P0-2-10 | 实现 `GET /api/v1/agent/settlements` + 详情 + 确认 | BE | 中 |
| P0-2-11 | 实现结算账单 PDF 生成 (pdfkit 或 puppeteer) | BE | 大 |
| P0-2-12 | 实现 cron 每月 1 日自动关账（含退款扣回） | BE | 中 |
| P0-2-13 | 管理端 — 结算管理页面（周期列表+代理结算单+详情） | FE | 大 |
| P0-2-14 | 代理端 — 结算账单页（列表+详情+确认按钮） | FE | 中 |
| P0-2-15 | 代理端 — 结算单 PDF 下载入口 | FE | 小 |

**后端预估：大（8-12h）· 前端预估：大（6-8h）**

### P0-3 运营待办队列

| 编号 | 任务 | 端 | 预估 |
|------|------|----|------|
| P0-3-1 | 创建 `admin_todo_queue` 表 + migration | BE | 小 |
| P0-3-2 | 实现各模块待办自动生成（在提现/实名/发票审核事件中触发） | BE | 中 |
| P0-3-3 | 实现 `GET /api/v1/admin/todo-queue` + 统计 | BE | 中 |
| P0-3-4 | 实现 `POST /api/v1/admin/todo-queue/:id/claim/complete/ignore` | BE | 小 |
| P0-3-5 | 实现 `POST /api/v1/admin/todo-queue/generate` — 手动触发 | BE | 小 |
| P0-3-6 | 管理端 — 待办队列页面（分类+优先级+处理入口） | FE | 大 |
| P0-3-7 | 管理端 — 侧边栏待办数量徽标 | FE | 小 |
| P0-3-8 | 管理端 — 仪表盘待办卡片模块 | FE | 中 |

**后端预估：中（4-5h）· 前端预估：中（4-6h）**

---

## 📦 P1 — 重要增强（产品竞争力）

### P1-1 Playground 计费确认 + 完善

| 编号 | 任务 | 端 | 预估 |
|------|------|----|------|
| P1-1-1 | 创建 `playground_logs` 表 + migration | BE | 小 |
| P1-1-2 | 实现 Playground 转发代理（复用路由逻辑+加计费确认钩子） | BE | 中 |
| P1-1-3 | 实现 `GET /api/v1/playground/history` 等 | BE | 小 |
| P1-1-4 | 前端 — 计费确认弹窗（费用>¥0.01时） | FE | 小 |
| P1-1-5 | 前端 — 对比模式完善（多选模型+并列展示+对比标签） | FE | 中 |
| P1-1-6 | 前端 — 历史记录持久化（localStorage+服务端同步） | FE | 中 |
| P1-1-7 | 前端 — Playground 当前会话 Token/费用计入页脚 | FE | 小 |
| P1-1-8 | 前端 — 图像生成模型返回图片展示 | FE | 中 |

**后端预估：中（3-4h）· 前端预估：中（4-6h）**

### P1-2 操作日志增强

| 编号 | 任务 | 端 | 预估 |
|------|------|----|------|
| P1-2-1 | 实现敏感操作检测中间件（10 种类型+阈值检查） | BE | 中 |
| P1-2-2 | 实现超阈值操作自动通知 super_admin | BE | 小 |
| P1-2-3 | 实现异常操作标注（夜间/高频/非惯用IP） | BE | 中 |
| P1-2-4 | 实现 `GET /api/v1/admin/operation-logs/export` | BE | 小 |
| P1-2-5 | 实现 `GET /api/v1/admin/operation-logs/stats` | BE | 小 |
| P1-2-6 | 前端 — 操作日志列表增加异常标注列+颜色标注 | FE | 小 |
| P1-2-7 | 前端 — 敏感操作二次确认弹窗 | FE | 中 |
| P1-2-8 | 前端 — 操作日志导出按钮 | FE | 小 |

**后端预估：中（3-5h）· 前端预估：小（2-3h）**

### P1-3 熔断器配置持久化

| 编号 | 任务 | 端 | 预估 |
|------|------|----|------|
| P1-3-1 | 创建 `circuit_breaker_configs` 表 + migration | BE | 小 |
| P1-3-2 | 创建 `circuit_breaker_events` 表 + migration | BE | 小 |
| P1-3-3 | 应用启动时从 DB 加载熔断器配置 | BE | 小 |
| P1-3-4 | 运行时状态变更同时写入 DB + 事件记录 | BE | 中 |
| P1-3-5 | 实现 `GET /api/v1/admin/circuit-breakers` 等 | BE | 中 |
| P1-3-6 | 管理端 — 熔断器状态面板（列表+状态+事件历史） | FE | 中 |

**后端预估：中（3-4h）· 前端预估：中（3-4h）**

### P1-4 用户端异常告警卡片

| 编号 | 任务 | 端 | 预估 |
|------|------|----|------|
| P1-4-1 | 实现用户端告警聚合 API（失败率/余额/异常登录/Key泄露） | BE | 中 |
| P1-4-2 | 前端 — 仪表盘告警卡片组件（AlertsPane.tsx） | FE | 中 |
| P1-4-3 | 前端 — 告警已读/折叠交互 | FE | 小 |

**后端预估：中（3h）· 前端预估：中（3h）**

### P1-5 实时活动流（WebSocket）

| 编号 | 任务 | 端 | 预估 |
|------|------|----|------|
| P1-5-1 | 后端已有 alert-ws.ts → 改造为面向用户的活动流 | BE | 中 |
| P1-5-2 | 前端 — 仪表盘活动流组件（ActivityFeed.tsx） | FE | 中 |
| P1-5-3 | 前端 — 悬停暂停/点击跳转日志详情 | FE | 小 |

**后端预估：中（3h）· 前端预估：中（4h）**

---

## 📦 P2 — 体验优化/高级功能

### P2-1 A/B 测试模块

| 编号 | 任务 | 端 | 预估 |
|------|------|----|------|
| P2-1-1 | 创建 `ab_experiments` + `ab_experiment_metrics` + `ab_experiment_assignments` + `ab_experiment_snapshots` 表 + migration | BE | 中 |
| P2-1-2 | 实现 CRUD API + 启动/暂停/完成 | BE | 中 |
| P2-1-3 | 实现分流算法（user_hash） | BE | 小 |
| P2-1-4 | 实现 cron 每日统计快照 | BE | 中 |
| P2-1-5 | 实现 `POST /api/v1/admin/ab-testing/:id/complete` + 选择优胜组 | BE | 中 |
| P2-1-6 | 管理端 — 实验列表+创建+详情+结果面板 | FE | 大 |

**后端预估：大（5-8h）· 前端预估：大（5-8h）**

### P2-2 新手任务 / Onboarding

| 编号 | 任务 | 端 | 预估 |
|------|------|----|------|
| P2-2-1 | 创建 `onboarding_tasks` + `user_onboarding_progress` 表 + migration + 种子数据 | BE | 小 |
| P2-2-2 | 实现 `GET /api/v1/me/onboarding` — 获取任务列表+进度 | BE | 小 |
| P2-2-3 | 实现 `POST /api/v1/me/onboarding/:task_key/claim/skip` | BE | 小 |
| P2-2-4 | 在各事件入口添加自动完成检测钩子 | BE | 中 |
| P2-2-5 | 实现 `GET /api/v1/admin/onboarding/stats` | BE | 小 |
| P2-2-6 | 前端 — 仪表盘顶部引导条（OnboardingGuideBar.tsx） | FE | 中 |
| P2-2-7 | 前端 — 新手任务面板（/console/onboarding） | FE | 中 |
| P2-2-8 | 前端 — 注册后自动弹引导逻辑（7天展示期） | FE | 小 |

**后端预估：中（3-5h）· 前端预估：中（4-6h）**

### P2-3 管理后台缺失页面补齐

| 编号 | 任务 | 端 | 预估 |
|------|------|----|------|
| P2-3-1 | 敏感词库管理页面（列表+增删改+批量导入+测试） | FE | 中 |
| P2-3-2 | 风控规则引擎页面（规则列表+编辑+开关） | FE | 中 |
| P2-3-3 | AI 风控模型页面（模型配置+评估报告+训练操作） | FE | 中 |
| P2-3-4 | 自定义报表页面（报表构建器+模板+定时调度） | FE | 大 |
| P2-3-5 | 实时监控页面（系统指标+告警趋势+服务状态） | FE | 大 |
| P2-3-6 | 限流规则管理页面（规则列表+编辑+触发统计） | FE | 中 |
| P2-3-7 | 对公转账凭证上传（用户端充值页） | FE+BE | 中 |

**前端预估：很大（20-30h）· 后端预估：小（各模块路由/API 大多已有）**

### P2-4 模型推荐/成本优化

| 编号 | 任务 | 端 | 预估 |
|------|------|----|------|
| P2-4-1 | 实现推荐逻辑扫描+替代模型匹配+节省金额计算 | BE | 中 |
| P2-4-2 | 前端 — 仪表盘建议卡片（OptimizationTip.tsx） | FE | 小 |

**后端预估：中（3h）· 前端预估：小（1-2h）**

---

## 📋 交付优先级建议

| 批次 | 内容 | 预估工时 | 交付价值 |
|------|------|---------|---------|
| **Sprint 1** 🥇 | P0-2 结算对账 + P0-1 账号注销 | ~30h | 打通代理财务闭环 |
| **Sprint 2** 🥈 | P0-3 待办队列 + P1-4 告警卡片 + P1-5 实时活动流 | ~20h | 运营效率提升 |
| **Sprint 3** 🥉 | P1-1 Playground + P1-2 操作日志 + P1-3 熔断器持久化 | ~20h | 用户体验改善 |
| **Sprint 4** | P2-2 新手任务 + P2-4 模型推荐 | ~15h | 留存率提升 |
| **Sprint 5** | P2-1 A/B测试 + P2-3 缺失页面补齐 | ~40h | 高级运营能力 |

> **总预估工时**：后端 ~50h + 前端 ~70h ≈ **120h 单人工作量**
> 建议按 Sprint 1 → 2 → 3 → 4 → 5 顺序推进，每个 Sprint 独立部署验证
