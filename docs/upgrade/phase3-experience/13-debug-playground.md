# 13 — 内置调试面板

> **后端**: 1 人天 | **前端**: 2 人天 | **依赖**: 02 调试令牌（debug-token）

---

## 1. 背景与目标

**问题**：用户测试接入需要开终端写 curl、查看结果要切多个页面。无法直接看到路由链路的每一个环节。

**目标**：在管理后台内置 API 调试器，像 OpenAI Playground 一样直观，同时展示 3cloud 特有的路由链路。

---

## 2. 路由

```
/admin/playground      — 完整调试面板
任何页面快捷入口         — 浮窗模式（可选）
```

---

## 3. 布局设计

```
┌─────────────────────────────────────────────────────────┐
│  🚀 API 调试器                             [Debug Token] │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  左侧: 参数配置                                  右侧: 结果 │
│  ┌─────────────────────┐   ┌──────────────────────────┐ │
│  │ 用户身份             │   │  响应                    │ │
│  │ [admin@3cloud.ai ▼] │   │                          │ │
│  │                     │   │  ┌──────────────────────┐ │ │
│  │ API Key             │   │  │ Status: 200 OK       │ │ │
│  │ [自动选择 ▼]         │   │  │ Duration: 1,234ms   │ │ │
│  │                     │   │  │ Tokens: 45 ↑ 123 ↓  │ │ │
│  │ 模型                 │   │  │ Cost: ¥0.0087       │ │ │
│  │ [gpt-4o ▼]          │   │  └──────────────────────┘ │ │
│  │                     │   │                          │ │
│  │ 路由策略             │   │  JSON 响应:                │ │
│  │ [自动最低价 ▼]       │   │  ┌──────────────────────┐ │ │
│  │                     │   │  │ {                    │ │ │
│  │ 系统提示              │   │  │   "choices": [...]  │ │ │
│  │ ┌─────────────────┐  │   │  │   "usage": {...}    │ │ │
│  │ │ You are a       │  │   │  }                    │ │ │
│  │ │ helpful...      │  │   │  └──────────────────────┘ │ │
│  │ └─────────────────┘  │   │                          │ │
│  │                     │   │  流式输出:                  │ │
│  │ 用户消息              │   │  ┌──────────────────────┐ │ │
│  │ ┌─────────────────┐  │   │  │ 你好！我是AI助手...  │ │ │
│  │ │ 你好，介绍一下   │  │   │  │                      │ │ │
│  │ │ 你自己           │  │   │  └──────────────────────┘ │ │
│  │ └─────────────────┘  │   │                          │ │
│  │                     │   │                          │ │
│  │ [🚀 发送] [刷新]     │   │                          │ │
│  └─────────────────────┘   └──────────────────────────┘ │
│                                                          │
├─────────────────────────────────────────────────────────┤
│  🔍 路由链路                                            │
│                                                          │
│  (1) API Key 鉴权     → ✅ admin@3cloud.ai               │
│  (2) 余额检查         → ✅ ¥1,234.56                     │
│  (3) 限流检查         → ✅ RPM: 45/100                    │
│  (4) 配额检查         → ✅ Token: 23.5%                   │
│  (5) 路由选择         → lowest_price                      │
│      ↓ 候选项                                            │
│       ① DeepSeek   ¥0.14/1K   ✅ 选中                     │
│       ② Claude 3.5 ¥0.18/1K   ⚡ 熔断中                    │
│       ③ Aliyun     ¥0.15/1K   ❌ isDown                   │
│  (6) 上游转发        → ✅ 成功 (1,234ms)                  │
│  (7) 计费            → ✅ ¥0.0087                         │
└─────────────────────────────────────────────────────────┘
```

---

## 4. 前端组件

### `<Playground>` 主组件

