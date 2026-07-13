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
    const action = process.argv[2] || 'set';
    
    if (action === 'set') {
      // Set low RPM override for testing
      await client.query(`UPDATE users SET rpm_override = 5, tpm_override = 1000 WHERE id = 5`);
      console.log('Set rpm_override=5, tpm_override=1000 for user 5');
    } else if (action === 'restore') {
      // Restore to defaults
      await client.query(`UPDATE users SET rpm_override = NULL, tpm_override = NULL WHERE id = 5`);
      console.log('Restored rpm_override and tpm_override to NULL for user 5');
    }
    
    // Verify
    const res = await client.query(`SELECT id, nickname, rpm_override, tpm_override FROM users WHERE id = 5`);
    console.log('User 5 now:', res.rows[0]);
  } finally {
    client.release();
  }
  await pool.end();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
