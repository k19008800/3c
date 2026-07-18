// ============================================================
//  3cloud (3C) — Vendor Self-Service Zod Schemas
// ============================================================

import { z } from "zod";

export const vendorRegisterSchema = z.object({
  name: z.string().min(1).max(100),
  baseUrl: z.string().url(),
  description: z.string().max(500).optional(),
  companyName: z.string().max(255).optional(),
  contactName: z.string().max(100).optional(),
  contactPhone: z.string().max(20).optional(),
  contactEmail: z.string().email().optional(),
});
export type VendorRegisterInput = z.infer<typeof vendorRegisterSchema>;

export const vendorUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  baseUrl: z.string().url().optional(),
  description: z.string().max(500).optional(),
  companyName: z.string().max(255).optional(),
  contactName: z.string().max(100).optional(),
  contactPhone: z.string().max(20).optional(),
  contactEmail: z.string().email().optional(),
});
export type VendorUpdateInput = z.infer<typeof vendorUpdateSchema>;

export const vendorAddModelSchema = z.object({
  modelId: z.number(),
  upstreamModelName: z.string().min(1).max(200),
  apiEndpoint: z.string().url().optional(),
  costPriceInput: z.string(),
  costPriceOutput: z.string(),
  sellPriceInput: z.string(),
  sellPriceOutput: z.string(),
  rpmLimit: z.number().int().positive().optional(),
  tpmLimit: z.number().int().positive().optional(),
});
export type VendorAddModelInput = z.infer<typeof vendorAddModelSchema>;

export const vendorUpdateModelSchema = z.object({
  sellPriceInput: z.string().optional(),
  sellPriceOutput: z.string().optional(),
  status: z.boolean().optional(),
});
export type VendorUpdateModelInput = z.infer<typeof vendorUpdateModelSchema>;

export const vendorRotateKeySchema = z.object({
  reason: z.string().max(500).optional(),
});
export type VendorRotateKeyInput = z.infer<typeof vendorRotateKeySchema>;
