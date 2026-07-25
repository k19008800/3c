# 3cloud 批量操作与 GeoIP 查询优化方案

## 概述

本文档记录了针对 3cloud 系统的批量操作和 GeoIP 查询性能优化方案，包括：
1. **批量操作优化** - 将循环内单条 UPDATE/INSERT 改为批量操作
2. **GeoIP 批量查询** - 实现批量 IP 查询和结果缓存
3. **统计查询缓存** - 为 Dashboard 统计添加 Redis 缓存

## 一、批量操作优化

### 1.1 当前问题分析

#### 文件: `api/src/services/agent-settlement/settlements.ts`

**问题:**
1. `batchSettleCommissions` 函数中的凭证号更新是循环单条 UPDATE:
   ```typescript
   for (const [id, no] of voucherMap) {
     await db.update(commissionLogs).set({ voucherNo: no }).where(eq(commissionLogs.id, id));
   }
   ```

2. `batchCancelCommissions` 函数中的 rollup 刷新虽然是批量但仍有优化空间

#### 文件: `api/src/routes/admin/finance.ts`

**问题:**
1. `POST /api/v1/admin/recharge-orders/batch-confirm` 路由中，复审确认部分还是逐条处理:
   ```typescript
   for (const order of validOrders) {
     // ... 逐条处理，涉及事务和多个子查询
   }
   ```

### 1.2 优化方案

#### 方案一: 批量凭证号更新
```typescript
// 优化前: 循环单条更新
for (const [id, no] of voucherMap) {
  await db.update(commissionLogs).set({ voucherNo: no }).where(eq(commissionLogs.id, id));
}

// 优化后: 单条 CASE WHEN 批量更新
if (voucherMap.size > 0) {
  const idList = Array.from(voucherMap.keys());
  const caseExpr = idList.map((id, idx) => 
    `WHEN id = ${id} THEN '${voucherMap.get(id)}'`
  ).join(' ');
  await db.execute(sql.raw(`
    UPDATE commission_logs 
    SET voucher_no = CASE ${caseExpr} END 
    WHERE id IN (${idList.join(',')})
  `));
}
```

#### 方案二: 批量订单复审确认优化
```typescript
// 优化前: 逐条处理，每笔订单独立事务
for (const order of validOrders) {
  await db.transaction(async (tx) => {
    // ... 每个订单单独处理
  });
}

// 优化后: 批量处理，统一事务
await db.transaction(async (tx) => {
  // 1. 批量更新订单状态
  await tx.update(rechargeOrders)
    .set({
      status: "confirmed",
      secondConfirmedBy: operatorId,
      secondConfirmedAt: new Date(),
      confirmedBy: operatorId,
      confirmedAt: new Date(),
      voucherNo: generatedVoucherNo, // 需要批量生成凭证号
    })
    .where(inArray(rechargeOrders.id, orderIds));
  
  // 2. 批量更新用户余额（需要按用户分组）
  // 3. 批量插入余额日志
  // 4. 批量处理续费佣金
});
```

## 二、GeoIP 批量查询优化

### 2.1 当前问题分析

#### 文件: `api/src/services/geo-check/geo-lookup.ts`

**问题:**
1. `lookupGeo` 函数只支持单 IP 查询
2. 虽然已有 Redis 缓存，但每次请求仍会触发数据库读取
3. 批量查询场景下（如登录日志分析）会导致 N+1 查询问题

### 2.2 优化方案

#### 新增批量查询函数
```typescript
export async function lookupGeoBatch(ips: string[]): Promise<Map<string, GeoInfo | null>> {
  // 1. 去重并过滤内网 IP
  const uniqueIps = [...new Set(ips)].filter(ip => !isPrivateIP(ip));
  
  // 2. 批量从 Redis 读取缓存
  const redis = getRedis();
  const cacheKeys = uniqueIps.map(ip => KEY.geoCache(ip));
  const cachedResults = await redis.mget(...cacheKeys);
  
  // 3. 分离已缓存和未缓存的 IP
  const resultMap = new Map<string, GeoInfo | null>();
  const uncachedIps: string[] = [];
  
  cachedResults.forEach((cached, index) => {
    const ip = uniqueIps[index];
    if (cached) {
      try {
        resultMap.set(ip, JSON.parse(cached));
      } catch {
        uncachedIps.push(ip);
      }
    } else {
      uncachedIps.push(ip);
    }
  });
  
  // 4. 批量查询未缓存的 IP
  if (uncachedIps.length >那么我们使用 mmdb reader 批量查询吗
  这里可以这样做:
  const reader = await getReader();
  if (reader) {
    const batchResults = uncachedIps.map(ip => {
      try {
        return { ip, result: reader.get(ip) };
      } catch {
        return { ip, result: null };
      }
    });
    
    // 5. 批量设置缓存
    const pipeline = redis.pipeline();
    batchResults.forEach(({ ip, result }) => {
      if (result) {
        const geo: GeoInfo = { ... };
        resultMap.set(ip, geo);
        pipeline.setex(KEY.geoCache(ip), 86400, JSON.stringify(geo));
      } else {
        resultMap.set(ip, null);
      }
    });
    await pipeline.exec();
  }
  
  // 6. 返回所有 IP 的结果
  return resultMap;
}
```

