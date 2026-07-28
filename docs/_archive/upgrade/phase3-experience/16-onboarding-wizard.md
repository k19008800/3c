# 16 — 新手引导系统

> **后端**: 0.5 人天 | **前端**: 2 人天 | **依赖**: 无

---

## 1. 背景与目标

**问题**：新用户/新管理员首次接触 3cloud 时面对大量配置项和术语不知从何入手。当前无任何引导。

**目标**：新用户注册后自动启动引导流程，分角色展示核心操作路径；管理后台首次登录展示配置向导。

---

## 2. 用户状态标记

```typescript
// users 表新增字段
guideFlags: jsonb("guide_flags").default('{}'),
// 格式：
// {
//   "admin_onboarding_completed": false,
//   "user_onboarding_completed": false,
//   "seen_dashboard_tour": false,
//   "first_api_key_created": false,
//   "first_call_made": false,
//   "guide_dismissed_at": null        // 用户手动关闭引导的时间
// }
```

### 后端 API

```typescript
GET /api/v1/user/guide-status
Response: {
  showGuide: boolean           // 是否显示引导
  role: 'admin' | 'user' | 'agent'
  flags: {
    adminOnboardingCompleted: boolean
    firstApiKeyCreated: boolean
    firstCallMade: boolean
  }
  // 管理员引导步骤
  adminSteps: GuideStep[]
  // 用户引导步骤
  userSteps: GuideStep[]
}

POST /api/v1/user/guide-progress
Body: { step: string; completed: boolean }
// 更新引导进度

POST /api/v1/user/guide-dismiss
// 用户主动关闭引导（30 天内不再显示）
```

---

## 3. 引导流程

### 管理员引导（5 步）

```
Step 1: "欢迎来到 3cloud 管理后台"
         ├ 简介 3cloud 的定位（Token 聚合转发平台）
         ├ 快速浏览各菜单区域
         └ 下一步 → "连接你的第一个供应商"

Step 2: "连接供应商"
         ├ 说明：3cloud 支持对接 OpenAI/DeepSeek/Claude 等
         ├ 高亮："供应商管理"菜单
         ├ 展示"从模板导入"功能（对接 14-模板导入）
         └ 下一步 → "创建 API Key"

Step 3: "创建 API Key"
         ├ 说明：API Key 是你的客户或应用访问 3cloud 的凭证
         ├ 高亮："API Key"管理页
         ├ 或：如果已有预置演示 Key，直接跳到下一步
         └ 下一步 → "测试连通性"

Step 4: "在线调试"
         ├ 说明：用调试面板测试一条真实的 API 调用
         ├ 高亮："调试面板"入口
         ├ 引导用户选择模型 → 输入消息 → 发送
         └ 下一步 → "了解核心概念"

Step 5: "核心概念"
         ├ RPM（每分钟请求数）、TPM（每分钟 Token）
         ├ 路由策略（最低价/加权/手动）
         ├ 熔断与健康检测
         ├ 计费与对账
         └ ✅ "完成！查看完整仪表盘"
```

### 普通用户引导（3 步）

```
Step 1: "欢迎使用 3cloud"
         ├ 简介：你正在使用统一的 AI API 接入服务
         └ 下一步

Step 2: "获取你的 API Key"
         ├ 高亮：我的 API Key
         ├ 引导创建第一个 Key
         ├ 展示一键复制 curl 示例
         └ 下一步

Step 3: "查看你的仪表盘"
         ├ 余额、套餐配额、今日消耗
         ├ 调用日志
         └ ✅ "开始使用"
```

---

## 4. 前端组件

### `<OnboardingWizard>`

```tsx
// 文件：web/src/components/onboarding/OnboardingWizard.tsx

interface OnboardingWizardProps {
  steps: GuideStep[]
  role: 'admin' | 'user'
  onComplete: () => void
  onDismiss: () => void
}
```

#### 主要特性

