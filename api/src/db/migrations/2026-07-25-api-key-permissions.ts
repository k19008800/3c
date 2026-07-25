// ============================================================
//  3cloud (3C) — API Key 权限控制迁移
//  添加权限字段和权限模板表
// ============================================================

import { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // ── 1. 添加 api_keys 表权限字段 ──
  await db.schema
    .alterTable("api_keys")
    .addColumn("permissions", "jsonb", (col) => col)
    .execute();

  await db.schema
    .alterTable("api_keys")
    .addColumn("template_id", "integer", (col) => col)
    .execute();

  // 添加索引
  await db.schema
    .createIndex("api_keys_template_idx")
    .on("api_keys")
    .column("template_id")
    .execute();

  // ── 2. 创建权限模板表 ──
  await db.schema
    .createTable("api_key_permission_templates")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("name", "varchar(100)", (col) => col.notNull())
    .addColumn("description", "varchar(500)")
    .addColumn("permissions", "jsonb", (col) => col.notNull())
    .addColumn("is_system", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("created_at", "timestamp with time zone", (col) =>
      col.notNull().defaultTo(db.fn.now())
    )
    .addColumn("updated_at", "timestamp with time zone", (col) =>
      col.notNull().defaultTo(db.fn.now())
    )
    .execute();

  await db.schema
    .createIndex("api_key_templates_name_idx")
    .on("api_key_permission_templates")
    .column("name")
    .execute();

  // ── 3. 插入系统预设模板 ──
  await db
    .insertInto("api_key_permission_templates")
    .values([
      {
        name: "完全访问",
        description: "无任何限制，允许访问所有模型和端点",
        permissions: JSON.stringify({
          allowedModels: null,
          ipWhitelist: null,
          allowedEndpoints: null,
          rateLimitPerMinute: null,
        }),
        is_system: true,
      },
      {
        name: "只读访问",
        description: "仅允许查看模型列表，不允许调用",
        permissions: JSON.stringify({
          allowedModels: null,
          ipWhitelist: null,
          allowedEndpoints: ["/v1/models"],
          rateLimitPerMinute: 60,
        }),
        is_system: true,
      },
      {
        name: "Chat 专用",
        description: "仅允许 Chat Completions 接口",
        permissions: JSON.stringify({
          allowedModels: null,
          ipWhitelist: null,
          allowedEndpoints: ["/v1/chat/completions", "/v1/models"],
          rateLimitPerMinute: 120,
        }),
        is_system: true,
      },
      {
        name: "Embedding 专用",
        description: "仅允许 Embeddings 接口",
        permissions: JSON.stringify({
          allowedModels: null,
          ipWhitelist: null,
          allowedEndpoints: ["/v1/embeddings", "/v1/models"],
          rateLimitPerMinute: 300,
        }),
        is_system: true,
      },
    ])
    .execute();

  console.log("✅ API Key 权限控制迁移完成");
}

export async function down(db: Kysely<any>): Promise<void> {
  // 删除系统预设模板
  await db
    .deleteFrom("api_key_permission_templates")
    .where("is_system", "=", true)
    .execute();

  // 删除索引
  await db.schema.dropIndex("api_keys_template_idx").ifExists().execute();
  await db.schema
    .dropIndex("api_key_templates_name_idx")
    .ifExists()
    .execute();

  // 删除模板表
  await db.schema
    .dropTable("api_key_permission_templates")
    .ifExists()
    .execute();

  // 删除 api_keys 表字段
  await db.schema
    .alterTable("api_keys")
    .dropColumn("template_id")
    .execute();

  await db.schema
    .alterTable("api_keys")
    .dropColumn("permissions")
    .execute();

  console.log("✅ API Key 权限控制回滚完成");
}
