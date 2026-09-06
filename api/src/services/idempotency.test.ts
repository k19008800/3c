/**
 * 幂等守卫服务单元测试 — mock lib/redis 与 db，不依赖真实 Redis / PG
 *
 * 覆盖：
 * - resolveIdempotencyKey：Idempotency-Key 头优先、缺失/空头回退、超长截断、空白裁剪
 * - acquireIdempotencyLock：SETNX 首获 / 重复 / Redis 降级三态
 * - releaseIdempotencyLock：token 匹配才删除、降级静默
 * - cacheIdempotentResponse / getCachedIdempotentResponse：读写回环、损坏 JSON、降级
 * - buildIdempotencySummary / buildEntryFromConsumptionRecord：摘要字段正确性
 * - isIdempotencyUniqueViolation：23505 / 约束名消息 / 非幂等错误
 * - findConsumptionByRequestId：DB 查询命中与未命中
 * - replayIdempotentRequest：缓存回放（非流式 body / 流式摘要）、DB 兜底补偿写回、未命中 'none'
 * - buildRequestFingerprint / canonicalizeBody / canonicalizePath / scopeIdempotencyKey：
 *   统一 request fingerprint（user identity + method + canonical path + canonical body）确定性、
 *   键序无关 body、路径规范化、user-scoped 键隔离
 * - replayIdempotentRequest 异摘要校验：同 key 不同 user/参数 → 'conflict' 不回放（409），
 *   相同指纹 → 'replayed' 正常回放
 *
 * @see coding-standards-api-db-test.md §3 测试规范
 * @module services/idempotency.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  acquireIdempotencyLock,
  buildEntryFromConsumptionRecord,
  buildIdempotencySummary,
  buildRequestFingerprint,
  cacheIdempotentResponse,
  canonicalizeBody,
  canonicalizePath,
  findConsumptionByRequestId,
  getCachedIdempotentResponse,
  IDEMPOTENCY_LOCK_KEY_PREFIX,
  IDEMPOTENCY_RESP_KEY_PREFIX,
  isIdempotencyUniqueViolation,
  releaseIdempotencyLock,
  replayIdempotentRequest,
  resolveIdempotencyKey,
  scopeIdempotencyKey,
} from './idempotency.js';

// ============================================================
// Module mocks（vi.hoisted 保证 factory 可引用）
// ============================================================

const mocks = vi.hoisted(() => ({
  db: { select: vi.fn() },
  redis: {
    getRedis: vi.fn(),
    cacheGet: vi.fn(),
    cacheSet: vi.fn(),
    cacheDel: vi.fn(),
  },
  schema: {
    consumptionRecords: {
      requestId: {},
      model: {},
      inputTokens: {},
      outputTokens: {},
      totalTokens: {},
      cost: {},
      finishReason: {},
      streamed: {},
    },
  },
}));

vi.mock('../db', () => ({
  db: mocks.db,
  schema: mocks.schema,
}));
vi.mock('../lib/redis', () => ({
  getRedis: mocks.redis.getRedis,
  cacheGet: mocks.redis.cacheGet,
  cacheSet: mocks.redis.cacheSet,
  cacheDel: mocks.redis.cacheDel,
}));

// ============================================================
// Test helpers
// ============================================================

/** 构造一个"Redis 可用"的假客户端（set 支持 NX 语义，eval 支持值匹配删除） */
function makeRedisClient() {
  const store = new Map<string, string>();
  return {
    store,
    client: {
      set: vi.fn(async (key: string, token: string) => {
        if (store.has(key)) return null;
        store.set(key, token);
        return 'OK';
      }),
      eval: vi.fn(async (_script: string, _numKeys: number, key: string, token: string) => {
        if (store.get(key) === token) {
          store.delete(key);
          return 1;
        }
        return 0;
      }),
    },
  };
}

