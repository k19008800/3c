import type { FastifyInstance } from "fastify";
import { pool } from "../db/index";
import { redis } from "../lib/redis";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

function requireSuperAdmin(app: FastifyInstance) {
  return async (req: any, reply: any) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const decoded = app.jwt.verify(token as string);
      req.user = decoded;
      const role = (decoded as any).role;
      if (role !== "super_admin") return reply.code(403).send({ code: 403, error: "FORBIDDEN", message: "仅超级管理员" });
    } catch { return reply.code(401).send({ code: 401, error: "UNAUTHORIZED" }); }
  };
}
function requireAdmin(app: FastifyInstance) {
  return async (req: any, reply: any) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const decoded = app.jwt.verify(token as string);
      req.user = decoded;
      const role = (decoded as any).role;
      if (!["admin","super_admin"].includes(role)) return reply.code(403).send({ code: 403, error: "FORBIDDEN" });
    } catch { return reply.code(401).send({ code: 401, error: "UNAUTHORIZED" }); }
  };
}

export function adminSysRoutes(app: FastifyInstance) {
  const superAdmin = requireSuperAdmin(app);
  const admin = requireAdmin(app);

  // ===== §12.2 数据库管理面板 =====
  app.post("/admin/sys/db/query", { onRequest: [superAdmin], schema: { body: { type: "object", additionalProperties: true } } }, async (req, reply) => {
    const b = req.body as { sql?: string };
    if (!b.sql?.trim()) return reply.code(400).send({ code: 400, error: "MISSING_SQL" });
    const sql = b.sql.trim();
    if (!/^SELECT\s/i.test(sql)) return reply.code(400).send({ code: 400, error: "READ_ONLY", message: "仅允许 SELECT 查询" });
    try {
      const start = Date.now();
      const rows = await pool.query(sql);
      return { code: 0, data: { rows: rows.rows, rowCount: rows.rowCount, fields: rows.fields?.map((f: any) => ({ name: f.name, dataTypeID: f.dataTypeID })), duration: Date.now() - start }, message: "ok" };
    } catch (e: any) {
      return reply.code(400).send({ code: 400, error: "SQL_ERROR", message: e.message });
    }
  });

  app.get("/admin/sys/db/schema", { onRequest: [admin] }, async () => {
    const tables = (await pool.query(
      "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
    )).rows;
    const schemas = (await pool.query(
      "SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position"
    )).rows;
    return { code: 0, data: { tables, columns: schemas }, message: "ok" };
  });

  // ===== §12.3 缓存管理 =====
  app.get("/admin/sys/cache/keys", { onRequest: [admin] }, async (req) => {
    const q = req.query as { pattern?: string };
    const pattern = q.pattern || "*";
    try {
      const keys = await redis.keys(pattern);
      const info = await redis.info("memory");
      const memLine = info.split("\n").find((l: string) => l.startsWith("used_memory_human"));
      return { code: 0, data: { keys: keys.slice(0, 500), count: keys.length, memory: memLine || "N/A" }, message: "ok" };
    } catch {
      return { code: 0, data: { keys: [], count: 0, memory: "Redis 不可用" }, message: "ok" };
    }
  });

  app.delete("/admin/sys/cache/key", { onRequest: [superAdmin], schema: { body: { type: "object", additionalProperties: true } } }, async (req, reply) => {
    const b = req.body as { key?: string };
    if (!b.key) return reply.code(400).send({ code: 400, error: "MISSING_KEY" });
    try {
      await redis.del(b.key);
      return { code: 0, data: { ok: true }, message: "已删除" };
    } catch {
      return reply.code(500).send({ code: 500, error: "REDIS_ERROR", message: "Redis 不可用" });
    }
  });

  app.post("/admin/sys/cache/flush", { onRequest: [superAdmin] }, async () => {
    try {
      const keys = await redis.keys("billing:*");
      if (keys.length > 0) await redis.del(...keys);
      return { code: 0, data: { cleared: keys.length }, message: "已清理业务缓存" };
    } catch {
      return { code: 0, data: { cleared: 0 }, message: "Redis 不可用，跳过" };
    }
  });

  // ===== §12.5 在线日志查看器 =====
  app.get("/admin/sys/logs", { onRequest: [admin] }, async (req) => {
    const q = req.query as { path?: string };
    const logDir = q.path || "/var/log";
    try {
      const logPath = process.platform === "win32" ? join(process.env.USERPROFILE || "C:\\", ".pm2", "logs") : logDir;
      const files = readdirSync(logPath).filter(f => f.endsWith(".log") || f.endsWith(".out") || f.endsWith(".err")).slice(0, 20);
      return { code: 0, data: { files, path: logPath }, message: "ok" };
    } catch {
      return { code: 0, data: { files: [], path: logDir, note: "日志目录不可访问" }, message: "ok" };
    }
  });

  app.get("/admin/sys/logs/read", { onRequest: [admin] }, async (req, reply) => {
    const q = req.query as { file?: string; search?: string; lines?: string };
    if (!q.file) return reply.code(400).send({ code: 400, error: "MISSING_FILE" });
    const maxLines = Math.min(500, Number(q.lines) || 100);
    try {
      if (!statSync(q.file).isFile()) return reply.code(400).send({ code: 400, error: "NOT_FILE" });
      const content = readFileSync(q.file, "utf8");
      const lines = content.split("\n").filter((l: string) => !q.search || l.includes(q.search));
      return { code: 0, data: { lines: lines.slice(-maxLines), total: lines.length, file: q.file }, message: "ok" };
    } catch (e: any) {
      return reply.code(400).send({ code: 400, error: "READ_ERROR", message: e.message });
    }
  });

  // ===== §12.7 变更计划/版本 =====
  app.get("/admin/sys/migrations", { onRequest: [admin] }, async () => {
    const rows = await pool.query("SELECT * FROM drizzle_migrations ORDER BY id DESC LIMIT 50").catch(() => ({ rows: [] }));
    return { code: 0, data: { list: rows.rows, note: "migration 执行记录" }, message: "ok" };
  });

  app.get("/admin/sys/version", { onRequest: [admin] }, async () => {
    const pkg = { version: "1.0.0" };
    const migrationCount = (await pool.query("SELECT count(*)::int c FROM drizzle_migrations").catch(() => ({ rows: [{ c: 0 }] }))).rows[0].c;
    return { code: 0, data: { version: pkg.version, node: process.version, platform: process.platform, migrationCount, uptime: process.uptime() }, message: "ok" };
  });

  // ===== 站点配置维护（ICP/版权/维护模式等） =====
  app.get("/admin/site-config", { onRequest: [admin] }, async () => {
    const rows = await pool.query("SELECT key, value FROM site_configs ORDER BY key");
    return { code: 0, data: rows.rows, message: "ok" };
  });

  app.put("/admin/site-config", { onRequest: [admin], schema: { body: { type: "object", additionalProperties: true } } }, async (req) => {
    const b = req.body as Record<string, string>;
    const entries = Object.entries(b).filter(([k]) => k.startsWith("site_"));
    for (const [key, value] of entries) {
      await pool.query(
        "INSERT INTO site_configs (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()",
        [key, value],
      );
    }
    return { code: 0, data: { updated: entries.length }, message: "ok" };
  });
}
