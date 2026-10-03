/**
 * Key 细粒度权限校验测试 — §20.4（P0）
 *
 * 覆盖要求（agent-hint）：
 *   1. allowedModels=["gpt-4o"]，请求 gpt-3.5 → 403
 *   2. allowedIps=["1.2.3.4"]，其他 IP → 403
 *   3. dailyTokenLimit=1000，用超后 → 429
 *   4. 未设置任何限制 → 全部放通（向后兼容）
 *
 * 纯函数（模型/IP/Referer 判定）零外部依赖；Redis 计数维度用 vi.mock 注入伪客户端，
 * 不依赖真实 PG/Redis。
 *
 * @module services/security
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// 注入伪 Redis（fail-open 路径返回 null）
const incrValue = { value: 0 };
const fakeRedis = {
  multi() {
    const chain: any = {
      incr() { return chain; },
      incrby() { return chain; },
      pexpire() { return chain; },
      async exec() { return [[null, incrValue.value]]; },
    };
    return chain;
  },
};
const getRedisMock = vi.fn<() => any>(() => fakeRedis);
vi.mock('../../lib/redis.js', () => ({ getRedis: () => getRedisMock() }));

import {
  checkModelAccess,
  checkIpAccess,
  checkRefererAccess,
  enforceKeyPermissions,
  buildKeyPermissionRequest,
  type KeyPermissionConfig,
} from './key-permissions.js';

// 无任何限制的配置
const NO_LIMITS: KeyPermissionConfig = {
  allowedModels: null,
  blockedModels: null,
  allowedIps: null,
  allowedReferers: null,
  dailyTokenLimit: null,
  rpmLimit: null,
  tpmLimit: null,
};

beforeEach(() => {
  getRedisMock.mockReturnValue(fakeRedis);
  incrValue.value = 0;
});

// ============================================================
// 纯函数：模型访问
// ============================================================

describe('checkModelAccess', () => {
  it('白名单内模型 → 放通', () => {
    expect(checkModelAccess('gpt-4o', ['gpt-4o'], null)).toBeNull();
  });

  it('白名单外模型 → 拒绝（§20.4 用例1）', () => {
    expect(checkModelAccess('gpt-3.5', ['gpt-4o'], null)).toBe('model_not_in_whitelist');
  });

  it('黑名单模型 → 拒绝（优先于白名单）', () => {
    expect(checkModelAccess('gpt-4o', ['gpt-4o'], ['gpt-4o'])).toBe('model_blocked');
  });

  it('未配置白/黑名单 → 全部放通', () => {
    expect(checkModelAccess('anything', null, null)).toBeNull();
    expect(checkModelAccess('anything', [], [])).toBeNull();
  });

  it('无模型名（/v1/models 列表）→ 跳过放通', () => {
    expect(checkModelAccess('', ['gpt-4o'], null)).toBeNull();
  });
});

// ============================================================
// 纯函数：IP 访问
// ============================================================

describe('checkIpAccess', () => {
  it('白名单内单 IP → 放通', () => {
    expect(checkIpAccess('1.2.3.4', ['1.2.3.4'])).toBeNull();
  });

  it('白名单外 IP → 拒绝（§20.4 用例2）', () => {
    expect(checkIpAccess('8.8.8.8', ['1.2.3.4'])).toBe('ip_not_in_whitelist');
  });

  it('CIDR 网段内 IP → 放通', () => {
    expect(checkIpAccess('192.168.1.55', ['192.168.1.0/24'])).toBeNull();
  });

  it('CIDR 网段外 IP → 拒绝', () => {
    expect(checkIpAccess('192.168.2.55', ['192.168.1.0/24'])).toBe('ip_not_in_whitelist');
  });

  it('未配置白名单 → 全部放通', () => {
    expect(checkIpAccess('8.8.8.8', null)).toBeNull();
    expect(checkIpAccess('8.8.8.8', [])).toBeNull();
  });

  it('配置了白名单但拿不到 IP → 拒绝', () => {
    expect(checkIpAccess('', ['1.2.3.4'])).toBe('ip_unavailable');
  });
});

// ============================================================
// 纯函数：Referer 访问
// ============================================================

describe('checkRefererAccess', () => {
  it('Referer 命中白名单子串 → 放通', () => {
    expect(checkRefererAccess('https://example.com/page', ['example.com'])).toBeNull();
  });

  it('Referer 不命中 → 拒绝', () => {
    expect(checkRefererAccess('https://evil.com', ['example.com'])).toBe('referer_not_in_whitelist');
  });

  it('未配置白名单 → 全部放通', () => {
    expect(checkRefererAccess('https://evil.com', null)).toBeNull();
  });

  it('配置了白名单但无 Referer 头 → 拒绝', () => {
    expect(checkRefererAccess(undefined, ['example.com'])).toBe('referer_missing');
  });
});

// ============================================================
// enforceKeyPermissions：编排
// ============================================================

describe('enforceKeyPermissions', () => {
  const baseReq = {
    apiKeyId: 99,
    model: 'gpt-3.5',
    clientIp: '8.8.8.8',
    referer: undefined,
    estimatedTokens: 10,
  };

  it('无任何限制 → 放通（向后兼容，§20.4 用例4）', async () => {
    const d = await enforceKeyPermissions(NO_LIMITS, baseReq);
    expect(d.allowed).toBe(true);
  });

  it('模型白名单拦截 → 403（§20.4 用例1）', async () => {
    const d = await enforceKeyPermissions(
      { ...NO_LIMITS, allowedModels: ['gpt-4o'] },
      baseReq,
    );
    expect(d.allowed).toBe(false);
    expect(d.status).toBe(403);
    expect(d.code).toBe('MODEL_NOT_ALLOWED');
  });

  it('IP 白名单拦截 → 403（§20.4 用例2）', async () => {
    const d = await enforceKeyPermissions(
      { ...NO_LIMITS, allowedIps: ['1.2.3.4'] },
      baseReq,
    );
    expect(d.allowed).toBe(false);
    expect(d.status).toBe(403);
    expect(d.code).toBe('IP_NOT_ALLOWED');
  });

  it('日 Token 超限 → 429（§20.4 用例3）', async () => {
    // 伪 Redis 返回今日累计 1500 > 上限 1000
    incrValue.value = 1500;
    const d = await enforceKeyPermissions(
      { ...NO_LIMITS, dailyTokenLimit: 1000 },
      baseReq,
    );
    expect(d.allowed).toBe(false);
    expect(d.status).toBe(429);
    expect(d.code).toBe('DAILY_TOKEN_LIMIT_EXCEEDED');
  });

  it('日 Token 未超限 → 放通', async () => {
    incrValue.value = 500;
    const d = await enforceKeyPermissions(
      { ...NO_LIMITS, dailyTokenLimit: 1000 },
      baseReq,
    );
    expect(d.allowed).toBe(true);
  });

  it('RPM 超限 → 429', async () => {
    incrValue.value = 11;
    const d = await enforceKeyPermissions(
      { ...NO_LIMITS, rpmLimit: 10 },
      baseReq,
    );
    expect(d.allowed).toBe(false);
    expect(d.status).toBe(429);
    expect(d.code).toBe('RATE_LIMITED');
  });

  it('TPM 超限 → 429', async () => {
    incrValue.value = 50000;
    const d = await enforceKeyPermissions(
      { ...NO_LIMITS, tpmLimit: 10000 },
      baseReq,
    );
    expect(d.allowed).toBe(false);
    expect(d.status).toBe(429);
    expect(d.code).toBe('RATE_LIMITED');
  });

  it('Redis 不可用 → 计数维度 fail-open 放通', async () => {
    getRedisMock.mockReturnValue(null);
    const d = await enforceKeyPermissions(
      { ...NO_LIMITS, rpmLimit: 1, tpmLimit: 1, dailyTokenLimit: 1 },
      baseReq,
    );
    expect(d.allowed).toBe(true);
  });

  it('纯配置判定优先于计数：模型被拒时不读 Redis', async () => {
    incrValue.value = 999999;
    const d = await enforceKeyPermissions(
      { ...NO_LIMITS, allowedModels: ['gpt-4o'], rpmLimit: 1 },
      baseReq,
    );
    expect(d.allowed).toBe(false);
    expect(d.status).toBe(403);
  });
});

// ============================================================
// buildKeyPermissionRequest：从 Fastify request 构建
// ============================================================

describe('buildKeyPermissionRequest', () => {
  it('从 apiKeyContext + body + headers 构建判定输入', () => {
    const request: any = {
      ip: '1.2.3.4',
      headers: { referer: 'https://example.com' },
      body: { model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] },
      apiKeyContext: {
        apiKeyId: 7,
        allowedModels: ['gpt-4o'],
        blockedModels: null,
        allowedIps: ['1.2.3.4'],
        allowedReferers: null,
        dailyTokenLimit: 1000,
        rpmLimit: null,
        tpmLimit: null,
      },
    };
    const built = buildKeyPermissionRequest(request);
    expect(built).not.toBeNull();
    expect(built!.req.apiKeyId).toBe(7);
    expect(built!.req.model).toBe('gpt-4o');
    expect(built!.req.clientIp).toBe('1.2.3.4');
    expect(built!.req.referer).toBe('https://example.com');
    expect(built!.config.allowedModels).toEqual(['gpt-4o']);
    expect(built!.config.dailyTokenLimit).toBe(1000);
  });

  it('apiKeyContext 缺失 → 返回 null（交回 401）', () => {
    expect(buildKeyPermissionRequest({ ip: '1.1.1.1', headers: {}, body: {} })).toBeNull();
  });
});
