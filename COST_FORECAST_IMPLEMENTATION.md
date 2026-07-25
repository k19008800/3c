# 成本预测与预警功能 - 完整实现

## 📋 任务概览

✅ **任务状态**: 已完成
📅 **完成时间**: 2026-07-25
🎯 **优先级**: P1
⏱️ **预估工时**: 2h

---

## 🎯 实现目标

### 1. 后端 API ✅
**路径**: `/api/v1/me/stats/forecast`

**功能特性**:
- ✅ 基于最近7日消费趋势进行线性回归分析
- ✅ 预测本月总消费
- ✅ 计算余额耗尽日期
- ✅ 多级预警判断（high/medium/low/none）
- ✅ 趋势判断（increasing/decreasing/stable）
- ✅ 返回每日消费数据用于图表绘制

**核心算法**:
```typescript
// 线性回归计算趋势
function linearRegression(x: number[], y: number[]): { slope, intercept }

// 计算耗尽日期
function calculateDepletionDate(balance: number, dailyCost: number): Date | null
```

**数据源**:
- 用户余额: `users.balance`
- 消费记录: `callLogs` 表（最近7天）

---

### 2. 前端组件 ✅

**文件**: `CostForecastCard.tsx`

**UI 组成**:
1. **标题栏**: "成本预测与预警" + 刷新按钮
2. **预警提示**: 根据预警级别显示不同颜色的警告框
3. **核心指标卡片** (4个):
   - 当前余额（蓝色）
   - 日均消费（紫色，带趋势图标）
   - 本月已消费（绿色）
   - 预测本月总消费（琥珀色）
4. **趋势图**: 使用 Recharts 绘制
   - 蓝色实线: 实际消费
   - 紫色虚线: 预测消费
   - 灰色分隔线: 今日
   - 未来3日预测
5. **耗尽日期提示**: 琥珀色背景，显示预计耗尽日期
6. **底部统计**: 最近7日总消费 + 预测剩余消费

**响应式设计**:
- 桌面端: 4列指标卡片
- 移动端: 2列指标卡片

---

### 3. 自定义 Hook ✅

**文件**: `useCostForecast.ts`

**功能**:
- 封装 API 调用逻辑
- 管理 loading/error 状态
- 支持 autoFetch 配置
- 提供 refetch 方法

**使用示例**:
```typescript
const { forecast, loading, error, refetch } = useCostForecast()
```

---

### 4. 单元测试 ✅

#### 后端测试 (Vitest)
**文件**: `forecast.test.ts`

**测试覆盖**:
- ✅ 认证用户访问
- ✅ 日均消费计算准确性
- ✅ 趋势判断逻辑
- ✅ 预警触发条件
- ✅ 耗尽日期计算
- ✅ 未认证访问拒绝
- ✅ 回归参数返回

#### 前端 Hook 测试
**文件**: `useCostForecast.test.ts`

**测试覆盖**:
- ✅ 自动获取数据
- ✅ 错误处理
- ✅ autoFetch=false 行为
- ✅ refetch 方法
- ✅ 网络错误处理
- ✅ 空响应处理
- ✅ 并发调用处理

#### 前端组件测试
**文件**: `CostForecastCard.test.tsx`

**测试覆盖**:
- ✅ 加载状态渲染
- ✅ 错误状态渲染
- ✅ 数据正确显示
- ✅ 预警级别样式
- ✅ 趋势指示器
- ✅ 刷新按钮交互
- ✅ 图表渲染
- ✅ 边界情况处理

---

## 📊 数据结构

### API 响应
```typescript
interface CostForecastData {
  balance: string                 // 当前余额
  last7DaysCost: string           // 最近7日总消费
  avgDailyCost: string            // 日均消费
  monthToDateCost: string         // 本月已消费
  predictedRemainingCost: string  // 预测剩余消费
  predictedMonthTotal: string     // 预测本月总消费
  depletionDate: string | null    // 余额耗尽日期
  warnings: string[]              // 预警信息列表
  warningLevel: 'none' | 'low' | 'medium' | 'high'
  trend: 'increasing' | 'decreasing' | 'stable'
  dailySeries: Array<{ date: string; cost: number }>
  regression: { slope: string; intercept: string }
}
```

---

## 🎨 UI 设计规范

### 预警级别颜色
| 级别 | 背景 | 边框 | 文字 | 触发条件 |
|------|------|------|------|----------|
| **High** | `bg-red-50` | `border-red-200` | `text-red-700` | 余额 < 3日消费 |
| **Medium** | `bg-amber-50` | `border-amber-200` | `text-amber-700` | 余额 < 7日消费 |
| **Low** | `bg-blue-50` | `border-blue-200` | `text-blue-700` | 余额 < 14日消费 |

### 趋势图标
- ⬆️ **上升**: `<TrendingUp />` - 红色 (`text-red-500`)
- ⬇️ **下降**: `<TrendingDown />` - 绿色 (`text-green-500`)
- ➡️ **稳定**: `<Minus />` - 灰色 (`text-slate-500`)

---

## 📁 文件清单

