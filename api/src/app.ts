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
import { adminReviewRoutes } from "./routes/admin/reviews.js";
import { adminApiKeyRoutes as adminApiKeyMgmtRoutes } from "./routes/admin/api-keys.js";
import { adminSystemRoutes } from "./routes/admin/system.js";
import { teamRoutes } from "./routes/team.js";
import { agentRoutes } from "./routes/agent.js";
import { adminAgentRoutes } from "./routes/admin/agents.js";
import { adminDashboardRoutes } from "./routes/admin/dashboard.js";
import { adminLogRoutes } from "./routes/admin/logs.js";
import { adminFinanceRoutes } from "./routes/admin/finance.js";
import { adminAuditLogRoutes } from "./routes/admin/audit-logs.js";

import cron from "node-cron";
import { getDb } from "./db/index.js";
import { systemConfigs, auditLogs } from "./db/schema.js";
import { eq, sql, lt } from "drizzle-orm";
import { settleCommissions, computeDailyReconSummary, computeDailyCommissionRollup } from "./services/agent-service.js";
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

  // ── 允许空 body 的 application/json ──
  // ── JSON body 解析：空 body 解析为 null，无效 JSON 返回 400 ──
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
    try {
      let buf: Buffer = body as Buffer;
      // 处理 UTF-8 BOM（Windows PowerShell/curl 等工具发送时可能带 BOM）
      if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
        buf = Buffer.from(buf.buffer, buf.byteOffset + 3, buf.length - 3);
      }
      // 进一步清除遗留的 BOM 字符（某些编码转换场景）
      let raw = buf.toString("utf-8").replace(/^\uFEFF/, "").trim();
      if (raw === "") {
        done(null, null); // 空 body -> null（DELETE/GET 无 body 不报错）
        return;
      }
      done(null, JSON.parse(raw));
    } catch (err) {
      // 无效 JSON 返回 400，避免路由层访问 null.something 产生 500
      const parseErr = new Error("请求体不是有效的 JSON");
      (parseErr as any).statusCode = 400;
      (parseErr as any).validation = [{ message: "请求体 JSON 解析失败" }];
      done(parseErr, undefined);
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

  // ── Admin 实名审核 ──
  await app.register(adminReviewRoutes, { prefix: "" });

  // ── Admin API Key 管理 ──
  await app.register(adminApiKeyMgmtRoutes, { prefix: "" });

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

  // ── Admin 审计日志 ──
  await app.register(adminAuditLogRoutes, { prefix: "" });



  // ── Token 代理 ──
  await app.register(proxyRoutes, { prefix: "" });

  // ══════════════════════════════════════════════
  //  安全配置检查
  // ══════════════════════════════════════════════

  function checkSecurityConfig() {
    const requiredSecrets = [
      { key: 'JWT_ACCESS_SECRET', value: config.jwt.accessSecret, devDefault: 'dev-access-secret' },
      { key: 'JWT_REFRESH_SECRET', value: config.jwt.refreshSecret, devDefault: 'dev-refresh-secret' },
      { key: 'VENDOR_KEY_ENCRYPTION_KEY', value: config.vendorKeyEncryption.key, devDefault: '' },
    ];

    for (const s of requiredSecrets) {
      if (s.value === s.devDefault || !s.value) {
        const message = `⚠️ 安全配置警告: ${s.key} 使用默认值，请设置环境变量`;
        if (config.isProd) {
          throw new Error(message);
        }
        console.warn(message);
      }
    }
  }

  checkSecurityConfig();

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

  // ══════════════════════════════════════════════
  //  Daily reconciliation pre-computation (04:00)
  // ══════════════════════════════════════════════

  cron.schedule("0 4 * * *", async () => {
    try {
      const count = await computeDailyReconSummary();
      console.log(`[Cron] Daily recon summary computed: ${count} records aggregated`);
    } catch (err) {
      console.error("[Cron] Daily recon summary error:", err);
    }
  });
  console.log("[Cron] Daily recon summary scheduled: daily at 4:00");

  // ══════════════════════════════════════════════
  //  Daily security summary email (09:00)
  // ══════════════════════════════════════════════

  cron.schedule("0 9 * * *", async () => {
    try {
      const { sendDailySecuritySummary } = await import("./services/daily-summary.js");
      const result = await sendDailySecuritySummary();
      if (result) {
        console.log("[Cron] Daily security summary sent successfully");
      }
    } catch (err) {
      console.error("[Cron] Daily security summary error:", err);
    }
  });
  console.log("[Cron] Daily security summary scheduled: daily at 9:00");

  // ── 佣金日汇总聚合（00:30 每天）──
  cron.schedule("30 0 * * *", async () => {
    try {
      const count = await computeDailyCommissionRollup();
      console.log(`[Cron] Commission daily rollup computed: ${count} agents`);
    } catch (err) {
      console.error("[Cron] Commission daily rollup error:", err);
    }
  });
  console.log("[Cron] Commission daily rollup scheduled: daily at 00:30");

  // ══════════════════════════════════════════════
  //  Audit log archival: purge logs older than 90 days (02:00 daily)
  // ══════════════════════════════════════════════

  cron.schedule("0 2 * * *", async () => {
    try {
      const db = getDb();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);

      const result = await db
        .delete(auditLogs)
        .where(lt(auditLogs.createdAt, cutoff))
        .returning({ id: auditLogs.id });

      if (result.length > 0) {
        console.log(`[Cron] Audit log archival: purged ${result.length} records older than 90 days`);
      }
    } catch (err) {
      console.error("[Cron] Audit log archival error:", err);
    }
  });
  console.log("[Cron] Audit log archival scheduled: daily at 02:00 (purge >90d)");

  return app;
}

// ══════════════════════════════════════════════
//  call_logs 分区就绪检查
// ══════════════════════════════════════════════

async function checkCallLogsPartition() {
  try {
    const db = getDb();
    const result = await db.execute(
      sql`SELECT relkind FROM pg_class WHERE relname = 'call_logs'`
    );
    const isPartitioned = result?.rows?.[0]?.relkind === "p";
    if (!isPartitioned) {
      console.warn("⚠️ call_logs 表不是分区表！大数据量下性能会严重下降");
      console.warn("   执行: npx tsx src/db/migrations/setup-call-logs-partitions.ts");
    } else {
      console.log("✅ call_logs 表已启用分区");
    }
  } catch (err) {
    console.warn("[Partition] call_logs 分区检查失败:", err);
  }
}

/**
 * commission_logs 分区就绪检查
 */
async function checkCommissionLogsPartition() {
  try {
    const db = getDb();
    const result = await db.execute(
      sql`SELECT relkind FROM pg_class WHERE relname = 'commission_logs'`
    );
    const isPartitioned = result?.rows?.[0]?.relkind === "p";
    if (!isPartitioned) {
      console.warn("⚠️ commission_logs 表不是分区表！大数据量下性能会严重下降");
      console.warn("   执行: npx tsx src/db/migrations/setup-commission-logs-partitions.ts");
    } else {
      console.log("✅ commission_logs 表已启用分区");
    }
  } catch (err) {
    console.warn("[Partition] commission_logs 分区检查失败:", err);
  }
}

export async function startServer() {
  const app = await buildApp();

  // 初始化数据库
  createDb();
  createRedis();

  // 检测分区表
  await checkCallLogsPartition();
  await checkCommissionLogsPartition();

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
