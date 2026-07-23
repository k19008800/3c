import pg from 'pg';
const { Pool } = pg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function analyzeDatabase() {
  // 连接到数据库
  const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'threecloud',
    user: 'postgres',
    password: 'postgres'
  });

  try {
    console.log('Starting database analysis...');
    const client = await pool.connect();
    
    // 1. 读取所有 schema 文件
    console.log('\n1. Reading Drizzle schema definitions...');
    const schemaDir = path.join(__dirname, 'src/db/schema');
    const schemaFiles = fs.readdirSync(schemaDir).filter(f => f.endsWith('.ts'));
    
    const schemaAnalysis = {};
    for (const file of schemaFiles) {
      if (file === 'index.ts') continue;
      
      const filePath = path.join(schemaDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      
      // 简单解析表结构
      const tableRegex = /export const (\w+) = pgTable\(\s*"(\w+)"[^)]+\)/gs;
      const tables = [];
      let match;
      
      while ((match = tableRegex.exec(content)) !== null) {
        const tableName = match[2];
        tables.push(tableName);
      }
      
      if (tables.length > 0) {
        schemaAnalysis[file] = tables;
      }
    }
    
    console.log(`✓ Found schema definitions in ${Object.keys(schemaAnalysis).length} files`);
    
    // 2. 查询数据库元数据
    console.log('\n2. Querying database metadata...');
    
    // 查询所有索引
    const indexesResult = await client.query(`
      SELECT 
        tablename,
        indexname,
        indexdef
      FROM pg_indexes 
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `);
    
    // 查询所有外键
    const fkResult = await client.query(`
      SELECT 
        tc.table_name,
        tc.constraint_name,
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
      ORDER BY tc.table_name, tc.constraint_name
    `);
    
    // 查询表统计信息
    const statsResult = await client.query(`
      SELECT 
        relname,
        n_live_tup,
        n_dead_tup,
        last_vacuum,
        last_autovacuum,
        last_analyze,
        last_autoanalyze
      FROM pg_stat_user_tables
      ORDER BY n_live_tup DESC
    `);
    
    // 查询表大小信息
    const sizeResult = await client.query(`
      SELECT 
        table_name,
        pg_size_pretty(pg_total_relation_size('"' || table_schema || '"."' || table_name || '"')) as total_size,
        pg_size_pretty(pg_table_size('"' || table_schema || '"."' || table_name || '"')) as table_size,
        pg_size_pretty(pg_indexes_size('"' || table_schema || '"."' || table_name || '"')) as index_size
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY pg_total_relation_size('"' || table_schema || '"."' || table_name || '"') DESC
    `);
    
    // 查询分区表信息
    const partitionsResult = await client.query(`
      SELECT 
        inhparent::regclass AS parent_table,
        inhrelid::regclass AS partition_name
      FROM pg_inherits
      WHERE inhparent::regclass::text LIKE 'call_logs%' 
         OR inhparent::regclass::text LIKE 'commission_logs%'
      ORDER BY inhparent, inhrelid
    `);
    
    // 3. 分析缺失索引
    console.log('\n3. Analyzing missing indexes...');
    
    // 分析高频查询模式（基于 schema 推断）
    const potentialMissingIndexes = [];
    
    // 检查常见查询模式
    const queryPatterns = [
      { table: 'call_logs', columns: ['status', 'created_at'], reason: '状态和时间范围查询' },
      { table: 'users', columns: ['email', 'status'], reason: '邮箱和状态查询' },
      { table: 'balance_logs', columns: ['user_id', 'created_at'], reason: '用户余额流水查询' },
      { table: 'commission_logs', columns: ['agent_id', 'status', 'created_at'], reason: '代理商佣金查询' },
      { table: 'recharge_orders', columns: ['user_id', 'status', 'created_at'], reason: '用户充值订单查询' },
    ];
    
    // 检查现有索引
    const existingIndexes = {};
    indexesResult.rows.forEach(row => {
      if (!existingIndexes[row.tablename]) {
        existingIndexes[row.tablename] = [];
      }
      existingIndexes[row.tablename].push(row.indexdef.toLowerCase());
    });
    
    // 检查缺失索引
    for (const pattern of queryPatterns) {
      if (!existingIndexes[pattern.table]) continue;
      
      const indexPattern = pattern.columns.map(col => `\\b${col}\\b`).join('.*');
      const regex = new RegExp(indexPattern, 'i');
      
      const hasIndex = existingIndexes[pattern.table].some(indexDef => 
        regex.test(indexDef) || indexDef.includes(pattern.table + '_' + pattern.columns.join('_'))
      );
      
      if (!hasIndex) {
        potentialMissingIndexes.push({
          table: pattern.table,
          columns: pattern.columns,
          reason: pattern.reason,
          suggestedIndex: `CREATE INDEX idx_${pattern.table}_${pattern.columns.join('_')} ON ${pattern.table}(${pattern.columns.join(', ')});`
        });
      }
    }
    
    // 4. 分析外键级联风险
    console.log('\n4. Analyzing foreign key cascade risks...');
    const cascadeRisks = [];
    
    fkResult.rows.forEach(row => {
      if (row.delete_rule === 'CASCADE') {
        cascadeRisks.push({
          table: row.table_name,
          foreignTable: row.foreign_table_name,
          constraint: row.constraint_name,
          deleteRule: row.delete_rule,
          risk: '级联删除可能影响数据完整性'
        });
      }
    });
    
    // 5. 分析分区表设计
    console.log('\n5. Analyzing partition table design...');
    const partitionAnalysis = {};
    
    partitionsResult.rows.forEach(row => {
      const parent = row.parent_table;
      const partition = row.partition_name;
      
      if (!partitionAnalysis[parent]) {
        partitionAnalysis[parent] = [];
      }
      partitionAnalysis[parent].push(partition);
    });
    
    // 6. 构建最终报告
    console.log('\n6. Building final report...');
    
    const report = {
      metadata: {
        totalTables: sizeResult.rows.length,
        totalIndexes: indexesResult.rows.length,
        totalForeignKeys: fkResult.rows.length,
        analysisTimestamp: new Date().toISOString()
      },
      schemaAnalysis: schemaAnalysis,
      tableStatistics: statsResult.rows.map(row => ({
        tableName: row.relname,
        liveRows: Number(row.n_live_tup),
        deadRows: Number(row.n_dead_tup),
        lastVacuum: row.last_vacuum,
        lastAnalyze: row.last_analyze
      })),
      tableSizes: sizeResult.rows.map(row => ({
        tableName: row.table_name,
        totalSize: row.total_size,
        tableSize: row.table_size,
        indexSize: row.index_size
      })),
      indexes: indexesResult.rows.map(row => ({
        tableName: row.tablename,
        indexName: row.indexname,
        definition: row.indexdef
      })),
      foreignKeys: fkResult.rows.map(row => ({
        tableName: row.table_name,
        constraintName: row.constraint_name,
        columnName: row.column_name,
        foreignTable: row.foreign_table_name,
        foreignColumn: row.foreign_column_name,
        deleteRule: row.delete_rule,
        updateRule: row.update_rule
      })),
      partitions: partitionAnalysis,
      performanceAnalysis: {
        missingIndexes: potentialMissingIndexes,
        cascadeRisks: cascadeRisks,
        recommendations: [
          {
            category: '索引优化',
            items: potentialMissingIndexes.length > 0 
              ? potentialMissingIndexes.map(mi => `表 ${mi.table} 建议添加索引: ${mi.suggestedIndex}`)
              : ['索引设计良好，无显著缺失']
          },
          {
            category: '外键约束',
            items: cascadeRisks.length > 0
              ? cascadeRisks.map(cr => `表 ${cr.table} 的外键 ${cr.constraint} 使用级联删除，请确保这是预期的行为`)
              : ['外键约束设计合理']
          },
          {
            category: '分区表',
            items: Object.keys(partitionAnalysis).length > 0
              ? Object.entries(partitionAnalysis).map(([parent, partitions]) => 
                  `分区表 ${parent} 有 ${partitions.length} 个子分区`)
              : ['暂无分区表']
          },
          {
            category: '表大小监控',
            items: sizeResult.rows
              .filter(row => {
                const sizeMatch = row.total_size.match(/(\d+\.?\d*)\s*(\w+)/);
                if (!sizeMatch) return false;
                const size = parseFloat(sizeMatch[1]);
                const unit = sizeMatch[2].toLowerCase();
                // 检查是否超过 1GB
                return (unit === 'gb' && size >= 1) || 
                       (unit === 'mb' && size >= 1000);
              })
              .map(row => `表 ${row.table_name} 大小为 ${row.total_size}，建议监控增长趋势`)
          }
        ]
      }
    };
    
    client.release();
    await pool.end();
    
    // 7. 保存报告
    const reportDir = path.join(__dirname, '..', '..', '3cloud', 'PERF-ANALYSIS');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    const reportPath = path.join(reportDir, 'database-schema.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`\n✓ Analysis complete! Report saved to: ${reportPath}`);
    
    // 输出关键发现
    console.log('\n' + '='.repeat(60));
    console.log('KEY FINDINGS');
    console.log('='.repeat(60));
    console.log(`• 数据库包含 ${report.metadata.totalTables} 张表`);
    console.log(`• 共有 ${report.metadata.totalIndexes} 个索引`);
    console.log(`• 共有 ${report.metadata.totalForeignKeys} 个外键约束`);
    console.log(`• 发现 ${report.performanceAnalysis.missingIndexes.length} 个潜在缺失索引`);
    console.log(`• 发现 ${report.performanceAnalysis.cascadeRisks.length} 个级联删除风险`);
    console.log(`• 最大的表: ${report.tableStatistics[0]?.tableName} (${report.tableStatistics[0]?.liveRows} 行)`);
    
    return report;
    
  } catch (error) {
    console.error('Error during analysis:', error.message);
    await pool.end();
    throw error;
  }
}

analyzeDatabase().catch(console.error);