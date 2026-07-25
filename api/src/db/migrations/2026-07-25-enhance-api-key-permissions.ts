// ============================================================
//  3cloud (3C) — 增强 API Key 权限控制迁移
//  添加额度限制、IP黑名单、时间段限制等字段
// ============================================================

import { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // ── 1. 添加额度统计字段到 api_keys 表 ──
  await db.schema
    .alterTable("api_keys")
    .addColumn("daily_usage", "numeric", (col) =>
      col.precision(18).scale(6).defaultTo(0)
    )
    .execute();

  await db.schema
    .alterTable("api_keys")
    .addColumn("monthly_usage", "numeric", (col) =>
      col.precision(18).scale(6).defaultTo(0)
    )
    .execute();

  await db.schema
    .alterTable("api_keys")
    .addColumn("last_reset_daily", "timestamp with time zone")
    .execute();

  await db.schema
    .alterTable("api_keys")
    .addColumn("last_reset_monthly", "timestamp with time zone")
    .execute();

  // ── 2. 添加使用统计表 ──
  await db.schema
    .createTable("api_key_usage_stats")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("api_key_id", "integer", (col) =>
      col.references("api_keys.id").onDelete("cascade").notNull()
    )
    .addColumn("date", "date", (col) => col.notNull())
    .addColumn("calls", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("tokens", "bigint", (col) => col.notNull().defaultTo(0))
    .addColumn("cost", "numeric", (col) =>
      col.precision(18).scale(6).notNull().defaultTo(0)
    )
    .addColumn("created_at", "timestamp with time zone", (col) =>
      col.notNull().defaultTo(db.fn.now())
    )
    .execute();

  // 添加索引
  await db.schema
    .createIndex("api_key_usage_stats_api_key_id_date_idx")
    .on("api_key_usage_stats")
    .columns(["api_key_id", "date"])
    .execute();

  await db.schema
    .createIndex("api_key_usage_stats_date_idx")
    .on("api_key_usage_stats")
    .column("date")
    .execute();

  console.log("✅ 增强 API Key 权限控制迁移完成");
}

export async function down(db: Kysely<any>): Promise<void> {
  // 删除使用统计表和索引
  await db.schema
    .dropIndex("api_key_usage_stats_api_key_id_date_idx")
    .ifExists()
    .execute();

  await db.schema
    .dropIndex("api_key_usage_stats_date_idx")
    .ifExists()
    .execute();

  await db.schema
    .dropTable("api_key_usage_stats")
    .ifExists()
    .execute();

  // 删除 api_keys 表新增字段
  await db.schema
    .alterTable("api_keys")
    .dropColumn("last_reset_monthly")
    .execute();

  await db.schema
    .alterTable("api_keys")
    .dropColumn("last_reset_daily")
    .execute();

  await db.schema
    .alterTable("api_keys")
    .dropColumn("monthly_usage")
    .execute();

  await db.schema
    .alterTable("api_keys")
    .dropColumn("daily_usage")
    .execute();

  console.log("✅ 增强 API Key 权限控制回滚完成");
}