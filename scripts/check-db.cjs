const postgres = require('postgres');

async function main() {
  const sql = postgres('postgres://postgres:postgres@localhost:5432/threecloud_v3');
  const result = await sql`SELECT 1 as ok`;
  console.log('DB OK:', result[0]);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
