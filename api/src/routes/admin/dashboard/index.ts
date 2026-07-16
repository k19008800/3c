// ============================================================
//  3cloud (3C) — Admin Dashboard 路由入口
//  注册所有 dashboard 子路由
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT } from "../../../middleware/auth.js";
import { statsRoutes } from "./stats.js";
import { recentActivityRoutes } from "./recent-activity.js";
import { healthRoutes } from "./health.js";
import { trendsRoutes } from "./trends.js";
import { revenueRoutes } from "./revenue.js";
import { topConsumersRoutes } from "./top-consumers.js";
import { todoQueueRoutes } from "./todo-queue.js";
import { enterpriseRoutes } from "./enterprise.js";
import { schedulingRoutes } from "./scheduling.js";
import { dashboardSummaryRoutes } from "./summaries.js";

export async function adminDashboardRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  await statsRoutes(app);
  await recentActivityRoutes(app);
  await healthRoutes(app);
  await trendsRoutes(app);
  await revenueRoutes(app);
  await topConsumersRoutes(app);
  await todoQueueRoutes(app);
  await enterpriseRoutes(app);
  await schedulingRoutes(app);
  await dashboardSummaryRoutes(app);
}
