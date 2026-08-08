import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * 团队/子账号成员表
 * 一个主账号（owner）可拥有多个子账号成员
 * 角色: owner / admin / member / viewer
 */
export const teamMembers = pgTable(
  "team_members",
  {
    id: serial("id").primaryKey(),
    teamOwnerId: integer("team_owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull().default("member"),
    // owner / admin / member / viewer
    status: varchar("status", { length: 20 }).notNull().default("active"),
    // active / invited / disabled
    invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("uq_team_owner_member").on(table.teamOwnerId, table.userId),
    index("idx_team_owner").on(table.teamOwnerId),
    index("idx_team_member_user").on(table.userId),
  ],
);

export const TEAM_ROLES = ["owner", "admin", "member", "viewer"] as const;
export const TEAM_ROLE_LABELS: Record<string, string> = {
  owner: "所有者",
  admin: "管理员",
  member: "成员",
  viewer: "只读",
};

export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;
