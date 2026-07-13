const crypto = require('crypto');
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'postgres',
  database: 'threecloud',
});

function generateApiKey() {
  const prefix = 'sk-3c-';
  const random = crypto.randomBytes(24).toString('hex');
  return prefix + random;
}

async function main() {
  const client = await pool.connect();
  try {
    // Check user 5 (has sk-3c-1e prefix) and user 37
    const userRes = await client.query(`
      SELECT id, nickname, user_type, status, real_name_status, rpm_override, tpm_override
      FROM users
      WHERE id IN (1, 5, 37)
    `);
    console.log('=== Target Users ===');
    for (const row of userRes.rows) {
      console.log(`ID: ${row.id}, Nickname: ${row.nickname}, Type: ${row.user_type}, Status: ${row.status}, RealName: ${row.real_name_status}, RPM: ${row.rpm_override}, TPM: ${row.tpm_override}`);
    }

    // Create a new test API key for user 5
    const newKey = generateApiKey();
    const keyHash = crypto.createHash('sha256').update(newKey).digest('hex');
    const keyPrefix = newKey.slice(0, 7);

    console.log('\n=== Creating Test API Key ===');
    console.log(`Plaintext key: ${newKey}`);
    console.log(`Hash: ${keyHash}`);
    console.log(`Prefix: ${keyPrefix}`);

    // Check if user 5 is active and has real_name_status approved
    const user5 = userRes.rows.find(r => r.id === 5);
    if (!user5 || user5.status !== 'active') {
      console.log('\nUser 5 not active. Trying to create key for user 1 (admin)...');
      
      // Check user 1
      const user1Res = await client.query(`
        SELECT id, nickname, user_type, status, real_name_status
        FROM users WHERE id = 1
      `);
      for (const row of user1Res.rows) {
        console.log(`User 1: ${row.nickname}, Status: ${row.status}, RealName: ${row.real_name_status}`);
      }
      
      // Create a key for user 1 if active
      if (user1Res.rows.length > 0) {
        const newKey2 = generateApiKey();
        const keyHash2 = crypto.createHash('sha256').update(newKey2).digest('hex');
        const keyPrefix2 = newKey2.slice(0, 7);
        
        await client.query(
          `INSERT INTO api_keys (user_id, name, key_hash, key_prefix, status) VALUES ($1, $2, $3, $4, true)`,
          [1, 'RateLimit-Test-Key', keyHash2, keyPrefix2]
        );
        console.log(`\nCreated key for user 1: ${newKey2}`);
        console.log(`Hash: ${keyHash2}`);
      }
    } else {
      // Create key for user 5
      await client.query(
        `INSERT INTO api_keys (user_id, name, key_hash, key_prefix, status) VALUES ($1, $2, $3, $4, true)`,
        [5, 'RateLimit-Test-Key', keyHash, keyPrefix]
      );
      console.log(`\nCreated key for user 5: ${newKey}`);
    }
  } finally {
    client.release();
  }
  await pool.end();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
