const { readFileSync } = require('fs');
const { join } = require('path');
const postgres = require('postgres');

async function runMigration() {
  const sql = postgres('postgres://postgres:postgres@localhost:5432/threecloud_v3', { max: 1 });
  const migrationPath = join(__dirname, 'src', 'db', 'migrations', '0000_uneven_red_ghost.sql');
  const migrationSQL = readFileSync(migrationPath, 'utf-8');

  console.log('Running migration...');
  console.log('SQL length:', migrationSQL.length, 'chars');

  try {
    const result = await sql.unsafe(migrationSQL);
    console.log('Migration applied successfully!');
    console.log('Result:', result);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }

  // Verify
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  console.log(`\nTables created (${tables.length}):`);
  tables.forEach((t) => console.log('  -', t.table_name));

  await sql.end();
  process.exit(0);
}

runMigration();
