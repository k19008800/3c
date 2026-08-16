/**
 * 供应商运维操作 — 渠道连通性测试 / 上游 API Key 余额查询
 *
 * 设计原则（依赖注入，便于纯单测）：
 *   - fetch 通过 fetchImpl 注入，默认用全局 fetch（Node 18+ 内置）；
 *   - Redis 缓存通过 cacheGet / cacheSet 注入，默认走 lib/redis 薄封装；
 *   - 本模块只做网络探测 + 响应解析 + 缓存编排，不碰 DB（DB 读写由路由层负责）。
 *
 * 对应 New API 渠道运维能力（见 kb/3cloud/newapi-gap-analysis.md Batch 1 任务 1.1/1.2）。
 *
 * @module services/supplier-ops
 */

import { cacheGet as redisCacheGet, cacheSet as redisCacheSet } from '../lib/redis';

/** 连通性探测 / 余额查询超时（ms） */
export const CONNECTION_TIMEOUT_MS = 5000;

/** 余额缓存 TTL（秒）= 10 分钟，避免高频打上游 */
export const BALANCE_CACHE_TTL_SECONDS = 600;

/** 余额缓存 key 前缀，完整 key 形如 supplier_balance:{keyId} */
export const BALANCE_CACHE_KEY_PREFIX = 'supplier_balance:';

/** 连通性测试结果 */
export interface ConnectionTestResult {
  ok: boolean;
  status?: number;
  latencyMs?: number;
  error?: string;
}

/** 单条 Key 余额查询结果（unsupported 标记供应商未实现余额端点） */
export interface KeyBalanceQueryResult {
  balance: number | null;
  currency: string | null;
  error?: string;
  unsupported: boolean;
}

/** 余额查询响应中单条 Key 的条目 */
export interface SupplierBalanceKeyResult {
  keyId: number;
  keyName: string | null;
  balance: number | null;
  currency: string | null;
  error?: string;
}

/** 供应商整体余额查询结果 */
export interface SupplierBalanceResult {
  ok: boolean;
  reason?: string;
  keys?: SupplierBalanceKeyResult[];
}

/** 可注入依赖：fetch 实现 + 缓存读写（默认取全局/模块默认） */
export interface SupplierOpsDeps {
  fetchImpl?: typeof fetch;
  cacheGet?: (key: string) => Promise<string | null>;
  cacheSet?: (key: string, value: string, ttlSeconds: number) => Promise<void>;
}

/** 规整 baseUrl：去掉末尾斜杠，避免拼接出双斜杠 */
function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

/**
 * 渠道连通性测试 — 向 `${baseUrl}/v1/models` 发 GET（OpenAI 系兼容端点）。
 *
 * 探测供应商 baseUrl + API Key 是否可用，5 秒超时。
 *
 * @param supplier - 供应商（至少含 baseUrl）
 * @param keyValue - 用于探测的 API Key
 * @param fetchImpl - fetch 实现，默认全局 fetch（测试可注入）
 * @returns
 *   - HTTP 2xx → { ok: true, status, latencyMs }
 *   - 非 2xx   → { ok: false, status, latencyMs, error }（body 截断前 200 字符）
 *   - 网络错误/超时 → { ok: false, error }
 */
