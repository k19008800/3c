/**
 * 管理端安全路由 — /api/v1/admin/security/ip-blacklist（P2-4）
 *
 * ⚠️ 占位文件（调度方预注册）：由 P2-4 子代理填充实现。
 *
 * 端点（对齐 kb/3cloud/admin-security-ip-blacklist.md）：
 *   GET  /api/v1/admin/security/ip-blacklist            — 黑名单列表（status/scope/关键字 + 分页）
 *   POST /api/v1/admin/security/ip-blacklist            — 添加（单 IP / CIDR，唯一冲突返回已存在）
 *   POST /api/v1/admin/security/ip-blacklist/batch      — 批量导入（CSV：IP, 原因, 范围）
 *   PUT  /api/v1/admin/security/ip-blacklist/:id        — 编辑（原因/范围/过期时间）
 *   POST /api/v1/admin/security/ip-blacklist/:id/unblock — 解禁（status → unblocked）
 *
 * 网关拦截 hook 由本模块提供并在 app.ts 注册（onRequest，/v1/* 命中 403）。
 *
 * 表：ip_blacklist（调度方已预置 schema + db:push）
 *
 * @module routes
 * @see kb/3cloud/admin-security-ip-blacklist.md
 * @see docs/iteration-plan-v2.md P2-4
 */
import type { FastifyInstance } from 'fastify';

export async function adminSecurityRoutes(app: FastifyInstance) {
  // P2-4 子代理在此实现
}
