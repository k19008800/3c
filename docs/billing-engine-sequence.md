# 计费引擎 — 时序图

> 文件：`3cloud/docs/billing-engine-sequence.md`
> 关联实现：`api/src/services/billing.ts`

## 核心场景

### 场景 1：正常请求（余额充足）

```mermaid
sequenceDiagram
    participant Client as 客户端
    participant Proxy as Token Proxy
    participant Billing as 计费引擎
    participant Upstream as 上游厂商
    participant DB as PostgreSQL

    Client->>Proxy: POST /v1/chat/completions (stream=false)
    Proxy->>Billing: 检查余额 (users.balance > 0)
    Billing-->>Proxy: 余额充足
    Proxy->>Upstream: 转发请求
    Upstream-->>Proxy: 完整响应 + usage
    Proxy->>Billing: 扣费: usage × 售价 × 折扣
    Billing->>DB: INSERT call_logs (status=success, cost=xxx)
    Billing->>DB: INSERT balance_logs (type=consumption, amount=-xxx)
    Billing->>DB: UPDATE users SET balance = balance - xxx
    Billing-->>Proxy: 扣费完成 (新余额)
    Proxy-->>Client: 返回响应 + usage
```

### 场景 2：流式请求（正常结束）

```mermaid
sequenceDiagram
    participant Client as 客户端
    participant Proxy as Token Proxy
    participant Billing as 计费引擎
    participant Upstream as 上游厂商
    participant DB as PostgreSQL

    Client->>Proxy: POST /v1/chat/completions (stream=true)
    Proxy->>Billing: 检查余额
    Billing-->>Proxy: 余额充足
    Proxy->>Upstream: 转发流式请求
    Upstream-->>Proxy: SSE: data chunk 1..N
    Proxy-->>Client: SSE: data chunk 1..N (逐块转发)
    Note over Proxy: 逐块累加 prompt_tokens + completion_tokens
    Upstream-->>Proxy: SSE: [DONE] (流结束)
    Note over Proxy: 流毕，总 tokens 已确定
    Proxy->>Billing: 扣费: total_tokens × 价格 × 折扣
    Billing->>DB: INSERT call_logs (is_streaming=true, cost=xxx)
    Billing->>DB: INSERT balance_logs
    Billing->>DB: UPDATE users.balance
    Billing-->>Proxy: 扣费完成
    Proxy-->>Client: (已在流中转发完毕)
```

### 场景 3：流式请求 — 中途余额耗尽（允许微超）

```mermaid
sequenceDiagram
    participant Client as 客户端
    participant Proxy as Token Proxy
    participant Billing as 计费引擎
    participant Upstream as 上游厂商
    participant DB as PostgreSQL

    Client->>Proxy: 流式请求
    Proxy->>Billing: 检查余额
    Billing-->>Proxy: 余额 > 0（但仅够部分 tokens）
    Proxy->>Upstream: 转发请求
    Upstream-->>Proxy: SSE 数据流...
    Note over Proxy: 流进行中，余额可能已耗尽
    Note over Billing: ⚠️ 余额耗尽
    Note over Proxy: 允许当前流继续走完
    Upstream-->>Proxy: [DONE]
    Proxy->>Billing: 扣费 (余额为负值)
    Billing->>DB: INSERT call_logs (cost=正数)
    Billing->>DB: UPDATE users SET balance = -xxx (负余额)
    Billing-->>Proxy: 扣费完成，余额为负
    Proxy-->>Client: 流完成
```

### 场景 4：流式请求 — 客户端中途断连（不计费）

```mermaid
sequenceDiagram
    participant Client as 客户端
    participant Proxy as Token Proxy
    participant Billing as 计费引擎
    participant Upstream as 上游厂商
    participant DB as PostgreSQL

    Client->>Proxy: 流式请求
    Proxy->>Billing: 检查余额
    Billing-->>Proxy: 余额充足
    Proxy->>Upstream: 转发请求
    Upstream-->>Proxy: SSE: chunk 1..N
    Proxy-->>Client: chunk 1..N
    Note over Client: ❌ 网络断连 / 用户取消
    Proxy->>Upstream: 中断上游请求
    Note over Proxy: 已消费 tokens 丢弃，不计费
    Proxy->>Billing: 记录：断连，不计费
    Billing->>DB: INSERT call_logs (status=cancelled, cost=0)
    Note over Billing: 不扣费，余额不变
```

### 场景 5：充值回补负余额

```mermaid
sequenceDiagram
    participant Client as 客户端
    participant Billing as 计费引擎
    participant Payment as 支付网关
    participant DB as PostgreSQL

    Note over Client,DB: 当前余额 = -2.50（负值）
    Client->>Billing: 充值 100 元
    Billing->>Payment: 发起在线支付
    Payment-->>Billing: 支付成功
    Billing->>DB: SELECT balance FROM users WHERE id = xxx
    DB-->>Billing: balance = -2.50
    Note over Billing: 先回补负余额
    Billing->>DB: UPDATE users SET balance = 0
    Billing->>DB: INSERT balance_logs (amount=+2.50, type=negative_repay)
    Note over Billing: 剩余部分进入可用余额
    Billing->>DB: UPDATE users SET balance = 97.50
    Billing->>DB: INSERT balance_logs (amount=+97.50, type=recharge, refId=order_id)
    Billing-->>Client: 充值成功，余额 = 97.50
    Note over Client: 余额回正，可发起新请求
```

## 扣费公式

```
最终扣费 = (prompt_tokens × sellPriceInput + completion_tokens × sellPriceOutput)
          × pricingMultiplier
          × discountRate
```

| 变量 | 来源 |
|---|---|
| `sellPriceInput` / `sellPriceOutput` | `vendor_models` 表（每 token 售价） |
| `pricingMultiplier` | `system_configs` key `pricing_multiplier`，默认 1.33 |
| `discountRate` | 优先级：`user_discounts` > `users.discountRate` > `system_configs` 默认折扣 |

## 精度规则

- 所有金额字段使用 `DECIMAL(18,6)`（6 位小数）
- 每次扣费计算结果截断到 6 位小数（不四舍五入，防止累积溢收）
- 余额为负时，下次充值**必须**回补到 > 0 才能继续使用
