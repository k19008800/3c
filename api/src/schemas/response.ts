// ============================================================
//  3cloud (3C) — Common Response Wrappers
// ============================================================

import { z } from "zod";

export function successResponse<T extends z.ZodType>(dataSchema: T) {
  return z.object({
    code: z.literal(0),
    data: dataSchema,
    message: z.literal("ok"),
  });
}

export function paginatedResponse<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    code: z.literal(0),
    data: z.object({
      list: z.array(itemSchema),
      total: z.number(),
      page: z.number(),
      pageSize: z.number(),
    }),
    message: z.literal("ok"),
  });
}

export const errorResponse = z.object({
  code: z.number(),
  data: z.null(),
  message: z.string(),
});
