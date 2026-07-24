// ============================================================
//  3cloud (3C) — Application Entry
//  Creates Fastify instance, registers plugins/routes/cron.
// ============================================================

import Fastify from "fastify";
import cron from "node-cron";
import { eq, sql, lt } from "drizzle-orm";
import { config } from "../config.js";
import { createDb, closeDb, getDb } from "../db/index.js";
import { createRedis } from "../redis.js";
import { systemConfigs, auditLogs } from "../db/schema.js";
import { settleCommissions } from "../services/agent-settlement.js";
import { computeDailyReconSummary, computeDailyCommissionRollup } from "../services/agent-finance.js";
import { scheduleAutoSettle } from "../cron/auto-settle.js";
import { registerRedemptionScheduler } from "../services/redemption-scheduler.js";
import { setupErrorHandler } from "./error-handler.js";
import { registerPlugins } from "./plugins.js";
import { registerRoutes } from "./routes.js";

// ══════════════════════════════════════════════
//  buildApp — 构建 Fastify 实例
// ══════════════════════════════════════════════

export async function buildApp() {
  const app = Fastify({
    trustProxy: true,
    logger: {
      level: config.log.level,
      transport: config.isDev
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
    },
  });

  // ── 全局错误处理（在所有路由之前注册）──
  setupErrorHandler(app);

  // ── 插件 & 中间件 ──
  await registerPlugins(app);

  // ── 健康检查（优先于业务路由）──
  const { healthRoutes } = await import("../routes/health.js");
  await app.register(healthRoutes, { prefix: "" });

  // ── 所有路由 ──
  await registerRoutes(app);

  // ══════════════════════════════════════════════
  //  安全配置检查
  // ══════════════════════════════════════════════

  checkSecurityConfig(app);

  // ══════════════════════════════════════════════
  //  定时任务（Cron）
  // ══════════════════════════════════════════════

  registerCronJobs(app);

  return app;
}

// ══════════════════════════════════════════════
//  Security Config Checks
// ══════════════════════════════════════════════

function checkSecurityConfig(app: Fastify.FastifyInstance) {
  const requiredSecrets = [
    { key: "JWT_ACCESS_SECRET", value: config.jwt.accessSecret, devDefault: "dev-access-secret" },
    { key: "JWT_REFRESH_SECRET", value: config.jwt.refreshSecret, devDefault: "dev-refresh-secret" },
    { key: "VENDOR_KEY_ENCRYPTION_KEY", value: config.vendorKeyEncryption.key, devDefault: "" },
  ];

  for (const s of requiredSecrets) {
    if (s.value === s.devDefault || !s.value) {
      const message = `⚠️ 安全配置警告: ${s.key} 使用默认值，请设置环境变量`;
      if (config.isProd) {
        throw new Error(message);
      }
      app.log.warn(message);
    }
  }
}

// ══════════════════════════════════════════════
//  Cron Jobs
// ══════════════════════════════════════════════

// 定时器句柄集合（用于优雅关闭）
const timerHandles: { intervals: NodeJS.Timeout[]; timeouts: NodeJS.Timeout[] } = {
  intervals: [],
  timeouts: [],
};

