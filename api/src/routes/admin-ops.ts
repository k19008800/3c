/**
 * 管理端运维配置 API — 批次2：对齐「运维配置」菜单下 6 个后端缺失页面
 *
 * 端点覆盖：
 *   GET/PUT   /api/v1/admin/performance             — 性能配置（system_config perf_* 键）
 *   GET       /api/v1/admin/content                  — 内容列表（site_content）
 *   PUT       /api/v1/admin/content/:id              — 更新内容正文
 *   GET       /api/v1/admin/undo/config              — 撤销窗口配置（system_config undo_* 键）
 *   PUT       /api/v1/admin/undo/config              — 保存撤销配置
 *   GET       /api/v1/admin/undo/records             — 撤销记录列表
 *   POST      /api/v1/admin/undo/:id/execute         — 执行撤销（恢复快照，幂等）
 *   GET       /api/v1/admin/webhook-retry            — Webhook 重试配置列表
 *   PUT       /api/v1/admin/webhook-retry/:id        — 更新重试策略 / 开关
 *   GET       /api/v1/admin/sys/version              — 应用版本 + 运行环境
 *   GET       /api/v1/admin/sys/migrations           — 本地 migrations 目录记录
 *   GET       /api/v1/admin/sys/logs                 — 日志文件列表
 *   GET       /api/v1/admin/sys/logs/read            — 读取日志文件（行数 + 关键词过滤）
 *
 * 审计约定：操作类写（PUT/POST）写 audit_logs；只读 GET 不写。
 */

import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { eq, desc, inArray } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { verifyToken } from '../services/auth/jwt';
import { UnauthorizedError, ForbiddenError, NotFoundError, ValidationError } from '../lib/errors';

/* ───────── auth / audit helpers ───────── */

export async function adminAuth(request: any, _reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid or expired token');
  request.userContext = payload;
  const { role } = payload as { role: string };
  if (role !== 'admin' && role !== 'super_admin') {
    throw new ForbiddenError('Admin access required');
  }
}

export function writeAudit(request: any, section: string, details: Record<string, unknown>) {
  const ctx = request.userContext ?? {};
  return db.insert(schema.auditLogs).values({
    userId: ctx.userId ?? null,
    action: `ops.${section}`,
    resource: 'ops_config',
    resourceId: null,
    details: details as any,
    ipAddress: request.ip ?? null,
    userAgent: request.headers['user-agent'] ?? null,
  });
}

/* ───────── system_config 通用读写 ───────── */

interface CfgDef {
  value: string;
  type: 'string' | 'number' | 'bool';
  description: string;
}

const PERF_DEFAULTS: Record<string, CfgDef> = {
  perf_cache_ttl_seconds: { value: '300', type: 'number', description: '缓存 TTL 秒' },
  perf_query_timeout_seconds: { value: '30', type: 'number', description: '查询超时秒' },
  perf_connection_pool_max: { value: '20', type: 'number', description: '连接池大小' },
  perf_connection_pool_idle_timeout: { value: '60', type: 'number', description: '连接空闲超时秒' },
  perf_compression_enabled: { value: 'true', type: 'bool', description: 'GZip 压缩' },
  perf_response_gzip_min_bytes: { value: '1024', type: 'number', description: '压缩最小字节' },
  perf_batch_write_enabled: { value: 'true', type: 'bool', description: '批量写入' },
  perf_batch_write_interval_ms: { value: '500', type: 'number', description: '批量写入间隔 ms' },
  perf_slow_query_threshold_ms: { value: '1000', type: 'number', description: '慢查询阈值 ms' },
  perf_max_concurrent_requests: { value: '1000', type: 'number', description: '最大并发请求' },
};

const UNDO_DEFAULTS: Record<string, CfgDef> = {
  undo_timeout_seconds: { value: '300', type: 'number', description: '撤销窗口秒' },
  undo_enabled_types: { value: JSON.stringify(['user_status_change', 'user_disable', 'user_delete', 'user_edit', 'balance_adjust', 'role_assign', 'config_edit', 'vendor_delete', 'model_delete']), type: 'string', description: '可撤销操作类型' },
};

