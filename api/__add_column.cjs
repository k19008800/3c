import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: 'postgres://postgres:postgres@localhost:5432/threecloud' });

async function main() {
  try {
    await pool.query('ALTER TABLE "models" ADD COLUMN "description" text');
    console.log('✅ Added description column to models table');
  } catch(err) {
    if (err.code === '42701') { // already exists
      console.log('ℹ️  description column already exists');
    } else {
      console.error('❌ Error:', err.message);
    }
  }
  await pool.end();
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
