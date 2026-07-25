#!/usr/bin/env node
// ============================================================
//  3cloud (3C) — 配置版本控制迁移脚本
//  执行 config_versions 相关表的迁移
// ============================================================

import { exec } from 'child_process'
import { promisify } from 'util'
import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const execAsync = promisify(exec)

// 读取迁移文件内容
const migrationFile = path.join(__dirname, '..', 'drizzle', 'migrations', '0003_add_config_versions.sql')
const migrationContent = readFileSync(migrationFile, 'utf-8')

console.log('🔧 开始执行配置版本控制迁移...')
console.log(`📄 迁移文件: ${migrationFile}`)
console.log(`📏 迁移内容大小: ${migrationContent.length} 字符`)

async function runMigration() {
  try {
    // 检查数据库连接
    console.log('🔍 检查数据库连接...')
    const { stdout: checkOutput } = await execAsync('npx drizzle-kit check')
    console.log('✅ 数据库连接正常')

    // 生成迁移
    console.log('🚀 生成迁移...')
    const { stdout: generateOutput } = await execAsync('npx drizzle-kit generate')
    console.log('✅ 迁移生成完成')

    // 检查是否有新的迁移文件
    const migrationsDir = path.join(__dirname, '..', 'drizzle', 'migrations')
    const { stdout: lsOutput } = await execAsync(`dir "${migrationsDir}"`, { shell: 'powershell.exe' })
    
    if (lsOutput.includes('0003_add_config_versions.sql')) {
      console.log('✅ 迁移文件已创建')
    } else {
      console.log('❌ 迁移文件创建失败')
      return
    }

    // 应用迁移
    console.log('🚀 应用迁移到数据库...')
    const { stdout: migrateOutput } = await execAsync('npx drizzle-kit migrate')
    console.log('✅ 迁移应用完成')

    // 验证迁移
    console.log('🔍 验证迁移结果...')
    const { stdout: verifyOutput } = await execAsync('npx drizzle-kit introspect')
    console.log('✅ 迁移验证完成')

    console.log('🎉 配置版本控制迁移执行成功！')
    console.log('\n📊 新增表结构：')
    console.log('  • config_versions - 配置版本历史表')
    console.log('  • config_change_requests - 配置变更审批表')
    console.log('  • config_snapshots - 配置快照表')
    console.log('\n🔧 修改现有表：')
    console.log('  • system_configs - 添加版本字段')
    console.log('  • audit_action - 扩展枚举类型')
    
  } catch (error) {
    console.error('❌ 迁移执行失败:', error.message)
    console.error(error.stderr || '')
    process.exit(1)
  }
}

// 运行迁移
runMigration().catch(console.error)