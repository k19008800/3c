import { Pool } from 'pg';
const pool = new Pool({ connectionString: 'postgres://postgres:postgres@localhost:5432/threecloud' });

// Check admin_accounts
const r1 = await pool.query('SELECT username, role_id FROM admin_accounts LIMIT 5');
console.log('admin_accounts:', JSON.stringify(r1.rows, null, 2));

// Check users 
const r2 = await pool.query("SELECT id, email, role FROM users WHERE email LIKE '%admin%' OR role IS NOT NULL LIMIT 10");
console.log('admin users:', JSON.stringify(r2.rows, null, 2));

// Check admin_roles
const r3 = await pool.query('SELECT * FROM admin_roles');
console.log('admin_roles:', JSON.stringify(r3.rows, null, 2));

await pool.end();
