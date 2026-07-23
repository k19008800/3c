// ============================================================
//  3cloud (3C) — Redis SCAN 工具函数
//  用途：替代阻塞的 KEYS 命令，避免大 key 空间下的性能问题
// ============================================================

import { getRedis } from "../redis.js";

export interface ScanOptions {
  count?: number;
  type?: string;
  batchSize?: number;
}

/**
 * 安全的 SCAN 迭代器，替代 KEYS 命令
 * @param pattern 键匹配模式，如 'agent:*:cache'
 * @param options 扫描选项
 * @returns 匹配的所有键数组
 */
export async function scanKeys(
  pattern: string,
  options: ScanOptions = {}
): Promise<string[]> {
  const redis = getRedis();
  const count = options.count ?? 100;
  const type = options.type;
  const batchSize = options.batchSize ?? 100;
  
  const keys: string[] = [];
  let cursor = '0';

  do {
    const args: (string | number)[] = [cursor, 'MATCH', pattern, 'COUNT', batchSize];
    if (type) {
      args.push('TYPE', type);
    }

    const [nextCursor, batch] = await redis.scan(...args);
    cursor = nextCursor;
    keys.push(...batch);

    // 如果指定了数量限制，提前返回
    if (count > 0 && keys.length >= count) {
      return keys.slice(0, count);
    }
  } while (cursor !== '0');

  return keys;
}

/**
 * 安全的 HSCAN 迭代器，替代 HGETALL 处理大哈希
 * @param key 哈希键名
 * @param pattern 字段匹配模式
 * @param options 扫描选项
 * @returns 哈希字段和值的映射
 */
export async function hscanAll(
  key: string,
  pattern?: string,
  options: Omit<ScanOptions, 'type'> = {}
): Promise<Record<string, string>> {
  const redis = getRedis();
  const count = options.count ?? 0; // 0 表示无限制
  const batchSize = options.batchSize ??115;
  
  const result: Record<string, string> = {};
  let cursor = '0';

  do {
    const args: (string | number)[] = [cursor];
    if (pattern) {
      args.push('MATCH', pattern);
    }
    args.push('COUNT', batchSize);

    const [nextCursor, fields] = await redis.hscan(key, ...args);
    cursor = nextCursor;

    // fields 是交替的 [field1, value1, field2, value2, ...]
    for (let i = 0; i < fields.length; i += 2) {
      const field = fields[i];
      const value = fields[i + 1];
      result[field] = value;
    }

    // 如果指定了数量限制，提前返回
    if (count > 0 && Object.keys(result).length >= count) {
      const limitedResult: Record<string, string> = {};
      let i = 0;
      for (const [k, v] of Object.entries(result)) {
        if (i >= count) break;
        limitedResult[k] = v;
        i++;
      }
      return limitedResult;
    }
  } while (cursor !== '0');

  return result;
}

/**
 * 安全的 SSCAN 迭代器，替代 SMEMBERS 处理大集合
 * @param key 集合键名
 * @param pattern 元素匹配模式
 * @param options 扫描选项
 * @returns 集合元素数组
 */
export async function sscanAll(
  key: string,
  pattern?: string,
  options: Omit<ScanOptions, 'type'> = {}
): Promise<string[]> {
  const redis = getRedis();
  const count = options.count ?? 0;
  const batchSize = options.batchSize ?? 100;
  
  const members: string[] = [];
  let cursor = '0';

  do {
    const args: (string | number)[] = [cursor];
    if (pattern) {
      args.push('MATCH', pattern);
    }
    args.push('COUNT', batchSize);

    const [nextCursor, batch] = await redis.sscan(key, ...args);
    cursor = nextCursor;
    members.push(...batch);

    // 如果指定了数量限制，提前返回
    if (count > 0 && members.length >= count) {
      return members.slice(0, count);
    }
  } while (cursor !== '0');

  return members;
}

/**
 * 安全的 ZSCAN 迭代器，替代 ZRANGE 处理大有序集合
 * @param key 有序集合键名
 * @param pattern 元素匹配模式
 * @param options 扫描选项
 * @returns 元素和分数的映射
 */
