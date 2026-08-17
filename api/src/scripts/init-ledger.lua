-- 原子初始化余额热账本（P0-1）
--
-- 背景：ensureLedger/readLedgerAvailable 的「exists 检查 → PG 读取 → HSET」两步式在
-- 并发冷启动下存在竞态：10 个并发请求同时看到 exists=0，各自读 PG 后 HSET，晚到的 HSET
-- 会把早到的预扣（available 扣减 / frozen 增加）覆盖回 PG 快照 → 同一账本被反复重置，
-- 后续 Lua 预扣可多次成功，造成超扣窗口（pre-consume.test.ts 10 并发用例曾实测 frozen=9）。
-- 本脚本将「类型检查 + 写入」合并为 Redis 原子操作：只有账本缺失（或类型错误）时才写入，
-- 绝不覆盖已存在的 HASH → 并发下仅第一个初始化生效，其余 no-op。
--
-- KEYS[1] = bal:{userId}            HASH { available, frozen }（整数单位 1e-8 元）
-- ARGV[1] = available               可用余额（整数单位）
-- ARGV[2] = frozen                  冻结余额（整数单位）
--
-- 返回：
--   1  本次已写入（首次初始化）
--   0  已存在合法 HASH（未覆盖，调用方直接复用）
--
-- @see services/billing/ledger.ts ensureLedger / initLedgerFromPg
-- @see services/billing/pre-consume.ts

local keyType = redis.call('TYPE', KEYS[1]).ok
if keyType == 'hash' then
    -- 已初始化：并发下第二个及之后的调用直接复用，不覆盖（防止重置进行中的预扣）
    return 0
end
if keyType ~= 'none' then
    -- 残留 STRING（旧两段式初始化崩溃遗留）等错误类型 → 删除重建（与既有自愈语义一致）
    redis.call('DEL', KEYS[1])
end
redis.call('HSET', KEYS[1], 'available', ARGV[1], 'frozen', ARGV[2])
return 1
