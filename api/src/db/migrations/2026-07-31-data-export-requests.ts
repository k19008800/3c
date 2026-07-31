import { sql } from "drizzle-orm";
import { db } from "../db.js";

export async function up() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "data_export_requests" (
      "id" SERIAL PRIMARY KEY,
      "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "requested_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
      "processed_by" INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
      "processed_at" TIMESTAMPTZ,
      "file_url" TEXT,
      "file_expires_at" TIMESTAMPTZ,
      "file_size_bytes" BIGINT,
      "error_message" TEXT,
      "reject_reason" TEXT
    );
    CREATE INDEX IF NOT EXISTS "der_user_idx" ON "data_export_requests" ("user_id");
    CREATE INDEX IF NOT EXISTS "der_status_idx" ON "data_export_requests" ("status");
  `);
}

export async function down() {
  await db.execute(sql`DROP TABLE IF EXISTS "data_export_requests"`);
}