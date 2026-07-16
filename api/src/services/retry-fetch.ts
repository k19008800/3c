// ============================================================
//  3cloud (3C) — 超时重试机制
//  retryFetch 包装函数
//
//  支持：
//  - 可配置重试次数和超时时间
//  - 固定/指数/线性退避策略
//  - 仅 5xx/超时/特定状态码触发重试
//  - 可选的厂商切换回调
// ============================================================

export interface RetryOptions {
  /** 单次请求超时（毫秒） */
  requestTimeoutMs: number
  /** 总超时（包含所有重试，毫秒） */
  totalTimeoutMs: number
  /** 最大重试次数 */
  maxRetries: number
  /** 退避策略 */
  backoff: 'fixed' | 'exponential' | 'linear'
  /** 退避间隔基数（毫秒） */
  backoffMs: number
  /** 触发重试的 HTTP 状态码 */
  retryableStatuses: number[]
  /** 重试前的回调（可用于切换厂商） */
  onRetry?: (attempt: number, error: any) => Promise<{ shouldRetry: boolean; newUrl?: string; newHeaders?: Record<string, string> }>
}

export interface RetryAttempt {
  attempt: number
  status: 'success' | 'timeout' | 'error'
  statusCode?: number
  durationMs: number
  error?: string
}

export interface RetryResult {
  response: Response | null
  durationMs: number
  attempts: RetryAttempt[]
  usedFallback: boolean
}

// ── 退避等待 ──

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

// ── 合并 AbortSignal ──

function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController()
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason)
      return controller.signal
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true })
  }
  return controller.signal
}

// ── 主函数 ──

export async function retryFetch(
  url: string,
  options: RequestInit,
  retryOpts: RetryOptions,
): Promise<RetryResult> {
  const attempts: RetryAttempt[] = []
  const startTime = Date.now()
  let currentUrl = url

  for (let attempt = 0; attempt <= retryOpts.maxRetries; attempt++) {
    const attemptStart = Date.now()
    const elapsed = attemptStart - startTime
    const remainingTime = retryOpts.totalTimeoutMs - elapsed

    if (remainingTime <= 0) {
      attempts.push({
        attempt: attempt + 1,
        status: 'timeout',
        durationMs: 0,
        error: '总超时已耗尽',
      })
      break
    }

    try {
      const requestTimeout = Math.min(retryOpts.requestTimeoutMs, remainingTime)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), requestTimeout)

      const signal = options.signal
        ? anySignal([options.signal, controller.signal])
        : controller.signal

      const response = await fetch(currentUrl, { ...options, signal })
      clearTimeout(timer)

      const durationMs = Date.now() - attemptStart

      // 检查状态码是否可重试
      if (response.ok || !retryOpts.retryableStatuses.includes(response.status)) {
        attempts.push({
          attempt: attempt + 1,
          status: 'success',
          statusCode: response.status,
          durationMs,
        })
        return {
          response,
          durationMs: Date.now() - startTime,
          attempts,
          usedFallback: attempt > 0,
        }
      }

      // 可重试的状态码
      attempts.push({
        attempt: attempt + 1,
        status: 'error',
        statusCode: response.status,
        durationMs,
        error: `HTTP ${response.status}`,
      })

      // 最后一次重试也失败了，返回但不切换
      if (attempt === retryOpts.maxRetries) {
        return {
          response,
          durationMs: Date.now() - startTime,
          attempts,
          usedFallback: attempt > 0,
        }
      }

    } catch (err: any) {
      const durationMs = Date.now() - attemptStart
      const isTimeout = err.name === 'AbortError'

      attempts.push({
        attempt: attempt + 1,
        status: isTimeout ? 'timeout' : 'error',
        durationMs,
        error: err.message,
      })

      if (attempt === retryOpts.maxRetries) {
        return { response: null, durationMs: Date.now() - startTime, attempts, usedFallback: false }
      }
    }

    // 退避等待
    await backoff(retryOpts.backoff, retryOpts.backoffMs, attempt)

    // 回调：切换厂商
    if (retryOpts.onRetry) {
      try {
        const decision = await retryOpts.onRetry(attempt, attempts[attempts.length - 1])
        if (!decision.shouldRetry) break
        if (decision.newUrl) currentUrl = decision.newUrl
        if (decision.newHeaders) {
          options.headers = { ...options.headers as any, ...decision.newHeaders }
        }
      } catch {
        break
      }
    }
  }

  return { response: null, durationMs: Date.now() - startTime, attempts, usedFallback: false }
}
