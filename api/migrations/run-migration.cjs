const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    database: 'threecloud',
    user: 'postgres',
    password: 'postgres'
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL');

    const sql = fs.readFileSync(path.join(__dirname, '2026-07-24-perf-indexes.sql'), 'utf8');
    console.log('📄 Migration file loaded:', sql.length, 'bytes');

    // Split by semicolons and execute each statement
    const statements = sql.split(';').filter(s => s.trim());
    let success = 0;
    let failed = 0;

    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (!trimmed || trimmed.startsWith('--')) continue;
      
      try {
        await client.query(trimmed);
        success++;
        // Extract first meaningful line for logging
        const lines = trimmed.split('\n').filter(l => !l.trim().startsWith('--'));
        const firstLine = lines[0]?.substring(0, 60) || 'statement';
        console.log(`  ✅ ${firstLine}...`);
      } catch (err) {
        // Ignore "already exists" errors
        if (err.message.includes('already exists') || err.message.includes('duplicate key')) {
          console.log(`  ⚠️  Skipped (exists): ${trimmed.split('\n')[0].substring(0, 40)}...`);
        } else {
          console.log(`  ❌ Error: ${err.message.substring(0, 80)}`);
          failed++;
        }
      }
    }

    console.log(`\n📊 Migration complete: ${success} success, ${failed} failed`);

    // Verify indexes
    const result = await client.query(`
      SELECT indexname, tablename 
      FROM pg_indexes 
      WHERE indexname LIKE '%trgm%' 
         OR indexname IN (
           'audit_logs_action_idx',
           'balance_logs_user_created_idx',
           'security_events_risk_created_idx',
           'redemption_orders_status_created_idx'
         )
      ORDER BY tablename, indexname
    `);

    console.log('\n📋 Created indexes:');
    result.rows.forEach(row => {
      console.log(`  - ${row.indexname} (${row.tablename})`);
    });

  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
