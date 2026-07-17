// API Key 管理
// 当前用户详情路由中无独立的 API Key CRUD 路由（相关管理在用户个人路由中），
// 此处预留为后续管理员 API Key 管理功能扩展。

/**
 * API Key 计数查询已内联在 info.ts 中：
 * ```ts
 * select({ apiKeyCount: sql<number>`count(*)` }).from(apiKeys)
 * ```
 *
 * 如需添加管理员 API Key 路由，在此文件添加注册函数：
 * ```ts
 * export function registerKeyRoutes(app: FastifyInstance) { ... }
 * ```
 */
export {};