export async function testSupplierConnection(
  supplier: { baseUrl: string },
  keyValue: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ConnectionTestResult> {
  const url = `${normalizeBaseUrl(supplier.baseUrl)}/v1/models`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${keyValue}` },
      signal: controller.signal,
    });
    const latencyMs = Date.now() - startedAt;
    if (res.ok) {
      return { ok: true, status: res.status, latencyMs };
    }
    let bodyText = '';
    try {
      bodyText = await res.text();
    } catch {
      /* body 读取失败时用状态码兜底 */
    }
    const error = bodyText ? bodyText.slice(0, 200) : `HTTP ${res.status}`;
    return { ok: false, status: res.status, latencyMs, error };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 解析余额响应中的用量字段。
 *
 * OpenAI 官方 usage 端点返回 total_used（美元）；部分国产供应商返回
 * total_usage（人民币分）。取可识别的字段；都无法解析时返回 null。
 */
export function parseBalanceResponse(
  data: unknown,
): { balance: number; currency: string } | null {
  if (data == null || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  if (typeof obj.total_used === 'number' && Number.isFinite(obj.total_used)) {
    return { balance: obj.total_used, currency: 'USD' };
  }
  if (typeof obj.total_usage === 'number' && Number.isFinite(obj.total_usage)) {
    // 人民币分 → 元，统一到"元"口径返回
    return { balance: obj.total_usage / 100, currency: 'CNY' };
  }
  return null;
}

/**
 * 查询单条 Key 的上游余额 — GET `${baseUrl}/v1/dashboard/billing/usage`。
 *
 * @param baseUrl  - 供应商 baseUrl
 * @param keyValue - 该 Key 的明文值
 * @param fetchImpl - fetch 实现，默认全局 fetch（测试可注入）
 * @returns
 *   - 200 且可解析 → { balance, currency, unsupported: false }
 *   - 200 但解析失败 → { balance: null, currency: null, error, unsupported: false }
 *   - 404（DeepSeek/智谱等未实现该端点）→ { unsupported: true }，由上层降级为 unsupported
 *   - 其他错误 → { balance: null, error, unsupported: false }
 */
export async function queryKeyBalance(
  baseUrl: string,
  keyValue: string,
  fetchImpl: typeof fetch = fetch,
): Promise<KeyBalanceQueryResult> {
  const url = `${normalizeBaseUrl(baseUrl)}/v1/dashboard/billing/usage`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${keyValue}` },
      signal: controller.signal,
    });
    // 404 = 供应商未实现余额端点 → 优雅降级为 unsupported，不报 500
    if (res.status === 404) {
      return {
        balance: null,
        currency: null,
        unsupported: true,
        error: 'billing endpoint not supported (404)',
      };
    }
    if (!res.ok) {
      return { balance: null, currency: null, unsupported: false, error: `HTTP ${res.status}` };
    }
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      return { balance: null, currency: null, unsupported: false, error: 'invalid JSON response' };
    }
    const parsed = parseBalanceResponse(data);
    if (!parsed) {
      return {
        balance: null,
        currency: null,
        unsupported: false,
        error: 'unable to parse balance from response',
      };
    }
    return { balance: parsed.balance, currency: parsed.currency, unsupported: false };
  } catch (err) {
    return {
      balance: null,
      currency: null,
      unsupported: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 查询供应商全部 Key 的余额（带 Redis 缓存编排）。
 *
 * 对每条 Key：先查缓存 supplier_balance:{keyId}（TTL 10min），命中直接复用；
 * 未命中则打上游，成功后写回缓存。缓存层异常一律静默跳过。
 *
 * @param supplier - 供应商（至少含 baseUrl）
 * @param keys     - 该供应商的 Key 列表（id / name / keyValue）
 * @param deps     - 可注入依赖（fetchImpl / cacheGet / cacheSet）
 * @returns
 *   - 全部 Key unsupported → { ok: false, reason: 'unsupported' }
 *   - 否则 → { ok: true, keys: [{ keyId, keyName, balance, currency, error? }] }
 */
export async function querySupplierBalances(
  supplier: { baseUrl: string },
  keys: Array<{ id: number; name: string | null; keyValue: string }>,
  deps: SupplierOpsDeps = {},
): Promise<SupplierBalanceResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const getCache = deps.cacheGet ?? redisCacheGet;
  const setCache = deps.cacheSet ?? redisCacheSet;

  const keyResults: SupplierBalanceKeyResult[] = [];
  let unsupportedCount = 0;

  for (const key of keys) {
    const cacheKey = `${BALANCE_CACHE_KEY_PREFIX}${key.id}`;
    let balance: number | null = null;
    let currency: string | null = null;
    let error: string | undefined;
    let unsupported = false;
    let cacheHit = false;

    // 1. 缓存命中 → 直接复用，不打上游
    try {
      const cached = await getCache(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as { balance?: unknown; currency?: unknown };
        if (typeof parsed.balance === 'number' && Number.isFinite(parsed.balance)) {
          balance = parsed.balance;
          currency = typeof parsed.currency === 'string' ? parsed.currency : null;
          cacheHit = true;
        }
      }
    } catch {
      // 缓存读取/解析异常按未命中处理，继续打上游
    }

    // 2. 未命中 → 查询上游并写缓存（unsupported 不缓存，下次可重新探测）
    if (!cacheHit) {
      const q = await queryKeyBalance(supplier.baseUrl, key.keyValue, fetchImpl);
      balance = q.balance;
      currency = q.currency;
      error = q.error;
      unsupported = q.unsupported;
      if (!unsupported) {
        try {
          await setCache(cacheKey, JSON.stringify({ balance, currency }), BALANCE_CACHE_TTL_SECONDS);
        } catch {
          // Redis 不可用 → 跳过缓存，不阻断
        }
      }
    }

    keyResults.push({ keyId: key.id, keyName: key.name, balance, currency, error });
    if (unsupported) unsupportedCount++;
  }

  // 全部 Key 都 unsupported → 整个供应商优雅降级
  if (keys.length > 0 && unsupportedCount === keys.length) {
    return { ok: false, reason: 'unsupported' };
  }
  return { ok: true, keys: keyResults };
}
