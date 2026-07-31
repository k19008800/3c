import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

/**
 * Fastify 类型增强声明
 */
declare module "fastify" {
  interface FastifyInstance {
    /** JWT 验证装饰器（受保护路由 onRequest 用） */
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    /** JWT 解析后的用户信息（authenticate 通过后可用） */
    user?: { sub: string; role?: string };
  }
}

export {};
