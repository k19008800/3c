import { pgTable, serial, integer, varchar, text, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { apiKeys } from "./api-keys";

/**
 * API Key 权限变更记录 对齐 SPEC-§20.4 / §30.4
 */
export const keyPermissionChanges = pgTable(
  "key_permission_changes",
  {
    id: serial("id").primaryKey(),
    keyId: integer("key_id").notNull().references(() => apiKeys.id),
    userId: integer("user_id").notNull().references(() => users.id),
    field: varchar("field", { length: 50 }).notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_kpc_key").on(table.keyId)],
);
