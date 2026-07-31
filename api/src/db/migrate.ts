import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/threecloud_v2",
  });
  const db = drizzle(pool);

  console.log("运行 migration...");
  await migrate(db, { migrationsFolder: "./src/db/migrations" });
  console.log("migration 完成");

  await pool.end();
}

main().catch((e) => {
  console.error("migration 失败:", e);
  process.exit(1);
});
