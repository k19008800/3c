import { Pool } from 'pg';
const pool = new Pool({ connectionString: 'postgres://postgres:postgres@localhost:5432/threecloud' });

// Find users with balance  
const users = await pool.query("SELECT id, email, balance FROM users WHERE balance > 100 ORDER BY balance DESC LIMIT 5");
console.log('Users with balance:');
for (const u of users.rows) console.log(u.id, u.email, u.balance);

// Check their API keys
const userIds = users.rows.map(u => u.id).join(',');
// First check api_keys columns
const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='api_keys'");
console.log('api_keys columns:', cols.rows.map(c=>c.column_name).join(', '));

const keys = await pool.query("SELECT id, user_id, key_prefix, status, quota_balance FROM api_keys WHERE user_id IN (" + userIds + ") AND status = true LIMIT 10");
console.log('\nActive API Keys:');
for (const k of keys.rows) console.log(k.id, 'user:', k.user_id, 'prefix:', k.key_prefix, 'status:', k.status, 'balance:', k.quota_balance);
console.log('\nActive API Keys:');
for (const k of keys.rows) console.log(k.id, 'user:', k.user_id, 'prefix:', k.key_prefix, 'rpm:', k.rpm_limit, 'tpm:', k.tpm_limit);
// Check if there are any models with active vendor models
const vm = await pool.query("SELECT vm.id, v.name as vendor, m.name as model, vm.status FROM vendor_models vm JOIN vendors v ON v.id = vm.vendor_id JOIN models m ON m.id = vm.model_id WHERE vm.status = 'active' LIMIT 10");
console.log('\nActive vendor_models:');
for (const r of vm.rows) console.log(r.id, r.vendor, r.model, r.status);

await pool.end();
