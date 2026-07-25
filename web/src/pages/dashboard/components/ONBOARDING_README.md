# OnboardingGuide 组件使用说明

## 概述

`OnboardingGuide` 是新用户空状态引导组件，当用户无 API Key 或无调用记录时显示，引导用户完成首次接入。

## 功能特性

### 1. 三步引导流程

- **Step 1: 创建 API 密钥** - 引导用户前往 API 密钥管理页面创建密钥
- **Step 2: 复制示例代码** - 提供多语言示例代码（cURL、Python、JavaScript、Go）
- **Step 3: 完成首次调用** - 提供在线调试工具或引导用户运行代码

### 2. 状态管理

使用 `useOnboarding` Hook 管理引导状态：

```typescript
const onboarding = useOnboarding()

// 状态属性
onboarding.currentStep      // 当前步骤
onboarding.completedSteps   // 已完成的步骤
onboarding.skipped          // 是否跳过
onboarding.visible          // 是否显示
onboarding.progress         // 进度百分比 (0-100)

// 方法
onboarding.completeStep(step)  // 完成当前步骤
onboarding.goToStep(step)      // 跳到指定步骤
onboarding.skip()              // 跳过引导
onboarding.reset()             // 重置引导
```

### 3. 持久化

引导状态自动保存到 `localStorage`，key 为 `onboarding_state`。

### 4. 动画效果

- 淡入淡出动画
- 缩放动画
- 步骤切换动画

### 5. 移动端适配

- 响应式布局
- 触摸友好
- 自适应字体大小

## 使用方式

### 基本用法

```tsx
import OnboardingGuide from './dashboard/components/OnboardingGuide'

function Dashboard() {
  return (
    <div>
      <OnboardingGuide
        hasApiKey={apiKeyList.length > 0}
        hasCallHistory={summary.totalCalls > 0}
        apiKeys={apiKeyList}
        baseUrl={window.location.origin}
        defaultModel="deepseek-chat"
      />
    </div>
  )
}
```

### Props 说明

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `hasApiKey` | `boolean` | ✅ | 用户是否已有 API Key |
| `hasCallHistory` | `boolean` | ✅ | 用户是否已有调用记录 |
| `apiKeys` | `ApiKey[]` | ❌ | API Key 列表（用于示例代码） |
| `baseUrl` | `string` | ❌ | API 基础 URL，默认 `window.location.origin` |
| `defaultModel` | `string` | ❌ | 默认模型，默认 `deepseek-chat` |

## 条件渲染逻辑

组件在以下情况下显示：

1. 用户无 API Key (`hasApiKey === false`)
2. 用户无调用记录 (`hasCallHistory === false`)
3. 用户未跳过引导 (`skipped === false`)
4. 引导未完成 (`visible === true`)

## 自动检测

组件会自动检测步骤完成：

- 检测到 API Key 后自动标记 Step 1 完成
- 检测到调用记录后自动标记 Step 3 完成

## 样式定制

组件使用 Tailwind CSS，可通过修改 className 或创建自定义主题来定制样式。

## 注意事项

1. 确保 `useAuth` Hook 可用
2. 确保 `@/lib/api` 的 `post` 方法可用
3. 确保 `CodeBlock` 组件可用
4. 需要路由支持 `/api-keys` 路径

## 文件结构

```
src/
├── hooks/
│   └── useOnboarding.ts          # 引导状态管理 Hook
└── pages/
    └── dashboard/
        └── components/
            └── OnboardingGuide.tsx  # 引导组件
```

## 示例代码生成

支持以下语言的示例代码：

- **cURL** - 命令行工具
- **Python** - requests 库
- **JavaScript** - fetch API
- **Go** - net/http 包

示例代码会自动填充用户的 API Key（如果已创建）。

## 测试

可以通过以下方式测试：

1. 清除 localStorage: `localStorage.removeItem('onboarding_state')`
2. 刷新页面，引导组件会自动显示

## 未来扩展

可考虑添加：

- 视频教程链接
- 交互式代码编辑器
- 实时调用测试
- 更多语言支持
- 自定义引导步骤
