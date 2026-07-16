// ============================================================
//  3cloud (3C) — Fastify Application
// ============================================================

import Fastify from "fastify";
import { join } from "node:path";
import { config } from "./config.js";
import { createDb, closeDb, checkDbConnection } from "./db/index.js";
import { createRedis, checkRedisConnection } from "./redis.js";
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
import { adminUserRoutes } from "./routes/admin/users/index.js";
import { adminReviewRoutes } from "./routes/admin/reviews.js";
import { adminApiKeyRoutes as adminApiKeyMgmtRoutes } from "./routes/admin/api-keys.js";
import { adminSystemRoutes } from "./routes/admin/system.js";

import { agentRoutes } from "./routes/agent/index.js";
import { adminAgentRoutes } from "./routes/admin/agents.js";
import { adminCampaignRoutes } from "./routes/admin/campaigns.js";
import { adminDashboardRoutes } from "./routes/admin/dashboard/index.js";
import { adminLogRoutes } from "./routes/admin/logs.js";
import { adminFinanceRoutes } from "./routes/admin/finance.js";
import { adminAuditLogRoutes } from "./routes/admin/audit-logs.js";
import { adminOperationLogRoutes } from "./routes/admin/operation-logs.js";
import { userOperationLogRoutes } from "./routes/operation-logs.js";
import { adminQuotaRoutes } from "./routes/admin/quotas.js";
import { adminRateLimitRoutes } from "./routes/admin/rate-limits.js";
import { adminCircuitRoutes } from "./routes/admin/circuits.js";
import { adminStatsRoutes } from "./routes/admin/stats.js";
import { adminStatsUsageRoutes } from "./routes/admin/stats-usage.js";
import { meStatsRoutes } from "./routes/stats.js";
import { statsUsageRoutes } from "./routes/stats-usage.js";
import { agentStatsUsageRoutes } from "./routes/agent/stats-usage.js";
import { redemptionRoutes } from "./routes/redemption.js";
import { redemptionGiftRoutes } from "./routes/redemption-gift.js";
import { adminAgentRedemptionRoutes } from "./routes/admin/agent-redemption.js";
import { adminRedemptionFraudRoutes } from "./routes/admin/redemption-fraud.js";
import { adminFinanceCodeRoutes } from "./routes/admin/finance/codes.js";
import { vendorSelfRoutes, vendorJWTRoutes } from "./routes/vendor-self.js";
import { adminKeyManagementRoutes } from "./routes/admin/admin-keys.js";
import { adminRoleRoutes } from "./routes/admin/roles.js";
import { authenticateAdminKey } from "./middleware/adminKeyAuth.js";
import { registerErrorHandler } from "./middleware/response.js";

