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
    statement_timeout: 30000, // PERF: 防止慢查询长时间占用连接（30s 超时断开）
  });

  // PERF: 池错误处理 — 未捕获的 pool 错误不会导致进程退出
  pool.on('error', (err) => {
    console.error('[DB] Unexpected pool connection error:', err.message);
    // 错误连接由 pg 库自动移除，无需手动处理
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
    await pool.query('SELECT 1'); // PERF: 直接查询避免连接获取/释放开销
    return true;
  } catch {
    return false;
  }
}

export { pool };