### 后端 (API)
```
3cloud/api/src/
├── routes/me/stats/
│   ├── forecast.ts              (218 行) - API 实现
│   └── __tests__/
│       └── forecast.test.ts     (210 行) - 单元测试
└── app/
    └── routes.ts                (已修改) - 路由注册
```

### 前端 (Web)
```
3cloud/web/src/
├── hooks/
│   ├── useCostForecast.ts       (60 行) - Hook 实现
│   └── __tests__/
│       └── useCostForecast.test.ts (180 行) - Hook 测试
└── pages/dashboard/components/
    ├── CostForecastCard.tsx     (303 行) - 组件实现
    └── __tests__/
        └── CostForecastCard.test.tsx (270 行) - 组件测试
└── pages/
    └── Dashboard.tsx            (已修改) - 组件集成
```

### 总代码量
- **API 实现**: 218 行
- **Hook 实现**: 60 行
- **组件实现**: 303 行
- **测试代码**: ~660 行
- **总计**: ~1241 行

---

## 🔧 技术栈

| 类别 | 技术 |
|------|------|
| **后端框架** | Fastify |
| **数据库** | PostgreSQL + Drizzle ORM |
| **前端框架** | React 18 + TypeScript |
| **样式** | Tailwind CSS |
| **图表库** | Recharts 3.9 |
| **测试框架** | Vitest + Testing Library |
| **路由** | React Router v6 |

---

## 🚀 启动测试

### 后端测试
```bash
cd 3cloud/api
npm test -- routes/me/stats/__tests__/forecast.test.ts
```

### 前端测试
```bash
cd 3cloud/web
npm test -- hooks/__tests__/useCostForecast.test.ts
npm test -- pages/dashboard/components/__tests__/CostForecastCard.test.tsx
```

### 启动开发服务器
```bash
# 后端
cd 3cloud/api
npm run dev

# 前端
cd 3cloud/web
npm run dev
```

访问: http://localhost:5175 （登录后查看 Dashboard）

---

## 📖 使用说明

### 在 Dashboard 查看
登录后，Dashboard 页面会自动显示"成本预测与预警"卡片。

### 手动调用 API
```bash
curl -X GET "http://localhost:3000/api/v1/me/stats/forecast" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 在其他组件中使用
```tsx
import { CostForecastCard } from '@/pages/dashboard/components/CostForecastCard'

<CostForecastCard />
```

### 使用 Hook 获取数据
```tsx
import { useCostForecast } from '@/hooks/useCostForecast'

function MyComponent() {
  const { forecast, loading, error, refetch } = useCostForecast()

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>

  return (
    <div>
      <p>余额: ¥{forecast?.balance}</p>
      <p>日均消费: ¥{forecast?.avgDailyCost}</p>
      <button onClick={refetch}>刷新</button>
    </div>
  )
}
```

---

## ✨ 核心特性

### 1. 智能预测
- 基于线性回归分析消费趋势
- 预测本月总消费
- 计算余额耗尽日期

### 2. 多级预警
- **High**: 余额不足3日消费
- **Medium**: 余额不足7日消费
- **Low**: 余额不足14日消费
- 自动判断并显示相应警告

### 3. 可视化趋势
- 最近7日实际消费曲线
- 未来3日预测消费曲线
- 今日分隔线
- 清晰的图表标注

### 4. 响应式设计
- 适配桌面端和移动端
- 流畅的交互动画
- 直观的颜色编码

### 5. 完善的错误处理
- 加载状态提示
- 错误信息显示
- 重试按钮
- 空数据处理

---

## 🎯 业务价值

1. **提前预警**: 帮助用户及时了解余额状态，避免服务中断
2. **趋势洞察**: 让用户了解消费趋势，合理规划使用
3. **决策支持**: 为充值时机提供数据参考
4. **用户体验**: 直观的可视化展示，提升用户满意度

---

## 📝 后续优化建议

1. **预测算法增强**
   - 考虑添加指数平滑算法
   - 支持自定义预测周期
   - 考虑季节性因素

2. **预警通知**
   - 邮件预警通知
   - 站内信预警
   - 短信预警（可选）

3. **历史对比**
   - 与上月同期对比
   - 与去年同期对比
   - 同类用户对比

4. **个性化设置**
   - 自定义预警阈值
   - 选择预警方式
   - 设置预警频率

---

## ✅ 验证清单

- [x] 后端 API 实现
- [x] 前端组件实现
- [x] 自定义 Hook 实现
- [x] 路由注册
- [x] Dashboard 集成
- [x] 后端单元测试
- [x] 前端 Hook 测试
- [x] 前端组件测试
- [x] 错误处理
- [x] 加载状态
- [x] 响应式设计
- [x] Recharts 图表
- [x] Tailwind CSS 样式

---

## 📞 技术支持

如有问题，请参考：
- API 文档: `3cloud/api/src/routes/me/stats/forecast.ts`
- 组件文档: `3cloud/web/src/pages/dashboard/components/CostForecastCard.tsx`
- Hook 文档: `3cloud/web/src/hooks/useCostForecast.ts`

---

**实现完成时间**: 2026-07-25 14:30 (GMT+8)
**总用时**: ~2小时
**状态**: ✅ 已完成，可投入使用