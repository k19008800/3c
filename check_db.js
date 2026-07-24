const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'threecloud',
  user: 'postgres',
  password: 'postgres'
});

async function checkDatabase() {
  const client = await pool.connect();
  try {
    console.log('正在连接到数据库...');
    
    // 1. 获取所有表
    console.log('\n=== 数据库表列表 ===');
    const tablesResult = await client.query(`
      SELECT 
        t.schemaname as schema,
        t.tablename as table,
        s.n_live_tup as estimated_rows
      FROM pg_tables t
      LEFT JOIN pg_stat_user_tables s ON t.tablename = s.relname
      WHERE t.schemaname = 'public'
      ORDER BY t.tablename;
    `);
    
    console.log('表总数:', tablesResult.rows.length);
    tablesResult.rows.forEach(row => {
      console.log(`  ${row.schema}.${row.table} (估计行数: ${row.estimated_rows || '未知'})`);
    });
    
    // 2. 获取所有索引
    console.log('\n=== 索引分析 ===');
    const indexesResult = await client.query(`
      SELECT 
        schemaname,
        tablename,
        indexname,
        indexdef,
        pg_relation_size(indexname::regclass) as index_size
      FROM pg_indexes 
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname;
    `);
    
    console.log('索引总数:', indexesResult.rows.length);
    const indexesByTable = {};
    indexesResult.rows.forEach(row => {
      if (!indexesByTable[row.tablename]) {
        indexesByTable[row.tablename] = [];
      }
      indexesByTable[row.tablename].push({
        name: row.indexname,
        definition: row.indexdef,
        size: row.index_size
      });
    });
    
    // 3. 分析每个表的索引情况
    console.log('\n=== 按表索引统计 ===');
    for (const [table, indexes] of Object.entries(indexesByTable)) {
      console.log(`\n${table}: ${indexes.length} 个索引`);
      indexes.forEach(idx => {
        const sizeMB = idx.size ? Math.round(idx.size / 1024 / 1024) : 0;
        console.log(`  ${idx.name} (${sizeMB} MB)`);
        console.log(`    定义: ${idx.definition.substring(0, 100)}...`);
      });
    }
    
    // 4. 检查外键约束
    console.log('\n=== 外键约束 ===');
    const fkResult = await client.query(`
      SELECT
        tc.constraint_name,
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        rc.update_rule,
        rc.delete_rule
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      JOIN information_schema.referential_constraints AS rc
        ON rc.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
      ORDER BY tc.table_name, tc.constraint_name;
    `);
    
    console.log('外键约束总数:', fkResult.rows.length);
    fkResult.rows.forEach(fk => {
      console.log(`  ${fk.table_name}.${fk.column_name} -> ${fk.foreign_table_name}.${fk.foreign_column_name}`);
    });
    
    // 5. 检查分区表
    console.log('\n=== 分区表信息 ===');
    const partitionResult = await client.query(`
      SELECT
        parent.relname AS parent_table,
        child.relname AS partition_name,
        pg_get_expr(child.relpartbound, child.oid) AS partition_definition,
        pg_relation_size(child.oid) AS partition_size
      FROM pg_inherits
      JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
      JOIN pg_class child ON pg_inherits.inhrelid = child.oid
      WHERE parent.relkind = 'p' OR parent.relkind = 'r'
      ORDER BY parent.relname, child.relname;
    `);
    
    console.log('分区表:', partitionResult.rows.length);
    partitionResult.rows.forEach(partition => {
      const sizeMB = Math.round(partition.partition_size / 1024 / 1024);
      console.log(`  ${partition.parent_table} -> ${partition.partition_name} (${sizeMB} MB)`);
    });
    
  } catch (error) {
    console.error('数据库查询错误:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkDatabase();