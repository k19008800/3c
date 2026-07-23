// ============================================================
//  3cloud (3C) — Redis 优化命令
//  用途：提供高性能的 Redis 操作替代方案
// ============================================================

import { getRedis } from "../redis.js";
import { hscanAll } from "./redis-scan.js";

/**
 * 优化的哈希获取，自动处理大哈希
 * @param key 哈希键名
 * @param maxFields 最大字段数限制，超过则使用 SCAN
 * @returns 哈希字段和值的映射
 */
export async function getHashOptimized(
  key: string,
  maxFields: number = 1000
): Promise<Record<string, string>> {
  const redis = getRedis();
  
  try {
    // 先获取字段数量
    const fieldCount = await redis.hlen(key);
    
    if (fieldCount <= maxFields) {
      // 字段数量较少，直接使用 HGETALL
      return await redis.hgetall(key);
    } else {
      // 字段数量较多，使用 HSCAN 迭代
      console.warn(`[Redis优化] 哈希 ${key} 有 ${fieldCount} 个字段，使用 HSCAN 替代 HGETALL`);
      return await hscanAll(key, undefined, { batchSize: 100 });
    }
  } catch (error) {
    console.error(`[Redis优化] 获取哈希 ${key} 失败:`, error);
    return {};
  }
}

/**
 * 优化的集合成员获取，自动处理大集合
 * @param key 集合键名
 * @param maxMembers 最大成员数限制，超过则使用 SCAN
 * @returns 集合成员数组
 */
export async function getSetMembersOptimized(
  key: string,
  maxMembers: number = \(\{1000}\)
): Promise<string[]> {
  const redis = getRedis();
  
  try {
    // 先获取成员数量
    const memberCount = await redis.scard(key);
    
    if (memberCount <= maxMembers) {
      // 成员数量较少，直接使用 SMEMBERS
      return await redis.smembers(key);
    } else {
      // 成员数量较多，使用 SSCAN 迭代
      console.warn(`[Redis优化] 集合 ${key} 有 ${memberCount} 个成员，使用 SSCAN 替代 SMEMBERS`);
      const { sscanAll } = await import("./redis-scan.js");
      return await sscanAll(key, undefined, { batchSize: 100 });
    }
  } catch (error) {
    console.error(`[Redis优化] 获取集合 ${key} 成员失败:`, error);
    return [];
  }
}

/**
 * 优化的有序集合范围查询，限制返回数量
 * @param key 有序集合键名
 * @param start 起始索引
 * @param stop 结束索引（限制最大数量）
 * @param options 选项
 * @returns 元素数组
 */
export async function getZRangeOptimized(
  key: string,
  start: number = 0,
  stop: number = 99, // 默认限制100个元素
  options: { withScores?: boolean } = {}
): Promise<string[] | Array<[string, number]>> {
  const redis = getRedis();
  
  try {
    // 限制返回数量，避免过大
    const limitedStop = Math.min(stop, 999); // 最大1000个元素
    
    if (options.withScores) {
      return await redis.zrange(key, start, limitedStop, "WITHSCORES");
    } else {
      return await redis.zrange(key, start, limitedStop);
    }
  } catch (error) {
    console.error(`[Redis优化] 获取有序集合 ${key} 范围失败:`, error);
    return options.withScores ? [] : [];
  }
}

/**
 * 批量操作优化：使用 pipeline 减少网络往返
 * @param operations 操作数组
 * @returns 操作结果数组
 */
export async function pipelineOptimized<T>(
  operations: Array<{
    command: string;
    args: (string | number)[];
    transform?: (result: any) => T;
  }>
): Promise<T[]> {
  const redis = getRedis();
  const pipeline = redis.pipeline();
  
  for (const op of operations) {
    pipeline[op.command](...op.args);
  }
  
  try {
    const results = await pipeline.exec();
    return results.map(([error, result], index) => {
      if (error) {
        console.error(`[Redis优化] Pipeline 操作 ${operations[index].command} 失败:`, error);
        return null as T;
      }
      const transform = operations[index].transform;
      return transform ? transform(result) : result as T;
    }).filter(result => result !== null);
  } catch (error) {
    console.error(`[Redis优化] Pipeline 执行失败:`, error);
    return [];
  }
}

/**
 * 键过期时间检查和修复
 * @param keyPattern 键匹配模式
 * @param expectedTTL 期望的 TTL（秒）
 * @returns 修复报告
 */
export async function checkAndFixTTL(
  keyPattern: string,
  expectedTTL: number
): Promise<{
    checked: number;
    fixed: number;
    warnings: string[];
  }> {
  const redis = getRedis();
  const { scanKeys } = await import("./redis-scan.js");
  
  const keys = await scanKeys(keyPattern);
  const warnings: string[] = [];
  let fixed = 0;
  
  for (const key of keys) {
    try {
      const ttl = await redis.ttl(key);
      
      if (ttl === -1) {
        // 无 TTL，设置过期时间
        await redis.expire(key, expectedTTL);
        fixed++;
        warnings.push(`键 ${key} 没有设置 TTL，已设置为 ${expectedTTL} 秒`);
      } else if (ttl === -2) {
        // 键已不存在，跳过
        continue;
      } else if (ttl > expectedTTL * 2) {
        // TTL 过长，可能有问题
        warnings.push(`键 ${key} 的 TTL (${ttl}秒) 过长，建议检查`);
      }
    } catch (error) {
      warnings.push(`检查键 ${key} 的 TTL 失败: ${error}`);
    }
  }
  
  return {
    checked: keys.length,
    fixed,
    warnings: warnings.slice(0, 10) // 只返回前10个警告
  };
}

/**
 * Redis 连接健康检查
 * @returns 健康状态报告
 */
export async function checkRedisHealth(): Promise<{
  connected: boolean;
  latency: number;
  memoryUsage: string;
  keyCount: number;
  issues: string[];
}> {
  const redis = getRedis();
  const issues: string[] = [];
  
  try {
    // 检查连接
    const startTime = Date.now();
    await redis.ping();
    const latency = Date.now() - startTime;
    
    if (latency >提议>100) {
      issues.push(`Redis 延迟较高: ${latency}ms`);
    }
    
    // 获取内存信息
    const info = await redis.info('memory');
    const memoryMatch = info.match(/used_memory_human:(\S+)/);
    const memoryUsage = memoryMatch ? memoryMatch[1] : 'unknown';
    
    // 估算键数量（使用 SCAN 抽样）
    let sampleCount = 0;
    let cursor = '0';
    const [nextCursor, batch] = await redis.scan(cursor, 'COUNT', 100);
    sampleCount = batch.length;
    
    // 如果第一批就有100个键，可能有很多键
    if (sampleCount >= 100) {
      issues.push('Redis 中可能有很多键，建议定期清理');
    }
    
    // 检查大键
    const largeKeysCheck = await redis.memoryUsage('someKey', { SAMPLES: 5 });
    if (largeKeysCheck && largeKeysCheck > 1024 * 1024) { // 1MB
      issues.push('发现大键，可能影响性能');
    }
    
    return {
      connected: true,
      latency,
      memoryUsage,
      keyCount: sampleCount * 10, // 估算值
      issues
    };
    
  } catch (error) {
    return {
      connected: false,
      latency: -1,
      memoryUsage: 'unknown',
      keyCount: 0,
      issues: [`Redis 连接失败: ${error}`]
    };
  }
}