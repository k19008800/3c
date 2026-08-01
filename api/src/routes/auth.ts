import type { FastifyInstance } from "fastify";
import { eq, and, desc } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { db, pool } from "../db/index";
import { users } from "../db/schema/users";
import { apiKeys } from "../db/schema/api-keys";
import { sendEmail } from "../services/smtp";

/**
 * 认证路由（§2 用户体系）
 * - POST /auth/register 注册
 * - POST /auth/login    登录（发 JWT）
 * - GET  /me            当前用户
 * - GET  /me/stats      仪表盘统计
 * - GET  /me/logs       调用日志
 * - /me/api-keys        API Key CRUD（用户自服务）
 */

function safeUser(u: any) {
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    phone: u.phone ?? null,
    role: u.role,
    status: u.status,
    balance: u.balance,
    realNameStatus: u.realNameStatus,
    createdAt: u.createdAt,
  };
}

export function authRoutes(app: FastifyInstance) {
  // 受保护路由验证器：验证 JWT 并设置 req.user（本地定义，避免装饰器未加载问题）
  const requireAuth = async (req: any, reply: any) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const decoded = app.jwt.verify(token as string);
      req.user = decoded;
    } catch {
      return reply.code(401).send({ error: "UNAUTHORIZED", message: "未认证或凭证已失效" });
    }
  };

  // ===== 注册 =====
  app.post(
    "/auth/register",
    {
      schema: {
        tags: ["auth"],
        body: {
          type: "object",
          required: ["email", "password", "username"],
          properties: { email: { type: "string", format: "email" }, password: { type: "string", minLength: 6 }, username: { type: "string", minLength: 2 } },
        },
      },
    },
    async (req, reply) => {
      const { email, password, username } = req.body as { email: string; password: string; username: string };
      const exist = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (exist[0]) return reply.code(409).send({ error: "EMAIL_EXISTS", message: "邮箱已注册" });
      const passwordHash = await bcrypt.hash(password, 10);
      const created = await db
        .insert(users)
        .values({ email: email.toLowerCase(), passwordHash, username, role: "user", status: "active" })
        .returning({ id: users.id, email: users.email, username: users.username, balance: users.balance });
      const u = created[0]!;
      const token = app.jwt.sign({ sub: String(u.id), role: "user" });
      // 注册欢迎邮件（fire-and-forget，不阻塞注册；SMTP 未配置时静默跳过）
      void sendEmail({
        to: u.email,
        subject: "欢迎注册 3Cloud —— 你的 AI Token 聚合平台账号已开通",
        html: `<div style="font-family:sans-serif;max-width:520px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:10px">
          <h2 style="color:#1e293b">👋 欢迎加入 3Cloud</h2>
          <p>你好，<strong>${u.username}</strong>：</p>
          <p>你的 3Cloud 账号已成功创建。现在可以：</p>
          <ul>
            <li>创建 API Key 并接入 OpenAI 兼容接口</li>
            <li>在控制台管理余额、充值、查看调用账单</li>
            <li>通过代理体系邀请伙伴，获取佣金</li>
          </ul>
          <p style="color:#64748b;font-size:13px">如需帮助，请联系平台客服。</p>
        </div>`,
        templateName: "welcome",
        vars: { username: u.username ?? "" },
      });
      return reply.code(201).send({ token, user: safeUser(u as any) });
    },
  );

  // ===== 登录 =====
  app.post(
    "/auth/login",
    {
      schema: {
        tags: ["auth"],
        body: {
          type: "object",
          required: ["email", "password"],
          properties: { email: { type: "string" }, password: { type: "string" } },
        },
      },
    },
    async (req, reply) => {
      const { email, password } = req.body as { email: string; password: string };
      const user = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
      const u = user[0];
      if (!u) return reply.code(401).send({ error: "INVALID_CREDENTIALS", message: "邮箱或密码错误" });

      let valid = false;
      if (u.passwordHash.startsWith("$2")) valid = await bcrypt.compare(password, u.passwordHash);
      else valid = u.passwordHash === password; // seed 明文兼容
      if (!valid) return reply.code(401).send({ error: "INVALID_CREDENTIALS", message: "邮箱或密码错误" });
      if (u.status !== "active") return reply.code(403).send({ error: "USER_DISABLED", message: "账号已被禁用" });

      const token = app.jwt.sign({ sub: String(u.id), role: u.role });
      return { token, user: safeUser(u) };
    },
  );

  // ===== /me 系列（受保护）=====
  app.get(
    "/me",
    { schema: { tags: ["auth"] }, onRequest: [requireAuth] },
    async (req, reply) => {
      const userId = Number((req as any).user.sub);
      const u = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!u[0]) return reply.code(404).send({ error: "NOT_FOUND", message: "用户不存在" });
      return safeUser(u[0]);
    },
  );

  // 仪表盘统计
  app.get("/me/stats", { schema: { tags: ["auth"] }, onRequest: [requireAuth] }, async (req) => {
    const userId = Number((req as any).user.sub);
    const [total, today, balanceRows] = await Promise.all([
      pool.query("SELECT COALESCE(SUM(total_tokens),0)::int AS tokens, COALESCE(SUM(cost),0)::numeric AS cost, COUNT(*)::int AS calls FROM call_logs WHERE user_id=$1", [userId]),
      pool.query("SELECT COUNT(*)::int AS calls FROM call_logs WHERE user_id=$1 AND created_at >= now() - interval '24 hours'", [userId]),
      pool.query("SELECT balance FROM users WHERE id=$1", [userId]),
    ]);
    return {
      totalTokens: total.rows[0].tokens,
      totalCost: Number(total.rows[0].cost || 0),
      totalCalls: total.rows[0].calls,
      todayCalls: today.rows[0].calls,
      balance: Number(balanceRows.rows[0]?.balance ?? 0) / 100,
    };
  });

  // 调用日志（支持 model/status/provider 筛选）
  app.get("/me/logs", { schema: { tags: ["auth"] }, onRequest: [requireAuth] }, async (req) => {
    const userId = Number((req as any).user.sub);
    const q = req.query as { limit?: number; model?: string; status?: string; provider?: string };
    const limit = Math.min(q.limit ?? 20, 100);
    let where = "WHERE user_id=$1";
    const params: any[] = [userId];
    const pp = (v: any) => { params.push(v); return `$${params.length}`; };
    if (q.model) { where += ` AND upstream_model ILIKE ${pp(`%${q.model}%`)}`; }
    if (q.status) { where += ` AND status = ${pp(q.status)}`; }
    if (q.provider) { where += ` AND provider ILIKE ${pp(`%${q.provider}%`)}`; }
    params.push(limit);
    const rows = await pool.query(
      `SELECT id, provider, upstream_model, request_tokens, response_tokens, total_tokens, cost, status, error_code, latency_ms, created_at
       FROM call_logs ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return { list: rows.rows };
  });

  // API Key 列表
  app.get("/me/api-keys", { schema: { tags: ["auth"] }, onRequest: [requireAuth] }, async (req) => {
    const userId = Number((req as any).user.sub);
    const keys = await db
      .select({ id: apiKeys.id, name: apiKeys.name, keyPrefix: apiKeys.keyPrefix, status: apiKeys.status, expiresAt: apiKeys.expiresAt, lastUsedAt: apiKeys.lastUsedAt, createdAt: apiKeys.createdAt })
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId))
      .orderBy(desc(apiKeys.createdAt));
    return { list: keys };
  });

  // 创建 Key（返回一次明文）
  app.post("/me/api-keys", { schema: { tags: ["auth"] }, onRequest: [requireAuth] }, async (req) => {
    const userId = Number((req as any).user.sub);
    const { name, expiresInDays, model_whitelist } = req.body as { name: string; expiresInDays?: number; model_whitelist?: string[] };
    const secret = "sk-" + crypto.randomBytes(24).toString("hex");
    const keyHash = crypto.createHash("sha256").update(secret).digest("hex");
    const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 3600 * 1000) : null;
    const modelWhitelist = Array.isArray(model_whitelist) && model_whitelist.length ? model_whitelist.join(",") : null;
    const created = await db
      .insert(apiKeys)
      .values({ userId, name, keyPrefix: secret.slice(0, 12), keyHash, status: "active", expiresAt, modelWhitelist })
      .returning({ id: apiKeys.id, name: apiKeys.name, modelWhitelist: apiKeys.modelWhitelist });
    return { key: secret, ...created[0] };
  });

  // 删除 Key（软删除）
  app.delete("/me/api-keys/:id", { schema: { tags: ["auth"] }, onRequest: [requireAuth] }, async (req, reply) => {
    const userId = Number((req as any).user.sub);
    const { id } = req.params as { id: number };
    const r = await db.update(apiKeys).set({ deletedAt: new Date(), status: "deleted" }).where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)));
    if ((r.rowCount ?? 0) === 0) return reply.code(404).send({ error: "NOT_FOUND" });
    return { ok: true };
  });

  // 启用/禁用 Key
  app.patch("/me/api-keys/:id", { schema: { tags: ["auth"] }, onRequest: [requireAuth] }, async (req, reply) => {
    const userId = Number((req as any).user.sub);
    const { id } = req.params as { id: number };
    const { status } = req.body as { status: string };
    const r = await db.update(apiKeys).set({ status }).where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)));
    if ((r.rowCount ?? 0) === 0) return reply.code(404).send({ error: "NOT_FOUND" });
    return { ok: true };
  });
}
