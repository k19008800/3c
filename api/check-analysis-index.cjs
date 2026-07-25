const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'threecloud',
  user: 'postgres',
  password: 'postgres'
});

async function checkAnalysisIndex() {
  await client.connect();
  
  // 检查model_name, ip, duration_ms列是否在所有分区表中存在
  const columnCheck = `
    SELECT 
      column_name,
      data_type,
      table_name
    FROM information_schema.columns
    WHERE table_name LIKE 'call_logs_%'
      AND column_name IN ('model_name', 'ip', 'duration_ms')
    ORDER BY table_name, column_name;
  `;
  
  console.log('=== call_logs 分区表列检查 ===');
  const result = await client.query(columnCheck);
  const tables = {};
  result.rows.forEach(row => {
    if (!tables[row.table_name]) {
      tables[row.table_name] = new Set();
    }
    tables[row.table_name].add(row.column_name);
  });
  
  Object.keys(tables).forEach(table => {
    const columns = Array.from(tables[table]);
    console.log(`表 ${table}: ${columns.join(', ')} (${columns.length}/3 列)`);
  });
  
  // 检查当前索引
  const indexCheck = `
    SELECT 
      schemaname,
      tablename,
      indexname,
      indexdef
    FROM pg_indexes 
    WHERE tablename LIKE 'call_logs_%'
      AND indexdef LIKE '%model_name%' 
      OR indexdef LIKE '%ip%'
      OR indexdef LIKE '%duration_ms%'
    ORDER BY tablename, indexname;
  `;
  
  console.log('\n=== 现有分析相关索引检查 ===');
  const indexResult = await client.query(indexCheck);
  if (indexResult.rows.length === 0) {
    console.log('没有找到分析相关的索引');
  } else {
    indexResult.rows.forEach(row => {
      console.log(`表: ${row.tablename}, 索引: ${row.indexname}`);
      console.log(`定义: ${row.indexdef}\n`);
    });
  }
  
  await client.end();
}

checkAnalysisIndex().catch(console.error);