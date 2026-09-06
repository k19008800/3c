const fs = require('fs');
const path = require('path');

/**
 * 本地 E2E 前置：为资金审核用管理员准备操作级 2FA。
 * 仅写 user_2fa.totp_enabled，不打开 users.two_factor_enabled，避免改变登录链路。
 */
module.exports = async function globalSetup() {
  const envPath = path.join(__dirname, '..', 'api', '.env');
  const env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const dbUrl = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim()
    || process.env.DATABASE_URL
    || 'postgres://postgres:postgres@localhost:5432/threecloud_v3';
  const postgresPath = path.join(__dirname, '..', 'api', 'node_modules', 'postgres');
  const postgres = require(postgresPath);
  const sql = postgres(dbUrl);
  try {
    const rows = await sql`SELECT id FROM users WHERE email = 'admin@3cloud.dev' LIMIT 1`;
    if (rows.length === 0) throw new Error('admin@3cloud.dev not found; run db:seed first');
    const userId = rows[0].id;
    // RFC 6238 测试密钥，仅用于本地 E2E；不写 users.two_factor_enabled。
    await sql`
      INSERT INTO user_2fa (user_id, totp_secret, totp_enabled, backup_codes, created_at, updated_at)
      VALUES (${userId}, 'JBSWY3DPEHPK3PXP', true, '[]'::jsonb, NOW(), NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        totp_secret = EXCLUDED.totp_secret,
        totp_enabled = true,
        updated_at = NOW()
    `;
    console.log('[e2e setup] operation 2FA ready for admin@3cloud.dev');
  } finally {
    await sql.end();
  }
};
