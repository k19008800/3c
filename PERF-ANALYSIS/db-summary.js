const { Client } = require('pg');

async function getDatabaseSummary() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    database: 'threecloud',
    user: 'postgres',
    password: 'postgres'
  });

  try {
    await client.connect();

    // 1. 获取表数量
    const tableCountRes = await client.query(`
      SELECT COUNT(*) as table_count FROM pg_tables WHERE schemaname = 'public';
    `);

    // 2. 获取索引数量
    const indexCountRes = await client.query(`
      SELECT COUNT(*) as index_count FROM pg_indexes WHERE schemaname = 'public';
    `);

    // 3. 获取最大的表
    const largestTablesRes = await client.query(`
      SELECT 
        schemaname,
        relname AS tablename,
        n_live_tup AS row_count,
        pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
        pg_size_pretty(pg_relation_size(relid)) AS table_size,
        pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS index_size
      FROM pg_stat_user_tables 
      ORDER BY n_live_tup DESC 
      LIMIT 10;
    `);

    // 4. 获取最活跃的表（按操作计数）
    const activeTablesRes = await client.query(`
      SELECT 
        relname AS tablename,
        n_tup_ins + n_tup_upd + n_tup_del as total_ops,
        n_tup_ins as inserts,
        n_tup_upd as updates,
        n_tup_del as deletes
      FROM pg_stat_user_tables 
      ORDER BY n_tup_ins + n_tup_upd + n_tup_del DESC
      LIMIT 20;
    `);

    // 5. 获取没有索引的外键字段
    const missingIndexesRes = await client.query(`
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name
      FROM 
        information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        LEFT JOIN pg_indexes pi 
          ON pi.tablename = tc.table_name 
          AND pi.indexdef LIKE '%' || kcu.column_name || '%'
      WHERE tc.constraint_type = 'FOREIGN KEY' 
        AND tc.table_schema = 'public'
        AND pi.indexname IS NULL
      GROUP BY tc.table_name, kcu.column_name, ccu.table_name;
    `);

    // 6. 检查大表缺少索引
    const largeTablesMissingIdxRes = await client.query(`
      WITH large_tables AS (
        SELECT 
          relname AS tablename,
          n_live_tup AS row_count
        FROM pg_stat_user_tables 
        WHERE n_live_tup > 10000
      ),
      table_columns AS (
        SELECT 
          t.table_name,
          c.column_name,
          c.data_type
        FROM information_schema.tables t
        JOIN information_schema.columns c ON t.table_name = c.table_name
        WHERE t.table_schema = 'public' 
          AND t.table_type = 'BASE TABLE'
          AND t.table_name IN (SELECT tablename FROM large_tables)
          AND c.column_name NOT LIKE '%id%'  -- 排除ID字段
      )
      SELECT 
        tc.table_name,
        tc.column_name,
        tc.data_type,
        lt.row_count
      FROM table_columns tc
      JOIN large_tables lt ON tc.table_name = lt.tablename
      WHERE NOT EXISTS (
        SELECT 1 FROM pg_indexes pi 
        WHERE pi.tablename = tc.table_name 
          AND pi.indexdef LIKE '%' || tc.column_name || '%'
      )
      LIMIT 20;
    `);

    const summary = {
      tableCount: tableCountRes.rows[0]?.table_count || 0,
      indexCount: indexCountRes.rows[0]?.index_count || 0,
      largestTables: largestTablesRes.rows,
      activeTables: activeTablesRes.rows,
      missingIndexes: missingIndexesRes.rows,
      largeTablesMissingIdx: largeTablesMissingIdxRes.rows
    };

    console.log('=== 数据库概览 ===');
    console.log(`表数量: ${summary.tableCount}`);
    console.log(`索引数量: ${summary.indexCount}`);
    
    console.log('\n=== 最大表（按行数）===');
    summary.largestTables.forEach(t => {
      console.log(`${t.tablename}: ${t.row_count.toLocaleString()} 行, ${t.total_size}`);
    });

    console.log('\n=== 最活跃的表（按操作数）===');
    summary.activeTables.forEach(t => {
      console.log(`${t.tablename}: ${t.total_ops.toLocaleString()} 次操作 (插入:${t.inserts}, 更新:${t.updates}, 删除:${t.deletes})`);
    });

    console.log('\n=== 缺少索引的外键字段 ===');
    if (summary.missingIndexes.length === 0) {
      console.log('所有外键都有索引 ✓');
    } else {
      summary.missingIndexes.forEach(m => {
        console.log(`${m.table_name}.${m.column_name} → ${m.foreign_table_name} (缺少索引)`);
      });
    }

    console.log('\n=== 大表缺少索引的字段 ===');
    if (summary.largeTablesMissingIdx.length === 0) {
      console.log('大表索引覆盖良好 ✓');
    } else {
      summary.largeTablesMissingIdx.forEach(m => {
        console.log(`${m.table_name}.${m.column_name} (${m.data_type}, ${m.row_count}行) 缺少索引`);
      });
    }

    await client.end();
    return summary;

  } catch (error) {
    console.error('Database connection error:', error);
    await client.end();
    throw error;
  }
}

getDatabaseSummary().catch(console.error);