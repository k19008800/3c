-- 0025 大表按月 RANGE 分区（P3-1，2026-08-18）
-- ============================================================================
-- 目标表：consumption_records / balance_transactions（当前 2958 / 6034 行，无外键引用它们）
-- 方案：PostgreSQL 原生 RANGE 分区（PARTITION BY RANGE (created_at)），手动按月子表。
--   ⚠️ 本地 PG17 无 pg_partman 扩展（仅 plpgsql）→ 不用 pg_partman，子表由本迁移 +
--      api/src/db/partition-maintenance.ts 维护（供 cron / 手动调用）。
--
-- ⚠️ 分区表硬性要求：所有唯一约束/主键必须包含分区列 created_at →
--   consumption_records 主键 (id, created_at)；
--   request_id 唯一约束 (request_id, created_at)（幂等 L2 DB 兜底依赖，见下）；
--   balance_transactions 主键 (id, created_at)。
--
-- 幂等 L2 兜底适配（见 api/src/services/idempotency.ts）：
--   分区表下唯一索引按「子表名_列名_key」命名（如 consumption_records_2026_08_request_id_created_at_key），
--   与旧约束名 consumption_records_request_id_unique 并存；idempotency 正则已同步兼容两种命名。
--
-- 表重建方式（步骤留档，本地开发库允许直接重建）：
--   1. 旧表 RENAME 为 *_pre_partition_20260818（备份），并重命名其冲突约束
--      （约束/索引名在 schema 内全局唯一：旧表 pkey / fk 约束名必须先让位）
--   2. 新建分区父表（PARTITION BY RANGE (created_at)，id 沿用原序列 nextval，约束用最终名）
--   3. 动态预建月度子表（备份表数据最早月 ～ 当前月+3 个月）+ 1 个 DEFAULT 兜底子表
--      （DEFAULT 承接 2099-12 之类测试/异常日期数据，保证任意 created_at 都能落子表）
--   4. INSERT INTO 新父表 SELECT * FROM 备份表（显式列清单，数据迁移）
--   5. 行数一致性校验（不一致 → RAISE EXCEPTION → 整个迁移回滚）
--   6. 新表 RENAME 为正式名 + 序列归属跟随（DROP 备份表时不会误删序列）
--   7. 重建高频查询索引（父表建索引自动下推各子表）
--
-- 幂等：整体在单个事务 + 单个 DO 块内执行 —— 已分区（pg_inherits 有子表）则跳过；
--       中途失败整体回滚，可安全重跑。执行：psql -1 -v ON_ERROR_STOP=1 -f 本文件
-- ============================================================================

BEGIN;

DO $$
DECLARE
  m date;
  part_name text;
  start_m date;
  end_m date;
  old_cnt bigint;
  new_cnt bigint;
  has_old_cr boolean;
  has_old_bt boolean;
