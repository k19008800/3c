-- 预扣解冻（原子）：异常/超时释放冻结（P0-1）
--
-- KEYS[1] = bal:{userId}          HASH { available, frozen }
-- KEYS[2] = freeze:{requestId}    STRING 冻结金额（EX TTL）
-- KEYS[3] = freeze-exp:{requestId} STRING "金额|到期ms"
-- ARGV[1] = amount                冻结金额（整数单位；-1 = 从冻结记录读取）
--
-- 返回：
--   {0, availableAfter}           解冻成功
--   {-2, available}               冻结记录不存在（已释放/已结算/已过期）→ no-op

local amount = tonumber(ARGV[1])
local record = tonumber(redis.call('GET', KEYS[2]) or '-1')

-- 正常路径：金额未显式传入 → 从冻结记录读取
if amount < 0 then
    if record < 0 then
        return {-2, tonumber(redis.call('HGET', KEYS[1], 'available') or '0')}
    end
    amount = record
end

-- 幂等：记录已不存在（曾被释放/结算）且调用方显式传额 → 仍校验 hash frozen 不为 0 才回补，
-- 避免 TTL 过期后清理任务已释放、此处再次释放造成超额退款。
local frozen = tonumber(redis.call('HGET', KEYS[1], 'frozen') or '0')
if frozen <= 0 then
    redis.call('DEL', KEYS[2], KEYS[3])
    return {-2, tonumber(redis.call('HGET', KEYS[1], 'available') or '0')}
end

-- 解冻：available +amount、frozen -amount
redis.call('HINCRBY', KEYS[1], 'available', amount)
redis.call('HINCRBY', KEYS[1], 'frozen', -amount)
redis.call('DEL', KEYS[2], KEYS[3])

return {0, tonumber(redis.call('HGET', KEYS[1], 'available') or '0')}
