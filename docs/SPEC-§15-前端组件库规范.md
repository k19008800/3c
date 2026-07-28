# 功能说明书：§15 前端组件库规范

> **对应文档**：[`PRD-组件库规范.md`](PRD-组件库规范.md)

---

### 功能描述

定义前端组件开发规范，保障 UI 一致性、可复用性和可维护性。

### 完成能力

**15.1 公共组件清单：**

**基础组件：**
- Button（含 loading/disabled 状态、多色系 variant）
- Input（含搜索框/密码框/数字输入）
- Modal / Drawer（弹窗/抽屉）
- Table（含排序/筛选/分页/批量选择）
- Form（含表单校验/布局）
- Select（单选/多选/搜索选择）
- Tag / Badge（标签/徽章）
- Card / StatCard（卡片/统计卡片）
- Loading（加载动画/骨架屏）
- Empty（空状态占位）
- ErrorBoundary（错误边界）
- Pagination（分页）

**业务组件：**
- UserSelect（用户搜索选择器）
- ModelCard（模型卡片）
- KeyDisplay（Key 展示/复制组件）
- BalanceCard（余额卡片）
- LogTable（日志表格）
- StatCard（统计指标卡片）
- TrendChart（趋势图）
- StatusTag（状态标签）

**15.2 组件 Props 规范：**
- 所有组件 TypeScript 类型定义完整
- Props 命名一致：`value` / `onChange` / `disabled` / `loading`
- 组件 Props 类型定义为 `interface` 而非 `type`
- 可选 Props 必须有默认值

**15.3 UI 风格指南：**
- StatsCard 统一 border-2 边框（异常标红/黄）
- 组件配合 ErrorBoundary 使用时包裹 fallback
- 每个组件的 Props 参数定义在独立 interface 文件中
- 工具函数统一导入：`formatNumber` / `formatCurrency` / `formatDate` / `formatRelative`
- Token 计数单位自动转换：K/M/B

---

### [?] 页面帮助

**页面名称**：功能说明书：§15 前端组件库规范

**适用角色**：视具体功能而定（参见总览中的优先级和适用角色说明）

**功能定位**：该页面提供 功能说明书：§15 前端组件库规范 相关的配置、查询和管理能力。

**核心操作**：
1. 查看列表 / 详情
2. 创建 / 编辑 / 删除条目
3. 筛选 / 搜索 / 导出

**注意事项**：
- 部分操作涉及敏感数据，需二次确认或 2FA 身份验证
- 操作记录会写入操作日志

**常见问题**：
Q: 为什么某些操作不可用？
A: 请检查当前账号的权限角色是否包含对应操作权限。

### [?] 按钮级帮助对照表

| 按钮/操作 | 帮助说明 |
|----------|---------|
| 创建/新增 | 添加一条新记录 |
| 编辑 | 修改已有记录的字段内容 |
| 删除 | 删除选中的记录（不可恢复，需确认） |
| 搜索 | 按关键词搜索匹配的记录 |
| 筛选 | 按选中条件过滤列表 |
| 导出 CSV | 将当前列表数据导出为 CSV 文件 |
| 查看详情 | 查看选中记录的完整信息 |
