/**
 * Key 细粒度权限校验 — §20.4（P0）
 *
 * 职责：在 API Key 认证通过后、转发上游前，按「单个 Key」维度执行：
 *   1. 模型白名单 / 黑名单（blocked 优先于 allowed）
 *   2. 来源 IP 白名单（IPv4 单地址 / IPv4 CIDR，复用 ip-blacklist 的掩码匹配）
 *   3. Referer 白名单（子串匹配，按 origin 配置）
 *   4. 日 Token 上限（按 Key × UTC 自然日，Redis 计数）
 *   5. RPM / TPM 限流（按 Key × 60s 窗口，Redis 计数）
 *
 * 数据来源：权限列在 apiKeyAuth preHandler 查库时一并读出（见 auth/apikey.ts），
 * 本服务不再二次查库；纯配置类判定（模型/IP/Referer）零额外 IO。
 *
 * 降级语义（硬约束：检查挂了不能阻断所有请求 → fail-open）：
 *   - 配置类判定（模型/IP/Referer）：这是「决策」而非「故障」——命中拒绝规则 → 403；
 *     仅当判定函数自身因脏数据抛出异常时，捕获并放行（fail-open）。
 *   - Redis 计数类（RPM/TPM/日 Token）：Redis 不可用或命令异常 → 跳过该维度（fail-open），
 *     与 lib/redis.ts 降级语义一致，不因保护层自身故障打挂网关。
 *
 * 与既有四级限流（rate-limit/enforcer.ts）的维度差异：
 *   enforcer 按 userId / userId+model 计数；本服务按 apiKeyId 计数（Key 级细粒度），
 *   Redis key 前缀 `kp:` 避免与 enforcer 的 `rl:` 冲突，两者叠加不重复计数。
 *
 * @module services/security
 * @see docs/02-requirements §20.4 Key 细粒度权限
 */

import { getRedis } from '../../lib/redis.js';
import { cidrContains } from './ip-blacklist.js';
import { estimateRequestTokens } from '../rate-limit/index.js';

// ============================================================
// 类型
// ============================================================

/**
 * Key 权限配置（来自 apiKeys 表 7 个扩列，全部 nullable）。
 * 数组为 null/空 = 不限制；整数为 null = 不限制。
 */
export interface KeyPermissionConfig {
  /** 模型白名单：非空时仅允许列表内模型 */
  allowedModels: string[] | null;
  /** 模型黑名单：列表内模型一律拒绝（优先于白名单） */
  blockedModels: string[] | null;
  /** 来源 IP 白名单：支持 IPv4 单地址或 IPv4 CIDR */
  allowedIps: string[] | null;
  /** Referer 白名单：请求头 Referer 须包含其中一条 */
  allowedReferers: string[] | null;
  /** 日 Token 上限（按 Key × UTC 自然日） */
  dailyTokenLimit: number | null;
  /** 每分钟请求数上限（按 Key，60s 窗口） */
  rpmLimit: number | null;
  /** 每分钟 Token 上限（按 Key，60s 窗口） */
  tpmLimit: number | null;
}

/**
 * 单次请求的判定输入（由 Fastify preHandler 从 request 构建）。
 */
export interface KeyPermissionRequest {
  /** API Key ID（Redis 计数维度键） */
  apiKeyId: number;
  /** 请求的平台模型名（body.model）；缺失时模型判定跳过 */
  model: string;
  /** 来源 IP（Fastify request.ip） */
  clientIp: string;
  /** Referer 请求头（request.headers.referer），可能为空 */
  referer: string | undefined;
  /** 本次请求估算 token 数（TPM / 日 Token 维度权重） */
  estimatedTokens: number;
}

/** 判定结果：allowed=true 放通；false 时带 HTTP 状态码与对外消息 */
export interface KeyPermissionDecision {
  allowed: boolean;
  status?: number;
  code?: string;
  message?: string;
}

// ============================================================
// 窗口常量
// ============================================================

/** RPM / TPM 窗口：1 分钟 */
const WINDOW_60S_MS = 60_000;

// ============================================================
// 纯函数：模型 / IP / Referer 访问判定
// ============================================================

/**
 * 模型访问判定。
 *
 * 规则：
 *   - model 为空 → 跳过（无模型信息，放通；如 /v1/models 列表接口）；
 *   - blockedModels 含 model → 拒绝（黑名单优先）；
 *   - allowedModels 非空且不含 model → 拒绝（白名单外）；
 *   - 其余 → 放通。
 *
 * @param model - 请求模型名
 * @param allowedModels - 白名单（null/空 = 不限）
 * @param blockedModels - 黑名单（null/空 = 不限）
 * @returns null = 放通；非空 = 拒绝原因（机器码，日志用）
 */