BEGIN
  -- ── 0. 顶部守卫：consumption_records 已是分区表 → 整体跳过 ──
  IF EXISTS (
    SELECT 1 FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhparent
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'consumption_records'
  ) THEN
    RAISE NOTICE '0025 already applied: consumption_records is partitioned. Skipping.';
    RETURN;
  END IF;

  has_old_cr := to_regclass('public.consumption_records') IS NOT NULL;
  has_old_bt := to_regclass('public.balance_transactions') IS NOT NULL;

  -- ── 1. 旧表改名备份 + 冲突约束让位（约束/索引名在 schema 内全局唯一）──
  IF has_old_cr THEN
    EXECUTE 'ALTER TABLE consumption_records RENAME TO consumption_records_pre_partition_20260818';
    EXECUTE 'ALTER TABLE consumption_records_pre_partition_20260818 RENAME CONSTRAINT consumption_records_pkey TO consumption_records_pre_partition_pkey';
    EXECUTE 'ALTER TABLE consumption_records_pre_partition_20260818 RENAME CONSTRAINT consumption_records_request_id_unique TO consumption_records_pre_partition_request_id_unique';
    EXECUTE 'ALTER TABLE consumption_records_pre_partition_20260818 RENAME CONSTRAINT consumption_records_user_id_users_id_fk TO consumption_records_pre_partition_user_id_users_id_fk';
    EXECUTE 'ALTER TABLE consumption_records_pre_partition_20260818 RENAME CONSTRAINT consumption_records_api_key_id_api_keys_id_fk TO consumption_records_pre_partition_api_key_id_api_keys_id_fk';
  END IF;

  IF has_old_bt THEN
    EXECUTE 'ALTER TABLE balance_transactions RENAME TO balance_transactions_pre_partition_20260818';
    EXECUTE 'ALTER TABLE balance_transactions_pre_partition_20260818 RENAME CONSTRAINT balance_transactions_pkey TO balance_transactions_pre_partition_pkey';
  END IF;

  -- ── 2. 建分区父表（列清单与旧表一致；约束用最终名；id 沿用原序列）──
  EXECUTE $ddl$
    CREATE TABLE consumption_records_new (
      id integer NOT NULL DEFAULT nextval('consumption_records_id_seq'::regclass),
      user_id integer NOT NULL,
      api_key_id integer,
      request_id varchar(100) NOT NULL,
      model varchar(200) NOT NULL,
      supplier_id integer,
      supplier_model_id integer,
      input_tokens integer NOT NULL DEFAULT 0,
      output_tokens integer NOT NULL DEFAULT 0,
      total_tokens integer NOT NULL DEFAULT 0,
      cost numeric(18,8) NOT NULL DEFAULT '0',
      currency varchar(10) DEFAULT 'CNY',
      trust_upstream boolean NOT NULL DEFAULT false,
      fallback boolean NOT NULL DEFAULT false,
      streamed boolean NOT NULL DEFAULT false,
      finish_reason varchar(50),
      error_code varchar(50),
      metadata jsonb,
      created_at timestamp NOT NULL DEFAULT now(),
      cache_hit_tokens integer,
      cache_discount numeric(18,8),
      CONSTRAINT consumption_records_pkey PRIMARY KEY (id, created_at),
      CONSTRAINT consumption_records_request_id_created_at_unique UNIQUE (request_id, created_at),
      CONSTRAINT consumption_records_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT consumption_records_api_key_id_api_keys_id_fk FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE SET NULL
    ) PARTITION BY RANGE (created_at)
  $ddl$;

  EXECUTE $ddl$
    CREATE TABLE balance_transactions_new (
      id integer NOT NULL DEFAULT nextval('balance_transactions_id_seq'::regclass),
      user_id integer NOT NULL,
      type balance_transaction_type NOT NULL,
      amount numeric(18,8) NOT NULL,
      balance_after numeric(18,8) NOT NULL,
      reference_type varchar(50),
      reference_id varchar(100),
      description text,
      created_at timestamp NOT NULL DEFAULT now(),
      CONSTRAINT balance_transactions_pkey PRIMARY KEY (id, created_at)
    ) PARTITION BY RANGE (created_at)
  $ddl$;

  -- ── 3. 动态预建月度子表（备份表数据最早月 ～ 当前月+3 个月）+ DEFAULT 兜底子表 ──
  EXECUTE 'CREATE TABLE IF NOT EXISTS consumption_records_default PARTITION OF consumption_records_new DEFAULT';
  EXECUTE 'CREATE TABLE IF NOT EXISTS balance_transactions_default PARTITION OF balance_transactions_new DEFAULT';

  SELECT date_trunc('month', min(created_at)) INTO start_m FROM consumption_records_pre_partition_20260818;
  IF start_m IS NULL THEN
    start_m := date_trunc('month', now());
  END IF;
  end_m := date_trunc('month', now()) + interval '3 months';

  m := start_m;
  WHILE m <= end_m LOOP
    part_name := 'consumption_records_' || to_char(m, 'YYYY_MM');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF consumption_records_new FOR VALUES FROM (%L) TO (%L)',
      part_name, m::text, (m + interval '1 month')::text
    );
    part_name := 'balance_transactions_' || to_char(m, 'YYYY_MM');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF balance_transactions_new FOR VALUES FROM (%L) TO (%L)',
      part_name, m::text, (m + interval '1 month')::text
    );
    m := m + interval '1 month';
  END LOOP;

  -- ── 4+5. 数据迁移 + 行数一致性校验（不一致 → 抛错回滚）──
  IF has_old_cr THEN
    SELECT count(*) INTO old_cnt FROM consumption_records_pre_partition_20260818;
    INSERT INTO consumption_records_new (
      id, user_id, api_key_id, request_id, model, supplier_id, supplier_model_id,
      input_tokens, output_tokens, total_tokens, cost, currency, trust_upstream,
      fallback, streamed, finish_reason, error_code, metadata, created_at,
      cache_hit_tokens, cache_discount
    )
    SELECT
      id, user_id, api_key_id, request_id, model, supplier_id, supplier_model_id,
      input_tokens, output_tokens, total_tokens, cost, currency, trust_upstream,
      fallback, streamed, finish_reason, error_code, metadata, created_at,
      cache_hit_tokens, cache_discount
    FROM consumption_records_pre_partition_20260818;
    SELECT count(*) INTO new_cnt FROM consumption_records_new;
    IF old_cnt <> new_cnt THEN
      RAISE EXCEPTION '0025 consumption_records row mismatch: old=% new=%', old_cnt, new_cnt;
    END IF;
  END IF;

  IF has_old_bt THEN
    SELECT count(*) INTO old_cnt FROM balance_transactions_pre_partition_20260818;
    INSERT INTO balance_transactions_new (
      id, user_id, type, amount, balance_after, reference_type, reference_id, description, created_at
    )
    SELECT
      id, user_id, type, amount, balance_after, reference_type, reference_id, description, created_at
    FROM balance_transactions_pre_partition_20260818;
    SELECT count(*) INTO new_cnt FROM balance_transactions_new;
    IF old_cnt <> new_cnt THEN
      RAISE EXCEPTION '0025 balance_transactions row mismatch: old=% new=%', old_cnt, new_cnt;
    END IF;
  END IF;

  -- ── 6. 新表上位 + 序列归属跟随（DROP 备份表时不会误删序列）──
  EXECUTE 'ALTER TABLE consumption_records_new RENAME TO consumption_records';
  EXECUTE 'ALTER TABLE balance_transactions_new RENAME TO balance_transactions';
  EXECUTE 'ALTER SEQUENCE consumption_records_id_seq OWNED BY consumption_records.id';
  EXECUTE 'ALTER SEQUENCE balance_transactions_id_seq OWNED BY balance_transactions.id';

  -- ── 7. 高频查询索引（索引审查结论：原仅 pkey + request_id 唯一，缺口补齐）──
  --    consumption_records(user_id, created_at)：/me/stats、/me/logs、admin-customers、导出等高频
  --    balance_transactions(user_id, created_at)：资金流水按用户查询
  --    balance_transactions(type, created_at)：admin-finance 退款统计/月结（type + 时间范围）
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_consumption_records_user_created ON consumption_records (user_id, created_at)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_balance_transactions_user_created ON balance_transactions (user_id, created_at)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_balance_transactions_type_created ON balance_transactions (type, created_at)';

  RAISE NOTICE '0025 partition migration applied.';
END $$;

COMMIT;
