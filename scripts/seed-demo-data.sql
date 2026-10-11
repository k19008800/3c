-- ============================================================
-- 3cloud 生产演示数据生成（consumption_records 100 万条）
-- ============================================================
-- 用法（生产 psql）：
--   psql -d threecloud_v3 -v total=1000000 -v batch=250000 -v offset=0 -f seed-demo-data.sql
--
-- ⚠️ 分批 offset 必须是 [0, total) 的**无重叠切分**，例如total=1000000
--    分 4 批时offset 依次为 0 / 250000 / 500000 / 750000。
--    若写成 10000/260000/510000/760000，最后会溢出到 1010000，
--    多出 1 万条（总量对不上，不报错，只是数字不对）。
--
-- 设计约束（均为踩过坑后的硬性要求，勿随意改动）：
--
-- 1. 必须用 generate_series 批量 INSERT。逐条循环插 100 万行会在
--    1.7G 内存的生产机上把连接撑爆，且耗时不可控。
--
-- 2. **必须分批提交**。单事务插 100 万行会在内存里堆积全部 WAL
--    与索引页，1.7G 机器 OOM 风险高。本脚本按 -v batch 参数切片，
--    每批独立 COMMIT，可用 \i 重复调用或用 psql 的循环执行。
--
-- 3. supplier_id / supplier_model_id **必须 100% 有值**。
--    本地库曾出现 99% 消费记录无供应商归属（settle.ts 中 channel 为
--    null 的 mock 回退路径），导致对账页只能覆盖 0.06% 成本。
--    若演示数据也缺归属，会掩盖这一真实缺陷，让告警横幅失去意义。
--
-- 4. created_at 用 timestamp without time zone（本库该列语义为墙钟时间）。
--    生成时直接给墙钟字面量，不要经过 Date/UTC 换算——否则会重蹈
--    FIX-14 的 8 小时偏移，导致数据错月、对账金额对不上。
--
-- 5. request_id 带seed- 前缀 + 全局序号，保证全局唯一（唯一约束
--    request_id + created_at），便于日后精准清理。
--
-- 6. 时间跨度覆盖最近 180 天，且**均匀分布到每一天**，
--    否则成本看板的按日/按月趋势图会失真。
--    ⚠️ 坑：generate_series 的序号**不能直接当"天"用**
--    （100 万天 ≈ 2738 年）。必须按比例缩放到 180 天窗口。
--
-- 7. 用户池只取 seed-user% 演示账号（由seed-demo-users.sql 创建），
--    **不碰 corp1@demo.cn 等真实账号**，避免污染其用量视图。
--
-- 8. 必须先执行 prepare-partitions.sql 补齐 2026_04~2026_09 分区，
--    否则约 6/10 的数据会落进 default 分区。
--
-- 幂等性：重复执行会因 request_id 冲突报错，属预期行为。
--          如需重新生成，先执行 cleanup-seed.sql。
-- ============================================================

-- 可调参数（psql -v 覆盖）
\if :{?total}
\else
  \set total 1000000
\endif
\if :{?batch}
\else
  \set batch 250000
\endif
\if :{?offset}
\else
  \set offset 0
\endif

\timing on

-- ------------------------------------------------------------
-- 幂等保护：**只检查本批区间**，否则第 2 批会被上一批的存量误拦
--   （分批执行是正常路径，不是重复执行）
--   用 \gset 在 psql 层判断，不用 DO 块——psql 变量在 $$ 引号内
--   的替换行为在不同版本不一致，避开这个坑。
-- ------------------------------------------------------------
SELECT EXISTS (
  SELECT 1 FROM consumption_records
  WHERE request_id LIKE 'seed-%'
    AND substring(request_id from 6)::bigint >= :offset
    AND substring(request_id from 6)::bigint <  :offset + :batch
) AS batch_exists \gset

\if :batch_exists
  \echo '!! 该批次已有 seed 数据，请先执行 cleanup-seed.sql 再重跑'
  \quit 1
\endif

-- 注：单条 INSERT 本身即一个隐式事务，会自动提交。
--     这正是我们需要的「逐批提交」语义——不要手动包 BEGIN/COMMIT，
--     否则 4 批会攒成一个大事务，正是约束 2 要避免的。

