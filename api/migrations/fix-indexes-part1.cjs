const { Client } = require('pg');

async function fixIndexes() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    database: 'threecloud',
    user: 'postgres',
    password: 'postgres'
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL\n');

    // 1. 安装 pg_trgm 扩展
    console.log('📦 Step 1: 安装 pg_trgm 扩展');
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
      console.log('  ✅ pg_trgm 扩展已安装\n');
    } catch (err) {
      console.log('  ❌ 安装失败:', err.message, '\n');
    }

    // 2. 创建全文搜索索引
    console.log('🔍 Step 2: 创建全文搜索索引');
    
    const trgmIndexes = [
      { name: 'users_email_trgm_idx', table: 'users', field: 'email' },
      { name: 'users_nickname_trgm_idx', table: 'users', field: 'nickname' },
      { name: 'vendors_name_trgm_idx', table: 'vendors', field: 'name' }
    ];

    for (const idx of trgmIndexes) {
      try {
        await client.query(`DROP INDEX IF EXISTS ${idx.name}`);
        await client.query(`
          CREATE INDEX CONCURRENTLY ${idx.name} 
          ON ${idx.table} USING gin (${idx.field} gin_trgm_ops)
        `);
        console.log(`  ✅ ${idx.name}`);
      } catch (err) {
        console.log(`  ❌ ${idx.name}: ${err.message}`);
      }
    }
    console.log('');

    // 3. 检查 call_logs 分区表
    console.log('📊 Step 3: 检查 call_logs 分区表');
    const partitions = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE tablename LIKE 'call_logs_%'
      ORDER BY tablename DESC
      LIMIT 3
    `);
    
    console.log(`  找到 ${partitions.rows.length} 个分区表:`);
    partitions.rows.forEach(r => console.log(`    - ${r.tablename}`));
    console.log('');

    // 在每个分区上创建索引
    console.log('  创建 model_name 索引:');
    for (const p of partitions.rows) {
      const idxName = `${p.tablename}_model_trgm_idx`;
      try {
        await client.query(`DROP INDEX IF EXISTS ${idxName}`);
        await client.query(`
          CREATE INDEX CONCURRENTLY ${idxName} 
          ON ${p.tablename} USING gin (model_name gin_trgm_ops)
        `);
        console.log(`    ✅ ${idxName}`);
      } catch (err) {
        console.log(`    ❌ ${idxName}: ${err.message}`);
      }
    }
    console.log('');

    // 4. 检查 agent_clients 表结构
    console.log('🔍 Step 4: 检查 agent_clients 表结构');
    const agentCols = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'agent_clients'
      ORDER BY ordinal_position
    `);
    
    console.log('  agent_clients 字段:');
    agentCols.rows.forEach(r => console.log(`    - ${r.column_name} (${r.data_type})`));
    console.log('');

    // 根据实际字段创建索引
    const hasParentId = agentCols.rows.some(r => r.column_name === 'parent_id');
    const hasStatus = agentCols.rows.some(r => r.column_name === 'status');
    
    if (hasParentId) {
      try {
        await client.query(`DROP INDEX IF EXISTS agent_clients_parent_idx`);
        await client.query(`CREATE INDEX CONCURRENTLY agent_clients_parent_idx ON agent_clients (parent_id)`);
        console.log('  ✅ agent_clients_parent_idx');
      } catch (err) {
        console.log('  ❌ agent_clients_parent_idx:', err.message);
      }
    } else {
      console.log('  ⚠️  parent_id 字段不存在，跳过索引');
    }
    
    if (hasStatus) {
      try {
        await client.query(`DROP INDEX IF EXISTS agent_clients_status_idx`);
        await client.query(`CREATE INDEX CONCURRENTLY agent_clients_status_idx ON agent_clients (status)`);
        console.log('  ✅ agent_clients_status_idx');
      } catch (err) {
        console.log('  ❌ agent_clients_status_idx:', err.message);
      }
    } else {
      console.log('  ⚠️  status 字段不存在，跳过索引');
    }
    console.log('');

    // 5. 检查 redemption_orders 表
    console.log('🔍 Step 5: 检查 redemption_orders 表');
    const redemptionTables = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE tablename LIKE '%redemption%'
    `);
    
    console.log('  相关表:');
    redemptionTables.rows.forEach(r => console.log(`    - ${r.tablename}`));
    console.log('');

    if (redemptionTables.rows.length > 0) {
      const actualTable = redemptionTables.rows[0].tablename;
      if (actualTable !== 'redemption_orders') {
        console.log(`  ⚠️  实际表名是 ${actualTable}，修正索引创建`);
        
        // 检查该表是否有 status 和 created_at 字段
        const cols = await client.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = '${actualTable}'
        `);
        const hasStatus = cols.rows.some(r => r.column_name === 'status');
        const hasCreatedAt = cols.rows.some(r => r.column_name === 'created_at');
        
        if (hasStatus && hasCreatedAt) {
          try {
            await client.query(`DROP INDEX IF EXISTS ${actualTable}_status_created_idx`);
            await client.query(`
              CREATE INDEX CONCURRENTLY ${actualTable}_status_created_idx 
              ON ${actualTable} (status, created_at DESC)
            `);
            console.log(`  ✅ ${actualTable}_status_created_idx`);
          } catch (err) {
            console.log('  ❌ 索引创建失败:', err.message);
          }
        }
      }
    } else {
      console.log('  ⚠️  未找到 redemption 相关表，跳过索引');
    }
    console.log('');

    // 6. 最终验证
    console.log('📋 Step 6: 验证所有索引');
    const allIndexes = await client.query(`
      SELECT indexname, tablename 
      FROM pg_indexes 
      WHERE indexname LIKE '%trgm%' 
         OR indexname LIKE '%_parent_%'
         OR indexname LIKE '%_status_%'
         OR indexname IN (
           'audit_logs_action_idx',
           'balance_logs_user_created_idx',
           'security_events_risk_created_idx'
         )
      ORDER BY tablename, indexname
    `);

    console.log(`\n  共 ${allIndexes.rows.length} 个索引:`);
    allIndexes.rows.forEach(r => {
      const isTrgm = r.indexname.includes('trgm');
      console.log(`    ${isTrgm ? '🔍' : '📊'} ${r.indexname} (${r.tablename})`);
    });

  } catch (err) {
    console.error('❌ 执行失败:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

fixIndexes();
