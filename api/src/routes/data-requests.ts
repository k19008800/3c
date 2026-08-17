/**
 * 数据导出流转路由 — /api/v1/me/data-export/* + /api/v1/admin/data-requests/*（P2-4）
 *
 * ⚠️ 占位文件（调度方预注册）：由 P2-4 子代理填充实现。
 *
 * 端点（对齐 SPEC-§4 数据生命周期管理 + api-contract §2.1）：
 *   用户端：
 *     POST /api/v1/me/data-export/request        — 提交导出申请
 *     GET  /api/v1/me/data-export/requests       — 我的导出申请列表
 *     GET  /api/v1/me/data-export/:id            — 申请详情 + 下载链接（file_expires_at 内）
 *     POST /api/v1/me/data-export/:id/cancel     — 撤回（pending 状态）
 *   管理端：
 *     GET  /api/v1/admin/data-requests           — 申请列表（status 筛选 + 分页）
 *     POST /api/v1/admin/data-requests/:id/approve  — 审核通过
 *     POST /api/v1/admin/data-requests/:id/reject   — 审核驳回
 *     POST /api/v1/admin/data-requests/:id/export   — 生成导出文件（写入 file_path + 过期时间）
 *
 * 表：data_requests（调度方已预置 schema + db:push）
 *
 * @module routes
 * @see docs/iteration-plan-v2.md P2-4
 */
import type { FastifyInstance } from 'fastify';

export async function dataRequestsRoutes(app: FastifyInstance) {
  // P2-4 子代理在此实现
}
