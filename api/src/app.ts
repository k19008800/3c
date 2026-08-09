import fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { db } from './db';
import { loadEnv, type Env } from './lib/env';
import { healthRoutes } from './routes/health';
import { chatRoutes } from './routes/chat';
import { authRoutes } from './routes/auth';
import { apiKeyRoutes } from './routes/apikeys';
import { supplierRoutes } from './routes/suppliers';

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
  await app.register(authRoutes);
  await app.register(apiKeyRoutes);
  await app.register(supplierRoutes);

  return app;
}

export async function startApp(opts?: { envOverrides?: Record<string, string> }) {
  const app = await buildApp(opts);
  const port = env.PORT;
  const host = env.HOST;

  await app.listen({ port, host });
  app.log.info(`🚀 3cloud API running at http://${host}:${port}`);
  app.log.info(`📖 Swagger docs at http://${host}:${port}/docs`);

  return app;
}

// Extend Fastify types
declare module 'fastify' {
  interface FastifyInstance {
    db: typeof db;
    env: Env;
  }
}
