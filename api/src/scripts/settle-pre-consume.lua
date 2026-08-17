-- 预扣结算（原子）：冻结额按实际用量解冻，多退少补（P0-1）
--
-- KEYS[1] = bal:{userId}          HASH { available, frozen }
-- KEYS[2] = freeze:{requestId}    STRING 冻结金额（EX TTL）
-- KEYS[3] = freeze-exp:{requestId} STRING "金额|到期ms"
-- ARGV[1] = actual                实际消费金额（整数单位）
--
-- 返回：
--   {0, availableAfter}           结算成功（多退少补后可用余额）
--   {-2, available}               冻结记录不存在（TTL 过期/已释放）→ 调用方直通扣费
--   {-3, availableAfter, available, frozen, actual}
--                                 补扣余额不足 → 已解冻全部，调用方 402

local frozen = tonumber(redis.call('GET', KEYS[2]) or '-1')

-- 冻结记录不存在（超时 TTL 兜底已消失 / 已被结算或释放）→ 直通扣费
if frozen < 0 then
    return {-2, tonumber(redis.call('HGET', KEYS[1], 'available') or '0')}
end

local actual = tonumber(ARGV[1])
local available = tonumber(redis.call('HGET', KEYS[1], 'available') or '0')

-- 多退：实际消费 ≤ 冻结额 → 差额退回 available，冻结清 0
if actual <= frozen then
    local refund = frozen - actual
    redis.call('HINCRBY', KEYS[1], 'available', refund)
    redis.call('HINCRBY', KEYS[1], 'frozen', -frozen)
    redis.call('DEL', KEYS[2], KEYS[3])
    return {0, available + refund}
end

-- 少补：实际消费 > 冻结额 → 需再扣差额
local delta = actual - frozen
if available >= delta then
    redis.call('HINCRBY', KEYS[1], 'available', -delta)
    redis.call('HINCRBY', KEYS[1], 'frozen', -frozen)
    redis.call('DEL', KEYS[2], KEYS[3])
    return {0, available - delta}
end

-- 补扣余额不足 → 解冻全部（避免资金卡死）+ 返回 -3（调用方 402，无消费入账）
redis.call('HINCRBY', KEYS[1], 'available', frozen)
redis.call('HINCRBY', KEYS[1], 'frozen', -frozen)
redis.call('DEL', KEYS[2], KEYS[3])
return {-3, available + frozen, available, frozen, actual}