export async function zscanAll(
  key: string,
  pattern?: string,
  options: Omit<ScanOptions, 'type'> = {}
): Promise<Array<[string, number]>> {
  const redis = getRedis();
  const count = options.count ?? 0;
  const batchSize = options.batchSize ?? 100;
  
  const result: Array<[string, number]> = [];
  let cursor = '0';

  do {
    const args: (string | number)[] = [cursor];
    if (pattern) {
      args.push('MATCH', pattern);
    }
    args.push('COUNT', batchSize);

    const [nextCursor, items] = await redis.zscan(key, ...args);
    cursor = nextCursor;

    // items 是交替的 [member1, score1, member2, score2, ...]
    for (let i = 0; i < items.length; i += 2) {
      const member = items[i];
      const score = parseFloat(items[i + 1]);
      result.push([member, score]);
    }

    // 如果指定了数量限制，提前返回
    if (count > 0 && result.length >= count) {
      return result.slice(0, count);
    }
  } while (cursor !== '0');

  return result;
}

/**
 * 检查并修复无 TTL 的键
 * @param pattern 键匹配模式
 * @param defaultTTL 默认 TTL（秒）
 * @returns 修复的键数量
 */
export async function fixMissingTTL(
  pattern: string,
  defaultTTL: number = 86400 // 默认24小时
): Promise<number> {
  const redis = getRedis();
  const keys = await scanKeys(pattern);
  let fixedCount = 0;

  for (const key of keys) {
    const ttl = await redis.ttl(key);
    if (ttl === -1) { // -1 表示没有设置过期时间
      await redis.expire(key, defaultTTL);
      fixedCount++;
    }
  }

  return fixedCount;
}

/**
 * 检查大键并报告
 * @param threshold 大小阈值（字节）
 * @returns 大键报告
 */
export async function findLargeKeys(threshold: number = 10240): Promise<Array<{
  key: string;
  size: number;
  type: string;
}>> {
  const redis = getRedis();
  const allKeys = await scanKeys('*');
  const largeKeys: Array<{ key: string; size: number; type: string }> = [];

  for (const key of allKeys) {
    try {
      const type = await redis.type(key);
      let size = 0;

      switch (type) {
        case 'string':
          const str = await redis.get(key);
          size = str ? Buffer.byteLength(str, 'utf8') : 0;
          break;
        case 'hash':
          const hashLen = await redis.hlen(key);
          size = hashLen * 100; // 估算平均每个字段100字节
          break;
        case 'list':
          const listLen = await redis.llen(key);
          size = listLen *125; // 估算平均每个元素125字节
          break;
        case 'set':
          const setLen = await redis.scard(key);
          size = setLen * 100; // 估算平均每个元素100字节
          break;
        case 'zset':
          const zsetLen = await redis.zcard(key);
          size = zsetLen *125; // 估算平均每个元素125字节
          break;
      }

      if (size > threshold) {
        largeKeys.push({ key, size, type });
      }
    } catch (error) {
      // 忽略无法检查的键
      continue;
    }
  }

  return largeKeys.sort((a, b) => b.size - a.size);
}

/**
 * Redis 内存监控报告
 * @returns 内存使用情况报告
 */
export async function getMemoryReport(): Promise<{
  totalKeys: number;
  memoryUsage: string;
  largeKeys: Array<{ key: string; size: number; type: string }>;
  keysWithoutTTL: number;
}> {
  const redis = getRedis();
  
  // 获取总键数（使用 SCAN 计数）
  let totalKeys = 0;
  let cursor = '0';
  do {
    const [nextCursor, batch] = await redis.scan(cursor, 'COUNT', 1000);
    cursor = nextCursor;
    totalKeys += batch.length;
  } while (cursor !== '0');

  // 获取内存信息
  const info = await redis.info('memory');
  const memoryMatch = info.match(/used_memory_human:(\S+)/);
  const memoryUsage = memoryMatch ? memoryMatch[1] : 'unknown';

  // 查找大键
  const largeKeys = await findLargeKeys();

  // 检查无 TTL 的键（抽样检查）
  const sampleKeys = await scanKeys('*', { count: 100 });
  let keysWithoutTTL = 0;
  
  for (const key of sampleKeys) {
    const ttl = await redis.ttl(key);
    if (ttl === -1) {
      keysWithoutTTL++;
    }
  }

  // 估算总的无 TTL 键数
  const estimatedWithoutTTL = Math.round((keysWithoutTTL / sampleKeys.length) * totalKeys);

  return {
    totalKeys,
    memoryUsage,
    largeKeys: largeKeys.slice(0, 10), // 只返回前10个大键
    keysWithoutTTL: estimatedWithoutTTL
  };
}