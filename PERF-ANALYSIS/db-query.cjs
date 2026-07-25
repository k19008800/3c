const { Client } = require('pg');

async function getDatabaseInfo() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    database: 'threecloud',
    user: 'postgres',
    password: 'postgres'
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL database');

    // 1. 获取所有表
    const tablesRes = await client.query(`
      SELECT 
        schemaname,
        tablename,
        tableowner,
        tablespace,
        hasindexes,
        hasrules,
        hastriggers,
        rowsecurity
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `);

    console.log('\n=== 表清单 ===');
    for (const table of tablesRes.rows) {
      console.log(`- ${table.tablename}`);
    }

    // 2. 获取每个表的字段信息
    console.log('\n=== 表结构详情 ===');
    for (const table of tablesRes.rows) {
      const columnsRes = await client.query(`
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default,
          character_maximum_length
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = $1
        ORDER BY ordinal_position;
      `, [table.tablename]);

      console.log(`\n表: ${table.tablename}`);
      for (const col of columnsRes.rows) {
        console.log(`  - ${col.column_name} (${col.data_type}${col.character_maximum_length ? `(${col.character_maximum_length})` : ''}) ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
      }
    }

    // 3. 获取索引信息
    const indexesRes = await client.query(`
      SELECT 
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes 
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname;
    `);

    console.log('\n=== 索引清单 ===');
    for (const idx of indexesRes.rows) {
      console.log(`表: ${idx.tablename}`);
      console.log(`  索引: ${idx.indexname}`);
      console.log(`  定义: ${idx.indexdef}`);
      console.log('');
    }

    // 4. 获取外键关系
    const fkRes = await client.query(`
      SELECT
        tc.table_schema,
        tc.table_name,
        kcu.column_name,
        ccu.table_schema AS foreign_table_schema,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM 
        information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' 
        AND tc.table_schema = 'public'
      ORDER BY tc.table_name, kcu.column_name;
    `);

    console.log('\n=== 外键关系 ===');
    for (const fk of fkRes.rows) {
      console.log(`${fk.table_name}.${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name}`);
    }

    // 5. 获取表统计信息
    const statsRes = await client.query(`
      SELECT 
        schemaname,
        relname AS tablename,
        n_live_tup AS live_rows,
        n_dead_tup AS dead_rows,
        n_tup_ins AS inserts,
        n_tup_upd AS updates,
        n_tup_del AS deletes,
        n_tup_hot_upd AS hot_updates,
        n_live_tup + n_dead_tup AS total_rows
      FROM pg_stat_user_tables 
      ORDER BY n_live_tup DESC;
    `);

    console.log('\n=== 表统计信息 (行数+操作频率) ===');
    for (const stat of statsRes.rows) {
      console.log(`${stat.tablename}: ${stat.live_rows} 行活跃，${stat.total_rows} 行总计`);
      console.log(`  操作: 插入=${stat.inserts}, 更新=${stat.updates}, 删除=${stat.deletes}, 热更新=${stat.hot_updates}`);
    }

    await client.end();
    return {
      tables: tablesRes.rows,
      stats: statsRes.rows,
      indexes: indexesRes.rows,
      foreignKeys: fkRes.rows
    };

  } catch (error) {
    console.error('Database connection error:', error);
    await client.end();
    throw error;
  }
}

// 运行函数
getDatabaseInfo().catch(console.error);