/** 构造一个假 FastifyReply（header/send 记录调用，raw 记录 SSE 写入） */
function makeFakeReply() {
  const headers = new Map<string, string>();
  const sseLines: string[] = [];
  let sentBody: unknown = undefined;
  return {
    headers,
    sseLines,
    get sentBody() {
      return sentBody;
    },
    reply: {
      header: vi.fn((name: string, value: string) => {
        headers.set(name.toLowerCase(), value);
      }),
      send: vi.fn((body: unknown) => {
        sentBody = body;
      }),
      raw: {
        writeHead: vi.fn((status: number, head: Record<string, string>) => {
          for (const [k, v] of Object.entries(head)) headers.set(k.toLowerCase(), v);
        }),
        write: vi.fn((chunk: string) => {
          sseLines.push(chunk);
        }),
        end: vi.fn(),
      },
    },
  };
}

/** 一条最小消费记录（findConsumptionByRequestId 的返回形状） */
function makeRecord(overrides: Record<string, unknown> = {}) {
  return {
    requestId: 'idem-key-1',
    model: 'deepseek-v3',
    inputTokens: 10,
    outputTokens: 5,
    totalTokens: 15,
    cost: '0.00012',
    finishReason: 'stop',
    streamed: false,
    ...overrides,
  };
}

/** 让 db.select 返回 consumption_records 查询链（默认解析为指定结果） */
function mockDbConsumptionQuery(result: unknown[] | (() => Promise<unknown[]>)) {
  const limit = vi.fn();
  if (typeof result === 'function') {
    limit.mockImplementation(result);
  } else {
    limit.mockResolvedValue(result);
  }
  mocks.db.select.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ limit }),
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// resolveIdempotencyKey
// ============================================================

describe('resolveIdempotencyKey', () => {
  it('Idempotency-Key 头存在 → 以头为准', () => {
    const key = resolveIdempotencyKey({ headers: { 'idempotency-key': 'client-key-abc' } }, 'fallback-uuid');
    expect(key).toBe('client-key-abc');
  });

  it('头缺失 → 回退服务端生成 requestId', () => {
    const key = resolveIdempotencyKey({ headers: {} }, 'server-uuid-1');
    expect(key).toBe('server-uuid-1');
  });

  it('空头 / 纯空白头 → 回退 requestId', () => {
    expect(resolveIdempotencyKey({ headers: { 'idempotency-key': '' } }, 'f1')).toBe('f1');
    expect(resolveIdempotencyKey({ headers: { 'idempotency-key': '   ' } }, 'f2')).toBe('f2');
  });

  it('头带首尾空白 → 裁剪后返回', () => {
    expect(resolveIdempotencyKey({ headers: { 'idempotency-key': '  key-x  ' } }, 'f')).toBe('key-x');
  });

  it('头超过 100 字符 → 截断到列长度（consumption_records.request_id varchar(100)）', () => {
    const long = 'k'.repeat(200);
    const key = resolveIdempotencyKey({ headers: { 'idempotency-key': long } }, 'f');
    expect(key).toHaveLength(100);
  });
});

// ============================================================
// acquireIdempotencyLock
// ============================================================

describe('acquireIdempotencyLock', () => {
  it('SETNX 首获（返回 OK）→ acquired + token，且带 EX TTL 与 NX 语义', async () => {
    const { client } = makeRedisClient();
    mocks.redis.getRedis.mockReturnValue(client as never);

    const result = await acquireIdempotencyLock('req-1', 3600);
    expect(result.status).toBe('acquired');
    if (result.status === 'acquired') {
      expect(result.token).toBeTruthy();
    }
    expect(client.set).toHaveBeenCalledWith(
      `${IDEMPOTENCY_LOCK_KEY_PREFIX}req-1`,
      expect.any(String),
      'EX',
      3600,
      'NX',
    );
  });

  it('SETNX 已存在（返回 null）→ duplicate', async () => {
    const { client, store } = makeRedisClient();
    store.set(`${IDEMPOTENCY_LOCK_KEY_PREFIX}req-1`, 'existing-token');
    mocks.redis.getRedis.mockReturnValue(client as never);

    const result = await acquireIdempotencyLock('req-1');
    expect(result.status).toBe('duplicate');
  });

  it('Redis 不可用（getRedis 返回 null）→ degraded 降级放行', async () => {
    mocks.redis.getRedis.mockReturnValue(null);
    const result = await acquireIdempotencyLock('req-1');
    expect(result.status).toBe('degraded');
  });

  it('Redis 调用抛异常 → degraded，不向上抛', async () => {
    mocks.redis.getRedis.mockReturnValue({
      set: vi.fn().mockRejectedValue(new Error('connection lost')),
    } as never);
    const result = await acquireIdempotencyLock('req-1');
    expect(result.status).toBe('degraded');
  });
});

