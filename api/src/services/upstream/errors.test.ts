/**
 * 上游错误分类单测（R2-USER-DRILL-002）
 */
import { describe, it, expect } from 'vitest';
import { classifyUpstreamError, UpstreamAuthError } from './errors';

describe('classifyUpstreamError', () => {
  it('401/403 → auth（平台上游鉴权故障）', () => {
    expect(classifyUpstreamError(401)).toBe('auth');
    expect(classifyUpstreamError(403)).toBe('auth');
  });

  it('5xx/429 → retryable', () => {
    expect(classifyUpstreamError(500)).toBe('retryable');
    expect(classifyUpstreamError(502)).toBe('retryable');
    expect(classifyUpstreamError(429)).toBe('retryable');
  });

  it('其余 4xx → client（请求本身问题，可透传）', () => {
    expect(classifyUpstreamError(400)).toBe('client');
    expect(classifyUpstreamError(404)).toBe('client');
    expect(classifyUpstreamError(422)).toBe('client');
  });
});

describe('UpstreamAuthError', () => {
  it('固定 502 + UPSTREAM_AUTH_FAILED + 中文友好文案（不透传上游 401）', () => {
    const err = new UpstreamAuthError(401);
    expect(err.statusCode).toBe(502);
    expect(err.code).toBe('UPSTREAM_AUTH_FAILED');
    expect(err.message).toContain('上游鉴权失败');
    expect(err.message).not.toContain('Authentication Fails');
    expect(err.context).toMatchObject({ upstreamStatus: 401 });
  });
});