-- ------------------------------------------------------------
-- 本批消费记录
--   供应商模型映射：让 model 与 supplier_model 保持一致，避免口径矛盾
--     1 DeepSeek  (id 2 deepseek-chat, id 3 deepseek-reasoner)
--     2 OpenAI    (id 4 gpt-4o, id 5 gpt-4o-mini)
--     3 Anthropic (id 6 claude-sonnet-4.5, id 7 claude-opus-4.5)
--   真实用户/密钥池：**只取 seed 演示账号**（约束 7）
--   时间轴：从 180 天前均匀铺到今天（按天抖动，避免整点聚集）
-- ------------------------------------------------------------
WITH model_map AS (
  SELECT * FROM (VALUES
    (1, 2::int, 'deepseek-chat'::text, 0),
    (1, 3::int, 'deepseek-reasoner', 1),
    (2, 4, 'gpt-4o', 2),
    (2, 5, 'gpt-4o-mini', 3),
    (3, 6, 'claude-sonnet-4.5', 4),
    (3, 7, 'claude-opus-4.5', 5)
  ) AS t(supplier_id, supplier_model_id, model, slot)
),
key_pool AS (
  SELECT array_agg(u.id ORDER BY u.id, k.id) AS user_ids,
         array_agg(k.id ORDER BY u.id, k.id) AS key_ids
  FROM users u
  JOIN api_keys k ON k.user_id = u.id
  WHERE u.email LIKE 'seed-user%@demo.3cloud.local'
    AND u.status = 'active' AND u.role = 'customer' AND k.status = 'active'
),
time_axis AS (
  SELECT
    g AS idx,
    -- ⚠️ 双重夹逼：末尾序号 + 抖动会溢出到未来（实测 1/1000 条落到今天之后），
   --    未来时间的记录会让"本月至今"趋势图失真。
    --    上界取 LEAST(CURRENT_DATE, ...)，再整体夹逼到今天 23:59:59 墙钟。
    LEAST(
      (CURRENT_DATE - INTERVAL '180 days')
        + (g * 180.0 / (:total - 1)::numeric || ' days')::interval
        + (random() * INTERVAL '1 day')::interval,
      (date_trunc('second', CURRENT_TIMESTAMP)
         + INTERVAL '1 day')::timestamp - INTERVAL '1 second'
    )::timestamp
    AS ts
  FROM generate_series(:offset, :offset + :batch - 1) AS g
)
INSERT INTO consumption_records (
  user_id, api_key_id, request_id, model, supplier_id, supplier_model_id,
  input_tokens, output_tokens, total_tokens, cost, currency,
  trust_upstream, fallback, streamed, finish_reason, error_code,
  metadata, created_at,
  cache_hit_tokens, cache_discount, cache_write_tokens, cache_hit_cost, cache_write_cost,
  cache_read_input_price, cache_write_input_price
)
SELECT
  kp.user_ids[(t.idx % array_length(kp.user_ids, 1)) + 1] AS user_id,
  kp.key_ids[(t.idx % array_length(kp.key_ids, 1)) + 1] AS api_key_id,
  'seed-' || t.idx,
  mm.model,
  mm.supplier_id,                       -- 归属齐全（约束 3）
  mm.supplier_model_id,
  inp,
  outp,
  inp + outp,
  -- 单价按 ¥/1K token 计（deepseek 最便宜、claude 最贵，制造差异化）
  -- inp*0.002/1000 + outp*0.006/1000 → 平均每次调用约 ¥0.01 量级
  round(((inp * 0.002000 + outp * 0.006000) / 1000.0
       * (0.8 + mm.supplier_id * 0.2)::numeric)::numeric, 8) AS cost,
  'CNY',
  false,
  (t.idx % 20 = 0),                     -- 约 5% fallback
  (t.idx % 4 = 0),                      -- 约 25% 流式
  CASE WHEN t.idx % 20 = 0 THEN 'error' ELSE 'stop' END,
  CASE WHEN t.idx % 20 = 0 THEN 'upstream_error' ELSE NULL END,
  jsonb_build_object('seed', true, 'idx', t.idx, 'supplier', mm.supplier_id),
  -- 墙钟时间字面量，直接落在 timestamp without time zone 语义上（约束 4）
  (date_trunc('second', t.ts))::timestamp,
  (t.idx % 3 = 0)::int * (inp / 4),      -- 部分请求命中缓存
  CASE WHEN t.idx % 3 = 0 THEN round((inp * 0.0000010)::numeric, 8) ELSE NULL END,
  NULL, NULL, NULL,
  0.002000, NULL
FROM time_axis t
CROSS JOIN LATERAL (
  -- 输入/输出 token：长尾分布（多数小请求，少数大批量）
  SELECT
    (200 + (random() * 3800)::int + CASE WHEN t.idx % 50 = 0 THEN 20000 ELSE 0 END) AS inp,
    (50  + (random() * 1200)::int + CASE WHEN t.idx % 50 = 0 THEN 6000  ELSE 0 END) AS outp
) tok
CROSS JOIN key_pool kp
-- 轮转分配供应商模型（6 个模型均匀轮转），保证 model 与 supplier_model 始终一致
JOIN model_map mm ON mm.slot = (t.idx % 6);

\timing off

-- ------------------------------------------------------------
-- 批次校验
-- ------------------------------------------------------------
\echo '=== 本批结果 ==='
SELECT count(*) AS 本批条数,
       count(DISTINCT user_id) AS 覆盖用户数,
       count(*) FILTER (WHERE supplier_id IS NULL) AS 缺归属条数,
       to_char(min(created_at), 'YYYY-MM-DD HH24:MI') AS 最早,
       to_char(max(created_at), 'YYYY-MM-DD HH24:MI') AS 最晚
FROM consumption_records
WHERE request_id LIKE 'seed-%'
  AND substring(request_id from 6)::bigint >= :offset
  AND substring(request_id from 6)::bigint <  :offset + :batch;

\echo '=== 累计进度 ==='
SELECT count(*) AS 累计seed条数,
       count(DISTINCT user_id) AS 覆盖用户数,
       count(*) FILTER (WHERE supplier_id IS NULL) AS 缺归属条数,
       round(coalesce(sum(cost), 0)::numeric, 4) AS 累计成本
FROM consumption_records
WHERE request_id LIKE 'seed-%';