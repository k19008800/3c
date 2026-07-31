import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import rateLimit from "@fastify/rate-limit";
import { registerRoutes } from "./routes/index";
import { errorHandler } from "./lib/error-handler";
import "dotenv/config";

/**
 * Fastify 应用装配
 */
export function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === "production" ? "info" : "debug",
    },
    trustProxy: true,
  });

  // CORS
  void app.register(cors, {
    origin: true,
    credentials: true,
  });

  // JWT
  void app.register(jwt, {
    secret: process.env.JWT_SECRET ?? "dev-secret-change-in-production",
  });

  // 限流（默认：每 IP 100 req/min）
  void app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  // Swagger（由 route JSON Schema 自动生成）
  void app.register(swagger, {
    openapi: {
      info: {
        title: "3cloud API",
        description: "3Cloud AI Token 聚合平台 API",
        version: "0.1.0",
      },
      tags: [{ name: "health" }],
    },
  });

  // Swagger UI（交互式文档界面，路径 /docs）
  void app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
    },
  });

  // 统一错误处理
  app.setErrorHandler(errorHandler);

  // 注册全部路由（唯一入口）
  registerRoutes(app);

  return app;
}
