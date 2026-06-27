// ============================================================
//  3cloud (3C) — Drizzle Kit 配置
//  用于生成和管理数据库迁移
// ============================================================

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/threecloud",
  },
  verbose: true,
  strict: true,
});
