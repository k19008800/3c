// ============================================================
//  3cloud (3C) — 供应商自助管理共享类型
// ============================================================

import { FastifyRequest } from "fastify";

// ── Vendor auth declaration ──

declare module "fastify" {
  interface FastifyRequest {
    vendor?: {
      id: number;
      userId: number | null;
      name: string;
    };
  }
}
