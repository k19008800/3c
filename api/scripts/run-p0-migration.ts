// 执行 P0 性能优化迁移
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'threecloud',
    user: 'postgres',
    password: 'postgres',
  });

  try {
    const sqlPath = path.join(__dirname, '../migrations/2026-07-24-p0-perf-indexes.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');
    
    console.log('🚀 开始执行 P0 性能优化迁移...\n');
    
    // 分割 SQL 语句（按分号分割，忽略注释）
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    let success = 0;
    let failed = 0;
    
    for (const stmt of statements) {
      if (stmt.startsWith('--') || stmt.length < 10) continue;
      
      try {
        await pool.query(stmt);
        // 提取语句类型
        const type = stmt.match(/^(CREATE|ALTER|ANALYZE)/i)?.[1] || 'SQL';
        console.log(`✅ ${type} 语句执行成功`);
        success++;
      } catch (err: any) {
        // 忽略 "已存在" 错误
        if (err.message.includes('already exists') || err.message.includes('duplicate')) {
          console.log(`⏭  已存在，跳过`);
          success++;
        } else {
          console.error(`❌ 执行失败: ${err.message.substring(0, 100)}`);
          failed++;
        }
      }
    }
    
    console.log(`\n📊 迁移完成: ${success} 成功, ${failed} 失败`);
    
  } finally {
    await pool.end();
  }
}

runMigration().catch(console.error);
