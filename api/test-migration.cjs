const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'threecloud',
  user: 'postgres',
  password: 'postgres'
});

async function testMigration() {
  try {
    await client.connect();
    console.log('✅ 数据库连接成功\n');
    
    // 读取迁移文件
    const migrationPath = path.join(__dirname, 'migrations', '2026-07-24-db-perf-indexes.sql');
    const migrationContent = fs.readFileSync(migrationPath, 'utf8');
    
    // 只执行验证部分，不实际创建索引
    const verificationQueries = [
      // 检查现有分析索引
      `SELECT 
          schemaname,
          tablename,
          indexname,
          indexdef
      FROM pg_indexes
      WHERE tablename LIKE 'call_logs_%' 
          AND indexname LIKE '%analysis%'
      ORDER BY tablename, indexname;`,
      
      // 检查分区表列
      `SELECT 
          column_name,
          data_type,
          table_name
      FROM information_schema.columns
      WHERE table_name LIKE 'call_logs_%'
          AND column_name IN ('model_name', 'ip', 'duration_ms')
          AND table_name LIKE '%202607%'
      ORDER BY table_name, column_name;`,
      
      // 检查外键
      `SELECT 
          tc.table_name,
          tc.constraint_name,
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
          AND tc.constraint_type = 'FOREIGN KEY'
      LIMIT 5;`
    ];
    
    console.log('=== 迁移前验证 ===\n');
    
    for (const query of verificationQueries) {
      const desc = getQueryDescription(query);
      console.log(`📊 ${desc}`);
      
      try {
        const result = await client.query(query);
        if (result.rows.length === 0) {
          console.log('  结果：无数据\n');
        } else {
          console.log(`  结果：${result.rows.length} 条记录\n`);
          if (desc.includes('索引')) {
            result.rows.forEach(row => {
              console.log(`  表: ${row.tablename}, 索引: ${row.indexname}`);
            });
            console.log('');
          }
        }
      } catch (error) {
        console.log(`  错误: ${error.message}\n`);
      }
    }
    
    // 检查索引创建语句是否正确
    const indexCreationStatements = migrationContent.match(/CREATE INDEX CONCURRENTLY.*?ON.*?\([^)]+\);/gs);
    console.log('=== 迁移文件分析 ===\n');
    console.log(`📋 迁移文件包含 ${indexCreationStatements ? indexCreationStatements.length : 0} 个索引创建语句\n`);
    
    if (indexCreationStatements) {
      console.log('📝 将创建的索引：');
      indexCreationStatements.forEach((stmt, i) => {
        const match = stmt.match(/CREATE INDEX CONCURRENTLY.*?ON (\w+) \(([^)]+)\)/);
        if (match) {
          console.log(`  ${i+1}. ${match[1]} -> (${match[2]})`);
        }
      });
      console.log('');
    }
    
    // 显示建议的执行命令
    console.log('=== 执行建议 ===\n');
    console.log('1. 备份数据库：');
    console.log('   pg_dump -h localhost -U postgres -d threecloud -F c -f backup_$(date +%Y-%m-%d).dump\n');
    
    console.log('2. 执行迁移（开发环境）：');
    console.log('   psql -h localhost -U postgres -d threecloud -f migrations/2026-07-24-db-perf-indexes.sql\n');
    
    console.log('3. 验证迁移：');
    console.log('   查看新创建的索引是否有效\n');
    
    await client.end();
    console.log('✅ 迁移测试完成\n');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    process.exit(1);
  }
}

function getQueryDescription(query) {
  if (query.includes('indexname LIKE')) return '检查分析索引';
  if (query.includes('column_name IN')) return '检查分区表列';
  if (query.includes('FOREIGN KEY')) return '检查外键约束';
  return '未知查询';
}

testMigration();