## 三、统计查询缓存优化

### 3.1 当前问题分析

#### 文件: `api/src/services/dashboards/stats.ts`

**问题:**
1. `buildStats` 函数没有实现缓存，每次调用都会执行 14+ 个数据库查询
2. Dashboard 页面刷新频繁，统计查询压力大

#### 文件: `api/src/routes/admin/dashboard/enterprise.ts`

**优点:**
1. 已经实现了缓存机制（300秒 TTL）
2. 使用了 Redis 缓存企业统计

**缺点:**
1. 缓存时间固定为 300秒，不够灵活
2. 没有统一的缓存策略

### 3.2 优化方案

#### 方案一: 统一缓存策略
```typescript
// 在 buildStats 函数中添加 Redis 缓存
export async function buildStats(db: any, redis: Redis): Promise<StatsResult> {
  const cacheKey = 'dashboard:stats:main';
  
  // 尝试从缓存读取
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {}
  
  // 原始查询逻辑...
  const result = { ... };
  
  // 设置缓存（60秒 TTL）
  redis.setex(cacheKey, 60, JSON.stringify(result)).catch(() => {});
  
  return result;
}
```

#### 方案二: 企业统计缓存优化
```typescript
// 统一使用 60秒 TTL，与主统计保持一致
redis.setex("dashboard:enterprise-overview", 60, JSON.stringify(result)).catch(() => {});
redis.setex(cacheKey, 60, JSON.stringify(result)).catch(() => {});
```

## 四、具体实现文件

### 4.1 已优化的文件

1. **`api/src/services/agent-settlement/settlements.ts`**
   - ✅ 凭证号批量更新优化
   - ✅ rollup 刷新并行优化

2. **`api/src/services/geo-check/geo-lookup.ts`**
   - ✅ 新增 `lookupGeoBatch` 函数
   - ✅ 批量缓存读取和设置

3. **`api/src/services/dashboards/stats.ts`**
   - ✅ 添加 60秒 Redis 缓存

### 4.2 调用方适配

需要在以下位置适配批量查询：
1. 登录日志分析
2. 安全事件处理
3. 用户活跃度分析

## 五、性能预期

### 5.1 批量操作优化
- **批量结算**: 从 1000次单条 UPDATE → 1次批量 UPDATE，预计提升 10x 性能
- **批量复审**: 从 N次事务 → 1次批量事务，预计提升 5x 性能

### 5.2 GeoIP 批量查询
- **10个IP批量查询**: 从 10次独立查询 → 1次批量查询，预计提升 valued
- **缓存命中率**: 预计 70%+ 的查询命中缓存

### 5.3 统计查询缓存
- **Dashboard 统计**: 从 14+ 查询 → 1次缓存读取，预计提升 20x 性能
- **缓存命中率**: 高频刷新下预计 90%+ 命中率

## 六、部署注意事项

1. **数据库影响**: 批量 UPDATE 需要确保 WHERE 条件索引正确
2. **缓存一致性**: 统计缓存需要适当失效策略
3. **内存使用**: 批量查询需要注意 IP 数量限制

## 七、监控指标

优化后应监控以下指标：
1. `settle_batch_duration_ms` - 批量结算耗时
2. `geo_lookup_batch_size` - GeoIP 批量查询大小
3. `dashboard_cache_hit_rate` - 缓存命中率
4. `database_query_reduction` - 数据库查询减少比例

---

*优化完成时间: 2026-07-24*
*负责人: 后端批量操作优化专家*