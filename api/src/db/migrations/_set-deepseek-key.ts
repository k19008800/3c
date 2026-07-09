const { Pool } = require('pg');
require('dotenv').config();

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query(
      "UPDATE system_configs SET value = $1, updated_at = NOW() WHERE key = 'deepseek_api_key' RETURNING key, value",
      ['sk-63686217e68f493fb048d27a8b7f891c']
    );
    console.log('Updated:', result.rows.length, 'row(s)');
    console.log('Key:', result.rows[0]?.key);
    console.log('Value starts with:', result.rows[0]?.value?.substring(0, 10) + '...');
  } finally {
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