const ALL_KEYS = { ...PERF_DEFAULTS, ...UNDO_DEFAULTS };

function parseCfgValue(type: string, raw: string): string | number | boolean {
  if (type === 'bool') return raw === 'true' || raw === '1';
  if (type === 'number') {
    const n = Number(raw);
    return isNaN(n) ? raw : n;
  }
  return raw;
}

function readCfgValue(key: string, raw: string | undefined): string | number | boolean {
  const def = ALL_KEYS[key]!;
  return raw != null ? parseCfgValue(def.type, raw) : parseCfgValue(def.type, def.value);
}

async function setCfg(operatorId: number | null, values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) {
    if (!(key in ALL_KEYS)) throw new ValidationError(`未知配置键: ${key}`);
    await db.insert(schema.systemConfig)
      .values({ key, value, description: ALL_KEYS[key]!.description, updatedBy: operatorId })
      .onConflictDoUpdate({
        target: schema.systemConfig.key,
        set: { value, updatedBy: operatorId, updatedAt: new Date() },
      });
  }
}

/* ───────── 性能配置 ───────── */

/**
 * 线协议键 → 存储键 映射。
 * 前端页面（AdminPerformancePage）使用无前缀键名（cache_ttl_seconds 等），
 * DB 中按 perf_* 前缀隔离存储，避免与其他配置键冲突。
 */
const PERF_WIRE_TO_DB: Record<string, string> = Object.keys(PERF_DEFAULTS).reduce((acc, dbKey) => {
  acc[dbKey.slice('perf_'.length)] = dbKey;
  return acc;
}, {} as Record<string, string>);

const PERF_WIRE_KEYS = Object.keys(PERF_WIRE_TO_DB);

async function readPerformance() {
  const dbKeys = Object.values(PERF_WIRE_TO_DB);
  const rows = await db.select({ key: schema.systemConfig.key, value: schema.systemConfig.value })
    .from(schema.systemConfig)
    .where(inArray(schema.systemConfig.key, dbKeys));
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const data: Record<string, string | number | boolean> = {};
  for (const wireKey of PERF_WIRE_KEYS) {
    const dbKey = PERF_WIRE_TO_DB[wireKey]!;
    data[wireKey] = readCfgValue(dbKey, map.get(dbKey));
  }
  return data;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (Number.isNaN(n) || n < min || n > max) return fallback;
  return Math.round(n);
}

/* ───────── 撤销配置 ───────── */

// 与前端 AdminUndoPage TYPE_MAP 的键保持一致 + user_status_change（当前真实生产者）
const UNDO_ENABLED_TYPES = [
  'user_status_change', 'user_disable', 'user_delete', 'user_edit',
  'balance_adjust', 'role_assign', 'config_edit', 'vendor_delete', 'model_delete',
] as const;

async function readUndoConfig() {
  const keys = Object.keys(UNDO_DEFAULTS);
  const rows = await db.select({ key: schema.systemConfig.key, value: schema.systemConfig.value })
    .from(schema.systemConfig)
    .where(inArray(schema.systemConfig.key, keys));
  const map = new Map(rows.map((r) => [r.key, r.value]));
  let timeoutSeconds = Number(readCfgValue('undo_timeout_seconds', map.get('undo_timeout_seconds')));
  if (Number.isNaN(timeoutSeconds)) timeoutSeconds = 300;
  let enabledTypes: string[] = [];
  const rawTypes = readCfgValue('undo_enabled_types', map.get('undo_enabled_types'));
  if (typeof rawTypes === 'string') {
    try { enabledTypes = JSON.parse(rawTypes); } catch { enabledTypes = []; }
  }
  return { timeout_seconds: timeoutSeconds, enabled_types: enabledTypes };
}

/* ───────── route plugin ───────── */

