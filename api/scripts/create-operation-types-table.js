// 快速创建 operation_types 表
import pg from 'pg';

const { Pool } = pg;

async function main() {
  const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: '3cloud',
    user: 'postgres',
    password: 'postgres',
  });

  try {
    console.log('🔄 创建 operation_types 表...');

    // 创建 operation_category 枚举（如果不存在）
    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE operation_category AS ENUM ('auth', 'api_key', 'finance', 'profile', 'agent', 'system');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('✅ operation_category 枚举已就绪');

    // 创建表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS operation_types (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        category operation_category NOT NULL,
        description TEXT,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        is_system BOOLEAN NOT NULL DEFAULT FALSE,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log('✅ operation_types 表已创建');

    // 创建索引
    await pool.query(`
      CREATE INDEX IF NOT EXISTS operation_types_category_idx ON operation_types(category);
      CREATE INDEX IF NOT EXISTS operation_types_enabled_idx ON operation_types(enabled);
    `);
    console.log('✅ 索引已创建');

    console.log('\n✅ 数据库迁移完成！');
  } catch (err) {
    console.error('❌ 错误:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