export function checkModelAccess(
  model: string,
  allowedModels: string[] | null,
  blockedModels: string[] | null,
): string | null {
  if (!model) return null;
  const blocked = Array.isArray(blockedModels) ? blockedModels : null;
  const allowed = Array.isArray(allowedModels) ? allowedModels : null;

  if (blocked && blocked.length > 0 && blocked.includes(model)) {
    return 'model_blocked';
  }
  if (allowed && allowed.length > 0 && !allowed.includes(model)) {
    return 'model_not_in_whitelist';
  }
  return null;
}

/**
 * 来源 IP 访问判定。
 *
 * 规则：
 *   - allowedIps 为空 → 不限制（放通）；
 *   - 配置了白名单但拿不到 clientIp → 拒绝（用户显式限定了来源，缺 IP 不可信）；
 *   - 列表项含 '/' → IPv4 CIDR 掩码匹配；否则单地址精确比较；
 *   - 命中任意一条 → 放通；否则拒绝。
 *
 * @param clientIp - 来源 IP
 * @param allowedIps - 白名单（null/空 = 不限）
 * @returns null = 放通；非空 = 拒绝原因
 */
export function checkIpAccess(
  clientIp: string,
  allowedIps: string[] | null,
): string | null {
  const allowed = Array.isArray(allowedIps) ? allowedIps : null;
  if (!allowed || allowed.length === 0) return null;
  if (!clientIp) return 'ip_unavailable';

  for (const entry of allowed) {
    if (typeof entry !== 'string' || !entry) continue;
    if (entry.includes('/')) {
      if (cidrContains(entry, clientIp)) return null;
    } else if (entry.trim() === clientIp.trim()) {
      return null;
    }
  }
  return 'ip_not_in_whitelist';
}

/**
 * Referer 访问判定（子串匹配，按 origin 配置）。
 *
 * 规则：
 *   - allowedReferers 为空 → 不限制（放通）；
 *   - 配置了白名单但请求无 Referer 头 → 拒绝；
 *   - Referer 小写后包含列表中任意一条（小写归一）→ 放通；否则拒绝。
 *
 * @param referer - Referer 请求头原始值
 * @param allowedReferers - 白名单（null/空 = 不限）
 * @returns null = 放通；非空 = 拒绝原因
 */
export function checkRefererAccess(
  referer: string | undefined,
  allowedReferers: string[] | null,
): string | null {
  const allowed = Array.isArray(allowedReferers) ? allowedReferers : null;
  if (!allowed || allowed.length === 0) return null;
  if (!referer) return 'referer_missing';

  const r = referer.toLowerCase();
  for (const entry of allowed) {
    if (typeof entry !== 'string' || !entry) continue;
    if (r.includes(entry.trim().toLowerCase())) return null;
  }
  return 'referer_not_in_whitelist';
}

// ============================================================
// Redis 窗口计数（per-key，fail-open）
// ============================================================

/**
 * Redis 固定窗口计数（INCR / INCRBY 原子自增）。
 *
 * key = {prefix}:{bucket}，bucket = floor(now / windowMs)；TTL = 2 × windowMs。
 * 返回本次累计值；Redis 不可用/异常 → 返回 null（调用方 fail-open 跳过该维度）。
 *
 * @param prefix - 计数键前缀（不含桶号）
 * @param windowMs - 窗口长度（毫秒）
 * @param weight - 单次权重：1 = 请求数（RPM），token 数（TPM/日 Token）
 * @returns 窗口内累计值；不可用返回 null
 */
async function windowIncr(
  prefix: string,
  windowMs: number,
  weight: number,
): Promise<number | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const bucket = Math.floor(Date.now() / windowMs);
    const key = `${prefix}:${bucket}`;
    const multi = redis.multi();
    if (weight === 1) {
      multi.incr(key);
    } else {
      multi.incrby(key, weight);
    }
    multi.pexpire(key, windowMs * 2);
    const results = await multi.exec();
    const first = results?.[0] as [Error | null, number] | undefined;
    return first ? Number(first[1] ?? 0) : null;
  } catch {
    return null;
  }
}

