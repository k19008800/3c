const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'threecloud',
  user: 'postgres',
  password: 'postgres'
});

async function analyzePerformance() {
  const client = await pool.connect();
  try {
    console.log('正在分析数据库性能瓶颈...\n');
    
    // 1. 分析缺失索引
    console.log('=== 潜在缺失索引分析 ===');
    
    // 分析 WHERE/JOIN 字段
    const missingIndexAnalysis = await client.query(`
      -- 这里可以添加更复杂的分析，但目前先列出所有表和字段
      SELECT 
        t.table_name,
        c.column_name,
        c.data_type,
        CASE 
          WHEN c.column_name LIKE '%_id' THEN 'FK 候选字段'
          WHEN c.column_name LIKE '%_at' THEN '时间字段'
          WHEN c.column_name LIKE '%status%' THEN '状态字段'
          ELSE '常规字段'
        END as field_type,
        (
          SELECT COUNT(*) 
          FROM pg_indexes i 
          WHERE i.tablename = t.table_name 
          AND i.indexdef LIKE '%' || c.column_name || '%'
        ) as in_index_count
      FROM information_schema.tables t
      JOIN information_schema.columns c ON t.table_name = c.table_name
      WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        AND c.column_name NOT IN ('id', 'created_at', 'updated_at')
      ORDER BY t.table_name, in_index_count ASC, field_type
      LIMIT 100;
    `);
    
    // 2. 分析大表性能
    console.log('\n=== 大表性能分析 ===');
    const largeTables = await client.query(`
      SELECT 
        relname as table_name,
        n_live_tup as row_count,
        pg_relation_size(relid) as table_size,
        pg_size_pretty(pg_relation_size(relid)) as size_pretty
      FROM pg_stat_user_tables 
      WHERE schemaname = 'public'
      ORDER BY pg_relation_size(relid) DESC
      LIMIT 10;
    `);
    
    console.log('最大的10个表:');
    largeTables.rows.forEach(table => {
      console.log(`  ${table.table_name}: ${table.row_count} 行, ${table.size_pretty}`);
    });
    
    // 3. 分析索引使用情况
    console.log('\n=== 索引使用率分析 ===');
    const indexUsage = await client.query(`
      SELECT 
        schemaname,
        tablename,
        indexname,
        idx_scan as index_scans,
        idx_tup_read as tuples_read,
        idx_tup_fetch as tuples_fetched
      FROM pg_stat_user_indexes 
      WHERE schemaname = 'public'
        AND idx_scan < 1000  -- 很少使用的索引
      ORDER BY idx_scan ASC;
    `);
    
    console.log('使用率低的索引（扫描次数 < 1000）:');
    indexUsage.rows.forEach(index => {
      console.log(`  ${index.schemaname}.${index.tablename}.${index.indexname}: ${index.index_scans} 次扫描`);
    });
    
    // 4. 分析分区表性能
    console.log('\n=== 分区表分析 ===');
    const partitions = await client.query(`
      SELECT
        parent.relname AS parent_table,
        child.relname AS partition_name,
        pg_get_expr(child.relpartbound, child.oid) AS partition_definition,
        pg_relation_size(child.oid) AS partition_size,
        pg_size_pretty(pg_relation_size(child.oid)) as size_pretty,
        pg_stat_get_live_tuples(child.oid) as row_count
      FROM pg_inherits
      JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
      JOIN pg_class child ON pg_inherits.inhrelid = child.oid
      WHERE parent.relkind = 'p' OR parent.relkind = 'r'
      ORDER BY parent.relname, child.relname;
    `);
    
    console.log('分区表详细信息:');
    const partitionGroups = {};
    partitions.rows.forEach(partition => {
      if (!partitionGroups[partition.parent_table]) {
        partitionGroups[partition.parent_table] = [];
      }
      partitionGroups[partition.parent_table].push(partition);
    });
    
    for (const [parent, partitions] of Object.entries(partitionGroups)) {
      console.log(`\n${parent}:`);
      partitions.forEach(p => {
        console.log(`  ${p.partition_name}: ${p.row_count || 0} 行, ${p.size_pretty}`);
      });
    }
    
    // 5. 连接池配置检查
    console.log('\n=== 连接池配置 ===');
    const connectionStats = await client.query(`
      SELECT 
        count(*) as total_connections,
        sum(case when state = 'active' then 1 else 0 end) as active_connections,
        sum(case when state = 'idle' then 1 else 0 end) as idle_connections
      FROM pg_stat_activity 
      WHERE backend_type = 'client backend';
    `);
    
    console.log(`连接统计:`);
    console.log(`  总连接数: ${connectionStats.rows[0].total_connections}`);
    console.log(`  活动连接: ${connectionStats.rows[0].active_connections}`);
    console.log(`  空闲连接: ${connectionStats.rows[0].idle_connections}`);
    
    // 6. 慢查询分析（需要 pg_stat_statements 扩展）
    console.log('\n=== 慢查询分析（需要 pg_stat_statements 扩展） ===');
    try {
      const slowQueries = await client.query(`
        SELECT 
          query,
          calls,
          total_time,
          mean_time,
          rows
        FROM pg_stat_statements 
        WHERE mean_time > 100  -- 超过100ms的查询
        ORDER BY mean_time DESC 
        LIMIT 5;
      `);
      
      if (slowQueries.rows.length > 0) {
        console.log('最慢的5个查询:');
        slowQueries.rows.forEach(query => {
          console.log(`  平均耗时: ${query.mean_time}ms, 调用次数: ${query.calls}`);
          console.log(`  查询: ${query.query.substring(0, 200)}...`);
        });
      } else {
        console.log('未发现慢查询（平均耗时 > 100ms）');
      }
    } catch (error) {
      console.log('pg_stat_statements 扩展未启用，跳过慢查询分析');
    }
    
  } catch (error) {
    console.error('分析错误:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

analyzePerformance();