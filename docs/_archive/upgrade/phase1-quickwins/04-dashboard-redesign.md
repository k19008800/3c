# 04 — 仪表盘改造

> **后端**: 0.5 人天 | **前端**: 1.5 人天 | **依赖**: 01 页面状态持久化（时间范围偏好）

---

## 1. 背景与目标

**问题**：当前 Admin Dashboard 以统计图表为主（6 大区块 + 6 个并行 API），缺少操作入口和新手引导。管理员需要跳转 2-3 级菜单才能执行高频操作。

**目标**：将仪表盘改造为"操作中心"——顶部实时状态带、快捷操作网格、异常预警区、传统统计图表下移。

---

## 2. 布局设计

```
┌──────────────────────────────────────────────────────────┐
│  📊 管理控制台                      [刷新] [帮助] [设置]   │
├──────────────────────────────────────────────────────────┤
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐            │
│ │ 在线 │ │ 今日 │ │ 今日 │ │ 今日 │ │ 异常 │            │
│ │ 通道 │ │ 调用 │ │Token │ │ 消耗 │ │ 告警 │            │
│ │  12  │ │8,532 │ │1.2M  │ │¥12.50│ │  2 ⚠️ │            │
│ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘            │
├──────────────────────────────────────────────────────────┤
│ 🔥 快捷操作                               [全部 →]       │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐             │
│ │ 创建   │ │ 批量   │ │ 新增   │ │ 在线   │             │
│ │ API Key│ │导入Key │ │ 通道   │ │ 调试   │             │
│ └────────┘ └────────┘ └────────┘ └────────┘             │
├──────────────────────────────────────────────────────────┤
│ 🚨 最近异常（2）                                        │
│ ┌─────────────────────────────────────────────────────┐  │
│ │ ⚠️ [10分钟前] deepseek-chat 连续 5 次超时 → 查看详情 │  │
│ │ ⚠️ [25分钟前] user@xxx 充值 ¥1000 待审核     → 去审核 │  │
│ └─────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────┤
│ [趋势图] [模型排行] [营收分布] [厂商健康] [调度] [TODO]  │
│  <原有图表区，增加时间范围快速切换>                       │
└──────────────────────────────────────────────────────────┘
```

---

## 3. 图表区重构

将原有 6 个独立区块调整为 Tab 切换 + 时间范围切换：

```tsx
// 主布局
<div className="grid grid-cols-12 gap-4">
  {/* 左侧 8 列：趋势图（主图） */}
  <div className="col-span-8">
    <OverviewTrendsChart />
  </div>
  {/* 右侧 4 列：收益/成本概览 */}
  <div className="col-span-4 space-y-4">
    <RevenueMini />
    <CostMini />
  </div>
  
  {/* 第二行：模型排行 */}
  <div className="col-span-4">
    <ModelRankBar />
  </div>
  {/* 厂商健康 */}
  <div className="col-span-4">
    <VendorHealthPanel />
  </div>
  {/* 调度实时 */}
  <div className="col-span-4">
    <ModelSchedulingRealtime />
  </div>
  
  {/* 第三行 */}
  <div className="col-span-6">
    <TopUsersTable />
  </div>
  <div className="col-span-6">
    <TodoQueuePanel />
  </div>
</div>
```

### 时间范围切换器增强

```tsx
// 已有 TimeRangeSelector 组件，增加"自定义"日期选择器
<TimeRangeSelector
  range={range}
  onChange={setRange}
  presets={[
    { label: '今日', value: 'today' },
    { label: '近 7 天', value: '7d' },    // 默认
    { label: '近 30 天', value: '30d' },
    { label: '近 90 天', value: '90d' },
    { label: '自定义', value: 'custom' },  // 新增
  ]}
  // 自定义时出现起止日期选择
  customStart={customStart}
  customEnd={customEnd}
/>
```

### API 聚合端点

合并 6 个并行请求为 2 个聚合端点，减少首屏请求数：