/**
 * Redis 自然日计数（日 Token 上限）。
 *
 * key = {prefix}:{YYYY-MM-DD}（UTC 自然日）；TTL = 48h（跨日兜底）。
 * 返回今日累计值；不可用/异常 → null（fail-open）。
 *
 * @param prefix - 计数键前缀
 * @param weight - 本次估算 token 数
 * @returns 今日累计值；不可用返回 null
 */
async function dailyIncr(prefix: string, weight: number): Promise<number | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const day = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD
    const key = `${prefix}:${day}`;
    const multi = redis.multi();
    multi.incrby(key, weight);
    multi.pexpire(key, 48 * 3600 * 1000);
    const results = await multi.exec();
    const first = results?.[0] as [Error | null, number] | undefined;
    return first ? Number(first[1] ?? 0) : null;
  } catch {
    return null;
  }
}

// ============================================================
// 核心：enforceKeyPermissions(config, req)
// ============================================================

/**
 * 执行 Key 细粒度权限校验（纯 ctx 驱动，无 Fastify 依赖，便于单测）。
 *
 * 流程：
 *   1. 模型黑白名单判定（纯函数）→ 命中拒绝 → 403；
 *   2. 来源 IP 白名单判定（纯函数，CIDR 复用 ip-blacklist）→ 命中拒绝 → 403；
 *   3. Referer 白名单判定（纯函数）→ 命中拒绝 → 403；
 *   4. RPM（per-key，60s）超限 → 429；
 *   5. TPM（per-key，60s，按估算 token 权重）超限 → 429；
 *   6. 日 Token（per-key × UTC 日）超限 → 429。
 *
 * 纯配置判定因脏数据抛异常 → 捕获放行（fail-open）；
 * Redis 不可用/异常 → 跳过对应计数维度（fail-open）。
 *
 * @param config - Key 权限配置（来自 apiKeyContext）
 * @param req - 本次请求判定输入
 * @returns 判定结果；allowed=false 时带 status/code/message
 */
export async function enforceKeyPermissions(
  config: KeyPermissionConfig,
  req: KeyPermissionRequest,
): Promise<KeyPermissionDecision> {
  // ── 1. 模型黑白名单 ──
  try {
    const modelDenied = checkModelAccess(req.model, config.allowedModels, config.blockedModels);
    if (modelDenied) {
      return {
        allowed: false,
        status: 403,
        code: 'MODEL_NOT_ALLOWED',
        message: `当前 API Key 无权使用模型：${req.model || '(unknown)'}`,
      };
    }
  } catch {
    /* 脏数据 → fail-open */
  }

  // ── 2. 来源 IP 白名单 ──
  try {
    const ipDenied = checkIpAccess(req.clientIp, config.allowedIps);
    if (ipDenied) {
      return {
        allowed: false,
        status: 403,
        code: 'IP_NOT_ALLOWED',
        message: '当前 API Key 限制了来源 IP，请在白名单中添加本机 IP',
      };
    }
  } catch {
    /* 脏数据 → fail-open */
  }

  // ── 3. Referer 白名单 ──
  try {
    const refererDenied = checkRefererAccess(req.referer, config.allowedReferers);
    if (refererDenied) {
      return {
        allowed: false,
        status: 403,
        code: 'REFERER_NOT_ALLOWED',
        message: '当前 API Key 限制了 Referer 来源',
      };
    }
  } catch {
    /* 脏数据 → fail-open */
  }

  // ── 4. RPM（per-key，60s 窗口）──
  if (config.rpmLimit != null && config.rpmLimit > 0) {
    const count = await windowIncr(`kp:rpm:key:${req.apiKeyId}`, WINDOW_60S_MS, 1);
    if (count != null && count > config.rpmLimit) {
      return {
        allowed: false,
        status: 429,
        code: 'RATE_LIMITED',
        message: '当前 API Key 请求过于频繁，请稍后重试',
      };
    }
  }

  // ── 5. TPM（per-key，60s 窗口，按估算 token 权重）──
  if (config.tpmLimit != null && config.tpmLimit > 0) {
    const sum = await windowIncr(`kp:tpm:key:${req.apiKeyId}`, WINDOW_60S_MS, Math.max(1, req.estimatedTokens));
    if (sum != null && sum > config.tpmLimit) {
      return {
        allowed: false,
        status: 429,
        code: 'RATE_LIMITED',
        message: '当前 API Key Token 用量超过每分钟上限',
      };
    }
  }

  // ── 6. 日 Token（per-key × UTC 自然日）──
  if (config.dailyTokenLimit != null && config.dailyTokenLimit > 0) {
    const daily = await dailyIncr(`kp:daily:key:${req.apiKeyId}`, Math.max(1, req.estimatedTokens));
    if (daily != null && daily > config.dailyTokenLimit) {
      return {
        allowed: false,
        status: 429,
        code: 'DAILY_TOKEN_LIMIT_EXCEEDED',
        message: '当前 API Key 今日 Token 用量已达上限，请明日再试',
      };
    }
  }

  return { allowed: true };
}

