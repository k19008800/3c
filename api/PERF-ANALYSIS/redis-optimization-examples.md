# Redis 优化使用示例

## 新工具函数概览

### 1. `redis-scan.ts` - SCAN 工具函数
```typescript
import { 
  scanKeys, 
  hscanAll, 
  sscanAll, 
  zscanAll, 
  fixMissingTTL,
  findLargeKeys,
  getMemoryReport 
} from "../utils/redis-scan.js";
```

### 2. `redis-optimized.ts` - 优化操作函数
```typescript
import {
  getHashOptimized,
  getSetMembersOptimized,
  getZRangeOptimized,
  pipelineOptimized,
  checkAndFixTTL,
  checkRedisHealth
} from "../utils/redis-optimized.js";
```

## 使用示例

### 示例 1：替换 KEYS 命令
```typescript
// ❌ 旧的阻塞方式（不要使用）
// const keys = await redis.keys('agent:*:cache');

// ✅ 新的非阻塞方式
import { scanKeys } from "../utils/redis-scan.js";

const agentCacheKeys = await scanKeys('agent:*:cache');
console.log(`找到 ${agentCacheKeys.length} 个 agent 缓存键`);
```

### 示例 2：处理大哈希
```typescript
// ❌ 旧的可能阻塞的方式
// const schedulingData = await redis.hgetall(`scheduling:rpm:${bucket}`);

// ✅ 新的优化方式
import { getHashOptimized } from "../utils/redis-optimized.js";

const schedulingData = await getHashOptimized(`scheduling:rpm:${bucket}`);
// 自动处理：如果字段超过1000个，使用 HSCAN；否则使用 HGETALL
```

### 示例 3：处理大集合
```typescript
// ❌ 旧的可能阻塞的方式
// const bannedIps = await redis.smembers("fraud:banned:ips");

// ✅ 新的优化方式
import { getSetMembersOptimized } from "../utils/redis-optimized.js";

const bannedIps = await getSetMembersOptimized("fraud:banned:ips");
// 自动处理：如果成员超过1000个，使用 SSCAN；否则使用 SMEMBERS
```

### 示例 4：限制有序集合返回大小
```typescript
// ❌ 旧的可能阻塞的方式
// const members = await redis.zrange(redisKey, 0, -1, "WITHSCORES");

// ✅ 新的优化方式
import { getZRangeOptimized } from "../utils/redis-optimized.js";

// 限制返回前100个元素
const members = await getZRangeOptimized(redisKey, 0, 99, { withScores: true });
```

### 示例 5：修复无 TTL 的键
```typescript
import { fixMissingTTL } from "../utils/redis-scan.js";

// 修复所有缓存键，设置24小时TTL
const fixedCount = await fixMissingTTL("cache:*", 86400);
console.log(`修复了 ${fixedCount} 个无 TTL 的缓存键`);

// 修复所有会话键，设置7天TTL
const sessionFixed = await fixMissingTTL("session:*", 604800);
```

### 示例 6：内存监控和报告
```typescript
import { getMemoryReport, findLargeKeys } from "../utils/redis-scan.js";

// 获取完整内存报告
const report = await getMemoryReport();
console.log(`总键数: ${report.totalKeys}`);
console.log(`内存使用: ${report.memoryUsage}`);
console.log(`无 TTL 键数（估算）: ${report.keysWithoutTTL}`);
console.log(`前10个大键:`, report.largeKeys);

// 查找特定大小的大键
const largeKeys = await findLargeKeys(1024 * 1024); // 1MB以上
if (largeKeys.length > 0) {
  console.warn(`发现 ${largeKeys.length} 个大键（>1MB）:`);
  largeKeys.forEach(key => {
    console.warn(`  ${key.key}: ${(key.size / 1024 / 1024).toFixed(2)}MB (${key.type})`);
  });
}
```

### 示例 7：Redis 健康检查
```typescript
import { checkRedisHealth } from "../utils/redis-optimized.js";

const health = await checkRedisHealth();

if (!health.connected) {
  console.error("❌ Redis 连接失败");
} else {
  console.log(`✅ Redis 连接正常，延迟: ${health.latency}ms`);
  console.log(`📊 内存使用: ${health.memoryUsage}`);
  console.log(`🔑 估算键数: ${health.keyCount}`);
  
  if (health.issues.length > 0) {
    console.warn("⚠️ 发现以下问题:");
    health.issues.forEach(issue => console.warn(`  - ${issue}`));
  }
}
```

