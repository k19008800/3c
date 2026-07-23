# Redis 使用模式详细分析

## 发现的主要 Redis 使用场景

### 1. 限流系统 (Rate Limiting)
**键模式:** `rl:*`
- `rl:rpm:global:0` - 全局每分钟请求限制
- `rl:rpm:user:{userId}` - 用户每分钟请求限制
- `rl:tpm:user:{userId}` - 用户每分钟token限制
- `rl:rpm:key:{apiKey}` - API密钥每分钟请求限制

**数据结构:** Sorted Set (ZSET)
**TTL:** 滑动窗口自动清理
**操作:** `zremrangebyscore`, `zcard`, `zrange`, `scan`
**文件:** `src/middleware/rate-limit.ts`, `src/routes/admin/rate-limits.ts`

### 2. 仪表板缓存 (Dashboard Cache)
**键模式:** `dashboard:*`
- `dashboard:enterprise-overview` - 企业概览
- `dashboard:summary` - 摘要数据
- `dashboard:todo-queue` - 待办队列
- `dashboard:trends:filters` - 趋势过滤器

**数据结构:** String
**TTL:** 60-600秒
**操作:** `get`, `setex`
**文件:** `src/routes/admin/dashboard/` 下多个文件

### 3. 会话管理 (Session Management)
**键模式:** `session:*` (实际存储JWT token)
**数据结构:** String
**TTL:** JWT过期时间 (通常2小时)
**操作:** `get`, `setex`, `del`
**文件:** `src/services/session-manager.ts`

### 4. 权限缓存 (Permission Cache)
**键模式:** `perm:user:{userId}`
**数据结构:** String (位掩码)
**TTL:** `PERM_CACHE_TTL` 常量
**操作:** `get`, `setex`, `del`, `scan`
**文件:** `src/services/permission-engine.ts`

### 5. 安全风险控制 (Security Risk)
**键模式:** `risk:*`
- `risk:ban:ip:{ip}` - IP封禁
- `risk:ban:user:{userId}` - 用户封禁
- `risk:proxy:user:{userId}` - 代理使用计数
- `risk:proxy:ips` - 代理IP集合

**数据结构:** String / Set
**TTL:** 分钟到数天不等
**操作:** `get`, `setex`, `exists`, `incr`, `pfadd`
**文件:** `src/services/login-security/`, `src/routes/admin/security/`

### 6. 反欺诈系统 (Fraud Prevention)
**键模式:** `fraud:*`
- `fraud:banned:ips` - 封禁IP集合
- `fraud:user:{userId}:ips` - 用户使用的IP集合
- `fraud:brute:ip:{ip}` - 暴力破解计数

**数据结构:** Set / String
**TTL:** 600-3600秒
**操作:** `sadd`, `srem`, `sismember`, `scard`, `smembers`, `get`, `setex`, `incr`
**文件:** `src/services/redemption-fraud/`

### 7. 熔断器系统 (Circuit Breaker)
**键模式:** `cb:v2:*`
- `cb:v2:open:{vendorModelId}` - 熔断器开启状态
- `cb:v2:halfOpen:{vendorModelId}` - 半开启状态
- `cb:v2:failures:{vendorModelId}` - 失败计数
- `cb:v2:weightReduced:{vendorModelId}` - 权重降低状态
- `cb:v2:level3ProbeFails:{vendorModelId}` - 三级探测失败

**数据结构:** String
**TTL:** 120-300秒
**操作:** `get`, `setex`, `del`, `incr`, `expire`, `scan`
**文件:** `src/services/circuit-breaker/`

### 8. 地理位置缓存 (Geo Location)
**键模式:** `geo:*`
- `geo:cache:{ip}` - IP地理信息缓存
- `geo:enrich:{userId}:{ip}` - 用户IP丰富信息
- `geo:lastGeo:{userId}` - 用户最后地理位置
- `geo:lastDevice:{userId}` - 用户最后设备哈希
- `geo:blockCache:{ip}` - IP阻断缓存

**数据结构:** String
**TTL:** 300秒 - 7天
**操作:** `get`, `setex`
**文件:** `src/services/geo-check/`

