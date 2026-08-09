const postgres = require('postgres');

async function createDB() {
  const sql = postgres('postgres://postgres:postgres@localhost:5432/postgres', { max: 1 });
  try {
    // Check if exists
    const dbs = await sql`SELECT 1 FROM pg_database WHERE datname = 'threecloud_v3'`;
    if (dbs.length === 0) {
      await sql.unsafe('CREATE DATABASE threecloud_v3');
      console.log('✅ Database threecloud_v3 created');
    } else {
      console.log('✅ Database threecloud_v3 already exists');
    }
  } catch (err) {
    console.error('Failed:', err.message);
  }
  await sql.end();
  process.exit(0);
}

createDB();
