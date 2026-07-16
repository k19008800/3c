import { Pool } from 'pg';
const pool = new Pool({ connectionString: 'postgres://postgres:postgres@localhost:5432/threecloud' });
const keys = await pool.query('SELECT id, user_id, status, key_prefix FROM api_keys WHERE user_id = 5 AND status = true');
console.log('User 5 active keys:', keys.rows.length);
for (const k of keys.rows) console.log(k.id, k.key_prefix);
await pool.end();
