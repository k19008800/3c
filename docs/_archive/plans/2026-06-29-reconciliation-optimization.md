# 对账报表优化 — 实现计划

## 设计目标

升级单日对账报表为多维度的财务对账中心，支持：
- 日/周/月/自定义时间范围
- 按代理商/状态维度拆分
- 资金平衡校验（三单勾稽）
- 可疑记录识别
- 趋势对比 + 数据导出
- Redis 缓存 + 预计算汇总表

## 任务分解

### Task 1: 扩展类型定义
**文件**: `web/src/types/index.ts`
- `ReconciliationReport` 扩展字段
- 新增子类型 `ReconDimensionItem`, `ReconAnomalyItem`, `ReconTrendPoint`
- 新增 API 查询参数类型

### Task 2: 扩展数据库 Schema
**文件**: `api/src/db/schema.ts`
- 新增 `daily_recon_summary` 表
- TTL 标记、版本号字段

### Task 3: 重写后端服务
**文件**: `api/src/services/agent-service.ts`
- `getReconciliationReport()` 支持多维度参数
- 资金平衡校验逻辑
- 可疑记录检测
- Redis 缓存

### Task 4: 更新路由
**文件**: `api/src/routes/admin/finance.ts`
- 更新 reconciliation 路由参数
- 新增导出路由 `/export/csv`

### Task 5: 重写前端页面
**文件**: `web/src/pages/admin/FinanceReconciliation.tsx`
- 日期范围选择器 + 粒度选择
- 维度拆分面板
- 资金平衡校验告警
- 趋势曲线图
- 可疑记录列表
- CSV 导出按钮
- 交互增强（排序/筛选/搜索）

### Task 6: 预计算 cron 任务
**文件**: `api/src/app.ts`
- 每日凌晨 3 点聚合前一天数据写入 daily_recon_summary