function registerCronJobs(app: Fastify.FastifyInstance) {
  // ── Commission auto-settlement (by config) ──
  async function tryAutoSettle() {
    try {
      const db = getDb();
      const [cfg] = await db
        .select()
        .from(systemConfigs)
        .where(eq(systemConfigs.key, "commission_settle_mode"))
        .limit(1);
      if (cfg?.value === "auto") {
        const count = await settleCommissions();
        app.log.info(`[Cron] Auto-settlement completed: ${count} commissions settled`);
      }
    } catch (err) {
      app.log.error({ err }, "[Cron] Auto-settlement error");
    }
  }
  const settleHour = parseInt(process.env.COMMISSION_SETTLE_HOUR || "3", 10);
  cron.schedule(`0 ${settleHour} * * *`, tryAutoSettle);
  app.log.info(`[Cron] Commission auto-settlement scheduled: daily at ${settleHour}:00`);

  // ── 对账自动化 (03:00) ──
  import("../cron/daily-recon.js").then(({ scheduleDailyRecon }) => {
    scheduleDailyRecon();
  }).catch((err) => {
    app.log.error({ err }, "[App] 加载对账自动化失败");
  });

  // ── Settlement cycle auto-settlement (02:00 + 14:00) ──
  scheduleAutoSettle();

  // ── Daily reconciliation pre-computation (04:00) ──
  cron.schedule("0 4 * * *", async () => {
    try {
      const count = await computeDailyReconSummary();
      app.log.info(`[Cron] Daily recon summary computed: ${count} records aggregated`);
    } catch (err) {
      app.log.error({ err }, "[Cron] Daily recon summary error");
    }
  });
  app.log.info("[Cron] Daily recon summary scheduled: daily at 4:00");

  // ── Daily security summary email (09:00) ──
  cron.schedule("0 9 * * *", async () => {
    try {
      const { sendDailySecuritySummary } = await import("../services/daily-summary.js");
      const result = await sendDailySecuritySummary();
      if (result) {
        app.log.info("[Cron] Daily security summary sent successfully");
      }
    } catch (err) {
      app.log.error({ err }, "[Cron] Daily security summary error");
    }
  });
  app.log.info("[Cron] Daily security summary scheduled: daily at 9:00");

  // ── 佣金日汇总聚合（00:30 每天）──
  cron.schedule("30 0 * * *", async () => {
    try {
      const count = await computeDailyCommissionRollup();
      app.log.info(`[Cron] Commission daily rollup computed: ${count} agents`);
    } catch (err) {
      app.log.error({ err }, "[Cron] Commission daily rollup error");
    }
  });
  app.log.info("[Cron] Commission daily rollup scheduled: daily at 00:30");

  // ── Audit log archival: purge logs older than 90 days (02:00 daily) ──
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
        app.log.info(`[Cron] Audit log archival: purged ${result.length} records older than 90 days`);
      }
    } catch (err) {
      app.log.error({ err }, "[Cron] Audit log archival error");
    }
  });
  app.log.info("[Cron] Audit log archival scheduled: daily at 02:00 (purge >90d)");

  // ── 分区表自动清理（03:30 每天）──
  cron.schedule("30 3 * * *", async () => {
    try {
      const { cleanupOldPartitions } = await import("../cron/partition-cleanup.js");
      await cleanupOldPartitions();
      app.log.info("[Cron] Partition cleanup completed");
    } catch (err) {
      app.log.error({ err }, "[Cron] Partition cleanup error");
    }
  });
  app.log.info("[Cron] Partition cleanup scheduled: daily at 03:30");

  // ── 兑换码过期检查（每小时）──
  const codeExpiryTimeout = setTimeout(async () => {
    const { runCodeExpiryCheck } = await import("../cron/code-expiry.js");
    await runCodeExpiryCheck();
  }, 30_000);
  timerHandles.timeouts.push(codeExpiryTimeout);

  const codeExpiryInterval = setInterval(async () => {
    const { runCodeExpiryCheck } = await import("../cron/code-expiry.js");
    await runCodeExpiryCheck();
  }, 60 * 60 * 1000);
  timerHandles.intervals.push(codeExpiryInterval);
  app.log.info("[Cron] Code expiry check scheduled: every 1 hour, first run in 30s");

  // ── 安全自动规则检查（每 60 秒）──
  import("../cron/auto-rule-check.js").then(({ scheduleAutoRuleCheck }) => {
    scheduleAutoRuleCheck();
  }).catch((err) => {
    app.log.error({ err }, "[App] 加载安全自动规则检查失败");
  });

  // ── 月度额度重置（每月 1 日 00:05）──
  cron.schedule("5 0 1 * *", async () => {
    try {
      const { resetMonthlyQuotas } = await import("../cron/quota-reset.js");
      const result = await resetMonthlyQuotas();
      app.log.info(`[Cron] Monthly quota reset: ${result.userQuotas} user quotas, ${result.keyQuotas} key quotas reset`);
    } catch (err) {
      app.log.error({ err }, "[Cron] Monthly quota reset error");
    }
  });
  app.log.info("[Cron] Monthly quota reset scheduled: 1st day of month at 00:05");
}

// ══════════════════════════════════════════════
//  Partition Checks
// ══════════════════════════════════════════════

async function checkCallLogsPartition(log: Fastify.FastifyBaseLogger) {
  try {
    const db = getDb();
    const result = await db.execute(
      sql`SELECT relkind FROM pg_class WHERE relname = 'call_logs'`
    );
    const isPartitioned = result?.rows?.[0]?.relkind === "p";
    if (!isPartitioned) {
      log.warn("⚠️ call_logs 表不是分区表！大数据量下性能会严重下降");
      log.warn("   执行: npx tsx src/db/migrations/setup-call-logs-partitions.ts");
    } else {
      log.info("✅ call_logs 表已启用分区");
    }
  } catch (err) {
    log.warn({ err }, "[Partition] call_logs 分区检查失败");
  }
}

async function checkCommissionLogsPartition(log: Fastify.FastifyBaseLogger) {
  try {
    const db = getDb();
    const result = await db.execute(
      sql`SELECT relkind FROM pg_class WHERE relname = 'commission_logs'`
    );
    const isPartitioned = result?.rows?.[0]?.relkind === "p";
    if (!isPartitioned) {
      log.warn("⚠️ commission_logs 表不是分区表！大数据量下性能会严重下降");
      log.warn("   执行: npx tsx src/db/migrations/setup-commission-logs-partitions.ts");
    } else {
      log.info("✅ commission_logs 表已启用分区");
    }
  } catch (err) {
    log.warn({ err }, "[Partition] commission_logs 分区检查失败");
  }
}

// ══════════════════════════════════════════════
//  startServer — 启动服务器
// ══════════════════════════════════════════════

// ── Windows 控制台 UTF-8 编码 ──
if (process.platform === "win32") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("child_process").execSync("chcp 65001 >NUL", { stdio: "pipe" });
  } catch {
    // ignore
  }
}

export async function startServer() {
  // 初始化数据库（必须在 buildApp 之前，因为 dbPlugin 需要 db 实例）
  createDb();
  createRedis();

  const app = await buildApp();

  // 检测分区表
  await checkCallLogsPartition(app.log);
  await checkCommissionLogsPartition(app.log);

  // ── 兑换码批次过期提醒调度器 ──
  registerRedemptionScheduler(app);

  // 启动
  try {
    await app.listen({ port: config.server.port, host: config.server.host });
    app.log.info(`\n  🚀 3cloud API 已启动`);
    app.log.info(`  📡 http://${config.server.host}:${config.server.port}`);
    app.log.info(`  🏥 http://localhost:${config.server.port}/health`);
    app.log.info(`  ✅ http://localhost:${config.server.port}/ready\n`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // 优雅关闭
  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down...`);
    
    // 清理定时器
    for (const handle of timerHandles.timeouts) {
      clearTimeout(handle);
    }
    for (const handle of timerHandles.intervals) {
      clearInterval(handle);
    }
    app.log.info(`Cleared ${timerHandles.timeouts.length} timeouts, ${timerHandles.intervals.length} intervals`);
    
    await app.close();
    await closeDb();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
