const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'threecloud',
  user: 'postgres',
  password: 'postgres'
});

async function collectKeyMetrics() {
  const client = await pool.connect();
  const report = {
    timestamp: new Date().toISOString(),
    tables: [],
    indexes: [],
    foreignKeys: [],
    partitions: [],
    performanceIssues: []
  };
  
  try {
    console.log('正在收集数据库关键指标...\n');
    
    // 1. 收集表基本信息
    console.log('1. 收集表信息...');
    const tables = await client.query(`
      SELECT 
        t.table_name,
        pg_stat_get_live_tuples(c.oid) as estimated_rows,
        pg_relation_size(c.oid) as table_size_bytes,
        pg_size_pretty(pg_relation_size(c.oid)) as table_size_pretty,
        (SELECT COUNT(*) FROM pg_indexes i WHERE i.tablename = t.table_name) as index_count
      FROM information_schema.tables t
      JOIN pg_class c ON t.table_name = c.relname
      WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
      ORDER BY pg_relation_size(c.oid) DESC;
    `);
    
    report.tables = tables.rows;
    
    // 2. 收集分区表信息
    console.log('2. 收集分区表信息...');
    const partitions = await client.query(`
      SELECT
        parent.relname AS parent_table,
        child.relname AS partition_name,
        pg_relation_size(child.oid) AS partition_size_bytes,
        pg_size_pretty(pg_relation_size(child.oid)) as size_pretty,
        pg_stat_get_live_tuples(child.oid) as row_count
      FROM pg_inherits
      JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
      JOIN pg_class child ON pg_inherits.inhrelid = child.oid
      ORDER BY parent.relname, child.relname;
    `);
    
    report.partitions = partitions.rows;
    
    // 3. 收集索引信息
    console.log('3. 收集索引信息...');
    const indexes = await client.query(`
      SELECT 
        schemaname,
        tablename,
        indexname,
        indexdef,
        pg_relation_size(indexname::regclass) as index_size_bytes,
        pg_size_pretty(pg_relation_size(indexname::regclass)) as index_size_pretty
      FROM pg_indexes 
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname;
    `);
    
    report.indexes = indexes.rows;
    
    // 4. 收集外键信息
    console.log('4. 收集外键信息...');
    const foreignKeys = await client.query(`
      SELECT
        tc.constraint_name,
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
      ORDER BY tc.table_name, tc.constraint_name;
    `);
    
    report.foreignKeys = foreignKeys.rows;
    
    // 5. 分析缺失外键（通过schema文件对比）
    console.log('5. 分析潜在问题...');
    
    // 查找大表
    const largeTables = tables.rows.filter(t => t.table_size_bytes > 100 * 1024 * 1024); // >100MB
    if (largeTables.length > 0) {
      report.performanceIssues.push({
        type: 'LARGE_TABLE',
        message: `发现 ${largeTables.length} 个大表（>100MB）`,
        details: largeTables.map(t => `${t.table_name}: ${t.table_size_pretty}`)
      });
    }
    
    // 查找索引过多的表
    const tablesWithManyIndexes = tables.rows.filter(t => t.index_count > 10); // >10个索引
    if (tablesWithManyIndexes.length > 0) {
      report.performanceIssues.push({
        type: 'MANY_INDEXES',
        message: `发现 ${tablesWithManyIndexes.length} 个表索引过多（>10个）`,
        details: tablesWithManyIndexes.map(t => `${t.table_name}: ${t.index_count} 个索引`)
      });
    }
    
    // 查找没有索引的表
    const tablesWithoutIndexes = tables.rows.filter(t => t.index_count === 0);
    if (tablesWithoutIndexes.length > 0) {
      report.performanceIssues.push({
        type: 'NO_INDEXES',
        message: `发现 ${tablesWithoutIndexes.length} 个表没有索引`,
        details: tablesWithoutIndexes.map(t => t.table_name)
      });
    }
    
    console.log('数据收集完成！');
    
    // 保存报告
    const outputPath = path.join(__dirname, 'database_analysis_report.json');
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`报告已保存到: ${outputPath}`);
    
    return report;
    
  } catch (error) {
    console.error('收集数据时出错:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

collectKeyMetrics().catch(console.error);