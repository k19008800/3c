/**
 * JWT 令牌服务测试 — 同秒同 payload 重复签发唯一性（回归 user_sessions.token 重复键）
 *
 * 背景：注册后立即登录（同秒）时，iat 秒级精度 + 相同 payload → 完全相同 JWT，
 *       user_sessions.token 唯一约束 → 500 重复键。jti 随机 UUID 保证每次签发唯一。
 */

import { describe, it, expect } from 'vitest';
import { generateAccessToken, generateRefreshToken, verifyToken } from '../src/services/auth/jwt.js';

const payload = { userId: 1, email: 'a@b.c', role: 'customer' };

describe('JWT 令牌唯一性', () => {
  it('1. 同秒同 payload 连续签发 access token → 互不相同', () => {
    const t1 = generateAccessToken(payload);
    const t2 = generateAccessToken(payload);
    expect(t1).not.toBe(t2);
  });

  it('2. 同秒同 payload 连续签发 refresh token → 互不相同', () => {
    const t1 = generateRefreshToken(payload);
    const t2 = generateRefreshToken(payload);
    expect(t1).not.toBe(t2);
  });

  it('3. 签发后仍可正常验证，payload 含 jti', () => {
    const token = generateAccessToken(payload);
    const decoded = verifyToken(token);
    expect(decoded?.userId).toBe(1);
    expect(decoded?.email).toBe('a@b.c');
    expect(decoded?.role).toBe('customer');
    expect(typeof decoded?.jti).toBe('string');
    expect(decoded!.jti!.length).toBeGreaterThan(0);
  });

  it('4. 多次签发 jti 均不重复（UUID 唯一性）', () => {
    const jtis = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const decoded = verifyToken(generateAccessToken(payload));
      jtis.add(decoded!.jti!);
    }
    expect(jtis.size).toBe(100);
  });
});
