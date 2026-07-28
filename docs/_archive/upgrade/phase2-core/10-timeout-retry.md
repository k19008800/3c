# 10 — 超时重试机制

> **后端**: 1 人天 | **前端**: — | **依赖**: 无

---

## 1. 背景与目标

**问题**：当前 `proxy.ts` 使用 `fetch()` 且由 AbortController 控制超时，但超时后直接返回失败，无重试逻辑。上游偶发抖动导致失败率偏高。

**目标**：实现可配置的重试策略：超时/5xx 时自动切换到备用厂商重试，重试参数可配置。

---

## 2. 设计

### `retryFetch` 包装函数

```typescript
// 文件：api/src/services/retry-fetch.ts

interface RetryOptions {
  /** 总超时（包含所有重试） */
  totalTimeoutMs: number
  /** 单次请求超时 */
  requestTimeoutMs: number
  /** 最大重试次数 */
  maxRetries: number
  /** 退避策略 */
  backoff: 'fixed' | 'exponential' | 'linear'
  /** 固定退避间隔（fixed 时使用） */
  backoffMs: number
  /** 哪些 HTTP 状态码触发重试（默认 5xx + 超时）*/
  retryableStatuses: number[]
  /** 是否仅切换到不同厂商重试（默认 true，可避免同一厂商重复超时）*/
  switchVendorOnly: boolean
  /** 重试前的回调（用于切换厂商）*/
  onRetry?: (attempt: number, error: any) => Promise<{ shouldRetry: boolean; newUrl?: string; newHeaders?: Record<string, string> }>
}

interface RetryResult {
  response: Response | null
  durationMs: number
  attempts: AttemptRecord[]
  usedFallbackVendor: boolean
}

interface AttemptRecord {
  attempt: number
  vendorModelId: number
  vendorName: string
  status: 'success' | 'timeout' | 'error'
  durationMs: number
  error?: string
}
```

### 核心实现

```typescript
async function retryFetch(
  url: string,
  options: RequestInit & { signal?: AbortSignal },
  retryOptions: RetryOptions,
): Promise<RetryResult> {
  const attempts: AttemptRecord[] = []
  const startTime = Date.now()
  const enableFallback = retryOptions.switchVendorOnly
    && typeof retryOptions.onRetry === 'function'
  
  for (let attempt = 0; attempt <= retryOptions.maxRetries; attempt++) {
    const attemptStart = Date.now()
    const remainingTime = retryOptions.totalTimeoutMs - (attemptStart - startTime)
    
    if (remainingTime <= 0) {
      attempts.push({
        attempt: attempt + 1,
        vendorModelId: 0,
        vendorName: '',
        status: 'timeout',
        durationMs: Date.now() - attemptStart,
        error: '总超时已耗尽',
      })
      break
    }
    
    try {
      const requestTimeout = Math.min(retryOptions.requestTimeoutMs, remainingTime)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), requestTimeout)
      
      // 合并 signal
      const combinedSignal = options.signal
        ? anySignal([options.signal, controller.signal])
        : controller.signal
      
      const response = await fetch(url, { ...options, signal: combinedSignal })
      clearTimeout(timer)
      
      attempts.push({
        attempt: attempt + 1,
        vendorModelId: 0,
        vendorName: '',
        status: 'success',
        durationMs: Date.now() - attemptStart,
      })
      
      return {
        response,
        durationMs: Date.now() - startTime,
        attempts,
        usedFallbackVendor: attempt > 0,
      }
    } catch (err: any) {
      clearTimeout(timer) // 确保清理
      const isTimeout = err.name === 'AbortError'
      
      attempts.push({
        attempt: attempt + 1,
        vendorModelId: 0,
        vendorName: '',
        status: isTimeout ? 'timeout' : 'error',
        durationMs: Date.now() - attemptStart,
        error: err.message,
      })
      
      // 最后一次重试失败 → 返回最后的错误
      if (attempt === retryOptions.maxRetries) {
        return {
          response: null,
          durationMs: Date.now() - startTime,
          attempts,
          usedFallbackVendor: false,
        }
      }
      
      // 退避等待
      await backoff(retryOptions.backoff, retryOptions.backoffMs, attempt)
      
      // 如果是 switchVendorOnly，调用 onRetry 切换厂商
      if (enableFallback && retryOptions.onRetry) {
        const retryDecision = await retryOptions.onRetry(attempt, err)
        if (!retryDecision.shouldRetry) break
        if (retryDecision.newUrl) url = retryDecision.newUrl
        if (retryDecision.newHeaders) {
          options.headers = { ...options.headers as any, ...retryDecision.newHeaders }
        }
      }
    }
  }
  
  return {
    response: null,
    durationMs: Date.now() - startTime,
    attempts,
    usedFallbackVendor: false,
  }
}

function backoff(strategy: string, baseMs: number, attempt: number): Promise<void> {
  let delay: number
  switch (strategy) {
    case 'exponential':
      delay = baseMs * Math.pow(2, attempt)
      break
    case 'linear':
      delay = baseMs * (attempt + 1)
      break
    default:
      delay = baseMs
  }
  return new Promise(resolve => setTimeout(resolve, Math.min(delay, 30000)))
}
```

