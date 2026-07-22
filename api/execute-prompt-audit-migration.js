import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    database: 'threecloud',
    user: 'postgres',
    password: 'postgres'
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', '2026-07-22-prompt-audit.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    console.log('Migration file read');

    // Execute migration
    await client.query(sql);
    console.log('✅ Migration executed successfully');

    // Verify tables
    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('prompt_audit_logs', 'sensitive_words')
    `);
    console.log('Created tables:', tables.rows.map(r => r.table_name).join(', '));

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    if (error.message.includes('already exists')) {
      console.log('Tables already exist, skipping migration');
    }
  } finally {
    await client.end();
  }
}

runMigration();
