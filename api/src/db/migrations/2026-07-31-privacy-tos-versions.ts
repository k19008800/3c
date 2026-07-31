import { sql } from "drizzle-orm";
import { db } from "../db.js";

export async function up() {
  // 隐私政策版本表
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "privacy_policy_versions" (
      "id" SERIAL PRIMARY KEY,
      "version" VARCHAR(20) NOT NULL,
      "title" VARCHAR(200),
      "content" TEXT NOT NULL,
      "summary" TEXT,
      "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
      "published_at" TIMESTAMPTZ,
      "created_by" INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS "ppv_status_idx" ON "privacy_policy_versions" ("status");
  `);

  // 用户隐私政策同意记录表
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "user_privacy_consents" (
      "id" SERIAL PRIMARY KEY,
      "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "version_id" INTEGER NOT NULL REFERENCES "privacy_policy_versions"("id") ON DELETE CASCADE,
      "consented_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "ip" VARCHAR(45)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "upc_user_version_idx" ON "user_privacy_consents" ("user_id", "version_id");
    CREATE INDEX IF NOT EXISTS "upc_user_idx" ON "user_privacy_consents" ("user_id");
  `);

  // 服务条款版本表
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "terms_of_service_versions" (
      "id" SERIAL PRIMARY KEY,
      "version" VARCHAR(20) NOT NULL,
      "title" VARCHAR(200),
      "content" TEXT NOT NULL,
      "summary" TEXT,
      "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
      "published_at" TIMESTAMPTZ,
      "created_by" INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS "tosv_status_idx" ON "terms_of_service_versions" ("status");
  `);

  // 用户服务条款同意记录表
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "user_tos_consents" (
      "id" SERIAL PRIMARY KEY,
      "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "version_id" INTEGER NOT NULL REFERENCES "terms_of_service_versions"("id") ON DELETE CASCADE,
      "consented_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "ip" VARCHAR(45)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "utc_user_version_idx" ON "user_tos_consents" ("user_id", "version_id");
    CREATE INDEX IF NOT EXISTS "utc_user_idx" ON "user_tos_consents" ("user_id");
  `);
}

export async function down() {
  await db.execute(sql`DROP TABLE IF EXISTS "user_tos_consents"`);
  await db.execute(sql`DROP TABLE IF EXISTS "terms_of_service_versions"`);
  await db.execute(sql`DROP TABLE IF EXISTS "user_privacy_consents"`);
  await db.execute(sql`DROP TABLE IF EXISTS "privacy_policy_versions"`);
}