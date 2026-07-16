# 14 — 模板一键导入

> **后端**: 0.5 人天 | **前端**: 1 人天 | **依赖**: 无

---

## 1. 背景与目标

**问题**：接入一个新供应商（如 OpenAI）需要在后台创建供应商 → 创建模型 → 创建映射 → 配置定价 → 设置路由，至少 5 步操作。

**目标**：提供预置模板（OpenAI / DeepSeek / Claude / LLMRouter / OspreyAI），一键完成通道配置；支持用户自定义导出/导入模板。

---

## 2. 模板格式

### 模板 JSON Schema

```json
{
  "templateVersion": "1.0",
  "name": "OpenAI 标准模板",
  "description": "接入 OpenAI 官方 API 的完整配置",
  "vendor": {
    "name": "OpenAI",
    "baseUrl": "https://api.openai.com",
    "description": "OpenAI Official API"
  },
  "models": [
    {
      "modelName": "gpt-4o",
      "upstreamModelName": "gpt-4o",
      "apiEndpoint": "/v1/chat/completions",
      "sellPriceInput": "0.0025",
      "sellPriceOutput": "0.01"
    },
    {
      "modelName": "gpt-4o-mini",
      "upstreamModelName": "gpt-4o-mini",
      "apiEndpoint": "/v1/chat/completions",
      "sellPriceInput": "0.00015",
      "sellPriceOutput": "0.0006"
    },
    {
      "modelName": "text-embedding-3-small",
      "upstreamModelName": "text-embedding-3-small",
      "apiEndpoint": "/v1/embeddings",
      "sellPriceInput": "0.00002",
      "sellPriceOutput": "0"
    }
  ],
  "keyGroup": {
    "name": "默认分组",
    "strategy": "round_robin",
    "keyCount": 1,
    "keyHint": "sk-"
  }
}
```

### 预置模板清单（内置在代码中）

| 模板名 | 模型数 | 说明 |
|--------|--------|------|
| OpenAI 标准 | 10+ | gpt-4o, gpt-4o-mini, o1, o3, embeddings 等 |
| DeepSeek 标准 | 5 | deepseek-chat, deepseek-reasoner 等 |
| Claude 标准 | 6 | claude-sonnet-4-6, opus-4-7, haiku-4-5 等 |
| LLMRouter 全量 | 29 | 已接 LLMRouter 的 29 个模型 |
| OspreyAI 全量 | 46 | 已接 OspreyAI 的 46 个模型 |
| Gemini 标准 | 5 | gemini-2.5-pro, flash 等 |

---

## 3. 后端 API

| 端点 | 方法 | 用途 |
|------|------|------|
| `GET /api/v1/admin/templates` | GET | 获取预置模板列表 |
| `GET /api/v1/admin/templates/:name` | GET | 获取模板详情 |
| `POST /api/v1/admin/templates/:name/apply` | POST | 应用模板（创建供应商+模型+映射）|
| `POST /api/v1/admin/templates/export` | POST | 导出当前配置为模板 |
| `POST /api/v1/admin/templates/import` | POST | 导入自定义模板 |

### 应用模板 API

```typescript
POST /api/v1/admin/templates/deepseek/apply
Body: {
  apiKey: "sk-xxx...",           // 必填：上游 API Key
  apiKeyName: "主 Key",
  sellPriceMultiplier: 1.5,      // 可选：售价乘以系数
  namePrefix: "",                 // 可选：通道名称前缀
  vendorName: "DeepSeek 正式环境", // 可选：自定义厂商名称
}
Response: {
  vendorId: 5,
  modelCount: 5,
  channelCount: 5,
  vendor: { ... },
  models: [ ... ],
  warnings: [],   // 如：模型 x 已存在，已跳过
}
```

---

## 4. 前端

### 模板选择向导

在供应商管理页面新增"从模板导入"入口：

```
┌──────────────────────────────────────────────────────────┐
│  📦 从模板导入                             [关闭]          │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  Step 1: 选择模板                                          │
│                                                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                  │
│  │ OpenAI   │ │DeepSeek  │ │ Claude   │                  │
│  │ 10 个模型 │ │  5 个模型 │ │  6 个模型 │                  │
│  │ 🟢 active│ │ 🟢 active│ │ 🟢 active│                  │
│  └──────────┘ └──────────┘ └──────────┘                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                  │
│  │LLMRouter │ │OspreyAI  │ │ Gemini   │                  │
│  │ 29 个模型 │ │ 46 个模型 │ │  5 个模型 │                  │
│  └──────────┘ └──────────┘ └──────────┘                  │
│  ┌──────────────────────────────────────────────────┐     │
│  │                                           [导入自定义]│     │
│  └──────────────────────────────────────────────────┘     │
│                                                           │
│  Step 2: 填入上游 Key                          已选: OpenAI │
│  ┌──────────────────────────────────────────────────┐     │
│  │                                                   │     │
│  │  API Key: [sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx]    │     │
│  │  名称: [OpenAI 主 Key]                            │     │
│  │  售价系数: [1.5] (成本价 × 系数 = 销售价)           │     │
│  │  厂商名称: [OpenAI 正式环境]  (可选)                │     │
│  │                                                   │     │
│  │  ⚠️ 将创建 1 个供应商 + 10 个模型映射                  │     │
│  └──────────────────────────────────────────────────┘     │
│                                                           │
│  Step 3: 确认并应用                        [🚀 一键应用]   │
└──────────────────────────────────────────────────────────┘
```

---

## 5. 验收标准

- [ ] 预置 6 个模板（OpenAI/DeepSeek/Claude/LLMRouter/OspreyAI/Gemini）
- [ ] 选择模板 → 填入 Key → 一键创建完整通道
- [ ] 售价系数支持批量调整（如成本 × 1.5 = 售价）
- [ ] 模板中已存在的模型自动跳过（不重复创建）
- [ ] 支持导出当前供应商配置为模板 JSON
- [ ] 支持导入自定义模板 JSON
- [ ] 创建完成结果显示：创建了多少模型映射、跳过了多少