// ============================================================
// releaseIdempotencyLock
// ============================================================

describe('releaseIdempotencyLock', () => {
  it('token 匹配 → eval 执行删除（Lua 值校验）', async () => {
    const { client } = makeRedisClient();
    mocks.redis.getRedis.mockReturnValue(client as never);

    await releaseIdempotencyLock('req-1', 'my-token');
    expect(client.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call'),
      1,
      `${IDEMPOTENCY_LOCK_KEY_PREFIX}req-1`,
      'my-token',
    );
  });

  it('Redis 不可用 → 静默跳过，不抛错', async () => {
    mocks.redis.getRedis.mockReturnValue(null);
    await expect(releaseIdempotencyLock('req-1', 'token')).resolves.toBeUndefined();
  });

  it('eval 抛异常 → 静默跳过，不阻断主链路', async () => {
    mocks.redis.getRedis.mockReturnValue({
      eval: vi.fn().mockRejectedValue(new Error('down')),
    } as never);
    await expect(releaseIdempotencyLock('req-1', 'token')).resolves.toBeUndefined();
  });
});

// ============================================================
// cacheIdempotentResponse / getCachedIdempotentResponse
// ============================================================

describe('cacheIdempotentResponse / getCachedIdempotentResponse', () => {
  it('写读回环：cacheSet 写入 JSON（含 cachedAt），cacheGet 解析返回', async () => {
    const store = new Map<string, string>();
    mocks.redis.cacheSet.mockImplementation(async (key: string, value: string) => {
      store.set(key, value);
    });
    mocks.redis.cacheGet.mockImplementation(async (key: string) => store.get(key) ?? null);

    const entry = {
      streamed: false,
      body: { id: 'chatcmpl-1', choices: [] },
      summary: buildIdempotencySummary({
        requestId: 'k1',
        model: 'm',
        inputTokens: 3,
        outputTokens: 1,
        cost: '0.0001',
        streamed: false,
      }),
    };
    await cacheIdempotentResponse('k1', entry, 86400);

    // cacheSet 走 idem:resp: 前缀 + 传入 TTL
    expect(mocks.redis.cacheSet).toHaveBeenCalledWith(
      `${IDEMPOTENCY_RESP_KEY_PREFIX}k1`,
      expect.any(String),
      86400,
    );

    const got = await getCachedIdempotentResponse('k1');
    expect(got).not.toBeNull();
    expect(got!.body).toEqual({ id: 'chatcmpl-1', choices: [] });
    expect(got!.summary.cost).toBe('0.0001');
    expect(got!.cachedAt).toBeTruthy();
  });

  it('无缓存 → null', async () => {
    mocks.redis.cacheGet.mockResolvedValue(null);
    expect(await getCachedIdempotentResponse('k1')).toBeNull();
  });

  it('缓存值 JSON 损坏 → null，不抛错', async () => {
    mocks.redis.cacheGet.mockResolvedValue('{not-json');
    expect(await getCachedIdempotentResponse('k1')).toBeNull();
  });

  it('Redis 不可用（cacheGet 返回 null / cacheSet 静默）→ 不抛错', async () => {
    mocks.redis.cacheGet.mockResolvedValue(null);
    mocks.redis.cacheSet.mockResolvedValue(undefined);
    await expect(cacheIdempotentResponse('k1', { streamed: false, summary: {} as never })).resolves.toBeUndefined();
    expect(await getCachedIdempotentResponse('k1')).toBeNull();
  });
});

// ============================================================
// buildIdempotencySummary / buildEntryFromConsumptionRecord
// ============================================================

describe('buildIdempotencySummary', () => {
  it('数字 cost → toFixed(8)；字符串 cost 原样；finishReason 缺省 → null', () => {
    const s = buildIdempotencySummary({
      requestId: 'r1',
      model: 'm',
      inputTokens: 10,
      outputTokens: 5,
      cost: 0.123456789,
      streamed: true,
    });
    expect(s.idempotent_replay).toBe(true);
    expect(s.total_tokens).toBe(15);
    expect(s.cost).toBe('0.12345679');
    expect(s.finish_reason).toBeNull();
    expect(s.streamed).toBe(true);
    expect(s.request_id).toBe('r1');
  });
});

