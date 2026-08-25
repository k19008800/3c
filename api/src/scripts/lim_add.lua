-- lim_add.lua：滚动窗口限额事件入集（R6，ARCH v1.1 §3.1）
--
-- 事件级 ZSET：lim:op:{userId} / lim:user:{userId}
--   member = "{refType}:{refId}:{amountCents}"（尾部 amountCents 供求和解析）
--   score  = 事件时间戳（毫秒）
--
-- 语义：
--   - 剪枝窗口外事件（score < now - windowMs）→ 移除；
--   - 判定模式（allow=0）：sum + 本笔 > limitCents → 返回 {0, sum}（拒绝）；
--     调用方在「Redis 快速预检」路径使用；PG 权威判定见 credit-limit.ts checkLimitsInTx
--     （advisory lock + 事务内滚动汇总），本脚本判定仅为热路径加速；
--   - 同步模式（allow=1）：不做判定直接 ZADD（提交后尽力同步，判定已在 PG 权威完成）；
--   - 每次写刷新 TTL（172800s = 48h）。
--
-- KEYS[1] = ZSET 键
-- ARGV[1] = member（{refType}:{refId}:{amountCents}）
-- ARGV[2] = score（毫秒）
-- ARGV[3] = amountCents（分）
-- ARGV[4] = windowMs（86400000 = 24h）
-- ARGV[5] = limitCents（判定模式阈值；同步模式传 0 忽略）
-- ARGV[6] = allow（0=判定模式 / 1=同步模式）
-- 返回：{1, sumAfter} 已入集；{0, sum} 拒绝（仅 allow=0 且超限时）
local score = tonumber(ARGV[2])
local windowMs = tonumber(ARGV[4])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', score - windowMs)

local sum = 0
for _, m in ipairs(redis.call('ZRANGEBYSCORE', KEYS[1], score - windowMs, '+inf')) do
  sum = sum + tonumber(string.match(m, ':(%d+)$') or '0')
end

if tonumber(ARGV[6]) == 0 and sum + tonumber(ARGV[3]) > tonumber(ARGV[5]) then
  return {0, sum}
end

redis.call('ZADD', KEYS[1], score, ARGV[1])
redis.call('EXPIRE', KEYS[1], 172800)
return {1, sum + tonumber(ARGV[3])}
