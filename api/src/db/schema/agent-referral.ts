// ============================================================
//  3cloud (3C) — 代理商邀请裂变（§24.1）
//  agent_referral_links 表定义
// ============================================================

import { pgTable, serial, integer, varchar, timestamp, text } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const agentReferralLinks = pgTable("agent_referral_links", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => users.id),
  code: varchar("code", { length: 20 }).notNull().unique(),
  customName: varchar("custom_name", { length: 100 }),
  clickCount: integer("click_count").default(0),
  registerCount: integer("register_count").default(0),
  source: varchar("source", { length: 50 }).default("direct"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});