import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import "dotenv/config";

/**
 * 3cloud v3 数据库 migration 工具
 * 用法: pnpm --filter @3cloud/api db:migrate
 */
async function main() {
  const connectionString = process.env.DATABASE_URL ?? "postgres://postgres:***@localhost:5432/threecloud_v3";
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  console.log("运行 migration...");
  await migrate(db, { migrationsFolder: "./src/db/migrations" });
  console.log("migration 完成");

  await client.end();
}

main().catch((e) => {
  console.error("migration 失败:", e);
  process.exit(1);
});
