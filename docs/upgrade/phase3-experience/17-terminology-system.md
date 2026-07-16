# 17 — 术语解释系统

> **后端**: — | **前端**: 1 人天 | **依赖**: 无

---

## 1. 背景与目标

**问题**：当前管理后台充斥 RPM、TPM、熔断、降级、加权路由、上游模型名等专业术语，新用户/非技术管理员难以理解。

**目标**：每个术语鼠标悬停展示解释；页面级功能说明完善；管理后台右上角新增"帮助"按钮。

---

## 2. 术语词典

### 后端接口（可选，降低前端维护成本）

```typescript
GET /api/v1/glossary
Response: {
  terms: {
    "RPM": {
      label: "每分钟请求数",
      description: "Requests Per Minute，每分钟允许的最大 API 请求次数",
      category: "限流",
      relatedTerms: ["TPM", "Rate Limit"]
    },
    "TPM": {
      label: "每分钟 Token 数",
      description: "Tokens Per Minute，每分钟允许处理的最大 Token 数量",
      category: "限流",
      relatedTerms: ["RPM"]
    },
    "熔断": {
      label: "Circuit Breaker",
      description: "当上游供应商连续失败超过阈值时自动切断流量，避免雪崩效应",
      category: "路由",
      relatedTerms: ["降级", "健康检查"]
    },
    "降级": {
      label: "Degraded",
      description: "供应商响应变慢或失败率升高时，系统自动降低其权重，优先选择更健康的厂商",
      category: "路由",
    },
    "加权路由": {
      label: "Weighted Routing",
      description: "按设置的比例（权重）将请求分配到不同的上游供应商",
      category: "路由",
    },
    "上游模型名": {
      label: "Upstream Model Name",
      description: "上游供应商实际使用的模型名称，可能与 3cloud 内展示的名称不同",
      example: "3cloud 叫 gpt-4o，上游实际叫 gpt-4o-2024-08-06",
      category: "模型",
    },
    "SSE": {
      label: "Server-Sent Events",
      description: "流式输出的技术协议，AI 回复逐字推送而非一次性返回",
      category: "协议",
    },
    "配额": {
      label: "Quota",
      description: "周期性资源上限，如月度 100 万 Token，到期自动重置",
      category: "计费",
    },
    "熔断恢复": {
      label: "Circuit Recovery",
      description: "熔断的厂商在确认恢复后（连续 3 次成功），自动重新接入流量",
      category: "路由",
    },
    // ... 共 40+ 术语
  }
}
```

---

## 3. 前端组件

### `<TermTooltip>`

```tsx
// 文件：web/src/components/ui/TermTooltip.tsx

interface TermTooltipProps {
  term: string           // 术语名（查找依据）
  children?: ReactNode   // 自定义显示内容（默认为术语名）
  placement?: 'top' | 'bottom' | 'left' | 'right'
  size?: 'sm' | 'md'
}
```

使用方法：

```tsx
// 直接使用
<TermTooltip term="RPM" />

// 自定义显示
<TermTooltip term="熔断" size="sm">
  <span className="underline decoration-dotted">Circuit Breaker</span>
</TermTooltip>
```

渲染：
```
           ┌──────────────────────┐
           │  RPM                  │
           │  每分钟请求数          │
           │                      │
           │  Requests Per Minute  │
           │  每分钟允许的最大 API  │
           │  请求次数             │
           │                      │
           │  关联: TPM, 限流      │
           └──────────────────────┘
                    ↑
                    │
   请求频率限制 ────┘
   RPM: 100/分钟
```

### `<FeatureDescription>` 增强

现有 `components/admin/FeatureDescription.tsx` 增强：

```tsx
// 现有组件：仅展示纯文本描述
// 增强后：支持差异、关联、截图

interface FeatureDescriptionProps {
  page: string
  type?: 'default' | 'diff' | 'guide'
  // default: 文字描述
  // diff: 当前页面相对于上一版本的变更
  // guide: 操作指南（分步骤）
}
```

### 页面帮助面板

每个管理页面右上角新增"帮助"按钮：

```
┌───────────────────────────────────────────────┐
│  供应商管理                       [📖 帮助] [?] │
├───────────────────────────────────────────────┤
│                                                │
│  点击帮助 → 弹出侧边面板                        │
│  ┌─────────────────────────────────────────┐   │
│  │ 📖 帮助                                 │   │
│  ├─────────────────────────────────────────┤   │
│  │                                         │   │
│  │  供应商管理                              │   │
│  │                                         │   │
│  │  供应商是上游 AI API 提供方，如           │   │
│  │  OpenAI、DeepSeek 等。                  │   │
│  │                                         │   │
│  │  📋 常见操作                             │   │
│  │  · 新建供应商：填入名称和 API 端点        │   │
│  │  · 从模板导入：一键接入主流厂商           │   │
│  │  · 行内展开：查看每个供应商的模型映射      │   │
│  │                                         │   │
│  │  🔗 关联页面                              │   │
│  │  · 模型管理 → 管理全局模型列表            │   │
│  │  · 模型映射 → 绑定供应商和模型            │   │
│  │                                         │   │
│  │                     [❌ 关闭]             │   │
│  └─────────────────────────────────────────┘   │
└───────────────────────────────────────────────┘
```

---

## 4. 覆盖页面

所有管理页面 + 用户页面需要 `TermTooltip` 覆盖的关键术语：

| 页面 | 需要解释的术语 |
|------|--------------|
| 仪表盘 | RPM, TPM, 熔断, 在线通道 |
| 供应商管理 | 降级, 熔断状态, 健康评分, 上游端点 |
| 模型管理 | 模型状态, 成本价/售价 |
| 模型映射 | 上游模型名, 权重, 售价加成 |
| 调用日志 | SSE, 流式, Token 计费, 路由策略 |
| 限流管理 | RPM/TPM, 滑动窗口, 限流级别 |
| 财务页面 | 结算周期, 对账, 未结算金额, 佣金 |
| 安全页面 | 熔断, 安全事件级别, IP 封禁 |
| API Key | 配额, 速率限制 |
| 用户端 | API Key, Token, 消费记录 |

---

## 5. 验收标准

- [ ] 核心管理页面的术语鼠标悬停显示解释 Tooltip
- [ ] 40+ 术语覆盖（调用日志、财务、路由、安全、模型）
- [ ] FeatureDescription 组件增强（支持 diff/guide 类型）
- [ ] 每个管理页面右上角有"帮助"按钮
- [ ] 帮助面板展示：页面功能说明、常见操作、关联页面
- [ ] 移动端 Tooltip 改为点击触发
- [ ] 术语词典支持后端接口动态获取（可选）
