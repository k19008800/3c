/**
 * Fastify 类型增强声明
 * 补充 FastifyRequest.user（由 auth 路由的 requireAuth 验证器设置）
 */
declare module "fastify" {
  interface FastifyRequest {
    /** JWT 解析后的用户信息（requireAuth 通过后可用） */
    user?: { sub: string; role?: string };
  }
}

export {};
