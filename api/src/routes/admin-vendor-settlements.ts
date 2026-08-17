/**
 * 供应商结算单路由 — /api/v1/admin/vendor-settlements（P1-3）
 *
 * 占位实现：由 P1-3 子代理填充（月度结算单生成/列表/下载，对齐 SPEC §25）。
 * 路由已在 app.ts 注册（buildApp 自动挂载，测试可直接 app.inject）。
 *
 * @module routes
 * @see docs/iteration-plan-v2.md P1-3
 */

import type { FastifyInstance } from 'fastify';

export async function adminVendorSettlementsRoutes(app: FastifyInstance) {
  // P1-3 实现：
  //   POST /api/v1/admin/vendor-settlements/generate   — 月度结算单自动计算（按供应商聚合 consumption）
  //   GET  /api/v1/admin/vendor-settlements            — 结算单列表
  //   GET  /api/v1/admin/vendor-settlements/:id        — 结算单详情
  //   GET  /api/v1/admin/vendor-settlements/:id/download — 结算单下载
  //   GET  /api/v1/admin/supplier-bill-match           — 账单匹配差异标记（可并入本文件或 admin-finance）
}
