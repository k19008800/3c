// ============================================================
//  3cloud (3C) — 营销活动管理路由入口
//  委托子模块注册各路由，保持路径与原有接口完全一致
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT } from "../../../middleware/auth.js";
import { createCampaignRoutes } from "./create.js";
import { listCampaignRoutes } from "./list.js";
import { detailCampaignRoutes } from "./detail.js";
import { redemptionCampaignRoutes } from "./redemption.js";

// ── 完整活动管理路由注册 ──
//  注意路由注册顺序：/stats 必须在 /:id 之前注册

export async function adminCampaignRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // 创建（POST /）
  await createCampaignRoutes(app);

  // 列表 + 汇总统计（GET /, GET /stats）
  // /stats 必须在 /:id 之前
  await listCampaignRoutes(app);

  // 详情 / 编辑 / 状态变更（/:id, /:id/status）
  await detailCampaignRoutes(app);

  // 兑换码 & 佣金 & 统计（/:id/allocations, /:id/codes, /:id/commission-rule, /:id/stats）
  await redemptionCampaignRoutes(app);
}
