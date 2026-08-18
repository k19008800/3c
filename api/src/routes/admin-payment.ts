/**
 * 支付通道配置路由 — /api/v1/admin/payment（产品裁决 2026-08-15）
 *
 * 支持通道：微信支付 / 支付宝 / QQ 钱包（预留回调验签）+ 对公转账收款账户。
 *
 * 端点：
 *   GET  /admin/payment/config       — 读取支付配置（密钥类字段脱敏返回）
 *   PUT  /admin/payment/config       — 保存支付配置（wechat/alipay/qq/bank 四组）
 *   GET  /admin/payment/certs        — 证书文件列表（名称/大小/上传时间/通道）
 *   POST /admin/payment/cert         — 上传证书文件（body: {channel, filename, content(base64)}）
 *   DELETE /admin/payment/cert/:name — 删除证书文件
 *
 * 存储：
 * - 配置存 system_config（键 payment_config，JSON）；
 * - 证书文件存 <cwd>/tmp/payment-certs/（文件名 = 时间戳_通道_原名，防覆盖与路径穿越）。
 *
 * 安全：
 * - 读配置时 private_key/api_v3_key/key 等敏感字段用 *** 掩码；
 * - 证书路径经 resolveCertPath 校验（仅允许落在证书目录内）。
 */

import type { FastifyInstance } from 'fastify';
import { mkdir, writeFile, readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, schema } from '../db';
import { eq, sql } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import { UnauthorizedError, ForbiddenError, ValidationError, NotFoundError } from '../lib/errors';

const CONFIG_KEY = 'payment_config';

const CERT_DIR = path.resolve(process.cwd(), 'tmp', 'payment-certs');

/** 敏感字段（读取时脱敏） */
const SECRET_FIELDS = ['api_v3_key', 'private_key', 'alipay_public_key', 'key', 'mch_id', 'app_id'];

export interface PaymentConfig {
  wechat: {
    enabled: boolean;
    app_id: string;
    mch_id: string;
    api_v3_key: string;
    notify_url: string;
    cert_file: string | null;
  };
  alipay: {
    enabled: boolean;
    app_id: string;
    private_key: string;
    alipay_public_key: string;
    notify_url: string;
    cert_file: string | null;
  };
  qq: {
    enabled: boolean;
    app_id: string;
    mch_id: string;
    key: string;
    notify_url: string;
    cert_file: string | null;
  };
  bank: {
    account_name: string;
    account_number: string;
    bank_name: string;
    branch_name: string;
  };
}

const DEFAULT_CONFIG: PaymentConfig = {
  wechat: { enabled: false, app_id: '', mch_id: '', api_v3_key: '', notify_url: '', cert_file: null },
  alipay: { enabled: false, app_id: '', private_key: '', alipay_public_key: '', notify_url: '', cert_file: null },
  qq: { enabled: false, app_id: '', mch_id: '', key: '', notify_url: '', cert_file: null },
  bank: { account_name: '', account_number: '', bank_name: '', branch_name: '' },
};

/* ───────── auth / audit ───────── */

async function adminAuth(request: any, _reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid or expired token');
  request.userContext = payload;
  const { role } = payload as { role: string };
  if (role !== 'admin' && role !== 'super_admin') throw new ForbiddenError('Admin access required');
}

function writeAudit(request: any, section: string, details: Record<string, unknown>) {
  const ctx = request.userContext ?? {};
  return db.insert(schema.auditLogs).values({
    userId: ctx.userId ?? null,
    action: `ops.payment.${section}`,
    resource: 'payment_config',
    resourceId: null,
    details: details as any,
    ipAddress: request.ip ?? null,
    userAgent: request.headers['user-agent'] ?? null,
  });
}

/* ───────── 配置读写 ───────── */

