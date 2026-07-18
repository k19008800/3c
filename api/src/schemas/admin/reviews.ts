// ============================================================
//  3cloud (3C) — Admin Real-name Review Zod Schemas
// ============================================================

import { z } from "zod";

export const adminRealNameReviewListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(["pending_review", "approved", "rejected"]).optional(),
  keyword: z.string().max(100).optional(),
});
export type AdminRealNameReviewListQuery = z.infer<typeof adminRealNameReviewListQuerySchema>;

export const adminRealNameReviewActionSchema = z.object({
  reviewId: z.number().int().positive().optional(), // 指定 history id；不传则审核最新
  action: z.enum(["approve", "reject"]),
  rejectReason: z.string().max(500).optional(),
});
export type AdminRealNameReviewActionInput = z.infer<typeof adminRealNameReviewActionSchema>;

export const adminManualRealNameSchema = z.object({
  action: z.enum(["approve", "reject"]),
  realName: z.string().min(1).max(100).optional(),
  idNumber: z.string().min(1).max(30).optional(),
  companyName: z.string().min(1).max(255).optional(),
  rejectReason: z.string().max(500).optional(),
});
export type AdminManualRealNameInput = z.infer<typeof adminManualRealNameSchema>;

export interface RealNameReviewRecord {
  id: number;
  userId: number;
  email: string;
  version: number;
  realName: string | null;
  idNumber: string | null;
  idFrontImage: string | null;
  idBackImage: string | null;
  companyName: string | null;
  companyRegNumber: string | null;
  businessLicense: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankAddress: string | null;
  invoiceTitle: string | null;
  invoiceTaxId: string | null;
  status: string;
  reviewerId: number | null;
  rejectReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
}