```tsx
// 文件：web/src/pages/admin/Playground.tsx（新建）

export default function Playground() {
  const [config, setConfig] = useState<PlaygroundConfig>({
    userId: undefined,
    apiKeyId: undefined,
    model: availableModels[0]?.name ?? '',
    strategy: 'lowest_price',
    systemPrompt: '',
    messages: [{ role: 'user', content: '' }],
    stream: false,
    temperature: 1,
    maxTokens: 2048,
  })
  
  const [result, setResult] = useState<PlaygroundResult | null>(null)
  const [chain, setChain] = useState<ChainStep[]>([])
  const [loading, setLoading] = useState(false)
  
  const handleSend = async () => {
    setLoading(true)
    setResult(null)
    setChain([])
    
    try {
      // 特殊端点：/api/v1/playground/chat/completions
      // 这个端点和普通代理走相同链路，但会返回详细的链路追踪
      const res = await post('/api/v1/playground/chat/completions', {
        ...config,
        model: config.model,
        messages: [
          ...(config.systemPrompt ? [{ role: 'system', content: config.systemPrompt }] : []),
          ...config.messages,
        ],
        _trace: true,    // 请求链路追踪标记
      })
      
      setResult(res)
      setChain(res._chain || [])
    } catch (err: any) {
      setResult({ error: err.message })
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <div className="flex h-[calc(100vh-120px)] gap-4">
      {/* 左侧配置面板 */}
      <div className="w-[400px] shrink-0 space-y-4 overflow-y-auto">
        <UserSelector value={config.userId} onChange={...} />
        <ApiKeySelector value={config.apiKeyId} onChange={...} />
        <ModelSelect value={config.model} onChange={...} />
        <StrategySelect value={config.strategy} onChange={...} />
        <TextArea label="系统提示" value={config.systemPrompt} onChange={...} />
        <MessageEditor messages={config.messages} onChange={...} />
        <div className="flex gap-2">
          <Slider label="Temperature" min={0} max={2} step={0.1} value={config.temperature} />
          <Slider label="Max Tokens" min={1} max={4096} value={config.maxTokens} />
        </div>
        <Button onClick={handleSend} loading={loading}>
          🚀 发送
        </Button>
      </div>
      
      {/* 右侧结果面板 */}
      <div className="flex-1 space-y-4 overflow-y-auto">
        {/* 响应摘要 */}
        {result && <ResponseSummary result={result} />}
        
        {/* JSON / 流式输出 */}
        {result && !result.error && (
          <Tabs>
            <Tab label="JSON">
              <CodeBlock code={JSON.stringify(result, null, 2)} language="json" />
            </Tab>
            <Tab label="流式输出">
              <StreamOutput content={result.streamContent || ''} />
            </Tab>
          </Tabs>
        )}
        
        {/* 路由链路追踪 */}
        {chain.length > 0 && <ChainTrace steps={chain} />}
        
        {/* 错误提示 */}
        {result?.error && (
          <ErrorCard message={result.error} />
        )}
      </div>
    </div>
  )
}
```

---

## 5. 后端：Playground 端点

```typescript
// api/src/routes/playground.ts（新建）

// POST /api/v1/playground/chat/completions
// 与正常代理走完全相同流程，但增加了：
// 1. 测试模式（标记 call_logs.is_test=true，不计费）
// 2. 返回 _chain 链路追踪
// 3. 需要管理员权限（不对外暴露）

import { authenticateJWT, requirePerm, Perm } from "../middleware/auth.js"

export async function playgroundRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT)
  app.addHook("preHandler", requirePerm(Perm.MODEL_MANAGE))
  
  app.post("/api/v1/playground/chat/completions", async (request, reply) => {
    const body = request.body as any
    const isTest = body._trace !== false
    
    // 1. 模拟 API Key 鉴权（使用指定 API Key）
    // 2. 模拟用户身份（切换不同用户来测试权限）
    // 3. 路由选择（展示候选列表）
    // 4. 转发请求（不限制超时）
    // 5. 返回结果 + _chain
    
    const chain: ChainStep[] = []
    
    // Step 1: API Key 鉴权
    const apiKey = await db.select().from(apiKeys).where(eq(apiKeys.id, body.apiKeyId)).limit(1)
    chain.push({ step: 1, name: 'API Key 鉴权', status: 'ok', detail: apiKey[0]?.name })
    
    // Step 2: 余额检查
    // ...
    
    // Step 3: 路由候选
    const candidates = await queryAvailableRoutes(modelId)
    chain.push({
      step: 5, name: '路由选择',
      status: 'ok',
      detail: `策略: ${body.strategy || 'lowest_price'}`,
      candidates: candidates.map(c => ({
        vendorName: c.vendorName,
        sellPrice: c.sellPriceInput,
        status: c.isDown ? 'down' : 'available',
      })),
    })
    
    // Step 4: 转发
    const forwardResult = await forwardRequest(selectedRoute, request)
    chain.push({
      step: 6, name: '上游转发',
      status: forwardResult.status < 400 ? 'ok' : 'error',
      detail: `${forwardResult.status} (${forwardResult.durationMs}ms)`,
    })
    
    // 返回结果 + _chain
    return {
      ...forwardResult.body,
      _chain: chain,
      _testMode: isTest,
      _warning: isTest ? '当前为调试模式，不计费' : undefined,
    }
  })
}
```

---

## 6. 安全

- 调试端点仅限 `admin`/`super_admin` 权限
- 调试模式下调用不计费
- 调试端点的 API Key 预检查中允许 `scope=debug` 的令牌
- 调试请求自动记录 `call_logs.is_test=true`
- 不能通过 Debug Panel 调用非白名单模型

---

## 7. 验收标准

- [ ] 调试面板可切换用户身份（模拟不同用户测试权限）
- [ ] 可选 API Key、模型、路由策略
- [ ] 支持非流式和流式两种模式
- [ ] 发送后展示路由链路追踪（每一步的耗时和状态）
- [ ] 失败时展示完整错误上下文（哪一步 + 原因）
- [ ] 调试 API 不计费（call_logs.is_test=true）
- [ ] 仅管理员可访问
- [ ] 响应支持 JSON 查看和流式文字渲染双 Tab