describe('buildEntryFromConsumptionRecord', () => {
  it('记录 → 摘要（无 body，DB 兜底路径）', () => {
    const entry = buildEntryFromConsumptionRecord(makeRecord());
    expect(entry.streamed).toBe(false);
    expect(entry.body).toBeUndefined();
    expect(entry.summary).toMatchObject({
      idempotent_replay: true,
      model: 'deepseek-v3',
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15,
      cost: '0.00012',
      finish_reason: 'stop',
      request_id: 'idem-key-1',
    });
  });
});

// ============================================================
// isIdempotencyUniqueViolation
// ============================================================

describe('isIdempotencyUniqueViolation', () => {
  it('Postgres code 23505 → true', () => {
    expect(isIdempotencyUniqueViolation({ code: '23505', message: 'duplicate key' })).toBe(true);
  });

  it('无 code 但有约束名消息（consumption_records_request_id_unique）→ true', () => {
    expect(isIdempotencyUniqueViolation({
      message: 'duplicate key value violates unique constraint "consumption_records_request_id_unique"',
    })).toBe(true);
  });

  it('分区表父表复合唯一约束名（consumption_records_request_id_created_at_unique）→ true', () => {
    expect(isIdempotencyUniqueViolation({
      message: 'duplicate key value violates unique constraint "consumption_records_request_id_created_at_unique"',
    })).toBe(true);
  });

  it('分区表子表唯一索引名（consumption_records_2026_08_request_id_created_at_key）→ true', () => {
    // P3-1 分区改造：PG 按「子表名_列名_key」命名分区子表唯一索引，
    // 幂等 L2 DB 兜底必须识别该形态（migration 0025）
    expect(isIdempotencyUniqueViolation({
      message: 'duplicate key value violates unique constraint "consumption_records_2026_08_request_id_created_at_key"',
    })).toBe(true);
    expect(isIdempotencyUniqueViolation({
      message: 'duplicate key value violates unique constraint "consumption_records_2026_09_request_id_created_at_key"',
    })).toBe(true);
  });

  it('其他错误 / 非对象 → false', () => {
    expect(isIdempotencyUniqueViolation({ code: '42P01', message: 'relation not found' })).toBe(false);
    expect(isIdempotencyUniqueViolation(new Error('boom'))).toBe(false);
    expect(isIdempotencyUniqueViolation(null)).toBe(false);
    expect(isIdempotencyUniqueViolation('string')).toBe(false);
  });
});

// ============================================================
// findConsumptionByRequestId
// ============================================================

describe('findConsumptionByRequestId', () => {
  it('DB 命中 → 返回记录', async () => {
    mockDbConsumptionQuery([makeRecord()]);
    const rec = await findConsumptionByRequestId('idem-key-1');
    expect(rec).toMatchObject({ requestId: 'idem-key-1', inputTokens: 10, outputTokens: 5 });
    // 显式列查询（禁 SELECT *）+ where request_id
    expect(mocks.db.select).toHaveBeenCalled();
  });

  it('DB 未命中 → null', async () => {
    mockDbConsumptionQuery([]);
    expect(await findConsumptionByRequestId('missing')).toBeNull();
  });
});

// ============================================================
// replayIdempotentRequest（缓存 → DB 兜底 → 'replayed' | 'conflict' | 'none'）
// ============================================================

