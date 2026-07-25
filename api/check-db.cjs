const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'threecloud',
  user: 'postgres',
  password: 'postgres'
});

async function checkIndexes() {
  await client.connect();
  
  // 检查索引
  const indexQuery = `
    SELECT 
      schemaname,
      tablename,
      indexname,
      indexdef
    FROM pg_indexes 
    WHERE tablename IN ('call_logs_202607', 'balance_logs', 'commission_logs_202607', 'agents', 'api_keys', 'commission_logs')
    ORDER BY tablename, indexname;
  `;
  
  console.log('=== 现有索引检查 ===');
  const indexResult = await client.query(indexQuery);
  indexResult.rows.forEach(row => {
    console.log(`表: ${row.tablename}, 索引: ${row.indexname}`);
    console.log(`定义: ${row.indexdef}\n`);
  });
  
  // 检查外键
  const fkQuery = `
    SELECT
      tc.table_name,
      tc.constraint_name,
      tc.constraint_type,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.table_name IN ('agents', 'api_keys', 'commission_logs')
      AND tc.constraint_type = 'FOREIGN KEY';
  `;
  
  console.log('=== 现有外键检查 ===');
  const fkResult = await client.query(fkQuery);
  if (fkResult.rows.length === 0) {
    console.log('没有找到相关的外键约束\n');
  } else {
    fkResult.rows.forEach(row => {
      console.log(`表: ${row.table_name}, 约束: ${row.constraint_name}`);
      console.log(`引用表: ${row.foreign_table_name}.${row.foreign_column_name}\n`);
    });
  }
  
  // 检查分区表结构
  const partitionQuery = `
    SELECT 
      schemaname,
      tablename,
      indexname,
      indexdef
    FROM pg_indexes 
    WHERE tablename LIKE 'call_logs_%' OR tablename LIKE 'commission_logs_%'
    ORDER BY tablename, indexname;
  `;
  
  console.log('=== 分区表索引检查 ===');
  const partitionResult = await client.query(partitionQuery);
  const partitionIndexes = {};
  partitionResult.rows.forEach(row => {
    if (!partitionIndexes[row.tablename]) {
      partitionIndexes[row.tablename] = [];
    }
    partitionIndexes[row.tablename].push(row.indexname);
    console.log(`分区表: ${row.tablename}, 索引: ${row.indexname}`);
  });
  
  await client.end();
}

checkIndexes().catch(console.error);