// ============================================================
//  3cloud (3C) — 数据库连接
//  Drizzle ORM + PostgreSQL (node-postgres)
// ============================================================

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { config } from "../config.js";
import * as schema from "./schema.js";

let pool: Pool;
let db: ReturnType<typeof drizzle>;

export function createDb() {
  if (db) return db;

  pool = new Pool({
    connectionString: config.database.url,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  db = drizzle({ client: pool, schema });
  return db;
}

export function getDb() {
  if (!db) throw new Error("Database not initialized. Call createDb() first.");
  return db;
}

export async function closeDb() {
  if (pool) {
    await pool.end();
  }
}

export async function checkDbConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    client.release();
    return true;
  } catch {
    return false;
  }
}

export { pool };
