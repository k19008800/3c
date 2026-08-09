const postgres = require('postgres');

async function resetDB() {
  const sql = postgres('postgres://postgres:postgres@localhost:5432/postgres', { max: 1 });
  try {
    await sql.unsafe(`
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = 'threecloud_v3' AND pid <> pg_backend_pid()
    `);
    await sql.unsafe('DROP DATABASE IF EXISTS threecloud_v3');
    console.log('✅ Dropped threecloud_v3');
    await sql.unsafe('CREATE DATABASE threecloud_v3');
    console.log('✅ Created threecloud_v3');
  } catch (err) {
    console.error('Failed:', err.message);
  }
  await sql.end();
  process.exit(0);
}

resetDB();
