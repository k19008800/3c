# OnboardingGuide 快速参考

## 快速开始

```tsx
import OnboardingGuide from './dashboard/components/OnboardingGuide'

<OnboardingGuide
  hasApiKey={apiKeyList.length > 0}
  hasCallHistory={summary.totalCalls > 0}
  apiKeys={apiKeyList}
/>
```

## Props

| Prop | Type | 必需 | 说明 |
|------|------|------|------|
| `hasApiKey` | boolean | ✅ | 是否有 API Key |
| `hasCallHistory` | boolean | ✅ | 是否有调用记录 |
| `apiKeys` | ApiKey[] | ❌ | API Key 列表 |
| `baseUrl` | string | ❌ | API 基础 URL |
| `defaultModel` | string | ❌ | 默认模型 |

## 三步流程

1. **创建 API 密钥** → 引导到 `/api-keys`
2. **复制示例代码** → 支持 cURL/Python/JS/Go
3. **完成首次调用** → 打开在线调试

## Hook API

```tsx
const onboarding = useOnboarding()

// 状态
onboarding.currentStep      // 当前步骤
onboarding.completedSteps   // 已完成步骤
onboarding.progress         // 进度 (0-100)
onboarding.skipped          // 是否跳过
onboarding.visible          // 是否显示

// 方法
onboarding.completeStep(step)  // 完成步骤
onboarding.goToStep(step)      // 跳转步骤
onboarding.skip()              // 跳过引导
onboarding.reset()             // 重置引导
```

## 测试

```js
// 清除状态
localStorage.removeItem('onboarding_state')
location.reload()
```

## 文件

- `src/hooks/useOnboarding.ts` - 状态管理
- `src/pages/dashboard/components/OnboardingGuide.tsx` - 组件
- `src/pages/dashboard/components/ONBOARDING_README.md` - 详细文档
