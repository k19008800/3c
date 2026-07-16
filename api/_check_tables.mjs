import { Pool } from 'pg';
const pool = new Pool({ connectionString: 'postgres://postgres:postgres@localhost:5432/threecloud' });
const result = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name");
for (const r of result.rows) console.log(r.table_name);
await pool.end();
