-- ============================================================
-- 演示数据用户池扩充（生产用）
-- ============================================================
-- 背景：生产库仅 4 个 API Key / 3 个客户用户。若把 100 万条消费记录
-- 全部挂在这几个账号上，后台的「用户用量 Top N」会退化成几行，
-- 演示效果失真，且这些账号是真实存在的（demo-ent@3cloud.dev 等），会被污染。
--
-- 做法：为 seed 数据**新建独立演示用户 + 独立密钥**，与真实账号完全隔离。
--       清理时只需删这些用户，消费记录由 ON DELETE CASCADE 自动带走。
--
-- 数量依据：100 万条 / 60 个用户 ≈ 每人 1.7 万条，落在最近 180 天窗口内，
--       日均约 90 条/人，足以让 Top N 榜单、用户详情页有真实形态。
--
-- 幂等：已存在则跳过整个 DO 块，可重复执行。
-- ============================================================

\timing on

BEGIN;

-- ------------------------------------------------------------
-- 60 个演示用户 + 每个 1 个专用密钥 + 1 条余额
--
-- ⚠️ 字段说明（已核对生产 users / api_keys / customer_balances 实际结构）：
--   users.name             NOT NULL varchar(100) —— 必须提供
--   users.balance          ✗ 不存在，余额在 customer_balances
--   users.role             枚举 user_role，取 'customer'
--   api_keys.key_prefix    varchar(12) —— 'sk-seed' + 3 位 = 9 字符，安全
--   api_keys.status        枚举 api_key_status，取 'active'
--   api_keys.key_hash      UNIQUE —— 用 md5 保证 60 个互不相同
-- ------------------------------------------------------------
DO $$
DECLARE
  i int;
  v_user_id int;
  v_prefix varchar(12);
  v_hash varchar(255);
BEGIN
  FOR i IN 1..60 LOOP
    IF NOT EXISTS (
      SELECT 1 FROM users WHERE email = 'seed-user' || lpad(i::text, 4, '0') || '@demo.3cloud.local'
    ) THEN
      INSERT INTO users (email, password_hash, name, role, status, customer_type,
                         real_name_status, is_contract, created_at, updated_at)
      VALUES (
        'seed-user' || lpad(i::text, 4, '0') || '@demo.3cloud.local',
        -- 占位 hash：演示账号不提供登录入口，仅满足 NOT NULL
        '$2b$10$' || substr(md5('seed-please-never-login'), 1, 53),
        '演示用户' || lpad(i::text, 4, '0'),
        'customer', 'active',
        CASE WHEN i % 3 = 0 THEN 'enterprise' ELSE 'personal' END,
        'verified', (i % 3 = 0),
        now(), now()
      )
      RETURNING id INTO v_user_id;

      v_prefix := 'sk-seed' || lpad(i::text, 4, '0');
      v_hash := 'seed_' || md5('seed-key-' || i::text);

      INSERT INTO api_keys (user_id, name, key_hash, key_prefix, status,
                            scopes, rate_limit_per_minute, created_at, updated_at)
      VALUES (
        v_user_id, 'seed 演示密钥', v_hash, v_prefix, 'active',
        '["chat","completion"]'::jsonb, 120, now(), now()
      );

      INSERT INTO customer_balances (user_id, total_balance, available_balance,
                                     frozen_balance, currency, created_at, updated_at)
      VALUES (v_user_id, 10000.0000, 10000.0000, 0.0000, 'CNY', now(), now());
    END IF;
  END LOOP;
END $$;

COMMIT;

\timing off

-- ------------------------------------------------------------
-- 校验
-- ------------------------------------------------------------
\echo '=== seed 用户池 ==='
SELECT count(DISTINCT u.id) AS 用户数,
       count(k.id)           AS 密钥数,
       count(cb.id)          AS 余额记录数
FROM users u
LEFT JOIN api_keys k            ON k.user_id = u.id
LEFT JOIN customer_balances cb ON cb.user_id = u.id
WHERE u.email LIKE 'seed-user%@demo.3cloud.local';

\echo '=== 前5 个（抽样） ==='
SELECT u.id, u.email, u.name, u.customer_type, k.key_prefix, cb.total_balance
FROM users u
LEFT JOIN api_keys k           ON k.user_id = u.id
LEFT JOIN customer_balances cb ON cb.user_id = u.id
WHERE u.email LIKE 'seed-user%@demo.3cloud.local'
ORDER BY u.id LIMIT 5;

\echo '=== 确认未污染真实账号 ==='
SELECT u.email, count(cr.id) AS 真实消费条数
FROM users u JOIN consumption_records cr ON cr.user_id = u.id
WHERE u.email NOT LIKE 'seed-user%@demo.3cloud.local'
GROUP BY 1 ORDER BY 1;