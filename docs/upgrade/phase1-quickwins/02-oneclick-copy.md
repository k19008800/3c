# 02 — 一键复制增强

> **后端**: 0.5 人天 | **前端**: 1 人天 | **依赖**: 无

---

## 1. 背景与目标

**问题**：用户接入 3cloud 时需要手动拼写转发地址、构造 curl 请求、查看各语言 SDK 用法。当前只有 API Key 有一键复制，完整的接入引导体验缺失。

**目标**：用户仪表盘/API Key 页面提供"一键接入"能力：转发地址复制、自动填充 Key 的 curl 示例、多语言 SDK 代码、快速调试链接。

---

## 2. 功能模块

### 2.1 接入面板组件 `QuickConnectPanel`

在用户仪表盘（`pages/Dashboard.tsx`）顶部新增接入面板：

```
┌─────────────────────────────────────────────────────────┐
│  🔗 快速接入                                  [❌ 关闭] │
│                                                         │
│  Step 1: 复制转发地址                                    │
│  ┌─────────────────────────────────────────────────┐    │
│  │ https://api.unmisa.com/v1/chat/completions  [📋] │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  Step 2: 选择语言                               [▼ 展开] │
│  ┌──────┬────────┬──────┬────────┬──────┐              │
│  │ curl │ Python │  JS  │  Go    │ Java │              │
│  └──────┴────────┴──────┴────────┴──────┘              │
│                                                         │
│  curl 示例（含你的 API Key 自动填充）：                   │
│  ┌─────────────────────────────────────────────────┐    │
│  │ curl https://api.unmisa.com/v1/chat/            │    │
│  │ completions \                                    │    │
│  │   -H "Authorization: Bearer sk-xxx..." \         │    │
│  │   -H "Content-Type: application/json" \          │    │
│  │   -d '{"model":"deepseek-chat","messages":       │    │
│  │         [{"role":"user","content":"你好"}]}'      │    │
│  │                                         [📋 复制] │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  Step 3: 快速调试                         [🚀 打开调试] │
│                                                         │
│  💡 提示：修改 model 参数选择其他可用模型                  │
└─────────────────────────────────────────────────────────┘
```

### 2.2 后端 API — 调试令牌

生成一个**临时调试令牌**，包含用户身份但不需要完整 API Key：

```typescript
// 新增端点
POST /api/v1/user/debug-token
Request: { minutes?: number }  // 有效期，默认 30 分钟
Response: {
  token: string      // JWT 格式，scope=debug
  expiresAt: string
  playgroundUrl: string  // 直接可打开：/admin/playground?token=xxx
}
```

**安全性**：
- debug token 有效期短（默认 30 分钟，最长 24 小时）
- 仅可用于调试面板请求（scope=debug），不可用作 API 代理调用
- 前端生成一次性链接，调用时需同源检查

### 2.3 多语言 SDK 示例生成

```typescript
// 文件：api/src/services/code-snippets.ts

interface SnippetContext {
  baseUrl: string
  apiKeyPreview: string  // sk-xxx...xxx（仅展示前后 4 位）
  modelName: string      // 默认模型
}

function generateCodeSnippets(ctx: SnippetContext): Record<string, string> {
  return {
    curl: `curl ${ctx.baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer ${ctx.apiKeyPreview}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${ctx.modelName}","messages":[{"role":"user","content":"你好"}]}'`,
    
    python: `import requests

response = requests.post(
    "${ctx.baseUrl}/v1/chat/completions",
    headers={
        "Authorization": "Bearer ${ctx.apiKeyPreview}",
        "Content-Type": "application/json"
    },
    json={
        "model": "${ctx.modelName}",
        "messages": [{"role": "user", "content": "你好"}]
    }
)
print(response.json())`,
    
    javascript: `const response = await fetch("${ctx.baseUrl}/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${ctx.apiKeyPreview}",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model: "${ctx.modelName}",
    messages: [{ role: "user", content: "你好" }]
  })
})
const data = await response.json()
console.log(data)`,
    
    go: `package main

import (
  "bytes"
  "encoding/json"
  "fmt"
  "net/http"
)

func main() {
  body := map[string]any{
    "model": "${ctx.modelName}",
    "messages": []any{map[string]string{"role": "user", "content": "你好"}},
  }
  b, _ := json.Marshal(body)
  req, _ := http.NewRequest("POST", "${ctx.baseUrl}/v1/chat/completions",
    bytes.NewReader(b))
  req.Header.Set("Authorization", "Bearer ${ctx.apiKeyPreview}")
  
  resp, _ := http.DefaultClient.Do(req)
  // ... 处理响应
}`,
  }
}
```

---

## 3. 前端组件

### `<CodeBlock>` 增强

改造现有 `components/portal/CodeBlock.tsx`：

```tsx
interface CodeBlockProps {
  code: string
  language: string      // 'bash' | 'python' | 'javascript' | 'go'
  showCopy?: boolean     // 默认 true
  showLineNumbers?: boolean
  /** 替换 API Key 显示为 ⚫ 模式 */
  maskApiKey?: boolean
  /** 复制回调 */
  onCopy?: () => void
}

// 新增：复制反馈
function handleCopy() {
  navigator.clipboard.writeText(code)
  // Toast: "已复制到剪贴板"
  // 3 秒后自动消失
}
```

### `<QuickConnectPanel>` 组件

```tsx
// 文件：web/src/components/portal/QuickConnectPanel.tsx

interface QuickConnectPanelProps {
  baseUrl: string                      // 从配置读取
  apiKeys: { id: number; key: string; name: string }[]
  defaultModel: string                 // 用户首次使用的模型
  defaultApiKeyId?: number
  expired?: boolean                    // 一天内是否已关闭
  onDismissPanel: () => void           // 关闭面板（24h 内不再显示）
}
```

### API Key 列表行内复制增强

每个 Key 行增加额外的复制按钮：
```
| Key 名称 | Key（前12位...） | 创建时间 | 状态 | 操作           |
|----------|-----------------|---------|------|----------------|
| 默认 Key | sk-b62e...a1f2  | 07-15   | ✅   | [📋 Key] [📋 curl] [🔌 调试] |
```

---

## 4. 后端端点汇总

| 端点 | 方法 | 用途 | 权限 |
|------|------|------|------|
| `POST /api/v1/user/debug-token` | POST | 生成调试令牌 | user |
| `GET /api/v1/user/quick-connect` | GET | 获取接入信息（baseUrl, defaultModel） | user |

---

## 5. 配置项

```typescript
// api/src/config.ts
export const config = {
  debug: {
    tokenExpiryMinutes: 30,       // 调试令牌默认有效期
    maxTokenExpiryMinutes: 1440,  // 调试令牌最长有效期
  },
}
```

---

## 6. 验收标准

- [ ] 用户仪表盘显示接入面板（首次登录/未关闭过）
- [ ] 转发地址一键复制成功
- [ ] curl 示例自动填充用户 API Key（仅显示前后 4 位）
- [ ] Python/JS/Go 示例生成正确
- [ ] 调试链接打开调试面板
- [ ] 关闭面板后 24 小时内不再显示
- [ ] API Key 列表行内新增 "📋 curl" 和 "🔌 调试" 按钮
