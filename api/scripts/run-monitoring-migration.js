#!/usr/bin/env node
/**
 * 运行监控告警系统迁移脚本
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const migrationFile = path.join(__dirname, '..', 'migrations', '20260725_monitoring_enhanced.sql');

console.log('🚀 开始运行监控告警系统迁移...');
console.log(`📄 迁移文件: ${migrationFile}`);

// 检查迁移文件是否存在
if (!fs.existsSync(migrationFile)) {
  console.error(`❌ 迁移文件不存在: ${migrationFile}`);
  process.exit(1);
}

try {
  // 读取数据库连接信息
  const envPath = path.join(__dirname, '..', '.env');
  let databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl && fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const match = envContent.match(/DATABASE_URL=(.+)/);
    if (match) {
      databaseUrl = match[1].trim();
    }
  }
  
  if (!databaseUrl) {
    databaseUrl = 'postgresql://postgres:postgres@localhost:5432/3cloud';
    console.log(`⚠️  使用默认数据库连接: ${databaseUrl}`);
  }
  
  // 读取迁移内容
  const migrationContent = fs.readFileSync(migrationFile, 'utf-8');
  
  console.log('📊 执行迁移SQL...');
  
  // 使用psql执行迁移
  // 注意：这里假设psql命令可用
  try {
    execSync(`psql "${databaseUrl}" -c "${migrationContent.replace(/"/g, '\\"')}"`, {
      stdio: 'inherit',
      shell: true
    });
    console.log('✅ 迁移成功完成！');
  } catch (psqlError) {
    console.error('❌ psql执行失败，尝试使用node-postgres...');
    
    // 尝试使用pg客户端
    const { Client } = require('pg');
    const client = new Client({
      connectionString: databaseUrl
    });
    
    try {
      await client.connect();
      console.log('🔗 数据库连接成功');
      
      // 执行迁移
      await client.query(migrationContent);
      console.log('✅ 迁移成功完成！');
      await client.end();
    } catch (pgError) {
      console.error('❌ PostgreSQL客户端错误:', pgError.message);
      console.log('💡 请手动执行迁移文件：');
      console.log(`psql "${databaseUrl}" -f "${migrationFile}"`);
      process.exit(1);
    }
  }
  
} catch (error) {
  console.error('❌ 迁移过程中出现错误:', error.message);
  process.exit(1);
}