import type { FastifyInstance } from "fastify";
import { pool } from "../db/index";

/**
 * 公开数据路由（Portal 门户 / 官网拉取）
 * - GET /public/stats       平台总览统计（模型/供应商/用户）
 * - GET /public/site-config 站点公开配置（名称/Logo/ICP/版权等）
 * - GET /public/models      模型列表（SSR 模型目录）
 * - GET /public/pricing     模型标价列表（成本×加价率）
 */

// 敏感/管理员专用 key 白名单过滤
const PUBLIC_SITE_KEYS = new Set([
  "site_name", "site_logo_url", "site_favicon_url",
  "site_icp", "site_icp_link", "site_police_icp",
  "site_copyright", "site_company_name",
  "site_contact_email", "site_contact_phone",
  "site_wechat_qr_url", "site_footer_html",
  "site_pricing_markup", "site_about_content", "site_about_milestones",
]);

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

  // 站点公开配置（官网用）
  app.get(
    "/public/site-config",
    { schema: { tags: ["public"] } },
    async () => {
      const rows = await pool.query("SELECT key, value FROM site_configs ORDER BY key");
      const config: Record<string, string> = {};
      for (const r of rows.rows) {
        if (PUBLIC_SITE_KEYS.has(r.key)) config[r.key] = r.value;
      }
      // 兜底值
      if (!config.site_name) config.site_name = "3Cloud";
      if (!config.site_copyright) config.site_copyright = `© ${new Date().getFullYear()} 3Cloud · AI Token 聚合平台`;
      return config;
    },
  );

  // 模型售出价格列表（官网定价展示：即后台配置的每个供应商-模型的售出价格）
  app.get(
    "/public/pricing",
    { schema: { tags: ["public"] } },
    async () => {
      const rows = await pool.query(
        `SELECT m.name, m.display_name, m.category, m.context_length, m.description,
                m.status,
                v.name AS vendor,
                vm.cost_input_price::float AS cost_input_price,
                vm.cost_output_price::float AS cost_output_price
         FROM models m
         JOIN vendor_models vm ON vm.model_id = m.id
         JOIN vendors v ON v.id = vm.vendor_id
         WHERE m.status='active' AND vm.is_enabled=true
         ORDER BY m.display_name, v.name`,
      );
      // vendor_models.cost_input/output_price 即后台配置的对外售出价格
      const list = rows.rows.map((r: any) => ({
        name: r.name,
        display_name: r.display_name,
        category: r.category,
        context_length: r.context_length,
        description: r.description,
        vendor: r.vendor,
        input_price: Number(r.cost_input_price ?? 0),
        output_price: Number(r.cost_output_price ?? 0),
      }));
      return { list, message: "ok" };
    },
  );

  // 供应商健康状态（状态页用）
  app.get(
    "/public/status",
    { schema: { tags: ["public"] } },
    async () => {
      const vendors = await pool.query(
        `SELECT v.id, v.name, v.status,
                COALESCE(AVG(vm.health_score), 100)::int AS health_score
         FROM vendors v
         LEFT JOIN vendor_models vm ON vm.vendor_id = v.id
         GROUP BY v.id, v.name, v.status
         ORDER BY v.name`,
      );
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
