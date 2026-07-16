import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: 'postgres://postgres:postgres@localhost:5432/threecloud' });
const db = drizzle(pool);

const tables = ['users', 'vendors', 'models', 'vendors_models', 'api_keys', 'call_logs', 'audit_logs', 'agents', 'recharge_orders', 'withdraw_orders', 'security_events', 'rate_limits', 'site_settings', 'email_templates', 'page_contents', 'announcements', 'campaigns', 'roles', 'role_assignments', 'balance_logs', 'settlements'];

for (const t of tables) {
  try {
    const [result] = await db.execute(`SELECT COUNT(*) as cnt FROM ${t}`);
    const cnt = result[0]?.cnt ?? result?.cnt ?? 0;
    console.log(`${t}: ${cnt}`);
  } catch(e) {
    console.log(`${t}: ERROR - ${e.message}`);
  }
}

await pool.end();