// ============================================================
// Fastify preHandler 钩子（路由层接入点）
// ============================================================

/**
 * 从 Fastify 请求构建 Key 权限判定输入。
 *
 * apiKeyId / 权限配置取自 request.apiKeyContext（apiKeyAuth 已注入并扩列）；
 * model 取自 body.model；clientIp 取 request.ip；referer 取请求头；
 * estimatedTokens 复用 rate-limit 的估算（4 字符 ≈ 1 token）。
 *
 * @param request - Fastify request（须已过 apiKeyAuth）
 * @returns 判定输入；apiKeyContext 缺失时返回 null（交由上层 401 处理）
 */
export function buildKeyPermissionRequest(request: any): { config: KeyPermissionConfig; req: KeyPermissionRequest } | null {
  const apiKeyCtx = request?.apiKeyContext as {
    apiKeyId?: number;
    allowedModels?: string[] | null;
    blockedModels?: string[] | null;
    allowedIps?: string[] | null;
    allowedReferers?: string[] | null;
    dailyTokenLimit?: number | null;
    rpmLimit?: number | null;
    tpmLimit?: number | null;
  } | undefined;

  if (!apiKeyCtx || typeof apiKeyCtx.apiKeyId !== 'number') return null;

  const body = (request?.body ?? {}) as Record<string, unknown>;
  const model = typeof body.model === 'string' ? body.model : '';

  const config: KeyPermissionConfig = {
    allowedModels: apiKeyCtx.allowedModels ?? null,
    blockedModels: apiKeyCtx.blockedModels ?? null,
    allowedIps: apiKeyCtx.allowedIps ?? null,
    allowedReferers: apiKeyCtx.allowedReferers ?? null,
    dailyTokenLimit: apiKeyCtx.dailyTokenLimit ?? null,
    rpmLimit: apiKeyCtx.rpmLimit ?? null,
    tpmLimit: apiKeyCtx.tpmLimit ?? null,
  };

  const req: KeyPermissionRequest = {
    apiKeyId: apiKeyCtx.apiKeyId,
    model,
    clientIp: request?.ip ? String(request.ip) : '',
    referer: typeof request?.headers?.referer === 'string' ? request.headers.referer : undefined,
    estimatedTokens: estimateRequestTokens(body),
  };

  return { config, req };
}

/**
 * Fastify preHandler：在 apiKeyAuth 之后执行 Key 细粒度权限校验。
 *
 * 放通 → 继续后续 preHandler / 路由 handler；
 * 拒绝 → 直接回 403/429（OpenAI 风格 error 对象，与 apiKeyAuth / enforceRateLimitPreHandler 同模式）。
 *
 * @param request - Fastify request
 * @param reply - Fastify reply
 */
export async function enforceKeyPermissionsPreHandler(request: any, reply: any): Promise<void> {
  const built = buildKeyPermissionRequest(request);
  // apiKeyContext 缺失 → 未认证，交回后续 401 处理（不在这里重复鉴权）
  if (!built) return;

  // 未配置任何限制 → 零成本放通（向后兼容，绝大多数 Key 走此快路径）
  const { config } = built;
  const hasAnyRestriction =
    (config.allowedModels && config.allowedModels.length > 0) ||
    (config.blockedModels && config.blockedModels.length > 0) ||
    (config.allowedIps && config.allowedIps.length > 0) ||
    (config.allowedReferers && config.allowedReferers.length > 0) ||
    config.dailyTokenLimit != null ||
    config.rpmLimit != null ||
    config.tpmLimit != null;
  if (!hasAnyRestriction) return;

  const decision = await enforceKeyPermissions(config, built.req);
  if (!decision.allowed) {
    reply.status(decision.status ?? 403).send({
      error: {
        message: decision.message ?? 'Forbidden',
        type: decision.status === 429 ? 'rate_limit_error' : 'permission_error',
        code: decision.status ?? 403,
      },
    });
  }
}
