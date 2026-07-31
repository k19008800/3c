import type { FastifyInstance } from "fastify";
import { pool } from "../db/index";

/**
 * 公开数据路由（Portal 门户 SSE 拉取）
 * - GET /public/stats  平台总览统计（模型/供应商/用户）
 * - GET /public/models 模型列表（SSR 模型目录）
 */

export function publicRoutes(app: FastifyInstance) {
  app.get(
    "/public/stats",
    { schema: { tags: ["public"] } },
    async () => {
      const [models, vendors, users, tokens] = await Promise.all([
        pool.query("SELECT COUNT(*)::int AS c FROM models WHERE status='active'"),
        pool.query("SELECT COUNT(*)::int AS c FROM vendors WHERE status='active'"),
        pool.query("SELECT COUNT(*)::int AS c FROM users WHERE status='active'"),
        pool.query("SELECT COALESCE(SUM(total_tokens),0)::bigint AS t FROM call_logs"),
      ]);
      return {
        models: models.rows[0].c,
        vendors: vendors.rows[0].c,
        users: users.rows[0].c,
        totalTokens: Number(tokens.rows[0].t) || 0,
      };
    },
  );

  // 模型目录（SSR 用）
  app.get(
    "/public/models",
    { schema: { tags: ["public"] } },
    async () => {
      const rows = await pool.query(
        `SELECT m.name, m.display_name, m.category, m.context_length, m.status,
                v.name AS vendor, vm.cost_input_price, vm.cost_output_price
         FROM models m
         JOIN vendor_models vm ON vm.model_id = m.id
         JOIN vendors v ON v.id = vm.vendor_id
         WHERE m.status='active' AND vm.is_enabled=true`,
      );
      return { list: rows.rows };
    },
  );

  // 供应商健康状态（状态页用）
  app.get(
    "/public/status",
    { schema: { tags: ["public"] } },
    async () => {
      const vendors = await pool.query("SELECT id, name, status, health_score FROM vendors");
      return {
        api: { status: "operational" },
        vendors: vendors.rows.map((v: any) => ({
          name: v.name,
          status: v.status === "active" ? "operational" : "degraded",
          healthScore: v.health_score ?? 100,
        })),
      };
    },
  );
}
