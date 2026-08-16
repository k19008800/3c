import fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { db } from './db';
import { loadEnv, type Env } from './lib/env';
import { healthRoutes } from './routes/health';
import { chatRoutes } from './routes/chat';
import { openaiCompatRoutes } from './routes/openai-compat';
import { authRoutes } from './routes/auth';
import { oauthRoutes } from './routes/oauth';
import { twoFactorRoutes } from './routes/2fa';
import { apiKeyRoutes } from './routes/apikeys';
import { supplierRoutes } from './routes/suppliers';
import { adminCustomerRoutes } from './routes/admin-customers';
import { adminCreditRoutes } from './routes/admin-credit';
import { adminRealNameRoutes } from './routes/admin-real-name';
import { adminSettingsRoutes } from './routes/admin-settings';
import { adminOpsRoutes } from './routes/admin-ops';
import { financeDashboardRoutes } from './routes/admin-finance';
import { adminDashboardRoutes } from './routes/admin-dashboard';
import { adminAgentRoutes } from './routes/admin-agents';
import { adminPriceChangeRoutes } from './routes/admin-price-changes';
import { adminEmailRoutes } from './routes/admin-email';
import { meRoutes } from './routes/me';
import { rechargeRoutes } from './routes/recharge';
import { publicRoutes } from './routes/public';
import { agentRoutes } from './routes/agent';
import { adminWithdrawalRoutes } from './routes/admin-withdrawals';
import { adminConversationRecordsRoutes } from './routes/admin-conversation-records';
import { adminMarketplaceRoutes } from './routes/admin-marketplace';
import { adminConsumptionRoutes } from './routes/admin-consumption';
import { adminGroupRoutes } from './routes/admin-groups';
import { startPriceNotificationScheduler } from './services/price-notification';
import { startCommissionBackfillScheduler } from './services/agent/commission-backfill';
import { startRetentionScheduler } from './services/audit/retention';
import { startModelHealthAggregator } from './services/marketplace/model-health-aggregator';
import { ensureDefaultGroup } from './services/groups';

let env: Env;

export async function buildApp(opts?: { envOverrides?: Record<string, string> }) {
  env = loadEnv(opts?.envOverrides);

  const app = fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport: env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
  });

  // Plugins
  await app.register(cors, { origin: true, credentials: true });
  await app.register(rateLimit, { max: 600, timeWindow: '1 minute' });

  // Swagger
  await app.register(swagger, {
    openapi: {
      info: { title: '3cloud API', version: '0.1.0', description: 'AI Token Aggregation Platform' },
      servers: [{ url: `http://localhost:${env.PORT}` }],
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  // Decorate with deps
  app.decorate('db', db);
  app.decorate('env', env);

  // Routes
  await app.register(healthRoutes);
  await app.register(chatRoutes);
  await app.register(openaiCompatRoutes);
  await app.register(authRoutes);
  await app.register(oauthRoutes);
  await app.register(twoFactorRoutes);
  await app.register(apiKeyRoutes);
  await app.register(supplierRoutes);
  await app.register(adminCustomerRoutes);
  await app.register(adminCreditRoutes);
  await app.register(adminRealNameRoutes);
  await app.register(adminSettingsRoutes);
  await app.register(adminOpsRoutes);
  await app.register(financeDashboardRoutes);
  await app.register(adminDashboardRoutes);
  await app.register(adminAgentRoutes);
  await app.register(adminPriceChangeRoutes);
  await app.register(adminEmailRoutes);
  await app.register(meRoutes);
  await app.register(rechargeRoutes);
  await app.register(publicRoutes);
  await app.register(agentRoutes);
  await app.register(adminWithdrawalRoutes);
  await app.register(adminConversationRecordsRoutes);
  await app.register(adminMarketplaceRoutes);
  await app.register(adminConsumptionRoutes);
  await app.register(adminGroupRoutes);

  return app;
}

export async function startApp(opts?: { envOverrides?: Record<string, string> }) {
  const app = await buildApp(opts);
  const port = env.PORT;
  const host = env.HOST;

  await app.listen({ port, host });
  app.log.info(`🚀 3cloud API running at http://${host}:${port}`);
  app.log.info(`📖 Swagger docs at http://${host}:${port}/docs`);

  // 启动时确保 default 分组存在（幂等；DB 暂不可用只告警，不阻断启动）
  try {
    await ensureDefaultGroup();
  } catch (err) {
    app.log.warn({ err }, '确保默认分组失败（服务继续启动）');
  }

  // 常驻调度器：价格变更每小时分发 + 周一 08:00 周报（UTC+8）
  startPriceNotificationScheduler(app.log);
  // 佣金回填调度器：自愈异步佣金生成遗漏
  startCommissionBackfillScheduler(app.log);
  // 对话留痕保留策略调度器：按轮询计划清理超期留痕（UTC+8）
  startRetentionScheduler(app.log);
  // 模型健康度聚合 Worker：conversation_context_records → model_health_stats 5min 桶
  startModelHealthAggregator(app.log);

  return app;
}

// Extend Fastify types
declare module 'fastify' {
  interface FastifyInstance {
    db: typeof db;
    env: Env;
  }
}
