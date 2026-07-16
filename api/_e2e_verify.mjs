import { Pool } from 'pg';
const pool = new Pool({ connectionString: 'postgres://postgres:postgres@localhost:5432/threecloud' });

const user = await pool.query("SELECT id, email, balance FROM users WHERE email = 'admin@3cloud.dev'");
console.log('User:', JSON.stringify(user.rows[0]));

const userId = user.rows[0].id;
const calls = await pool.query('SELECT * FROM call_logs WHERE user_id = $1 ORDER BY id DESC LIMIT 1', [userId]);
console.log('\nLatest call columns:');
for (const key in calls.rows[0]) process.stdout.write(key + ' ');
console.log();
console.log(JSON.stringify(calls.rows[0], null, 2));

await pool.end();
