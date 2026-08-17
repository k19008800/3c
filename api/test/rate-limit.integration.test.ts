/**
 * 四级限流（P0-2）集成测试 — 真实 PG + Redis 端到端网关链路
 *
 * 前提：Redis 运行中（localhost:6379，见 docs/iteration-plan-v2.md §0.2 前提 2）、
 *       threecloud_v3 库已迁移/seed。
 *
 * 与 test/rate-limit.test.ts（纯单测，mock DB/Redis）互补：本文件验证
 * enforcer 真实接入 6 个网关路由后的行为（经 buildApp 全量路由 + 真实 apiKeyAuth）：
 *  - Key 超 RPM → 429（@fastify/rate-limit 层，enforcer 企业默认 300 不冲突）
 *  - 模型 cap_rpm 超限 → 429（enforcer 层先于 fastify Key 限流触发）
 *  - 模型 cap_tpm 超限 → 429（截断）
 *
 * 每个用例使用独立 remoteAddress 隔离 fastify 的 IP 级计数桶。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app';
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../src/db';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { hashApiKey } from '../src/services/auth/apikey';
import { estimateRequestTokens } from '../src/services/rate-limit';

const testEnv = {
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/threecloud_v3',
  JWT_SECRET: 'test-rate-limit-integration-secret',
  PORT: '3044',
};

let app: FastifyInstance;

/** 创建网关测试用户（customer + 余额 + API Key） */
async function createUser(customerType: 'personal' | 'enterprise', balance = '1000.0000') {
  const email = `rl-int-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
  const [user] = await db.insert(schema.users).values({
    email,
    passwordHash: bcrypt.hashSync('Test1234!', 4),
    name: 'RL Integration',
    role: 'customer',
    customerType,
  }).returning({ id: schema.users.id });

  await db.insert(schema.customerBalances).values({
    userId: user!.id,
    totalBalance: balance,
    availableBalance: balance,
    frozenBalance: '0',
    currency: 'CNY',
  });

  const rawKey = `sk-rl-${crypto.randomUUID().replace(/-/g, '')}`;
  const [key] = await db.insert(schema.apiKeys).values({
    userId: user!.id,
    keyHash: hashApiKey(rawKey),
    keyPrefix: 'sk-rl-',
    name: 'RL Integration Key',
    status: 'active',
  }).returning({ id: schema.apiKeys.id });

  return { user: user!, key: key!, rawKey };
}

/** chat 请求体（唯一模型名 → 无供应商映射 → 走 mock 回退，避免真实上游调用） */
function chatPayload(model: string, content = 'hi') {
  return { model, messages: [{ role: 'user', content }] };
}

beforeAll(async () => {
  app = await buildApp({ envOverrides: testEnv });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('四级限流集成 — 真实网关链路', () => {
  it('Key 超 RPM → 429（@fastify/rate-limit 层；enforcer 企业默认 300 独立计数不冲突）', async () => {
    const { rawKey } = await createUser('enterprise');
    const model = `rl-int-key-${Date.now()}`;
    const headers = { authorization: `Bearer ${rawKey}` };

    let res: Awaited<ReturnType<typeof app.inject>>;
    for (let i = 0; i < 61; i++) {
      res = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers,
        payload: chatPayload(model),
        remoteAddress: '10.2.0.1',
      });
      if (i < 60) expect(res.statusCode).not.toBe(429);
    }
    expect(res!.statusCode).toBe(429);
    // fastify 默认 429 格式
    expect(res!.json().error).toBe('Too Many Requests');
  });

  it('模型 cap_rpm 超限 → 429（enforcer 层，先于 fastify Key 60/min 触发）', async () => {
    const { rawKey } = await createUser('personal');
    const model = `rl-int-cap-${Date.now()}`;
    await db.insert(schema.modelRateLimits).values({ modelName: model, capRpm: 5, capTpm: null });

    const headers = { authorization: `Bearer ${rawKey}` };
    let res: Awaited<ReturnType<typeof app.inject>>;
    for (let i = 0; i < 6; i++) {
      res = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers,
        payload: chatPayload(model),
        remoteAddress: '10.2.0.2',
      });
      if (i < 5) expect(res.statusCode).not.toBe(429);
    }
    expect(res!.statusCode).toBe(429);
    // enforcer 统一 429 格式
    expect(res!.json().error?.type).toBe('rate_limit_error');
    expect(res!.json().error?.code).toBe(429);
  });

  it('模型 cap_tpm 超限 → 429（截断）', async () => {
    const { rawKey } = await createUser('personal');
    const model = `rl-int-tpm-${Date.now()}`;
    const content = 'A'.repeat(120);
    // 权重 = enforcer 同款粗估（model + role + content），cap 设为单次权重 → 第 2 次必超
    const weight = estimateRequestTokens(chatPayload(model, content));
    await db.insert(schema.modelRateLimits).values({ modelName: model, capRpm: null, capTpm: weight });

    const headers = { authorization: `Bearer ${rawKey}` };
    const r1 = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      headers,
      payload: chatPayload(model, content),
      remoteAddress: '10.2.0.3',
    });
    expect(r1.statusCode).not.toBe(429);

    const r2 = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      headers,
      payload: chatPayload(model, content),
      remoteAddress: '10.2.0.3',
    });
    expect(r2.statusCode).toBe(429);
    expect(r2.json().error?.type).toBe('rate_limit_error');
  });
});