export function parsePaymentConfig(raw: string | null | undefined): PaymentConfig {
  if (!raw) return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  try {
    const p = JSON.parse(raw) as Partial<PaymentConfig>;
    return {
      wechat: { ...DEFAULT_CONFIG.wechat, ...(p.wechat ?? {}) },
      alipay: { ...DEFAULT_CONFIG.alipay, ...(p.alipay ?? {}) },
      qq: { ...DEFAULT_CONFIG.qq, ...(p.qq ?? {}) },
      bank: { ...DEFAULT_CONFIG.bank, ...(p.bank ?? {}) },
    };
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
}

async function readConfig(): Promise<PaymentConfig> {
  const [row] = await db.select({ value: schema.systemConfig.value })
    .from(schema.systemConfig)
    .where(sql`${schema.systemConfig.key} = ${CONFIG_KEY}`);
  return parsePaymentConfig(row?.value);
}

async function saveConfig(cfg: PaymentConfig, operatorId: number | null) {
  await db.insert(schema.systemConfig)
    .values({ key: CONFIG_KEY, value: JSON.stringify(cfg), updatedBy: operatorId })
    .onConflictDoUpdate({
      target: schema.systemConfig.key,
      set: { value: JSON.stringify(cfg), updatedBy: operatorId, updatedAt: new Date() },
    });
}

/** 深拷贝并掩码敏感字段（读接口返回给前端展示） */
function maskConfig(cfg: PaymentConfig): PaymentConfig {
  const clone = JSON.parse(JSON.stringify(cfg)) as PaymentConfig;
  for (const channel of ['wechat', 'alipay', 'qq'] as const) {
    const c = clone[channel] as Record<string, unknown>;
    for (const f of SECRET_FIELDS) {
      const v = c[f];
      if (typeof v === 'string' && v.length > 0) c[f] = v.slice(0, 4) + '***' + v.slice(-4);
    }
  }
  return clone;
}

/* ───────── 证书文件管理 ───────── */

/** 校验证书文件名（仅允许 [0-9a-z_.-]，防路径穿越） */
const CERT_NAME_PATTERN = /^[0-9a-zA-Z_.-]{1,120}$/;

function resolveCertPath(name: string): string | null {
  if (!CERT_NAME_PATTERN.test(name)) return null;
  const dir = path.resolve(CERT_DIR);
  const full = path.resolve(dir, name);
  if (!full.startsWith(dir + path.sep)) return null;
  return full;
}

async function ensureCertDir() {
  await mkdir(CERT_DIR, { recursive: true });
}

export async function adminPaymentRoutes(app: FastifyInstance) {
  /** GET /api/v1/admin/payment/config — 读取支付配置（脱敏） */
  app.get('/api/v1/admin/payment/config', { preHandler: [adminAuth] }, async (_request, reply) => {
    const cfg = await readConfig();
    return reply.send({ data: maskConfig(cfg) });
  });

  /**
   * PUT /api/v1/admin/payment/config — 保存支付配置
   * body: { wechat?, alipay?, qq?, bank? } 部分覆盖；enabled 由前端传。
   * 敏感字段：传值且非 '***' 开头时更新；传空字符串则清空。
   */
  app.put('/api/v1/admin/payment/config', { preHandler: [adminAuth] }, async (request, reply) => {
    const body = (request.body || {}) as Record<string, unknown>;
    const current = await readConfig();
    const next: PaymentConfig = JSON.parse(JSON.stringify(current));

    const mergeChannel = <K extends 'wechat' | 'alipay' | 'qq'>(key: K, fields: (keyof PaymentConfig[K])[]) => {
      const patch = body[key] as Record<string, unknown> | undefined;
      if (!patch || typeof patch !== 'object') return;
      const cur = next[key] as Record<string, unknown>;
      for (const f of fields) {
        const v = patch[f as string];
        // enabled 是 boolean，直接覆盖
        if (typeof v === 'boolean' && f === 'enabled') {
          cur[f as string] = v;
          continue;
        }
        if (typeof v !== 'string') continue;
        // 掩码回传（***）视为未修改；空串清空
        if (v.startsWith('***')) continue;
        cur[f as string] = v;
      }
    };
    mergeChannel('wechat', ['enabled', 'app_id', 'mch_id', 'api_v3_key', 'notify_url', 'cert_file'] as any);
    mergeChannel('alipay', ['enabled', 'app_id', 'private_key', 'alipay_public_key', 'notify_url', 'cert_file'] as any);
    mergeChannel('qq', ['enabled', 'app_id', 'mch_id', 'key', 'notify_url', 'cert_file'] as any);
    if (body.bank && typeof body.bank === 'object') {
      const b = body.bank as Record<string, unknown>;
      for (const f of ['account_name', 'account_number', 'bank_name', 'branch_name']) {
        if (typeof b[f] === 'string') (next.bank as Record<string, unknown>)[f] = b[f];
      }
    }

    await saveConfig(next, (request as any).userContext?.userId ?? null);
    await writeAudit(request, 'config-save', { channels: Object.keys(body).filter((k) => ['wechat', 'alipay', 'qq', 'bank'].includes(k)) });

    return reply.send({ data: maskConfig(next), message: '支付配置已保存' });
  });

  /** GET /api/v1/admin/payment/certs — 证书文件列表 */
  app.get('/api/v1/admin/payment/certs', { preHandler: [adminAuth] }, async (_request, reply) => {
    await ensureCertDir();
    let files: { name: string; size: number; modified_at: string | null }[] = [];
    try {
      const names = await readdir(CERT_DIR);
      files = await Promise.all(names.map(async (n) => {
        const p = resolveCertPath(n);
        if (!p) return { name: n, size: 0, modified_at: null };
        try {
          const st = await stat(p);
          return { name: n, size: st.size, modified_at: st.mtime.toISOString() };
        } catch {
          return { name: n, size: 0, modified_at: null };
        }
      }));
    } catch {
      /* 目录不存在视为空 */
    }
    return reply.send({ data: { list: files, dir: CERT_DIR } });
  });

  /**
   * POST /api/v1/admin/payment/cert — 上传证书文件
   * body: { channel: 'wechat'|'alipay'|'qq', filename: 'apiclient_cert.pem', content: '<base64>' }
   * 保存为 <时间戳>_<channel>_<filename>，并自动把 cert_file 写入对应通道配置。
   */
  app.post('/api/v1/admin/payment/cert', { preHandler: [adminAuth] }, async (request, reply) => {
    const body = (request.body || {}) as Record<string, unknown>;
    const channel = String(body.channel || '');
    const filename = String(body.filename || '');
    const content = String(body.content || '');

    if (!['wechat', 'alipay', 'qq'].includes(channel)) throw new ValidationError('channel 必须是 wechat/alipay/qq');
    if (!CERT_NAME_PATTERN.test(filename)) throw new ValidationError('证书文件名不合法');
    if (!content) throw new ValidationError('证书内容不能为空');

    let buf: Buffer;
    try {
      buf = Buffer.from(content, 'base64');
    } catch {
      throw new ValidationError('证书内容必须是 base64');
    }
    if (buf.length === 0 || buf.length > 5 * 1024 * 1024) throw new ValidationError('证书大小需在 5MB 以内');

    await ensureCertDir();
    const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const storedName = `${ts}_${channel}_${filename}`;
    const full = resolveCertPath(storedName);
    if (!full) throw new ValidationError('证书文件名不合法');
    await writeFile(full, buf);

    // 自动更新对应通道 cert_file
    const cfg = await readConfig();
    (cfg[channel as 'wechat' | 'alipay' | 'qq'] as { cert_file: string | null }).cert_file = storedName;
    await saveConfig(cfg, (request as any).userContext?.userId ?? null);

    await writeAudit(request, 'cert-upload', { channel, filename: storedName, size: buf.length });

    return reply.status(201).send({
      data: { name: storedName, size: buf.length, cert_file: storedName },
      message: '证书上传成功',
    });
  });

  /** DELETE /api/v1/admin/payment/cert/:name — 删除证书文件（不自动清配置，避免误删后通道断链） */
  app.delete('/api/v1/admin/payment/cert/:name', { preHandler: [adminAuth] }, async (request, reply) => {
    const { name } = request.params as { name: string };
    const full = resolveCertPath(name);
    if (!full) throw new ValidationError('证书文件名不合法');
    try {
      await unlink(full);
    } catch {
      throw new NotFoundError('Cert', name);
    }
    await writeAudit(request, 'cert-delete', { filename: name });
    return reply.send({ data: { ok: true }, message: '证书已删除' });
  });
}

export { CERT_DIR };
