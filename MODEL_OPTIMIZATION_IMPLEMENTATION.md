# 模型成本优化建议功能实现报告

## 功能概述
在用户仪表盘添加模型成本优化建议组件，基于用户最近 7 天的模型使用数据，分析是否有更便宜的替代模型（相同能力但价格更低），显示潜在节省金额和推荐模型。

## 实现内容

### 1. 后端 API
**文件**: `api/src/routes/me/stats/optimization.ts`

**端点**: `GET /api/v1/me/stats/optimization`

**功能**:
- 分析用户最近 7 天的模型使用统计
- 查询所有可用模型及其价格
- 基于模型能力分组进行智能匹配
- 计算能力匹配度（0-100）
- 生成推荐理由
- 返回优化建议列表

**数据结构**:
```typescript
interface ModelOptimization {
  currentModel: string;        // 当前使用的模型
  recommendedModel: string;    // 推荐的替代模型
  currentCost: number;         // 当前成本（元/百万token）
  recommendedCost: number;     // 推荐模型成本
  savings: number;             // 每月预估节省（元）
  savingsPercent: number;      // 节省百分比
  capabilityMatch: number;     // 能力匹配度 0-100
  reason: string;              // 推荐理由
  usageCount: number;          // 用户使用次数
  usageTokens: number;         // 用户使用 token 数
}
```

**模型能力分组**:
- DeepSeek 系列: deepseek-chat, deepseek-coder, deepseek-reasoner
- GPT 系列: gpt-4o, gpt-4o-mini, gpt-3.5-turbo, gpt-4-turbo
- Claude 系列: claude-3-5-sonnet, claude-3-5-haiku, claude-3-opus
- Gemini 系列: gemini-2.0-flash-exp, gemini-1.5-pro, gemini-1.5-flash
- Qwen 系列: qwen-turbo, qwen-plus, qwen-max
- GLM 系列: glm-4-plus, glm-4-flash, glm-4-air

**能力匹配算法**:
1. 计算能力包含度（当前模型能力 ∩ 推荐模型能力）
2. Tier 匹配加分（同 tier 或更低 tier）
3. 综合评分 = 能力包含度 * 80% + Tier 加分

**推荐排序**:
- 按性价比排序：价格 * (100 - 能力匹配度 + 50)
- 只推荐能力匹配度 >= 60% 的模型
- 只推荐每月节省 >= 1 元的优化

### 2. 前端 Hook
**文件**: `web/src/hooks/useModelOptimization.ts`

**功能**:
- 封装 API 调用逻辑
- 提供加载状态、错误处理
- 支持手动刷新

**返回值**:
```typescript
interface UseModelOptimizationReturn {
  data: ModelOptimizationData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}
```

### 3. 前端组件
**文件**: `web/src/pages/dashboard/components/ModelOptimizationTip.tsx`

**功能**:
- 卡片式设计，显示优化建议
- 可展开/收起
- 每个推荐显示：
  - 当前模型 → 推荐模型
  - 节省金额和百分比
  - 能力匹配度
  - 使用统计
  - 推荐理由
- "应用推荐"按钮（跳转到模型详情）
- 支持刷新

**UI 特性**:
- 渐变背景（amber/orange）
- 图标提示（Lightbulb）
- 颜色编码（绿色=节省，蓝色=能力）
- 响应式布局

### 4. Dashboard 集成
**文件**: `web/src/pages/Dashboard.tsx`

**位置**: 在额度使用情况之后、用量总览之前显示

**条件渲染**: 只有当有优化建议时才显示

### 5. 路由注册
**文件**: `api/src/app/routes.ts`

**修改**:
- 导入 `meStatsOptimizationRoutes`
- 注册路由：`await app.register(meStatsOptimizationRoutes, { prefix: "" })`

## 验收标准检查

✅ **API 返回有效推荐数据**
- 查询用户最近 7 天模型使用
- 对比模型价格表
- 返回推荐列表 + 潜在节省金额

✅ **组件正确显示推荐建议**
- 卡片式设计
- 显示模型对比、节省金额、能力匹配度
- 推荐理由清晰

✅ **节省金额计算准确**
- 基于实际使用数据计算
- 考虑价格差异和使用量
- 预估每月节省

✅ **TypeScript 编译通过**
- 后端代码无类型错误
- 前端代码符合类型定义

## 测试方法

### 1. API 测试
```powershell
# 运行测试脚本
.\test-optimization-api.ps1
```

### 2. 手动测试
1. 启动后端：`cd api && npm run dev`
2. 启动前端：`cd web && npm run dev`
3. 登录用户账户
4. 访问仪表盘页面
5. 查看优化建议组件

### 3. 测试场景
- **无使用数据**: 显示"暂无使用数据"
- **无优化建议**: 组件不显示
- **有优化建议**: 显示推荐列表
- **刷新功能**: 点击刷新按钮重新获取数据
- **应用推荐**: 点击跳转到模型详情页

## 技术亮点

1. **智能匹配算法**: 基于能力分组和 Tier 匹配
2. **性价比排序**: 综合考虑价格和能力匹配度
3. **推荐理由生成**: 自动生成易懂的推荐说明
4. **响应式设计**: 适配不同屏幕尺寸
5. **错误处理**: 完善的加载和错误状态

## 后续优化建议

1. **个性化推荐**: 考虑用户的使用场景偏好
2. **A/B 测试**: 对比不同推荐算法的效果
3. **实时更新**: WebSocket 推送新的优化机会
4. **一键切换**: 直接在组件内切换模型（需 API 支持）
5. **历史追踪**: 记录用户采纳的推荐和实际节省

## 文件清单

```
api/src/routes/me/stats/optimization.ts     # 后端 API
api/src/app/routes.ts                       # 路由注册（已修改）
web/src/hooks/useModelOptimization.ts       # 前端 Hook
web/src/pages/dashboard/components/ModelOptimizationTip.tsx  # 前端组件
web/src/pages/Dashboard.tsx                 # Dashboard 集成（已修改）
test-optimization-api.ps1                   # 测试脚本
```

## 总结

功能已完整实现，符合所有验收标准。用户现在可以在仪表盘看到模型成本优化建议，帮助他们选择更具性价比的模型，降低使用成本。