describe('replayIdempotentRequest', () => {
  it('缓存命中（非流式 + 有 body）→ 回放完整响应体 + X-Idempotent-Replay 头', async () => {
    const entry = {
      streamed: false,
      body: { id: 'chatcmpl-first', choices: [{ index: 0, message: { role: 'assistant', content: 'hi' } }] },
      summary: buildIdempotencySummary({
        requestId: 'k1', model: 'm', inputTokens: 1, outputTokens: 1, cost: '0.0001', streamed: false,
      }),
    };
    mocks.redis.cacheGet.mockResolvedValue(JSON.stringify(entry));

    const fake = makeFakeReply();
    const handled = await replayIdempotentRequest(fake.reply as never, 'k1', false);

    expect(handled).toBe('replayed');
    expect(fake.headers.get('x-idempotent-replay')).toBe('true');
    expect(fake.sentBody).toEqual(entry.body);
  });

  it('缓存命中（流式）→ SSE 摘要帧 + [DONE]，不打 send', async () => {
    const entry = {
      streamed: true,
      summary: buildIdempotencySummary({
        requestId: 'k1', model: 'm', inputTokens: 3, outputTokens: 2, cost: '0.0002', streamed: true,
      }),
    };
    mocks.redis.cacheGet.mockResolvedValue(JSON.stringify(entry));

    const fake = makeFakeReply();
    const handled = await replayIdempotentRequest(fake.reply as never, 'k1', true);

    expect(handled).toBe('replayed');
    expect(fake.headers.get('x-idempotent-replay')).toBe('true');
    expect(fake.headers.get('content-type')).toContain('text/event-stream');
    expect(fake.sentBody).toBeUndefined();
    const joined = fake.sseLines.join('');
    expect(joined).toContain('idempotent_replay');
    expect(joined).toContain('data: [DONE]');
  });

  it('缓存未命中 + DB 记录存在 → 补偿写回缓存 + 回放摘要', async () => {
    mocks.redis.cacheGet.mockResolvedValue(null);
    mockDbConsumptionQuery([makeRecord({ streamed: true })]);
    mocks.redis.cacheSet.mockResolvedValue(undefined);

    const { reply, headers, sseLines } = makeFakeReply();
    const handled = await replayIdempotentRequest(reply as never, 'idem-key-1', true);

    expect(handled).toBe('replayed');
    // 补偿写回：摘要缓存
    expect(mocks.redis.cacheSet).toHaveBeenCalledWith(
      `${IDEMPOTENCY_RESP_KEY_PREFIX}idem-key-1`,
      expect.stringContaining('idempotent_replay'),
      expect.any(Number),
    );
    expect(headers.get('x-idempotent-replay')).toBe('true');
    expect(sseLines.join('')).toContain('data: [DONE]');
  });

  it('缓存与 DB 均未命中（首次请求仍在处理中）→ 返回 none', async () => {
    mocks.redis.cacheGet.mockResolvedValue(null);
    mockDbConsumptionQuery([]);

    const { reply } = makeFakeReply();
    const handled = await replayIdempotentRequest(reply as never, 'k1', false);
    expect(handled).toBe('none');
  });
});

// ============================================================
// 统一 request fingerprint（user identity + method + canonical path + canonical body）
// ============================================================

describe('canonicalizeBody', () => {
  it('对象键按字典序排序 → 键序不同语义相同 body 得到同一 JSON', () => {
    const a = canonicalizeBody({ model: 'm', messages: [{ role: 'user', content: 'hi' }], stream: true });
    const b = canonicalizeBody({ stream: true, messages: [{ role: 'user', content: 'hi' }], model: 'm' });
    expect(a).toBe(b);
    expect(a).toContain('"model":"m"');
  });

  it('数组保序（顺序不同 → 摘要不同）', () => {
    expect(canonicalizeBody([1, 2])).not.toBe(canonicalizeBody([2, 1]));
  });

  it('undefined 值跳过，不影响其余键', () => {
    expect(canonicalizeBody({ a: 1, b: undefined })).toBe(canonicalizeBody({ a: 1 }));
  });

  it('循环引用 → 兜底 "null"，不抛错', () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    expect(canonicalizeBody(obj)).toBe('null');
  });
});

describe('canonicalizePath', () => {
  it('去掉 query、折叠连续斜杠、去首尾斜杠、小写', () => {
    expect(canonicalizePath('/v1/chat/completions')).toBe('v1/chat/completions');
    expect(canonicalizePath(' //v1//Chat//Completions?stream=true ')).toBe('v1/chat/completions');
  });
});

