// ============================================================
//  3cloud (3C) — Common / Pagination Zod Schemas
// ============================================================

import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const logFilterSchema = paginationSchema.extend({
  modelId: z.coerce.number().optional(),
  vendorName: z.string().optional(),
  status: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  // NEW FIELDS:
  apiKeyId: z.coerce.number().optional(),
  modelName: z.string().optional(),
  minDuration: z.coerce.number().optional(),
  maxDuration: z.coerce.number().optional(),
  minTokens: z.coerce.number().optional(),
  maxTokens: z.coerce.number().optional(),
  isStreaming: z.coerce.boolean().optional(),
  sortBy: z.enum(['createdAt', 'durationMs', 'totalTokens', 'cost']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const adminLogFilterSchema = logFilterSchema.extend({
  userId: z.coerce.number().optional(),
});