export async function adminOpsRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/admin/performance — 性能配置
   */
  app.get('/api/v1/admin/performance', { preHandler: [adminAuth] }, async (_request, reply) => {
    return reply.send({ data: await readPerformance() });
  });

  /**
   * PUT /api/v1/admin/performance — 保存性能配置
   */
  app.put('/api/v1/admin/performance', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const b = (request.body || {}) as Record<string, unknown>;
    const values: Record<string, string> = {};
    for (const wireKey of PERF_WIRE_KEYS) {
      if (b[wireKey] !== undefined) values[PERF_WIRE_TO_DB[wireKey]!] = String(b[wireKey]);
    }
    if (Object.keys(values).length === 0) throw new ValidationError('No fields to update');
    await setCfg(request.userContext?.userId ?? null, values);
    await writeAudit(request, 'performance', { keys: Object.keys(values) });
    return reply.send({ data: { ok: true }, message: '性能配置已保存' });
  });

  /**
   * GET /api/v1/admin/content — 内容列表
   */
  app.get('/api/v1/admin/content', { preHandler: [adminAuth] }, async (_request, reply) => {
    const rows = await db.select().from(schema.siteContents).orderBy(desc(schema.siteContents.updatedAt));
    const list = rows.map((c) => ({
      id: c.id, type: c.type, title: c.title, content: c.content, slug: c.slug, status: c.status, updated_at: c.updatedAt,
    }));
    return reply.send({ data: { list, total: list.length } });
  });

  /**
   * PUT /api/v1/admin/content/:id — 更新内容正文
   */
  app.put('/api/v1/admin/content/:id', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) throw new ValidationError('Invalid id');
    const b = (request.body || {}) as { content?: string };
    if (typeof b.content !== 'string') throw new ValidationError('content is required');

    const [row] = await db.update(schema.siteContents)
      .set({ content: b.content, updatedAt: new Date() })
      .where(eq(schema.siteContents.id, id))
      .returning({ id: schema.siteContents.id, title: schema.siteContents.title });
    if (!row) throw new NotFoundError('Content', id);
    await writeAudit(request, 'content', { contentId: id, title: row.title });
    return reply.send({ data: { ok: true }, message: `${row.title} 已更新` });
  });

  /**
   * GET /api/v1/admin/undo/config — 撤销配置
   */
  app.get('/api/v1/admin/undo/config', { preHandler: [adminAuth] }, async (_request, reply) => {
    return reply.send({ data: await readUndoConfig() });
  });

  /**
   * PUT /api/v1/admin/undo/config — 保存撤销配置
   */
  app.put('/api/v1/admin/undo/config', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const b = (request.body || {}) as { timeout_seconds?: number; enabled_types?: string[] };
    const values: Record<string, string> = {};
    if (b.timeout_seconds !== undefined) {
      values.undo_timeout_seconds = String(clampInt(b.timeout_seconds, 60, 86400, 300));
    }
    if (Array.isArray(b.enabled_types)) {
      const valid = UNDO_ENABLED_TYPES.filter((t) => (b.enabled_types as string[]).includes(t));
      values.undo_enabled_types = JSON.stringify(valid);
    }
    if (Object.keys(values).length === 0) throw new ValidationError('No fields to update');
    await setCfg(request.userContext?.userId ?? null, values);
    await writeAudit(request, 'undo-config', { keys: Object.keys(values) });
    return reply.send({ data: { ok: true }, message: '撤销配置已保存' });
  });

  /**
   * GET /api/v1/admin/undo/records — 撤销记录列表（未过期优先）
   */
  app.get('/api/v1/admin/undo/records', { preHandler: [adminAuth] }, async (_request, reply) => {
    const rows = await db.select().from(schema.undoRecords).orderBy(desc(schema.undoRecords.createdAt)).limit(200);

    // 解析操作人名称（operator_id → users.email）
    const ids = Array.from(new Set(rows.map((r) => r.operatorId).filter((v): v is number => v != null)));
    const operators = new Map<number, string>();
    if (ids.length > 0) {
      const ops = await db.select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
        .from(schema.users).where(inArray(schema.users.id, ids));
      for (const o of ops) operators.set(o.id, o.email || o.name);
    }

    const list = rows.map((r) => ({
      id: r.id,
      operation_type: r.operationType,
      operation_label: r.operationLabel,
      target_type: r.targetType,
      target_id: Number(r.targetId) || 0,
      operator_id: r.operatorId,
      operator_name: r.operatorId != null ? (operators.get(r.operatorId) ?? '') : '',
      snapshot: r.snapshot,
      reverted: r.reverted === 'yes',
      expires_at: r.expiresAt,
      created_at: r.createdAt,
    }));
    return reply.send({ data: { list, total: list.length } });
  });

  /**
   * POST /api/v1/admin/undo/:id/execute — 执行撤销（恢复快照，幂等）
   */
  app.post('/api/v1/admin/undo/:id/execute', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) throw new ValidationError('Invalid id');

    const [rec] = await db.select().from(schema.undoRecords).where(eq(schema.undoRecords.id, id)).limit(1);
    if (!rec) throw new NotFoundError('Undo record', id);
    if (rec.reverted === 'yes') throw new ValidationError('该操作已撤销过');
    if (new Date(rec.expiresAt) < new Date()) throw new ValidationError('撤销窗口已过期');

    if (rec.operationType === 'user_status_change' && rec.targetType === 'customer') {
      const userId = Number(rec.targetId);
      const targetStatus = rec.snapshot; // 快照即被改前状态
      await db.update(schema.users)
        .set({ status: targetStatus as 'active' | 'disabled', updatedAt: sql`NOW()` })
        .where(eq(schema.users.id, userId));
    } else {
      throw new ValidationError(`暂不支持撤销操作类型: ${rec.operationType}`);
    }

    await db.update(schema.undoRecords)
      .set({ reverted: 'yes' })
      .where(eq(schema.undoRecords.id, id));
    await writeAudit(request, 'undo-execute', { undoId: id, operationType: rec.operationType, targetId: rec.targetId });
    return reply.send({ data: { ok: true }, message: `已撤销：${rec.operationLabel}` });
  });

  /**
   * GET /api/v1/admin/webhook-retry — 重试配置列表
   */
  app.get('/api/v1/admin/webhook-retry', { preHandler: [adminAuth] }, async (_request, reply) => {
    const rows = await db.select().from(schema.webhookRetryConfigs).orderBy(desc(schema.webhookRetryConfigs.updatedAt));
    const list = rows.map((c) => ({
      id: c.id, webhook_id: c.id, webhook_url: c.webhookUrl, name: c.name,
      max_retries: c.maxRetries, retry_delay_seconds: c.retryDelaySeconds, backoff_multiplier: c.backoffMultiplier,
      enabled: c.enabled === 'true', updated_at: c.updatedAt,
    }));
    return reply.send({ data: { list, total: list.length } });
  });

  /**
   * PUT /api/v1/admin/webhook-retry/:id — 更新重试策略 / 开关
   */
  app.put('/api/v1/admin/webhook-retry/:id', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) throw new ValidationError('Invalid id');
    const b = (request.body || {}) as { enabled?: boolean; max_retries?: number; retry_delay_seconds?: number; backoff_multiplier?: number };

    const setData: Record<string, unknown> = { updatedAt: new Date() };
    if (b.enabled !== undefined) setData.enabled = b.enabled ? 'true' : 'false';
    if (b.max_retries !== undefined) setData.maxRetries = clampInt(b.max_retries, 0, 10, 3);
    if (b.retry_delay_seconds !== undefined) setData.retryDelaySeconds = clampInt(b.retry_delay_seconds, 1, 3600, 60);
    if (b.backoff_multiplier !== undefined) setData.backoffMultiplier = clampInt(b.backoff_multiplier, 1, 10, 2);
    if (Object.keys(setData).length <= 1) throw new ValidationError('No fields to update');

    const [row] = await db.update(schema.webhookRetryConfigs)
      .set(setData)
      .where(eq(schema.webhookRetryConfigs.id, id))
      .returning({ id: schema.webhookRetryConfigs.id });
    if (!row) throw new NotFoundError('Webhook retry config', id);
    await writeAudit(request, 'webhook-retry', { id });
    return reply.send({ data: { ok: true }, message: 'Webhook 重试配置已更新' });
  });

  /**
   * GET /api/v1/admin/sys/version — 应用版本 + 运行环境
   */
  app.get('/api/v1/admin/sys/version', { preHandler: [adminAuth] }, async (_request, reply) => {
    let version = '';
    try {
      const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8')) as { version?: string };
      version = pkg.version ?? '';
    } catch { /* ignore */ }

    let migrationCount = 0;
    const dir = join(process.cwd(), 'src', 'db', 'migrations');
    try {
      migrationCount = readdirSync(dir).filter((f) => f.endsWith('.sql')).length;
    } catch { /* ignore */ }

    return reply.send({
      data: {
        version,
        node: process.version,
        platform: `${process.platform} ${process.arch}`,
        uptime: process.uptime(),
        migrationCount,
      },
    });
  });

  /**
   * GET /api/v1/admin/sys/migrations — 本地 migrations 目录记录
   */
  app.get('/api/v1/admin/sys/migrations', { preHandler: [adminAuth] }, async (_request, reply) => {
    const dir = join(process.cwd(), 'src', 'db', 'migrations');
    let list: { id: number; tag: string; hash: string }[] = [];
    try {
      list = readdirSync(dir)
        .filter((f) => f.endsWith('.sql'))
        .sort()
        .map((f, i) => {
          let hash = '';
          try {
            const content = readFileSync(join(dir, f), 'utf-8');
            let h = 0;
            for (let j = 0; j < content.length; j++) { h = ((h << 5) - h + content.charCodeAt(j)) | 0; }
            hash = (h >>> 0).toString(16).padStart(8, '0');
          } catch { /* ignore */ }
          return { id: i + 1, tag: f.replace(/^\d+_/, '').replace(/\.sql$/, ''), hash };
        });
    } catch { list = []; }
    return reply.send({ data: { list, total: list.length } });
  });

  /**
   * GET /api/v1/admin/sys/logs — 日志文件列表
   */
  app.get('/api/v1/admin/sys/logs', { preHandler: [adminAuth] }, async (_request, reply) => {
    const candidates = [
      join(process.cwd(), 'logs'),
      join(process.cwd(), '..', 'logs'),
      join(process.cwd(), '..', '..', 'logs'),
    ];
    const found = new Set<string>();
    for (const dir of candidates) {
      try {
        if (!existsSync(dir)) continue;
        for (const f of readdirSync(dir)) {
          const full = resolve(join(dir, f));
          if (statSync(full).isFile() && /\.(log|out|err)$/i.test(f)) found.add(full);
        }
      } catch { /* ignore */ }
    }
    const files = Array.from(found).sort();
    return reply.send({ data: { files, path: files.length > 0 ? dirname(files[0]!) : '' } });
  });

  /**
   * GET /api/v1/admin/sys/logs/read?file=...&search=...&lines=N — 读取日志
   */
  app.get('/api/v1/admin/sys/logs/read', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query || {}) as { file?: string; search?: string; lines?: string };
    const file = String(q.file || '').trim();
    if (!file) throw new ValidationError('file is required');
    const filePath = resolve(file);

    // 路径安全：仅允许读取 cwd 或其祖先目录下的日志
    const cwd = resolve(process.cwd());
    const allowed = [cwd, resolve(join(cwd, '..')), resolve(join(cwd, '..', '..'))];
    if (!allowed.some((base) => filePath === base || filePath.startsWith(base + '\\') || filePath.startsWith(base + '/'))) {
      throw new ForbiddenError('日志文件超出允许目录');
    }
    if (!existsSync(filePath) || !statSync(filePath).isFile()) throw new NotFoundError('Log file', file);

    const lines = clampInt(q.lines ? Number(q.lines) : NaN, 10, 1000, 100);
    const search = String(q.search || '').trim();
    const all = readFileSync(filePath, 'utf-8').split(/\r?\n/);
    const needle = search ? search.toLowerCase() : '';
    const matched = needle ? all.filter((l) => l.toLowerCase().includes(needle)) : all;
    const tail = matched.slice(-lines);
    return reply.send({ data: { lines: tail, total: matched.length, path: filePath } });
  });
}

function dirname(p: string): string {
  return join(p).split(/[\\/]/).slice(0, -1).join('\\');
}
