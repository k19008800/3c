// 一次性工具：把 task_records 迁移应用到本地 threecloud_v3（幂等）
// 用法（api 目录下）：node scripts/apply-task-records-migration.mjs
import postgres from 'postgres';

const sql = postgres('postgres://postgres:postgres@localhost:5432/threecloud_v3', { max: 1 });

try {
  const tables = await sql`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_name = 'task_records'
  `;
  if (tables.length > 0) {
    console.log('task_records 已存在，跳过');
  } else {
    await sql`
      CREATE TABLE "task_records" (
        "id" serial PRIMARY KEY NOT NULL,
        "task_type" varchar(20) NOT NULL,
        "public_id" varchar(64) NOT NULL,
        "upstream_id" varchar(200),
        "user_id" integer NOT NULL,
        "api_key_id" integer,
        "supplier_id" integer NOT NULL,
        "channel_key_id" integer,
        "action" varchar(50) NOT NULL,
        "model" varchar(100) NOT NULL,
        "prompt" text,
        "status" varchar(20) NOT NULL DEFAULT 'submitted',
        "progress" varchar(10),
        "fail_reason" text,
        "response" jsonb,
        "cost" varchar(30),
        "refunded" boolean NOT NULL DEFAULT false,
        "request_id" varchar(64),
        "submit_time" timestamp,
        "start_time" timestamp,
        "finish_time" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      )
    `;
    await sql`CREATE UNIQUE INDEX "uq_task_records_public_id" ON "task_records" ("public_id")`;
    await sql`CREATE INDEX "idx_task_records_user_id" ON "task_records" ("user_id")`;
    await sql`CREATE INDEX "idx_task_records_status" ON "task_records" ("status")`;
    await sql`CREATE INDEX "idx_task_records_supplier_id" ON "task_records" ("supplier_id")`;
    console.log('已创建 task_records 表 + 索引');
  }
} finally {
  await sql.end();
}
