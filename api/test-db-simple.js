// 简化测试，直接在项目目录运行
const { Pool } = require('pg');

async function main() {
  const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'threecloud',
    user: 'postgres',
    password: 'postgres'
  });

  try {
    console.log('Testing connection...');
    const client = await pool.connect();
    console.log('✓ Connected to PostgreSQL');
    
    // 执行所有需要的查询
    const queries = {
      tables: 'SELECT table_name FROM information_schema.tables WHERE table_schema = \'public\' ORDER BY table_name',
      indexes: 'SELECT * FROM pg_indexes WHERE schemaname = \'public\' ORDER BY tablename, indexname',
      foreignKeys: `
        SELECT 
          tc.table_name,
          tc.constraint_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
        ORDER BY tc.table_name, tc.constraint_name
      `,
      statistics: 'SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC'
    };

    const results = {};
    
    for (const [name, query] of Object.entries(queries)) {
      console.log(`\nRunning ${name} query...`);
      const result = await client.query(query);
      results[name] = result.rows;
      console.log(`✓ Found ${result.rows.length} ${name}`);
    }
    
    client.release();
    await pool.end();
    
    // 输出摘要
    console.log('\n' + '='.repeat(50));
    console.log('DATABASE SCHEMA ANALYSIS SUMMARY');
    console.log('='.repeat(50));
    console.log(`Tables: ${results.tables.length}`);
    console.log(`Indexes: ${results.indexes.length}`);
    console.log(`Foreign Keys: ${results.foreignKeys.length}`);
    console.log('\nTop 5 tables by row count:');
    results.statistics.slice(0, 5).forEach(row => {
      console.log(`  ${row.relname}: ${row.n_live_tup} rows`);
    });
    
    return results;
    
  } catch (error) {
    console.error('Error:', error.message);
    await pool.end();
    throw error;
  }
}

main().catch(console.error);