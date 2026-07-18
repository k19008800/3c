import { readFileSync } from "fs";
import { createHash } from "crypto";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const content = readFileSync(
  "/3cloud/api/src/db/migrations/2026-07-20-vendor-key-groups.sql"
);
const hash = createHash("md5").update(content).digest("hex").slice(0, 8);

await pool.query(
  "INSERT INTO _migrations (name, hash, executed_at) VALUES ($1, $2, NOW()) ON CONFLICT (name) DO NOTHING",
  ["2026-07-20-vendor-key-groups.sql", hash]
);
console.log("tracked:", hash);
await pool.end();
