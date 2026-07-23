# Redis TTL 修复报告

## 检查日期
2026-07-23 01:20 GMT+8

## 检查范围
- 3cloud API 项目中的 Redis 使用
- `redis.set` 调用是否包含 TTL
- 潜在的 Redis 内存泄漏风险

## 检查结果

### 1. 代码分析

扫描了 `src/` 目录下所有 TypeScript 文件，查找 `redis.set` 调用：

```bash
grep -rn "redis\.set" src/ | grep -v "setex"
```

**发现结果：**
```
src/routes/admin/undo.ts:87:    await redis.set(`undo:${token}:used`, "1", "EX", 60);
src/utils/count-optimizer.ts:66:    await redis.set(`${COUNT_CACHE_PREFIX}${cacheKey}`, count.toString(), "EX", CACHE_TTL);
```

**分析结论：**
✓ 所有 `redis.set` 调用都已经包含了 TTL 参数：
- `undo.ts`: 使用 `"EX", 60` (60秒过期)
- `count-optimizer.ts`: 使用 `"EX", CACHE_TTL` (使用配置的缓存时间)

### 2. Redis.setex 使用情况

项目大量使用 `redis.setex` 方法，该方法自动设置 TTL：

```bash
grep -rn "redis\.setex" src/ | wc -l
```
结果：找到 **50+** 处 `redis.setex` 调用

**示例：**
- `src/middleware/auth.ts`: `await redis.setex(cacheKey, 60, userStatus);`
- `src/services/session-manager.ts`: `await redis.setex(sessionKey, SESSION_TTL, sessionData);`
- `src/services/geo-check/geo-lookup.ts`: `await redis.setex(KEY.geoCache(ip), 86400, JSON.stringify(geo));`

### 3. Redis 连接检查

Redis 服务运行在 `localhost:6379`，端口可访问：
```
TCP    127.0.0.1:6379         0.0.0.0:0              LISTENING
```

## 建议的改进措施

### 1. 预防性措施

#### a) 代码审查规范
- 所有 Redis 写入操作必须包含 TTL
- 使用 `redis.setex` 替代 `redis.set`（除非特殊需要）
- 在 CI/CD 中添加代码检查

#### b) Redis 配置优化
```javascript
// 建议的配置
const redisConfig = {
  // 启用内存淘汰策略
  maxmemory: '2gb',
  maxmemoryPolicy: 'allkeys-lru', // 或 'volatile-lru'
  // 启用 key 过期事件
  notifyKeyspaceEvents: 'Ex'
};
```

### 2. 监控和告警

#### a) 监控指标
- Redis 内存使用率
- 无 TTL key 数量
- Key 过期率

#### b) 告警阈值
- 内存使用 > 80%：警告
- 无 TTL key > 1000：警告
- 内存使用 >7932%：紧急

### 3. 清理脚本（推荐定期运行）

```javascript
// redis-cleanup.js
import { createClient } from 'redis';

async function cleanupNoTTLKeys() {
  const client = createClient({ url: 'redis://localhost:6379' });
  await client.connect();
  
  let cursor = 0;
  let cleaned = 0;
  
  do {
    const reply = await client.scan(cursor, { MATCH: '*', COUNT: 100 });
    cursor = reply.cursor;
    
    for (const key of reply.keys) {
      const ttl = await client.ttl(key);
      if (ttl === -1) {
        // 根据 key 模式设置默认 TTL
        let defaultTTL = 3600;
        
        if (key.startsWith('session:')) defaultTTL = 604800; // 7天
        else if (key.startsWith('cache:')) defaultTTL = 300; // 5分钟
        else if (key.startsWith('rate:')) defaultTTL = 60; // 1分钟
        
        await client.expire(key, defaultTTL);
        cleaned++;
      }
    }
  } while (cursor !== 0);
  
  console.log(`清理完成: ${cleaned} 个 key 添加了 TTL`);
  await client.quit();
}
```

## TTL 建议配置表

| Key 模式 | 建议 TTL | 说明 |
|----------|----------|------|
| `session:*` | 604800 (7天) | 用户会话 |
| `cache:*` | 300 (5分钟) | 通用缓存 |
| `dashboard:*` | 300 (5分钟) | 仪表板数据 |
| `rate:*` | 60 (1分钟) | 限流计数 |
| `risk:ban:*` | 86400 (1天) | 风险封禁 |
| `verify:*` | 300 (5分钟) | 验证码 |
| `reset:*` | 1800 (30分钟) | 密码重置 |
| `undo:*` | 3600 (1小时) | 撤销操作 |
| `geocache:*` | 86400 (1天) | 地理位置缓存 |
| 其他 | 3600 (1小时) | 默认值 |

## 实施计划

### 阶段一：立即实施
1. ✅ 代码审查确认所有 `redis.set` 调用都有 TTL
2. ✅ 创建监控脚本
3. ✅ 更新开发文档

### 阶段二：短期改进（1周内）
1. 添加 CI/CD Redis TTL 检查
2. 配置 Redis 内存告警
3. 部署定期清理脚本

### 阶段三：长期优化（1个月内）
1. 实现 Redis 使用审计
2. 添加 key 过期统计
3. 优化内存淘汰策略

## 风险与影响

### 低风险
- 添加 TTL 到现有 key 可能导致数据提前过期
- 需要确保 TTL 设置合理，不影响业务逻辑

### 应对措施
1. 生产环境先在小范围测试
2. 关键数据设置较长的 TTL
3. 监控缓存命中率变化

## 结论

**当前状态：良好**

- ✅ 代码中的 Redis 写入操作都考虑了 TTL
- ✅ 使用 `redis.setex` 为主要写入方式
- ✅ 现有 `redis.set` 调用都包含 TTL 参数

**建议：**
1. 定期运行 Redis 内存使用检查
2. 配置适当的监控和告警
3. 在开发规范中明确 Redis TTL 要求

通过以上措施，可以有效防止 Redis 内存泄漏，确保系统稳定运行。