### 9. 推荐系统 (Referral System)
**键模式:** `ref:*`
- `ref:link:{code}` - 推荐链接到agent映射
- `ref:uid:{userId}` - 用户到推荐码映射

**数据结构:** String
**TTL:** 90天 (7776000秒)
**操作:** `get`, `setex`
**文件:** `src/services/agent-core/referral.ts`

### 10. 验证与重置 (Verification & Reset)
**键模式:** `verify:*`, `reset:*`, `undo:*`
- `verify:email:{userId}` - 邮箱验证码
- `reset:token:{token}` - 密码重置令牌
- `undo:{tokenId}` - 操作撤销令牌

**数据结构:** String
**TTL:** 300-1800秒
**操作:** `get`, `setex`, `del`
**文件:** 多个文件

### 11. 调度统计 (Scheduling Stats)
**键模式:** `scheduling:*`
- `scheduling:rpm:{bucket}` - 每分钟请求统计
- `scheduling:tpm:{bucket}` - 每分钟token统计
- `scheduling:lat:{bucket}` - 延迟统计

**数据结构:** Hash
**TTL:** 10秒
**操作:** `hgetall`, `setex`
**文件:** `src/services/dashboards/scheduling.ts`

## Redis 操作模式统计

| 操作类型 | 使用频率 | 主要用途 | 风险等级 |
|---------|---------|---------|---------|
| `get` | 高 | 读取缓存 | 低 |
| `setex` | 高 | 设置缓存带TTL | 低 |
| `del` | 中 | 删除缓存 | 低 |
| `incr` | 中 | 计数器 | 低 |
| `expire` | 中 | 设置TTL | 低 |
| `zadd`/`zrem` | 中 | 限流系统 | 低 |
| `zcard`/`zrange` | 中 | 限流查询 | 低 |
| `hgetall` | 低 | 调度统计 | 中(需监控hash大小) |
| `scan` | 低 | 批量查询 | 低(良好实践) |
| `sadd`/`sismember` | 低 | 集合操作 | 低 |
| `pfadd` | 低 | 基数估计 | 低 |

## TTL 策略总结

| TTL范围 | 使用场景 | 合理性评估 |
|---------|---------|-----------|
| 10秒 | 调度统计 | 合理，高频实时数据 |
| vide-300秒 | 仪表板缓存 | 合理，但需添加抖动 |
| 300秒 | 验证码、地理位置 | 合理 |
| 600-1800秒 | 安全风险控制 | 合理 |
| 120-300秒 | 熔断器状态 | 合理 |
| 数天 | 推荐链接、地理位置历史 | 合理 |
| JWT过期 | 会话管理 | 合理 |

## 潜在问题和建议

### 1. 缓存雪崩风险
**问题:** 多个`dashboard:*`缓存使用相同TTL(300秒)
**建议:** 添加随机TTL抖动: `ttl = base_ttl + random(0, 30)`

### 2. 键数量增长风险
**问题:** `rl:*`和`cb:v2:*`键可能随用户/供应商增长
**建议:** 
- 监控这些键的数量增长
- 考虑使用hash合并相关键
- 定期清理过期键

### 3. 大Hash风险
**问题:** `scheduling:*`使用hash存储统计数据
**建议:** 
- 监控hash字段数量
- 考虑分片或限制字段数量
- 使用zset替代大规模hash

### 4. 内存使用优化
**建议:**
- 启用Redis内存淘汰策略(maxmemory-policy)
- 监控内存碎片率(mem_fragmentation_ratio)
- 定期分析内存使用模式

### 5. 监控建议
1. 监控键总数增长趋势
2. 监控内存使用变化
3. 监控慢查询(slowlog)
4. 监控客户端连接数
5. 监控命令统计信息

## 结论

3cloud Redis使用模式整体设计良好，具有以下优点：
1. 统一的键命名规范
2. 合理的TTL设置
3. 避免阻塞命令(使用SCAN而非KEYS)
4. 适当的数据结构选择

主要改进点：
1. 为dashboard缓存添加TTL抖动
2. 加强`rl:*`和`cb:v2:*`键的监控
3. 建立定期Redis健康检查机制