---

## 3. 在 proxy.ts 中集成

### 配置默认值

```typescript
// api/src/config.ts 追加
retry: {
  enabled: true,
  maxRetries: 2,
  requestTimeoutMs: 30000,
  totalTimeoutMs: 90000,    // 30s × 3 次尝试
  backoff: 'linear',
  backoffMs: 1000,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
  switchVendorOnly: true,
}
```

### 改造 `handleNonStreaming`

```typescript
// proxy.ts — handleNonStreaming 中替换直接 fetch 调用

const retryResult = await retryFetch(
  route.apiEndpoint,
  {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${route.apiKeyPlain}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(forwardBody),
  },
  {
    ...config.retry,
    onRetry: async (attempt, err) => {
      // 切换到备选厂商
      const fallbackRoute = await selectFallbackRoute(model.id, route.vendorId)
      if (!fallbackRoute) return { shouldRetry: false }
      
      return {
        shouldRetry: true,
        newUrl: fallbackRoute.apiEndpoint,
        newHeaders: { 'Authorization': `Bearer ${fallbackRoute.apiKeyPlain}` },
      }
    },
  },
)

// 记录重试信息到 call_logs
if (retryResult.attempts.length > 1 || retryResult.usedFallbackVendor) {
  // 新增字段：retry_info JSON
  request.retryInfo = {
    attempts: retryResult.attempts.map(a => ({
      attempt: a.attempt,
      vendor: a.vendorName,
      status: a.status,
      durationMs: a.durationMs,
    })),
    totalDurationMs: retryResult.durationMs,
    usedFallbackVendor: retryResult.usedFallbackVendor,
  }
}
```

---

## 4. 数据库变更

### `call_logs` 表新增字段

```typescript
// call_logs 扩展
retryAttempts: jsonb("retry_attempts"),
// 存储重试详情：
// [{"attempt":1,"vendor":"deepseek","status":"timeout"},
//  {"attempt":2,"vendor":"aliyun","status":"success"}]

usedFallbackVendor: boolean("used_fallback_vendor").default(false),
```

---

## 5. 配置 UI（管理后台新增）

```
超时重试设置
┌─────────────────────────────────────────────────┐
│ 开启重试                  [✅ 是] [❌ 否]          │
│ 最大重试次数              [2]                     │
│ 单次请求超时(秒)          [30]                    │
│ 总超时(秒)               [90]                    │
│ 退避策略                 [线性 ▼]                 │
│ 退避间隔(ms)             [1000]                  │
│ 触发重试的状态码          [408,429,500,502,503,504]│
│ 仅切换到不同厂商重试       [✅ 是]                  │
└─────────────────────────────────────────────────┘
```

---

## 6. 验收标准

- [ ] 上游超时/5xx 时自动重试（默认最多 2 次）
- [ ] 重试时切换到备用厂商（自动选次优路线）
- [ ] 重试次数/退避策略可配置
- [ ] 重试详情记录到 call_logs.retryAttempts
- [ ] 所有重试总时间不超过 totalTimeoutMs
- [ ] 管理后台有重试配置页面
- [ ] 重试不影响幂等性（非流式请求可以重试，流式请求降级不重试）
