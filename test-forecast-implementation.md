# 成本预测与预警功能实现总结

## ✅ 已完成的工作

### 1. 后端 API 实现
**文件**: `3cloud/api/src/routes/me/stats/forecast.ts`

**功能**:
- ✅ GET `/api/v1/me/stats/forecast` - 成本预测与预警接口
- ✅ 基于最近7日消费数据，使用线性回归预测趋势
- ✅ 计算日均消费、本月预测总消费
- ✅ 计算余额耗尽日期
- ✅ 多级预警判断（high/medium/low）
- ✅ 趋势判断（increasing/decreasing/stable）
- ✅ 返回每日消费数据用于绘制趋势图

**核心算法**:
- 线性回归计算消费趋势
- 填充缺失日期数据（确保7天完整）
- 预测未来消费（本月剩余天数）
- 多级预警判断逻辑

### 2. 前端 Hook 实现
**文件**: `3cloud/web/src/hooks/useCostForecast.ts`

**功能**:
- ✅ 封装 API 调用逻辑
- ✅ 管理 loading/error 状态
- ✅ 支持 autoFetch 配置
- ✅ 提供 refetch 方法

### 3. 前端组件实现
**文件**: `3cloud/web/src/pages/dashboard/components/CostForecastCard.tsx`

**功能**:
- ✅ 显示核心指标（余额、日均消费、本月已消费、预测总消费）
- ✅ 多级预警提示（high/medium/low 对应不同颜色）
- ✅ 趋势指示器（上升/下降/稳定）
- ✅ Recharts 趋势图（实际消费 + 预测线）
- ✅ 余额耗尽日期提示
- ✅ 加载状态和错误处理
- ✅ 刷新按钮

**UI 特性**:
- Tailwind CSS 样式
- 渐变背景卡片
- 响应式布局
- 充值链接跳转

### 4. 路由集成
**文件**: `3cloud/api/src/app/routes.ts`

- ✅ 导入 `meStatsForecastRoutes`
- ✅ 注册路由到应用

**文件**: `3cloud/web/src/pages/Dashboard.tsx`

- ✅ 导入 `CostForecastCard` 组件
- ✅ 在 Dashboard 页面中渲染组件

### 5. 单元测试
**后端测试**: `3cloud/api/src/routes/me/stats/__tests__/forecast.test.ts`
- ✅ 测试认证用户访问
- ✅ 测试日均消费计算
- ✅ 测试趋势判断
- ✅ 测试预警触发
- ✅ 测试耗尽日期计算
- ✅ 测试未认证访问
- ✅ 测试回归参数

**前端 Hook 测试**: `3cloud/web/src/hooks/__tests__/useCostForecast.test.ts`
- ✅ 测试自动获取数据
- ✅ 测试错误处理
- ✅ 测试 autoFetch=false
- ✅ 测试 refetch 方法
- ✅ 测试并发调用

**前端组件测试**: `3cloud/web/src/pages/dashboard/components/__tests__/CostForecastCard.test.tsx`
- ✅ 测试加载状态
- ✅ 测试错误状态
- ✅ 测试数据显示
- ✅ 测试预警级别样式
- ✅ 测试趋势指示器
- ✅ 测试刷新按钮
- ✅ 测试图表渲染

## 📊 数据结构

### API 响应格式
```typescript
{
  balance: string              // 当前余额
  last7DaysCost: string        // 最近7日总消费
  avgDailyCost: string         // 日均消费
  monthToDateCost: string      // 本月已消费
  predictedRemainingCost: string // 预测剩余消费
  predictedMonthTotal: string  // 预测本月总消费
  depletionDate: string | null // 余额耗尽日期
  warnings: string[]           // 预警信息列表
  warningLevel: 'none' | 'low' | 'medium' | 'high'
  trend: 'increasing' | 'decreasing' | 'stable'
  dailySeries: Array<{ date: string; cost: number }>
  regression: { slope: string; intercept: string }
}
```

## 🎨 UI 设计

### 核心指标卡片
- 当前余额（蓝色渐变）
- 日均消费（紫色渐变，带趋势图标）
- 本月已消费（绿色渐变）
- 预测本月总消费（琥珀色渐变）

### 预警提示
- **High**: 红色背景，余额不足3日消费
- **Medium**: 琥珀色背景，余额不足7日消费
- **Low**: 蓝色背景，余额不足14日消费

### 趋势图
- 实际消费线（蓝色实线）
- 预测线（紫色虚线）
- 今日分隔线
- 未来3日预测

## 🔧 技术栈

- **后端**: Fastify + Drizzle ORM + PostgreSQL
- **前端**: React + TypeScript + Tailwind CSS
- **图表**: Recharts
- **测试**: Vitest + Testing Library

## 📝 使用示例

### 在 Dashboard 中使用
组件已自动集成到 Dashboard 页面，无需额外配置。

### 单独使用
```tsx
import { CostForecastCard } from '@/pages/dashboard/components/CostForecastCard'

<CostForecastCard />
```

### 使用 Hook
```tsx
import { useCostForecast } from '@/hooks/useCostForecast'

function MyComponent() {
  const { forecast, loading, error, refetch } = useCostForecast()

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>

  return <div>Balance: {forecast?.balance}</div>
}
```

## ✨ 特色功能

1. **智能预测**: 基于线性回归分析消费趋势，预测未来消费
2. **多级预警**: 根据余额与消费比例，提供不同级别的预警
3. **可视化**: 趋势图直观展示历史消费和未来预测
4. **耗尽日期**: 自动计算余额耗尽日期，提前预警
5. **响应式**: 适配不同屏幕尺寸
6. **错误处理**: 完善的加载和错误状态处理

## 🚀 下一步建议

1. 运行测试验证功能
2. 启动开发服务器测试 UI
3. 根据实际数据调整预警阈值
4. 考虑添加更多预测算法（如指数平滑）
5. 考虑添加邮件/站内信预警通知

## 📂 文件清单

### 后端
- `3cloud/api/src/routes/me/stats/forecast.ts` - API 实现
- `3cloud/api/src/routes/me/stats/__tests__/forecast.test.ts` - 单元测试
- `3cloud/api/src/app/routes.ts` - 路由注册（已修改）

### 前端
- `3cloud/web/src/hooks/useCostForecast.ts` - Hook 实现
- `3cloud/web/src/hooks/__tests__/useCostForecast.test.ts` - Hook 测试
- `3cloud/web/src/pages/dashboard/components/CostForecastCard.tsx` - 组件实现
- `3cloud/web/src/pages/dashboard/components/__tests__/CostForecastCard.test.tsx` - 组件测试
- `3cloud/web/src/pages/Dashboard.tsx` - Dashboard 集成（已修改）
