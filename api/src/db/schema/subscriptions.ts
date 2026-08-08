import {
  pgTable, serial, varchar, text, integer, numeric, boolean, timestamp, jsonb, index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/** 订阅计划 */
export const subscriptionPlans = pgTable(
  "subscription_plans",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 128 }).notNull(),
    description: text("description"),
    price: numeric("price", { precision: 18, scale: 2 }).notNull().default("0"),
    billingCycle: varchar("billing_cycle", { length: 20 }).notNull().default("monthly"), // monthly | yearly
    modelLimit: integer("model_limit"),
    requestLimit: integer("request_limit"),
    features: jsonb("features").notNull().default({}),
    status: varchar("status", { length: 20 }).notNull().default("active"), // active | inactive
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_sp_status").on(table.status)],
);

/** 用户订阅 */
export const subscriptionUsers = pgTable(
  "subscription_users",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id),
    planId: integer("plan_id").notNull().references(() => subscriptionPlans.id),
    status: varchar("status", { length: 20 }).notNull().default("active"), // active | cancelled | expired
    startAt: timestamp("start_at", { withTimezone: true }).notNull().defaultNow(),
    endAt: timestamp("end_at", { withTimezone: true }),
    autoRenew: boolean("auto_renew").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_su_user").on(table.userId),
    index("idx_su_plan").on(table.planId),
    index("idx_su_status").on(table.status),
  ],
);

export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type NewSubscriptionPlan = typeof subscriptionPlans.$inferInsert;
export type SubscriptionUser = typeof subscriptionUsers.$inferSelect;
export type NewSubscriptionUser = typeof subscriptionUsers.$inferInsert;
