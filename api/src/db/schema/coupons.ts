import { pgTable, serial, varchar, timestamp, integer, numeric, boolean } from 'drizzle-orm/pg-core';

export const couponCodes = pgTable('coupon_codes', {
  id: serial('id').primaryKey(),
  batchCode: varchar('batch_code', { length: 50 }).notNull(),
  batchName: varchar('batch_name', { length: 200 }),
  couponType: varchar('coupon_type', { length: 30 }).notNull().default('fixed_amount'),
  faceValue: numeric('face_value', { precision: 18, scale: 2 }).notNull(),
  minRechargeAmount: numeric('min_recharge_amount', { precision: 18, scale: 2 }),
  totalCount: integer('total_count').notNull().default(0),
  usedCount: integer('used_count').notNull().default(0),
  maxPerUser: integer('max_per_user').default(1),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  validFrom: timestamp('valid_from'),
  validTo: timestamp('valid_to'),
  createdBy: integer('created_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const campaignCouponCodes = pgTable('campaign_coupon_codes', {
  id: serial('id').primaryKey(),
  campaignId: integer('campaign_id').notNull(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  status: varchar('status', { length: 20 }).notNull().default('unused'),
  usedBy: integer('used_by'),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
