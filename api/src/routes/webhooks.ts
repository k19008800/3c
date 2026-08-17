/**
 * 用户端 Webhook 路由 — /api/v1/me/webhooks（P1-1）
 *
 * 占位实现：由 P1-1 子代理填充（CRUD + regenerate-secret + test 投递）。
 * 路由已在 app.ts 注册（buildApp 自动挂载，测试可直接 app.inject）。
 *
 * @module routes
 * @see docs/iteration-plan-v2.md P1-1
 */

import type { FastifyInstance } from 'fastify';

export async function webhooksRoutes(app: FastifyInstance) {
  // P1-1 实现：
  //   GET    /api/v1/me/webhooks                     — Webhook 列表
  //   POST   /api/v1/me/webhooks                     — 创建（自动生成 secret，仅返回一次）
  //   PUT    /api/v1/me/webhooks/:id                 — 更新
  //   DELETE /api/v1/me/webhooks/:id                 — 删除
  //   POST   /api/v1/me/webhooks/:id/regenerate-secret — 重置密钥
  //   POST   /api/v1/me/webhooks/:id/test            — 测试投递（可选）
}
