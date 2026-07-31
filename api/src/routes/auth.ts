import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "../db/index";
import { users } from "../db/schema/users";

/**
 * 认证路由（§2 用户体系最小集）
 * - POST /auth/login    登录发 JWT
 * - POST /auth/register 注册
 * - GET  /me            当前用户信息（用于前端 Console 状态）
 */

export function authRoutes(app: FastifyInstance) {
  // 注册
  app.post(
    "/auth/register",
    {
      schema: {
        tags: ["auth"],
        body: {
          type: "object",
          required: ["email", "password", "username"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 6 },
            username: { type: "string", minLength: 2 },
          },
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
      return reply.code(201).send({ token, user: safeUser(u as any) });
    },
  );

  // 登录
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

      // 校验密码：优先 bcrypt；兼容 seed 明文密码（dev 便捷）
      let valid = false;
      if (u.passwordHash.startsWith("$2")) {
        valid = await bcrypt.compare(password, u.passwordHash);
      } else {
        valid = u.passwordHash === password; // seed 明文兼容
      }
      if (!valid) return reply.code(401).send({ error: "INVALID_CREDENTIALS", message: "邮箱或密码错误" });

      if (u.status !== "active") return reply.code(403).send({ error: "USER_DISABLED", message: "账号已被禁用" });

      const token = app.jwt.sign({ sub: String(u.id), role: u.role });
      return { token, user: safeUser(u) };
    },
  );

  // 当前用户信息（需 JWT）
  app.get(
    "/me",
    {
      schema: { tags: ["auth"] },
      onRequest: [app.authenticate as any],
    },
    async (req) => {
      const userId = Number((req as any).user.sub);
      const u = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!u[0]) throw { statusCode: 404, message: "用户不存在" };
      return safeUser(u[0]);
    },
  );
}

/** 脱敏用户对象 */
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
