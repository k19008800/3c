// ============================================================
//  3cloud (3C) — Fastify Application
// ============================================================

import Fastify from "fastify";
import { config } from "./config.js";
import { createDb, closeDb } from "./db/index.js";
import { createRedis, getRedis, checkRedisConnection } from "./redis.js";
import { checkDbConnection } from "./db/index.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { apiKeyRoutes } from "./routes/api-keys.js";
import { adminVendorRoutes } from "./routes/admin/vendors.js";
import { adminModelRoutes } from "./routes/admin/models.js";
import { adminVendorModelRoutes } from "./routes/admin/vendor-models.js";
import { proxyRoutes } from "./routes/proxy.js";
import { rechargeRoutes } from "./routes/recharge.js";
import { modelListRoutes } from "./routes/models.js";
import { logRoutes } from "./routes/logs.js";
import { adminUserRoutes } from "./routes/admin/users.js";
import { adminRechargeRoutes } from "./routes/admin/recharge-admin.js";
import { adminSystemRoutes } from "./routes/admin/system.js";
import { teamRoutes } from "./routes/team.js";
import { agentRoutes } from "./routes/agent.js";
import { adminAgentRoutes } from "./routes/admin/agents.js";
import { adminDashboardRoutes } from "./routes/admin/dashboard.js";
import { adminLogRoutes } from "./routes/admin/logs.js";
import { adminFinanceRoutes } from "./routes/admin/finance.js";
import cron from "node-cron";
import { getDb } from "./db/index.js";
import { systemConfigs } from "./db/schema.js";
import { eq } from "drizzle-orm";
import { settleCommissions } from "./services/agent-service.js";
import { realNameFileRoutes } from "./routes/real-name-file.js";
import { notificationRoutes } from "./routes/notifications.js";
import { authSecurityRoutes } from "./routes/auth-security.js";
import { adminSecurityRoutes } from "./routes/admin/security.js";
import { preferenceRoutes } from "./routes/preferences.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.log.level,
      transport: config.isDev
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
    },
  });

  // ── 允许空 body 的 application/json（DELETE 等无 body 请求可能带 Content-Type）──
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
    if (body && body.length > 0) {
      try {
        done(null, JSON.parse(body.toString()));
      } catch (err: any) {
        done(err, undefined);
      }
    } else {
      done(null, {});
    }
  });

  // ── CORS ──
  await app.register(import("@fastify/cors"), {
    origin: config.cors.origin,
    credentials: true,
  });

  // ── Multipart 文件上传支持 ──
  await app.register(import("@fastify/multipart"), {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB，由业务层二次校验
      files: 1,
    },
  });

  // ── 健康检查 ──
  await app.register(healthRoutes, { prefix: "" });

  // ── 钩子：请求日志 ──
  app.addHook("onRequest", async (request) => {
    request.log.info({ url: request.url, method: request.method }, "incoming request");
  });

  // ── Auth 路由 ──
  await app.register(authRoutes, { prefix: "" });

  // ── API Key 管理 ──
  await app.register(apiKeyRoutes, { prefix: "" });

  // ── 厂商管理 ──
  await app.register(adminVendorRoutes, { prefix: "" });

  // ── 模型管理 ──
  await app.register(adminModelRoutes, { prefix: "" });

  // ── 厂商-模型关联管理 ──
  await app.register(adminVendorModelRoutes, { prefix: "" });

  // ── 公共模型列表 ──
  await app.register(modelListRoutes, { prefix: "" });

  // ── 调用日志 ──
  await app.register(logRoutes, { prefix: "" });

  // ── 充值系统 ──
  await app.register(rechargeRoutes, { prefix: "" });

  // ── Admin 用户管理 ──
  await app.register(adminUserRoutes, { prefix: "" });

  // ── Admin 充值审核 ──
  await app.register(adminRechargeRoutes, { prefix: "" });

  // ── Admin 系统配置 ──
  await app.register(adminSystemRoutes, { prefix: "" });

  // ── Admin 实名文件查看 ──
  await app.register(realNameFileRoutes, { prefix: "" });

  // ── 通知中心（站内信） ──
  await app.register(notificationRoutes, { prefix: "" });

  // ── 用户端安全 ──
  await app.register(authSecurityRoutes, { prefix: "" });

  // ── Admin 安全风控 ──
  await app.register(adminSecurityRoutes, { prefix: "" });

  // ── 用户偏好（筛选条件持久化）──
  await app.register(preferenceRoutes, { prefix: "" });

  // ── 团队管理 ──
  await app.register(teamRoutes, { prefix: "" });

  // ── 代理商 ──
  await app.register(agentRoutes, { prefix: "" });

  // ── Admin 代理商管理 ──
  await app.register(adminAgentRoutes, { prefix: "" });

  // ── Admin Dashboard ──
  await app.register(adminDashboardRoutes, { prefix: "" });

  // ── Admin 调用日志 ──
  await app.register(adminLogRoutes, { prefix: "" });

  // ── Admin 财务管理 ──
  await app.register(adminFinanceRoutes, { prefix: "" });

  // ── Token 代理 ──
  await app.register(proxyRoutes, { prefix: "" });

  // ══════════════════════════════════════════════
  //  Commission auto-settlement (by config)
  // ══════════════════════════════════════════════

  async function tryAutoSettle() {
    try {
      const db = getDb();
      const [config] = await db
        .select()
        .from(systemConfigs)
        .where(eq(systemConfigs.key, "commission_settle_mode"))
        .limit(1);
      if (config?.value === "auto") {
        const count = await settleCommissions();
        console.log(`[Cron] Auto-settlement completed: ${count} commissions settled`);
      }
    } catch (err) {
      console.error("[Cron] Auto-settlement error:", err);
    }
  }

  // Schedule: read settle hour from config, default 3 AM
  const settleHour = parseInt(process.env.COMMISSION_SETTLE_HOUR || "3", 10);
  cron.schedule(`0 ${settleHour} * * *`, tryAutoSettle);
  console.log(`[Cron] Commission auto-settlement scheduled: daily at ${settleHour}:00`);

  return app;
}

export async function startServer() {
  const app = await buildApp();

  // 初始化数据库
  createDb();
  createRedis();

  // 启动
  try {
    await app.listen({ port: config.server.port, host: config.server.host });
    console.log(`\n  🚀 3cloud API 已启动`);
    console.log(`  📡 http://${config.server.host}:${config.server.port}`);
    console.log(`  🏥 http://localhost:${config.server.port}/health`);
    console.log(`  ✅ http://localhost:${config.server.port}/ready\n`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // 优雅关闭
  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down...`);
    await app.close();
    await closeDb();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
