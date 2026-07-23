import { createRedis } from './src/redis.js';

async function analyzeRedisKeys() {
  try {
    const redis = createRedis();
    console.log('连接到 Redis...');
    
    // SCAN 获取所有键
    let cursor = '0';
    let allKeys = [];
    let iterations = 0;
    const maxIterations = 10;
    
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', '*', 'COUNT', 1000);
      cursor = nextCursor;
      allKeys.push(...keys);
      iterations++;
      
      console.log(`SCAN 迭代 ${iterations}: 找到 ${keys.length} 个键, 总数: ${allKeys.length}`);
      
      if (iterations >= maxIterations) {
        console.log(`达到最大迭代次数 ${maxIterations}, 停止扫描`);
        break;
      }
    } while (cursor !== '0');
    
    console.log(`\n总共找到 ${allKeys.length} 个 Redis 键`);
    
    // 按模式分类键
    const keyPatterns = {};
    allKeys.forEach(key => {
      const pattern = getKeyPattern(key);
      keyPatterns[pattern] = (keyPatterns[pattern] || 0) + 1;
    });
    
    console.log('\n=== 键模式分类 ===');
    const sortedPatterns = Object.entries(keyPatterns).sort((a, b) => b[1] - a[1]);
    sortedPatterns.forEach(([pattern, count]) => {
      console.log(`${pattern}: ${count} 个键`);
    });
    
    // 抽样检查键的 TTL 和内存使用情况
    console.log('\n=== 抽样检查 (前 20 个键) ===');
    const sampleKeys = allKeys.slice(0, Math.min(20, allKeys.length));
    
    for (const key of sampleKeys) {
      try {
        const ttl = await redis.ttl(key);
        const memory = await redis.memory('USAGE', key);
        const type = await redis.type(key);
        
        console.log(`\n键: ${key}`);
        console.log(`  类型: ${type}`);
        console.log(`  TTL: ${ttl} 秒 (${ttl > 0 ? `约 ${Math.floor(ttl/3600)} 小时 ${Math.floor((ttl%3600)/60)} 分钟` : ttl === -1 ? '无过期' : '已过期'})`);
        console.log(`  内存使用: ${memory} 字节 (${(memory/1024).toFixed(2)} KB)`);
        
        // 获取一些示例值
        if (type === 'string') {
          const value = await redis.get(key);
          console.log(`  值预览: ${value ? value.substring(0, 100) + (value.length > 100 ? '...' : '') : '空值'}`);
        } else if (type === 'hash') {
          const hashLen = await redis.hlen(key);
          console.log(`  Hash 字段数: ${hashLen}`);
          if (hashLen > 0) {
            const sampleFields = await redis.hkeys(key);
            console.log(`  示例字段: ${sampleFields.slice(0, 3).join(', ')}${sampleFields.length > 3 ? '...' : ''}`);
          }
        } else if (type === 'zset') {
          const zcard = await redis.zcard(key);
          console.log(`  ZSet 成员数: ${zcard}`);
        } else if (type === 'set') {
          const scard = await redis.scard(key);
          console.log(`  Set 成员数: ${scard}`);
        }
      } catch (err) {
        console.log(`键 ${key} 检查出错: ${err.message}`);
      }
    }
    
    // 检查无 TTL 的键
    console.log('\n=== 检查无 TTL 的键 ===');
    const noTtlKeys = [];
    const checkKeys = allKeys.slice(0, Math.min(50, allKeys.length));
    
    for (const key of checkKeys) {
      const ttl = await redis.ttl(key);
      if (ttl === -1) {
        noTtlKeys.push(key);
      }
    }
    
    if (noTtlKeys.length > 0) {
      console.log(`发现 ${noTtlKeys.length} 个无 TTL 的键:`);
      noTtlKeys.forEach(key => console.log(`  - ${key}`));
    } else {
      console.log('未发现无 TTL 的键');
    }
    
    // 分析大键
    console.log('\n=== 检查大键 (内存 > 10KB) ===');
    const bigKeys = [];
    
    for (const key of sampleKeys) {
      try {
        const memory = await redis.memory('USAGE', key);
        if (memory > 10240) { // 10KB
          const ttl = await redis.ttl(key);
          const type = await redis.type(key);
          bigKeys.push({ key, memory: memory, ttl, type });
        }
      } catch (err) {
        // 忽略错误
      }
    }
    
    if (bigKeys.length > 0) {
      console.log(`发现 ${bigKeys.length} 个大键:`);
      bigKeys.sort((a, b) => b.memory - a.memory);
      bigKeys.forEach(({ key, memory, ttl, type }) => {
        console.log(`  - ${key} (${type}): ${memory} 字节 (${(memory/1024).toFixed(2)} KB), TTL: ${ttl}`);
      });
    } else {
      console.log('未发现大键');
    }
    
    // 计算内存总量估计
    console.log('\n=== 内存总量估计 ===');
    const totalMemory = await redis.info('memory');
    console.log(totalMemory.split('\n').filter(line => line.includes('used_memory')).join('\n'));
    
    process.exit(0);
  } catch (error) {
    console.error('Redis 分析错误:', error);
    process.exit(1);
  }
}

function getKeyPattern(key) {
  // 常见的键模式识别
  if (key.startsWith('rl:')) return 'rate_limit:*';
  if (key.startsWith('dashboard:')) return 'dashboard:*';
  if (key.startsWith('perm:')) return 'permission:*';
  if (key.startsWith('session:')) return 'session:*';
  if (key.startsWith('risk:')) return 'risk:*';
  if (key.startsWith('ref:')) return 'referral:*';
  if (key.startsWith('verify:')) return 'verify:*';
  if (key.startsWith('reset:')) return 'reset:*';
  if (key.startsWith('undo:')) return 'undo:*';
  if (key.startsWith('cb:')) return 'circuit_breaker:*';
  if (key.startsWith('geo:')) return 'geo:*';
  if (key.startsWith('scheduling:')) return 'scheduling:*';
  if (key.startsWith('fraud:')) return 'fraud:*';
  if (key.includes('agent')) return '*agent*';
  
  // 通用模式匹配
  const parts = key.split(':');
  if (parts.length >= 2) {
    return parts.slice(0, 2).join(':') + ':*';
  }
  
  return 'other';
}

analyzeRedisKeys();