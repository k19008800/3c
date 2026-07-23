# Redis TTL 检查清单和最佳实践

## 🎯 目标
防止 Redis 内存泄漏，确保所有 Redis key 都有合理的过期时间。

## 📋 代码检查清单

### 1. Redis 写入操作检查
- [x] 所有 `redis.set()` 调用必须包含 TTL 参数
- [x] 优先使用 `redis.setex()` 方法
- [ ] 避免使用 `redis.set()` 无 TTL 参数

### 2. TTL 值合理性检查
| 数据类型 | 建议 TTL | 检查项 |
|----------|----------|--------|
| 会话数据 | 7天 | `session:*` 系列 key |
| 验证码 | 5-30分钟 | `verify:*`, `captcha:*` |
| 缓存数据 | 1-5分钟 | `cache:*`, `dashboard:*` |
| 限流计数 | 1分钟 | `rate:*`, `rl:*` |
| 地理位置 | 1天 | `geocache:*` |
| 撤销操作 | 1小时 | `undo:*` |
| 封禁数据 | 1-30天 | `risk:ban:*` |

### 3. 代码示例对比

#### ❌ 错误示例
```typescript
// 无 TTL - 可能导致内存泄漏
await redis.set('user:123:cache', data);
```

#### ✅ 正确示例
```typescript
// 使用 setex (推荐)
await redis.setex('user:123:cache', 3600, data);

// 或使用 set 带 TTL 参数
await redis.set('user:123:cache', data, 'EX', 3600);

// 或单独设置 expire
await redis.set('user:123:cache', data);
await redis.expire('user:123:cache', 3600);
```

## 🔧 工具和脚本

### 1. 定期检查脚本
```javascript
// scripts/check-redis-ttl.js
export async function checkRedisTTL() {
  // 扫描代码中的 redis.set 调用
  // 检查是否有无 TTL 的情况
}
```

### 2. 清理现有无 TTL key
```javascript
// scripts/fix-redis-ttl.js
export async function fixNoTTLKeys() {
  // 扫描 Redis 中的无 TTL key
  // 根据 key 模式设置合理的 TTL
}
```

### 3. CI/CD 检查
在 `.github/workflows/ci.yml` 或类似文件中添加：
```yaml
- name: Check Redis TTL usage
  run: |
    # 检查是否有无 TTL 的 redis.set 调用
    grep -r "redis\.set(" src/ | grep -v "EX\|PX" | wc -l
```

## 📊 监控指标

### 1. Redis 监控
```bash
# Redis 内存使用
redis-cli info memory

# 无 TTL key 数量
redis-cli --scan | while read key; do
  ttl=$(redis-cli ttl "$key")
  if [ "$ttl" = "-1" ]; then
    echo "$key"
  fi
done | wc -l

# Key 过期统计
redis-cli info stats | grep expired_keys
```

### 2. 告警阈值
| 指标 | 警告阈值 | 紧急阈值 |
|------|----------|----------|
| 内存使用率 | > 70% | > 90% |
| 无 TTL key 数 | >网上 | > 1000 |
| 内存碎片率 | > 1.5 | > 2.0 |

## 🚀 最佳实践

### 1. 开发规范
- **所有 Redis 写入操作必须指定 TTL**
- 使用常量定义 TTL 值，不要硬编码
- 为不同的数据类别定义标准 TTL

### 2. TTL 常量定义示例
```typescript
// src/constants/redis-ttl.ts
export const REDIS_TTL = {
  SESSION: 60 * 60 * 24 * 7, // 7天
  CAPTCHA: 60 * 5, // 5分钟
  CACHE: 60 * 5, // 5分钟
  RATE_LIMIT: 60, // 1分钟
  GEO_CACHE: 60 * 60 * 24, // 1天
  BAN: 60 * 60 * 24, // 1天
  UNDO: 60 * 60, // 1小时
  VERIFY_EMAIL: 60 * 5, // 5分钟
  RESET_PASSWORD: 60 * 30, // 30分钟
} as const;
```

### 3. Redis 配置优化
```javascript
// Redis 服务器配置建议
const redisConfig = {
  // 内存限制
  maxmemory: '2gb',
  
  // 内存淘汰策略
  maxmemoryPolicy: 'allkeys-lru',
  
  // 启用 key 过期事件
  notifyKeyspaceEvents: 'Ex',
  
  // 启用 AOF 持久化
  appendonly: 'yes',
  appendfsync: 'everysec',
};
```

### 4. 代码审查要点
在代码审查中检查：
1. Redis 写入操作是否包含 TTL
2. TTL 值是否合理
3. 是否使用了标准 TTL 常量
4. 是否有潜在的无限期缓存

## 📈 性能优化建议

### 1. 内存优化
- 定期清理无 TTL key
- 监控内存使用趋势
- 设置合理的内存淘汰策略

### 2. 缓存策略优化
- 热点数据设置较短的 TTL
- 冷数据设置较长的 TTL 或使用 LRU
- 考虑使用多级缓存

### 3. 监控和告警
- 实时监控 Redis 内存使用
- 设置无 TTL key 数量告警
- 定期生成 Redis 使用报告

## 🔍 故障排查

### 1. 内存突然增长
1. 检查是否有新的无 TTL key
2. 检查 TTL 设置是否过短导致频繁重写
3. 检查是否有大量数据同时过期

### 2. 缓存命中率下降
1. 检查 TTL 是否过短
2. 检查缓存淘汰策略
3. 监控 key 访问模式

### 3. Redis 响应变慢
1. 检查内存使用率
2. 检查是否有大量 key 扫描操作
3. 检查网络连接和配置

## 📝 总结

通过实施以上措施，可以：
1. ✅ 防止 Redis 内存泄漏
2. ✅ 提高缓存命中率
3. ✅ 优化系统性能
4. ✅ 避免生产环境故障

**关键要点：**
- 所有 Redis 写入必须包含 TTL
- 定期检查和清理无 TTL key
- 配置合适的监控和告警
- 在开发流程中加入 TTL 检查