```typescript
// 新增聚合端点
GET /api/v1/admin/dashboard/summary
Response: {
  stats: {
    activeVendorModels: number      // 在线通道数
    todayCalls: number
    todayTokens: number
    todayCost: string
    anomalyCount: number            // 异常告警数
  }
  quickActions: {
    pendingReviews: number           // 待审核实名/充值
    pendingWithdraws: number
    recentAnomalies: AnomalyItem[]   // 最近异常
  }
}

// 原有统计端点保留（懒加载）
GET /api/v1/admin/dashboard/stats        // → lazy
GET /api/v1/admin/dashboard/trends        // → lazy
```

---

## 4. 新增组件

### `<QuickActionsGrid>`

```tsx
interface QuickAction {
  id: string
  label: string
  icon: ReactNode
  description: string
  href: string
  shortcut?: string          // 快捷键如 "Ctrl+N"
  badge?: number             // 待办数量
}

const ACTIONS: QuickAction[] = [
  { id: 'create-key', label: '创建 API Key', icon: <Key />,
    description: '为你的客户或应用创建新的访问密钥',
    href: '/admin/api-keys?action=create', shortcut: 'Ctrl+Shift+K' },
  { id: 'batch-import', label: '批量导入 Key', icon: <Upload />,
    description: 'CSV 文件批量导入上游 API Key',
    href: '/admin/vendors?tab=import' },
  { id: 'add-channel', label: '新增通道', icon: <Plus />,
    description: '创建新的供应商-模型映射通道',
    href: '/admin/vendor-models?action=create' },
  { id: 'debug', label: '在线调试', icon: <Terminal />,
    description: '页面内测试转发接口连通性',
    href: '/admin/playground' },
  { id: 'recharge-review', label: '充值审核', icon: <DollarSign />,
    description: '待审核的充值订单',
    href: '/admin/recharge-orders?status=pending', badge: 3 },
  { id: 'system-health', label: '系统健康', icon: <Activity />,
    description: '查看各服务状态',
    href: '/admin/system-health' },
]
```

### `<AnomalyAlertBar>`

```tsx
interface AnomalyItem {
  id: number
  type: 'timeout' | 'error' | 'circuit' | 'pending_review'
  severity: 'warning' | 'error' | 'info'
  message: string
  time: string              // 相对时间
  action: { label: string; href: string }
}

// 每种类型有对应图标和颜色
const ANOMALY_ICONS = {
  timeout: <ClockAlert className="text-orange-500" />,
  error: <XCircle className="text-red-500" />,
  circuit: <ZapOff className="text-red-500" />,
  pending_review: <AlertCircle className="text-blue-500" />,
}
```

---

## 5. 后端改动

```typescript
// 新增聚合端点路由
// api/src/routes/admin/dashboard/summary.ts

// 仅新增一个端点，不修改现有端点
GET /api/v1/admin/dashboard/summary
```

---

## 6. 用户端仪表盘同步升级

用户端仪表盘（`pages/Dashboard.tsx`）也统一改造：

```
┌──────────────────────────────────────────────────┐
│  👤 我的控制台                                     │
├──────────────────────────────────────────────────┤
│ 💰 余额: ¥1,234.56     [充值] [套餐]               │
│ 📊 今日: 调用 156 | Token 23K | 消费 ¥0.35       │
├──────────────────────────────────────────────────┤
│ 🔗 快速接入 (QuickConnectPanel)                    │
├──────────────────────────────────────────────────┤
│ 📈 近 7 天用量趋势                                 │
│ 📋 我的 API Key  (最近 3 个)    [管理全部 →]      │
└──────────────────────────────────────────────────┘
```

---

## 7. 验收标准

- [ ] 仪表盘顶部显示实时状态带（在线通道数/今日调用/Token/消耗/异常数）
- [ ] 快捷操作网格包含 6 个核心入口，每个带图标和说明文字
- [ ] 异常告警区列出最近异常（有时间和操作按钮）
- [ ] 聚合端点 `/summary` 替代 6 个并行请求（首屏性能提升）
- [ ] 时间范围支持预设 + 自定义日期选择
- [ ] 用户端仪表盘同步升级
- [ ] 响应式：桌面网格 12 列，平板 6 列，手机单列
