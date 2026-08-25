/**
 * 上游错误分类（R2-USER-DRILL-002）
 *
 * 网关对上游非 2xx 响应按「故障性质」分类，避免把平台侧上游故障
 * （如上游 API Key 无效）透传成用户的鉴权错误（此前会出现
 * `Authentication Fails, Your api key: ****xxxx is invalid` 误导用户）。
 *
 * 分类：
 *   - auth      — 上游 401/403：平台配置的上游 Key 无效/无权限 → 平台侧故障，
 *                 返回 502 UPSTREAM_AUTH_FAILED 友好文案（不透传上游错误体）；
 *   - retryable — 上游 5xx/429：可熔断/重试/回退；
 *   - client    — 其余 4xx：请求本身问题（模型不存在等），按原样透传。
 *
 * @module services/upstream
 */
import { AppError } from '../../lib/errors';

export type UpstreamFault = 'auth' | 'retryable' | 'client';

/** 按 HTTP 状态码分类上游错误 */
export function classifyUpstreamError(status: number): UpstreamFault {
  if (status === 401 || status === 403) return 'auth';
  if (status >= 500 || status === 429) return 'retryable';
  return 'client';
}

/**
 * 上游鉴权类故障错误（平台侧上游 Key 无效/无权限）
 *
 * 固定映射 HTTP 502 + 友好中文文案 + code=UPSTREAM_AUTH_FAILED；
 * 各路由在 catch 的通用 AppError 分支统一输出，不再透传上游原始错误体。
 */
export class UpstreamAuthError extends AppError {
  public readonly upstreamStatus: number;

  constructor(upstreamStatus: number) {
    super(
      '平台上游鉴权失败，请稍后重试或联系管理员',
      502,
      'UPSTREAM_AUTH_FAILED',
      { upstreamStatus },
    );
    this.name = 'UpstreamAuthError';
    this.upstreamStatus = upstreamStatus;
  }
}