describe('buildRequestFingerprint', () => {
  const base = { userId: 1, method: 'POST', path: '/v1/chat/completions', body: { messages: [{ role: 'user', content: 'hi' }] } };

  it('确定性：同输入（含键序不同的 body）同指纹', () => {
    const fp1 = buildRequestFingerprint(base);
    const fp2 = buildRequestFingerprint({ ...base, body: { messages: [{ content: 'hi', role: 'user' }] } });
    expect(fp1).toBe(fp2);
    expect(fp1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('user identity 不同 → 指纹不同（跨用户隔离）', () => {
    expect(buildRequestFingerprint({ ...base, userId: 2 })).not.toBe(buildRequestFingerprint(base));
  });

  it('method 不同 → 指纹不同', () => {
    expect(buildRequestFingerprint({ ...base, method: 'GET' })).not.toBe(buildRequestFingerprint(base));
  });

  it('path 不同 → 指纹不同', () => {
    expect(buildRequestFingerprint({ ...base, path: '/v1/embeddings' })).not.toBe(buildRequestFingerprint(base));
  });

  it('body 不同 → 指纹不同（异参数不可复用作同幂等键）', () => {
    expect(buildRequestFingerprint({ ...base, body: { messages: [{ role: 'user', content: 'bye' }] } })).not.toBe(buildRequestFingerprint(base));
  });
});

describe('scopeIdempotencyKey', () => {
  it('同一原始键 + 不同 userId → 不同 scoped key（跨用户同键不碰撞）', () => {
    expect(scopeIdempotencyKey('K', 1)).not.toBe(scopeIdempotencyKey('K', 2));
    expect(scopeIdempotencyKey('K', 1)).toBe('K:1');
  });
});

// ============================================================
// replayIdempotentRequest 指纹校验（异摘要不得回放 → 409 IDEMPOTENCY_CONFLICT）
// ============================================================

describe('replayIdempotentRequest 指纹校验', () => {
  it('同 key 缓存指纹与当前指纹不一致 → 返回 conflict，不回放（异参数/异用户复用拦截）', async () => {
    const entry = {
      request_fingerprint: 'fp-user1-bodyX',
      streamed: false,
      body: { id: 'chatcmpl-first' },
      summary: buildIdempotencySummary({
        requestId: 'k1', model: 'm', inputTokens: 1, outputTokens: 1, cost: '0.0001', streamed: false,
      }),
    };
    mocks.redis.cacheGet.mockResolvedValue(JSON.stringify(entry));

    const fake = makeFakeReply();
    const handled = await replayIdempotentRequest(fake.reply as never, 'k1', false, {
      fingerprint: 'fp-user2-bodyY',
    });

    expect(handled).toBe('conflict');
    // 未回放：无 X-Idempotent-Replay 头、未发送 body
    expect(fake.headers.get('x-idempotent-replay')).toBeUndefined();
    expect(fake.sentBody).toBeUndefined();
  });

  it('同 key 缓存指纹与当前指纹一致 → 正常回放', async () => {
    const entry = {
      request_fingerprint: 'fp-same',
      streamed: false,
      body: { id: 'chatcmpl-first' },
      summary: buildIdempotencySummary({
        requestId: 'k1', model: 'm', inputTokens: 1, outputTokens: 1, cost: '0.0001', streamed: false,
      }),
    };
    mocks.redis.cacheGet.mockResolvedValue(JSON.stringify(entry));

    const fake = makeFakeReply();
    const handled = await replayIdempotentRequest(fake.reply as never, 'k1', false, { fingerprint: 'fp-same' });

    expect(handled).toBe('replayed');
    expect(fake.headers.get('x-idempotent-replay')).toBe('true');
    expect(fake.sentBody).toEqual(entry.body);
  });

  it('DB 兜底记录重建的条目（无 request_fingerprint）→ 补偿回放，不误拦截合法恢复', async () => {
    mocks.redis.cacheGet.mockResolvedValue(null);
    mockDbConsumptionQuery([makeRecord()]);
    mocks.redis.cacheSet.mockResolvedValue(undefined);

    const { reply, headers } = makeFakeReply();
    const handled = await replayIdempotentRequest(reply as never, 'k1', false, {
      fingerprint: 'fp-current',
      requestId: 'idem-key-1',
    });

    expect(handled).toBe('replayed');
    expect(headers.get('x-idempotent-replay')).toBe('true');
  });
});
