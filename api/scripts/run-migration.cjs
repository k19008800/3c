const { config } = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load env
config({ path: path.resolve(__dirname, '../.env') });

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'threecloud',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function run() {
  const sqlFile = process.argv[2];
  if (!sqlFile) {
    console.error('Usage: node run-migration.js <sql-file>');
    process.exit(1);
  }
  const sql = fs.readFileSync(sqlFile, 'utf-8');
  console.log(`Running migration: ${sqlFile}`);
  try {
    await pool.query(sql);
    console.log('Migration completed successfully ✅');
  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    await pool.end();
  }
}

run();