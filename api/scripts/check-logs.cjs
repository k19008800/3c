const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'postgres',
  database: 'threecloud',
});

async function main() {
  const client = await pool.connect();
  try {
    // Check call_logs for rate_limited entries
    const res = await client.query(`
      SELECT id, user_id, api_key_id, status, error_message, duration_ms, created_at
      FROM call_logs
      WHERE status = 'rate_limited'
      ORDER BY created_at DESC
      LIMIT 20
    `);
    console.log('=== Rate Limited Call Logs ===');
    if (res.rows.length === 0) {
      console.log('No rate_limited entries found in call_logs');
    } else {
      for (const row of res.rows) {
        console.log(`ID: ${row.id}, User: ${row.user_id}, APIKeyID: ${row.api_key_id}`);
        console.log(`  Status: ${row.status}, Error: ${row.error_message}`);
        console.log(`  Time: ${row.created_at}`);
        console.log('');
      }
    }
    
    // Count total rate_limited entries
    const countRes = await client.query(`
      SELECT COUNT(*) as cnt FROM call_logs WHERE status = 'rate_limited'
    `);
    console.log(`Total rate_limited entries: ${countRes.rows[0].cnt}`);
    
    // Restore user 5's rate limit override
    await client.query(`UPDATE users SET rpm_override = NULL, tpm_override = NULL WHERE id = 5`);
    console.log('\nRestored user 5 rate limit overrides to NULL');
    
    const userRes = await client.query(`SELECT id, rpm_override, tpm_override FROM users WHERE id = 5`);
    console.log('User 5 after restore:', userRes.rows[0]);
  } finally {
    client.release();
  }
  await pool.end();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
