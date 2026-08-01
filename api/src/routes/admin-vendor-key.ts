import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db, pool } from "../db/index";
import { vendorApiKeys } from "../db/schema/vendor-api-keys";
import { vendors } from "../db/schema/vendors";
import crypto from "node:crypto";

/**
 * 供应商 Key 资源池管理
 * 对齐 ref-4.3-vendor-model.md §2.4 Key 资源池 + vendor-api-keys 表
 * 管理端为供应商维护多个可用 API Key，路由时轮换；支持启停/删除/连通性测试
 */

function requireAdmin(app: FastifyInstance) {
  return async (req: any, reply: any) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const decoded = app.jwt.verify(token as string);
      req.user = decoded;
      const role = (decoded as any).role;
      if (role !== "admin" && role !== "super_admin") {
        return reply.code(403).send({ code: 403, error: "FORBIDDEN", message: "需要管理员权限" });
      }
    } catch (e: any) {
      if (e?.statusCode === 403) return;
      return reply.code(401).send({ code: 401, error: "UNAUTHORIZED" });
    }
  };
}

/** 简单对称加密（演示级；生产建议 KMS/环境变量密钥） */
const ENC_KEY = crypto.createHash("sha256").update(process.env.KEY_ENC_SECRET ?? "3cloud-key-enc-secret").digest();
function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), enc.toString("hex")].join(":");
}
function decrypt(enc: string): string | null {
  try {
    const [ivs, tags, encs] = enc.split(":");
    if (!ivs || !tags || !encs) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", ENC_KEY, Buffer.from(ivs, "hex"));
    decipher.setAuthTag(Buffer.from(tags, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(encs, "hex")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function adminVendorKeyRoutes(app: FastifyInstance) {
  const admin = requireAdmin(app);

  // 1. 供应商 Key 列表
  app.get("/admin/vendors/:vendorId/keys", { onRequest: [admin] }, async (req) => {
    const vendorId = Number((req.params as any).vendorId);
    const rows = await pool.query(
      `SELECT vk.id, vk.key_prefix, vk.is_enabled, vk.last_used_at, vk.failed_count, vk.created_at
       FROM vendor_api_keys vk WHERE vk.vendor_id = $1 ORDER BY vk.created_at DESC`,
      [vendorId],
    );
    return { code: 0, data: { list: rows.rows }, message: "ok" };
  });

  // 2. 添加供应商 Key（加密存储）
  app.post("/admin/vendors/:vendorId/keys", { onRequest: [admin] }, async (req, reply) => {
    const vendorId = Number((req.params as any).vendorId);
    const { api_key } = req.body as { api_key?: string };
    if (!api_key?.trim()) return reply.code(400).send({ code: 400, error: "MISSING_KEY", message: "请输入供应商 API Key" });

    const v = await db.select().from(vendors).where(eq(vendors.id, vendorId)).limit(1);
    if (!v[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND", message: "供应商不存在" });

    const key = api_key.trim();
    const encrypted = encrypt(key);
    const created = await db
      .insert(vendorApiKeys)
      .values({ vendorId, encryptedKey: encrypted, keyPrefix: key.slice(0, 8) + "...", isEnabled: true })
      .returning({ id: vendorApiKeys.id });
    return { code: 0, data: { id: created[0]!.id, key_prefix: key.slice(0, 8) + "..." }, message: "供应商 Key 已添加" };
  });

  // 3. 启停 Key
  app.post("/admin/vendor-keys/:id/toggle", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const { is_enabled } = req.body as { is_enabled?: boolean };
    const r = await db.update(vendorApiKeys).set({ isEnabled: !!is_enabled }).where(eq(vendorApiKeys.id, id));
    if ((r.rowCount ?? 0) === 0) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    return { code: 0, data: { ok: true }, message: is_enabled ? "Key 已启用" : "Key 已停用" };
  });

  // 4. 删除 Key
  app.delete("/admin/vendor-keys/:id", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const r = await db.delete(vendorApiKeys).where(eq(vendorApiKeys.id, id));
    if ((r.rowCount ?? 0) === 0) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    return { code: 0, data: { ok: true }, message: "Key 已删除" };
  });

  // 5. 连通性测试（解密后请求上游 /v1/models）
  app.post("/admin/vendor-keys/:id/test", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const vk = await db.select().from(vendorApiKeys).where(eq(vendorApiKeys.id, id)).limit(1);
    if (!vk[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    const vd = await db.select().from(vendors).where(eq(vendors.id, vk[0].vendorId)).limit(1);
    const base = vd[0]?.baseUrl ?? "";
    const rawKey = decrypt(vk[0].encryptedKey);

    const result = { success: false, latency_ms: 0, error: "未配置上游地址" };
    if (base && rawKey) {
      const t0 = Date.now();
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(`${base.replace(/\/$/, "")}/v1/models`, {
          method: "GET",
          headers: { Authorization: `Bearer ${rawKey}` },
          signal: controller.signal,
        });
        clearTimeout(timer);
        result.latency_ms = Date.now() - t0;
        result.success = res.status < 500;
        result.error = res.status < 500 ? "连通正常" : `上游返回 ${res.status}`;
      } catch (e: any) {
        result.latency_ms = Date.now() - t0;
        result.error = e?.name === "AbortError" ? "连接超时" : e?.message ?? "连接失败";
      }
    }
    return { code: 0, data: result, message: "ok" };
  });
}
