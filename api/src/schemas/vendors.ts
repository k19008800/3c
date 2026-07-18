// ============================================================
//  3cloud (3C) — Vendor & Model Zod Schemas
// ============================================================

import { z } from "zod";

export const createVendorSchema = z.object({
  name: z.string().min(1).max(100),
  baseUrl: z.string().url(),
  description: z.string().max(500).optional(),
});
export type CreateVendorInput = z.infer<typeof createVendorSchema>;

export const updateVendorSchema = z.object({
  baseUrl: z.string().url().optional(),
  description: z.string().max(500).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

export const createModelSchema = z.object({
  name: z.string().min(1).max(100),
  displayName: z.string().max(200).optional(),
  type: z.enum(["chat", "embedding", "image", "audio", "rerank", "video", "moderation", "realtime"]),
});
export type CreateModelInput = z.infer<typeof createModelSchema>;

export const createVendorModelSchema = z.object({
  vendorId: z.number(),
  modelId: z.number(),
  upstreamModelName: z.string().min(1).max(200),
  apiEndpoint: z.string().url(),
  apiKey: z.string().min(1),                    // 明文传入，后端加密存储
  costPriceInput: z.string(),
  costPriceOutput: z.string(),
  sellPriceInput: z.string(),
  sellPriceOutput: z.string(),
  weight: z.number().int().positive().default(100),
  rpmLimit: z.number().int().positive().optional(),
  tpmLimit: z.number().int().positive().optional(),
});
export type CreateVendorModelInput = z.infer<typeof createVendorModelSchema>;

export const updateVendorModelSchema = z.object({
  upstreamModelName: z.string().max(200).optional(),
  apiEndpoint: z.string().url().optional(),
  apiKey: z.string().optional(),
  costPriceInput: z.union([z.string(), z.number()]).transform(v => String(v)).optional(),
  costPriceOutput: z.union([z.string(), z.number()]).transform(v => String(v)).optional(),
  sellPriceInput: z.union([z.string(), z.number()]).transform(v => String(v)).optional(),
  sellPriceOutput: z.union([z.string(), z.number()]).transform(v => String(v)).optional(),
  weight: z.number().int().positive().optional(),
  status: z.union([z.boolean(), z.number()]).transform(v => Boolean(v)).optional(),
});
export type UpdateVendorModelInput = z.infer<typeof updateVendorModelSchema>;
