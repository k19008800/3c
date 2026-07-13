// ============================================================
//  3cloud (3C) — 营销活动 (Campaign)
// ============================================================

import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  bigint,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

import { campaignStatusEnum } from "./enums.js";
import { users } from "./users.js";
import { agents } from "./agents.js";

// ── 营销活动 ──

export const campaigns = pgTable(
  "campaigns",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 128 }).notNull(),
    description: text("description"),
    status: campaignStatusEnum("status").notNull().default("draft"),
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    budgetAmount: bigint("budget_amount", { mode: "number" }).notNull().default(0),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("campaigns_status_idx").on(table.status),
    createdByIdx: index("campaigns_created_by_idx").on(table.createdBy),
    startEndIdx: index("campaigns_start_end_idx").on(table.startAt, table.endAt),
  })
);

// ── 活动码分配 ──

export const campaignCodes = pgTable(
  "campaign_codes",
  {
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    agentId: integer("agent_id")
      .references(() => agents.id),
    allocatedCount: integer("allocated_count").notNull().default(0),
    usedCount: integer("used_count").notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.campaignId, table.agentId] }),
  })
);