### 示例 8：批量操作优化
```typescript
import { pipelineOptimized } from "../utils/redis-optimized.js";

// 使用 pipeline 批量操作
const results = await pipelineOptimized([
  {
    command: "get",
    args: ["user:123:profile"],
    transform: (result) => JSON.parse(result || "{}")
  },
  {
    command: "hgetall",
    args: ["user:123:settings"]
  },
  {
    command: "zscore",
    args: ["user:ranking", "123"],
    transform: (result) => parseFloat(result || "0")
  },
  {
    command: "scard",
    args: ["user:123:connections"]
  }
]);

console.log(`用户资料: ${results[0]}`);
console.log(`用户设置: ${results[1]}`);
console.log(`用户排名分数: ${results[2]}`);
console.log(`用户连接数: ${results[3]}`);
```

## 迁移指南

### 1. 识别需要迁移的代码模式
```typescript
// 需要迁移的模式：
// 1. redis.keys(pattern)
// 2. redis.hgetall(key) - 如果哈希可能很大
// 3. redis.smembers(key) - 如果集合可能很大
// 4. redis.zrange(key, 0, -1) - 无限制获取有序集合
// 5. 重复的 SCAN 函数实现
```

### 2. 迁移步骤
1. **分析现有代码**: 使用 grep 搜索上述模式
2. **评估风险**: 确定哪些是高风险（生产环境关键路径）
3. **逐步迁移**: 从高风险代码开始，分批次迁移
4. **测试验证**: 每次迁移后测试功能
5. **监控效果**: 迁移后监控 Redis 性能指标

### 3. 自动化检查脚本
```bash
# 检查可能的阻塞命令使用
cd 3cloud/api
grep -r "redis\.keys\|redis\.hgetall\|redis\.smembers\|redis\.zrange.*0.*-1" src/
```

## 性能对比

### 修复前（风险）
```typescript
// 10万键时可能阻塞数秒
const keys = await redis.keys('*');

// 1万字段哈希可能阻塞
const hash = await redis.hgetall('large:hash');

// 5万元员集合可能阻塞
const members = await redis.smembers('large:set');

// 大有序集合获取整个集合
const allScores = await redis.zrange('ranking', 0, -1, 'WITHSCORES');
```

### 修复后（安全）
```typescript
// 非阻塞，分批迭代
const keys = await scanKeys('*', { batchSize: 100 });

// 自动选择最佳方式
const hash = await getHashOptimized('large:hash');

// 自动选择最佳方式
const members = await getSetMembersOptimized('large:set');

// 限制返回数量
const top100 = await getZRangeOptimized('ranking', 0, 99, { withScores: true });
```

## 监控指标

### 建议的监控项
1. **Redis 延迟**: `redis_latency_ms` (P95 < 10ms)
2. **大键数量**: `redis_large_keys_count` (告警阈值: >10)
3. **无 TTL 键比例**: `redis_keys_without_ttl_ratio` (告警阈值: >1%)
4. **内存使用率**: `redis_memory_usage_percent` (告警阈值: >80%)
5. **SCAN 迭代次数**: `redis_scan_iterations` (监控趋势)

### 告警规则示例
```yaml
- alert: RedisHighLatency
  expr: redis_latency_ms{p95} > 50
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Redis 延迟过高"
    description: "Redis P95 延迟超过 50ms，当前值 {{ $value }}ms"

- alert: RedisLargeKeys
  expr: redis_large_keys_count > 20
  labels:
    severity: warning
  annotations:
    summary: "Redis 大键过多"
    description: "发现 {{ $value }} 个大键（>10KB），可能影响性能"
```

## 总结

通过使用新的 Redis 优化工具函数，可以：

1. **避免阻塞**: 用 SCAN 替代 KEYS，分批处理大数据
2. **自动优化**: 根据数据大小自动选择最佳操作方式
3. **内存安全**: 定期检查和修复无 TTL 的键
4. **性能监控**: 内置健康检查和报告功能
5. **代码统一**: 消除重复的 SCAN 实现

建议立即开始迁移高风险代码，逐步应用优化，并建立持续监控机制。