```tsx
export default function OnboardingWizard({ steps, role, onComplete, onDismiss }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [animating, setAnimating] = useState(false)
  
  const step = steps[currentStep]
  
  const handleNext = async () => {
    if (currentStep >= steps.length - 1) {
      await post('/api/v1/user/guide-progress', {
        step: 'completed',
        completed: true
      })
      onComplete()
      return
    }
    
    setAnimating(true)
    setTimeout(() => {
      setCurrentStep(s => s + 1)
      setAnimating(false)
    }, 300)
    
    // 高亮目标元素
    if (step.highlightSelector) {
      document.querySelector(step.highlightSelector)?.scrollIntoView({
        behavior: 'smooth', block: 'center'
      })
    }
  }
  
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      {/* 高亮环（围绕目标元素）*/}
      {step.highlightSelector && <HighlightRing selector={step.highlightSelector} />}
      
      {/* 引导卡片 */}
      <div className={cn(
        "bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 transition-all",
        animating && "opacity-0 translate-y-4"
      )}>
        {/* 进度指示 */}
        <div className="flex gap-1 mb-6">
          {steps.map((_, i) => (
            <div key={i} className={cn(
              "h-1 flex-1 rounded-full",
              i <= currentStep ? "bg-blue-500" : "bg-slate-200"
            )} />
          ))}
        </div>
        
        {/* 内容 */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{step.icon}</span>
            <h3 className="text-lg font-semibold">{step.title}</h3>
          </div>
          <p className="text-slate-600 text-sm leading-relaxed">{step.description}</p>
          
          {/* 额外内容（如截图/代码块） */}
          {step.content && <div className="bg-slate-50 rounded-lg p-3">{step.content}</div>}
          
          {/* 操作按钮 */}
          {step.action && (
            <button
              onClick={step.action.onClick}
              className="w-full py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-100"
            >
              {step.action.label}
            </button>
          )}
        </div>
        
        {/* 底部按钮 */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t">
          <button
            onClick={onDismiss}
            className="text-sm text-slate-400 hover:text-slate-600"
          >
            跳过引导
          </button>
          <div className="flex gap-2">
            {currentStep > 0 && (
              <button
                onClick={() => setCurrentStep(s => s - 1)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg"
              >
                上一步
              </button>
            )}
            <button
              onClick={handleNext}
              className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              {currentStep >= steps.length - 1 ? '✅ 完成' : '下一步'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

### `<HighlightRing>` — 高亮引导区域

```tsx
// 在目标元素周围画一个脉冲高亮环
function HighlightRing({ selector }: { selector: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  
  useEffect(() => {
    const el = document.querySelector(selector)
    if (el) {
      const updateRect = () => setRect(el.getBoundingClientRect())
      updateRect()
      window.addEventListener('resize', updateRect)
      return () => window.removeEventListener('resize', updateRect)
    }
  }, [selector])
  
  if (!rect) return null
  
  return (
    <div
      className="fixed border-4 border-blue-400 rounded-lg pointer-events-none z-50
                 animate-pulse shadow-[0_0_0_4px_rgba(59,130,246,0.3)]"
      style={{
        top: rect.top - 8,
        left: rect.left - 8,
        width: rect.width + 16,
        height: rect.height + 16,
      }}
    />
  )
}
```

---

## 5. 引导配置文件

```typescript
// web/src/components/onboarding/steps.ts

export const ADMIN_STEPS: GuideStep[] = [
  {
    icon: '👋',
    title: '欢迎来到 3cloud',
    description: '3cloud 是 AI API 聚合平台，连接多家模型供应商，' +
      '为你的用户提供统一的 API 接入和 Token 计费服务。',
    highlightSelector: '.admin-header',
  },
  {
    icon: '🔗',
    title: '连接你的第一个供应商',
    description: '通过模板一键接入 OpenAI/DeepSeek 等厂商。' +
      '只需填入 API Key，系统自动创建模型映射和定价。',
    highlightSelector: '[href="/admin/vendors"]',
    action: {
      label: '去连接供应商 →',
      onClick: () => window.location.href = '/admin/vendors?action=template-import',
    },
  },
  {
    icon: '🔑',
    title: '创建 API Key',
    description: 'API Key 是访问凭证，你的客户或应用用它来调用 AI 服务。' +
      '每个 Key 都可以独立设置限流和权限。',
    highlightSelector: '[href="/admin/api-keys"]',
    action: {
      label: '去创建 Key →',
      onClick: () => window.location.href = '/admin/api-keys?action=create',
    },
  },
  {
    icon: '🧪',
    title: '在线调试',
    description: '不需要 curl 或 Postman，直接在后台测试 API 连通性。' +
      '选择模型、输入消息，系统会展示完整的路由链路。',
    highlightSelector: '[href="/admin/playground"]',
    action: {
      label: '打开调试面板 →',
      onClick: () => window.location.href = '/admin/playground',
    },
  },
  {
    icon: '📖',
    title: '核心概念速览',
    description: 'RPM = 每分钟请求数 / TPM = 每分钟 Token / ' +
      '路由策略决定请求走哪个供应商 / 熔断自动隔离故障厂商',
    content: <ConceptCards />,
  },
]

export const USER_STEPS: GuideStep[] = [
  // ... 轻量版引导
]
```

---

## 6. 验收标准

- [ ] 新注册管理员自动弹出 5 步引导
- [ ] 新注册普通用户自动弹出 3 步引导
- [ ] 引导可随时跳过（30 天内不再显示）
- [ ] 引导步骤采用走马灯形式，有进度条和上一步/下一步
- [ ] 管理员引导高亮对应的菜单/按钮
- [ ] 每个引导步骤有"关联操作"按钮，点击跳转到对应页面
- [ ] 用户完成引导后，guideFlags 更新
- [ ] 可在用户设置中重新打开引导
