-- 预扣冻结（原子）：available → frozen（P0-1）
--
-- 对齐 coding-standards-control-logic.md §五 Redis Lua 原子预扣脚本结构：
--   余额检查 → 幂等检查 → 原子转移（HINCRBY 等效 DECRBY/INCRBY）
--
-- KEYS[1] = bal:{userId}          HASH { available, frozen }（整数单位 1e-8 元）
-- KEYS[2] = freeze:{requestId}    STRING 冻结金额（EX TTL，超时兜底）
-- KEYS[3] = freeze-exp:{requestId} STRING "金额|到期ms|userId"（无 TTL，清理任务依赖）
-- ARGV[1] = amount                冻结金额（整数单位）
-- ARGV[2] = ttlSeconds            冻结记录 TTL（秒）
-- ARGV[3] = expiresAtMs           到期时间戳（毫秒）
-- ARGV[4] = userId                用户 ID（清理任务定位 bal:{userId} 用）
--
-- 返回：
--   {0, availableAfter, amount}   冻结成功
--   {1, alreadyFrozenAmount}      幂等命中（同 requestId 已冻结）
--   {-1, available}               余额不足

local available = tonumber(redis.call('HGET', KEYS[1], 'available') or '0')
local amount = tonumber(ARGV[1])

-- 幂等检查：同一 requestId 重复预扣 → 返回已冻结金额（不重复扣减）
if redis.call('EXISTS', KEYS[2]) == 1 then
    return {1, tonumber(redis.call('GET', KEYS[2]) or '0')}
end

-- 余额检查：可用余额不足 → 冻结失败（调用方 402）
if available < amount then
    return {-1, available}
end

-- 原子冻结：available -amount、frozen +amount，并落冻结记录（TTL 兜底）
redis.call('HINCRBY', KEYS[1], 'available', -amount)
redis.call('HINCRBY', KEYS[1], 'frozen', amount)
redis.call('SET', KEYS[2], tostring(amount), 'EX', tonumber(ARGV[2]))
redis.call('SET', KEYS[3], tostring(amount) .. '|' .. ARGV[3] .. '|' .. ARGV[4])

return {0, available - amount, amount}