import cron from "node-cron";
import { getDb } from "./db/index.js";
import { systemConfigs, auditLogs } from "./db/schema.js";
import { eq, sql, lt } from "drizzle-orm";
import { settleCommissions } from "./services/agent-settlement.js";
import { computeDailyReconSummary, computeDailyCommissionRollup } from "./services/agent-finance.js";
import { realNameFileRoutes } from "./routes/real-name-file.js";
import { notificationRoutes } from "./routes/notifications.js";
import { authSecurityRoutes } from "./routes/auth-security.js";
import { adminSecurityRoutes } from "./routes/admin/security.js";
import { scheduleAutoSettle } from "./cron/auto-settle.js";
import { registerRedemptionScheduler } from "./services/redemption-scheduler.js";
import { adminAnnouncementRoutes } from "./routes/admin/announcements.js";
import { announcementRoutes } from "./routes/announcements.js";
import { preferenceRoutes } from "./routes/preferences.js";
import { realNameOcrRoutes } from "./routes/real-name-ocr.js";
import { invoiceRoutes } from "./routes/invoices.js";
import { refundRoutes } from "./routes/refunds.js";
import { adminInvoiceRoutes } from "./routes/admin/invoices.js";
import { adminRefundRoutes } from "./routes/admin/refunds.js";
import { profitRoutes } from "./routes/admin/profit.js";
import { priceRoutes } from "./routes/admin/prices.js";
import { adminRedemptionEnhancedRoutes } from "./routes/admin/redemption-enhanced.js";
import { redemptionUserRoutes } from "./routes/redemption-user.js";
import { agentRedemptionRoutes } from "./routes/agent/redemption.js";
import { agentFinanceRoutes } from "./routes/agent/finance.js";
import { adminEmailTemplateRoutes } from "./routes/admin/email-templates.js";
import { adminPageContentRoutes } from "./routes/admin/page-contents.js";
import { adminPerfCacheStatsRoutes } from "./routes/admin/perf-stats.js";
import { adminSiteSettingsRoutes } from "./routes/admin/site-settings.js";
import { publicSiteConfigRoutes } from "./routes/public/site-config.js";
import { userTransactionRoutes } from "./routes/user-transactions.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.log.level,
      transport: config.isDev
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
    },
  });

  // ── 全局错误处理（在所有路由之前注册）──
  registerErrorHandler(app);

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

  // ── DB & Redis Decorate ──
  const { default: dbPlugin } = await import("./plugins/db.js");
  await app.register(dbPlugin, {});

  // ── 静态文件服务（用于上传图片访问）──
  await app.register(import("@fastify/static"), {
    root: join(import.meta.dirname, "../public"),
    prefix: "/",
    decorateReply: false,
    wildcard: true,
  });

  // ── 健康检查 ──
  await app.register(healthRoutes, { prefix: "" });

  // ── 钩子：请求日志 ──
  app.addHook("onRequest", async (request) => {
    request.log.info({ url: request.url, method: request.method }, "incoming request");
  });

  // ── 管理 API Key 全局鉴权（优先于 JWT）──
  // 如果 X-Admin-Key 存在则跳过 JWT，否则降级到 JWT
  app.addHook("onRequest", authenticateAdminKey);

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

  // ── OCR 证件识别 ──
  await app.register(realNameOcrRoutes, { prefix: "" });

  // ── 用户端安全 ──
  await app.register(authSecurityRoutes, { prefix: "" });

  // ── Admin 公告管理 ──
  await app.register(adminAnnouncementRoutes, { prefix: "" });

  // ── 用户端公告 ──
  await app.register(announcementRoutes, { prefix: "" });

  // ── 发票管理（用户端）──
  await app.register(invoiceRoutes, { prefix: "" });

  // ── 退款申请（用户端）──
  await app.register(refundRoutes, { prefix: "" });

  // ── Admin 安全风控 ──
  await app.register(adminSecurityRoutes, { prefix: "" });

  // ── 用户偏好（筛选条件持久化）──
  await app.register(preferenceRoutes, { prefix: "" });

  // ── 代理商 ──
  await app.register(agentRoutes, { prefix: "" });

  // ── Admin 代理商管理 ──
  await app.register(adminAgentRoutes, { prefix: "" });

  // ── Admin 营销活动管理 ──
  await app.register(adminCampaignRoutes, { prefix: "" });

  // ── Admin Dashboard ──
  await app.register(adminDashboardRoutes, { prefix: "" });

  // ── Admin 调用日志 ──
  await app.register(adminLogRoutes, { prefix: "" });

  // ── Admin 财务管理 ──
  await app.register(adminFinanceRoutes, { prefix: "" });

  // ── Admin 财务成本核算 ──
  await app.register(adminFinanceCodeRoutes, { prefix: "" });

  // ── Admin 利润分析 ──
  await app.register(profitRoutes, { prefix: "" });

  // ── Admin 价格管理 ──
  await app.register(priceRoutes, { prefix: "" });

  // ── Admin 发票管理 ──
  await app.register(adminInvoiceRoutes, { prefix: "" });

  // ── Admin 退款管理 ──
  await app.register(adminRefundRoutes, { prefix: "" });

  // ── Admin 审计日志 ──
  await app.register(adminAuditLogRoutes, { prefix: "" });

  // ── 操作日志（用户端 + 管理端）──
  await app.register(userOperationLogRoutes, { prefix: "" });
  await app.register(adminOperationLogRoutes, { prefix: "" });

  // ── 管理 API Key 管理（admin_api_keys 表）──
  await app.register(adminKeyManagementRoutes, { prefix: "" });

  // ── 角色权限管理 ──
  await app.register(adminRoleRoutes, { prefix: "" });

  // ── 兑换码系统 ──
  await app.register(redemptionRoutes, { prefix: "" });

  // ── 用户端兑换码增强（未激活权益/活动列表）──
  await app.register(redemptionUserRoutes, { prefix: "" });

  // ── 兑换码转赠 ──
  await app.register(redemptionGiftRoutes, { prefix: "" });

  // ── Admin 代理钻取管理（兑换码）──
  await app.register(adminAgentRedemptionRoutes, { prefix: "" });

  // ── Admin 兑换码风控管理 ──
  await app.register(adminRedemptionFraudRoutes, { prefix: "" });

  // ── Admin 兑换码增强（批量操作/导出/风控/审计/报表）──
  await app.register(adminRedemptionEnhancedRoutes, { prefix: "" });

  // ── 供应商自助管理 ──
  await app.register(vendorSelfRoutes, { prefix: "" });

  // ── 供应商自助管理（JWT 鉴权，供门户使用）──
  await app.register(vendorJWTRoutes, { prefix: "" });

  // ── Admin 额度管理 ──
  await app.register(adminQuotaRoutes, { prefix: "" });

  // ── Admin TPM/RPM 限流管理 ──
  await app.register(adminRateLimitRoutes, { prefix: "" });

  // ── Admin 熔断器管理 ──
  await app.register(adminCircuitRoutes, { prefix: "" });

  // ── Admin 聚合统计 ──
  await app.register(adminStatsRoutes, { prefix: "" });

  // ── Admin 用量聚合统计（V2.0 新增）──
  await app.register(adminStatsUsageRoutes, { prefix: "" });

  // ── 用户端统计 & 额度 ──
  await app.register(meStatsRoutes, { prefix: "" });

  // ── 用户端用量聚合统计（V2.0 新增）──
  await app.register(statsUsageRoutes, { prefix: "" });

  // ── 代理端用量聚合统计（V2.0 新增）──
  await app.register(agentStatsUsageRoutes, { prefix: "" });

  // ── 代理端兑换码增强（模板/批量操作/导出/成本分析）──
  await app.register(agentRedemptionRoutes, { prefix: "" });

  // ── 代理端财务（结算单/资金流水）──
  await app.register(agentFinanceRoutes, { prefix: "" });

  // ── Admin 邮件模板管理 ──
  await app.register(adminEmailTemplateRoutes, { prefix: "" });

  // ── Admin 页面内容管理 ──
  await app.register(adminPageContentRoutes, { prefix: "" });

  // ── Admin 性能缓存统计 ──
  await app.register(adminPerfCacheStatsRoutes, { prefix: "" });

  // ── Admin 站点基础信息 ──
  await app.register(adminSiteSettingsRoutes, { prefix: "" });

  // ── 公开站点配置（免认证）──
  await app.register(publicSiteConfigRoutes, { prefix: "" });

  // ── Token 代理 ──
  await app.register(userTransactionRoutes, { prefix: "" });

    // -- Token 代理 --
  await app.register(proxyRoutes, { prefix: "" });

  // ── WebSocket 限流水位 ──
  const { rateLimitWsRoutes } = await import("./routes/rate-limit-ws.js");
  await app.register(rateLimitWsRoutes, { prefix: "" });

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
        app.log.warn(message);
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
        app.log.info(`[Cron] Auto-settlement completed: ${count} commissions settled`);
      }
    } catch (err) {
      app.log.error({ err }, "[Cron] Auto-settlement error");
    }
  }

  // Schedule: read settle hour from config, default 3 AM
  const settleHour = parseInt(process.env.COMMISSION_SETTLE_HOUR || "3", 10);
  cron.schedule(`0 ${settleHour} * * *`, tryAutoSettle);
  app.log.info(`[Cron] Commission auto-settlement scheduled: daily at ${settleHour}:00`);

  // ══════════════════════════════════════════════
  //  对账自动化 (03:00)
  // ══════════════════════════════════════════════

  import('./cron/daily-recon.js').then(({ scheduleDailyRecon }) => {
    scheduleDailyRecon();
  }).catch((err) => {
    app.log.error({ err }, '[App] 加载对账自动化失败');
  });

  // ══════════════════════════════════════════════
  //  Settlement cycle auto-settlement (02:00 + 14:00)
  // ══════════════════════════════════════════════

  scheduleAutoSettle();

  // ══════════════════════════════════════════════
  //  Daily reconciliation pre-computation (04:00)
  // ══════════════════════════════════════════════

  cron.schedule("0 4 * * *", async () => {
    try {
      const count = await computeDailyReconSummary();
      app.log.info(`[Cron] Daily recon summary computed: ${count} records aggregated`);
    } catch (err) {
      app.log.error({ err }, "[Cron] Daily recon summary error");
    }
  });
  app.log.info("[Cron] Daily recon summary scheduled: daily at 4:00");

  // ══════════════════════════════════════════════
  //  Daily security summary email (09:00)
  // ══════════════════════════════════════════════

  cron.schedule("0 9 * * *", async () => {
    try {
      const { sendDailySecuritySummary } = await import("./services/daily-summary.js");
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
        app.log.info(`[Cron] Audit log archival: purged ${result.length} records older than 90 days`);
      }
    } catch (err) {
      app.log.error({ err }, "[Cron] Audit log archival error");
    }
  });
  app.log.info("[Cron] Audit log archival scheduled: daily at 02:00 (purge >90d)");

  // ══════════════════════════════════════════════
  //  兑换码过期检查（每小时）
  // ══════════════════════════════════════════════

  // 立即延迟 30 秒执行一次（冷启动后快速清理已过期数据）
  setTimeout(async () => {
    const { runCodeExpiryCheck } = await import("./cron/code-expiry.js");
    await runCodeExpiryCheck();
  }, 30_000);

  // 每小时执行一次
  setInterval(async () => {
    const { runCodeExpiryCheck } = await import("./cron/code-expiry.js");
    await runCodeExpiryCheck();
  }, 60 * 60 * 1000);

  app.log.info("[Cron] Code expiry check scheduled: every 1 hour, first run in 30s");

  // ══════════════════════════════════════════════
  //  安全自动规则检查（每 60 秒）
  // ══════════════════════════════════════════════

  import('./cron/auto-rule-check.js').then(({ scheduleAutoRuleCheck }) => {
    scheduleAutoRuleCheck();
  }).catch((err) => {
    app.log.error({ err }, '[App] 加载安全自动规则检查失败');
  });

  // ══════════════════════════════════════════════
  //  月度额度重置（每月 1 日 00:05）
  // ══════════════════════════════════════════════

  cron.schedule("5 0 1 * *", async () => {
    try {
      const { resetMonthlyQuotas } = await import("./cron/quota-reset.js");
      const result = await resetMonthlyQuotas();
      app.log.info(`[Cron] Monthly quota reset: ${result.userQuotas} user quotas, ${result.keyQuotas} key quotas reset`);
    } catch (err) {
      app.log.error({ err }, "[Cron] Monthly quota reset error");
    }
  });
  app.log.info("[Cron] Monthly quota reset scheduled: 1st day of month at 00:05");

  return app;
}

// ══════════════════════════════════════════════
//  call_logs 分区就绪检查
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

/**
 * commission_logs 分区就绪检查
 */
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

// ── Windows 控制台 UTF-8 编码（防止中文/emoji 乱码）──
if (process.platform === 'win32') {
  try {
    require('child_process').execSync('chcp 65001 >NUL', { stdio: 'pipe' });
  } catch (_) {
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

  // ── 兑换码批次过期提醒调度器（必须在 listen 之前注册，避免 addHook 报错） ──
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
    await app.close();
    await closeDb();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
