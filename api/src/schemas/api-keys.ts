// ============================================================
//  3cloud (3C) — API Key Zod Schemas
// ============================================================

import { z } from "zod";

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  expiresAt: z.string().datetime().optional(),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export const createApiKeyResponse = z.object({
  id: z.number(),
  name: z.string(),
  key: z.string(), // 原始 Key，仅展示一次
  keyPrefix: z.string(),
  expiresAt: z.string().nullable(),
});

export const updateApiKeySchema = z.object({
  name: z.string().max(100).optional(),
  status: z.boolean().optional(),
});
export type UpdateApiKeyInput = z.infer<typeof updateApiKeySchema>;
