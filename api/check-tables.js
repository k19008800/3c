import pg from 'pg';

const { Client } = pg;

async function checkTables() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    database: 'threecloud',
    user: 'postgres',
    password: 'postgres'
  });

  try {
    await client.connect();

    // Check if tables exist
    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('prompt_audit_logs', 'sensitive_words')
      ORDER BY table_name
    `);

    console.log('Existing tables:', tables.rows.map(r => r.table_name).join(', ') || 'NONE');

    if (tables.rows.length === 0) {
      console.log('\nCreating tables manually...');

      // Create sensitive_words table
      await client.query(`
        CREATE TABLE sensitive_words (
          id SERIAL PRIMARY KEY,
          word VARCHAR(100) NOT NULL,
          category VARCHAR(50) NOT NULL DEFAULT 'general',
          severity VARCHAR(20) NOT NULL DEFAULT 'medium',
          description TEXT,
          hit_count INTEGER NOT NULL DEFAULT 0,
          last_hit_at TIMESTAMPTZ,
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      console.log('✅ Created sensitive_words table');

      // Create prompt_audit_logs table
      await client.query(`
        CREATE TABLE prompt_audit_logs (
          id SERIAL PRIMARY KEY,
          call_log_id INTEGER,
          call_log_created_at TIMESTAMPTZ,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
          api_key_id INTEGER REFERENCES api_keys(id) ON DELETE SET NULL,
          model_name VARCHAR(100),
          prompt TEXT NOT NULL,
          prompt_hash VARCHAR(64) NOT NULL,
          response_summary TEXT,
          response_status response_status NOT NULL DEFAULT 'success',
          is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
          sensitive_words TEXT[],
          audit_status audit_status NOT NULL DEFAULT 'pending',
          audited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          audited_at TIMESTAMPTZ,
          flag_reason TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      console.log('✅ Created prompt_audit_logs table');

      // Create indexes
      await client.query(`
        CREATE INDEX IF NOT EXISTS sensitive_words_word_idx ON sensitive_words(word);
        CREATE INDEX IF NOT EXISTS sensitive_words_category_idx ON sensitive_words(category);
        CREATE INDEX IF NOT EXISTS sensitive_words_enabled_idx ON sensitive_words(enabled);
        CREATE INDEX IF NOT EXISTS prompt_audit_user_idx ON prompt_audit_logs(user_id);
        CREATE INDEX IF NOT EXISTS prompt_audit_api_key_idx ON prompt_audit_logs(api_key_id);
        CREATE INDEX IF NOT EXISTS prompt_audit_model_idx ON prompt_audit_logs(model_name);
        CREATE INDEX IF NOT EXISTS prompt_audit_hash_idx ON prompt_audit_logs(prompt_hash);
        CREATE INDEX IF NOT EXISTS prompt_audit_sensitive_idx ON prompt_audit_logs(is_sensitive);
        CREATE INDEX IF NOT EXISTS prompt_audit_status_idx ON prompt_audit_logs(audit_status);
        CREATE INDEX IF NOT EXISTS prompt_audit_created_idx ON prompt_audit_logs(created_at);
      `);
      console.log('✅ Created indexes');
    }

    // Verify again
    const verify = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('prompt_audit_logs', 'sensitive_words')
      ORDER BY table_name
    `);
    console.log('\nFinal tables:', verify.rows.map(r => r.table_name).join(', '));

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

checkTables();
