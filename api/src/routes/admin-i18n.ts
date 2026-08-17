/**
 * 管理端 i18n 路由 — /api/v1/admin/i18n/entries（P2-3）
 *
 * ⚠️ 占位文件（调度方预注册）：由 P2-3 子代理填充实现。
 *
 * 端点（对齐 SPEC-§23 §23.4）：
 *   GET  /api/v1/admin/i18n/entries        — 条目列表（key/lang/scope/status 筛选 + 分页）
 *   POST /api/v1/admin/i18n/entries        — 新增（同 key+lang 冲突返回已存在）
 *   PUT  /api/v1/admin/i18n/entries/:id    — 更新 value/status
 *   DELETE /api/v1/admin/i18n/entries/:id  — 删除（或软删 status=disabled）
 *   POST /api/v1/admin/i18n/entries/import — 批量导入（JSON：{key: {lang: value}}）
 *
 * 表：i18n_entries（调度方已预置 schema + db:push）
 *
 * @module routes
 * @see docs/SPEC-§23-系统级能力增强.md §23.4
 * @see docs/iteration-plan-v2.md P2-3
 */
import type { FastifyInstance } from 'fastify';

export async function adminI18nRoutes(app: FastifyInstance) {
  // P2-3 子代理在此实现
}
