// ============================================================
//  3cloud (3C) — Fastify Plugin: DB & Redis Decorate
//  将 db 和 redis 实例装饰到 FastifyInstance 上
// ============================================================

import { FastifyInstance } from "fastify";
import { getDb } from "../db/index.js";
import { getRedis } from "../redis.js";

declare module "fastify" {
  interface FastifyInstance {
    db: ReturnType<typeof getDb>;
    redis: ReturnType<typeof getRedis>;
  }
}

export async function dbPlugin(fastify: FastifyInstance) {
  fastify.decorate("db", getDb());
  fastify.decorate("redis", getRedis());
}

export default dbPlugin;
