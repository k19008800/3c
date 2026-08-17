/**
 * 用户账号注销流转路由 — /api/v1/me/deletion/*（P2-4）
 *
 * ⚠️ 占位文件（调度方预注册）：由 P2-4 子代理填充实现。
 *
 * 端点（对齐 SPEC-§2 §2.11 + api-contract §2.1）：
 *   GET  /api/v1/me/deletion/checks     — 注销前置检查（余额/工单/归属客户/代理身份）
 *   POST /api/v1/me/deletion/request    — 提交注销申请（写入 deletion_requests，pending）
 *   GET  /api/v1/me/deletion/status     — 查看注销申请状态
 *   POST /api/v1/me/deletion/cancel     — 撤回申请（pending / 冷静期内 approved）
 *   GET  /api/v1/me/deletion/status     — 管理员侧由 admin-data-requests 或 admin 端点处理
 *
 * 表：deletion_requests（调度方已预置 schema + db:push）
 *
 * @module routes
 * @see docs/iteration-plan-v2.md P2-4
 */
import type { FastifyInstance } from 'fastify';

export async function deletionRoutes(app: FastifyInstance) {
  // P2-4 子代理在此实现
}
