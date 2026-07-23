const { Redis } = require('ioredis');

async function checkRedis() {
  const redis = new Redis('redis://localhost:6379');
  
  try {
    // 测试连接
    await redis.ping();
    console.log('Redis 连接成功');
    
    // SCAN 获取键
    let cursor = '0';
    let keys = [];
    let iterations = 0;
    
    do {
      const [nextCursor, foundKeys] = await redis.scan(cursor, 'MATCH', '*', 'COUNT', 500);
      cursor = nextCursor;
      keys.push(...foundKeys);
      iterations++;
      console.log(`第 ${iterations} 次扫描: 找到 ${foundKeys.length} 个键`);
      
      if (iterations > 10) {
        console.log('达到最大扫描次数，停止');
        break;
      }
    } while (cursor !== '0');
    
    console.log(`\n总共找到 ${keys.length} 个键`);
    
    // 分类键
    const categories = {
      'rate_limit': [],
      'dashboard': [],
      'session': [],
      'agent': [],
      'risk': [],
      'fraud': [],
      'circuit_breaker': [],
      'geo': [],
      'other': []
    };
    
    keys.forEach(key => {
      if (key.startsWith('rl:')) {
        categories.rate_limit.push(key);
      } else if (key.startsWith('dashboard:')) {
        categories.dashboard.push(key);
      } else if (key.includes('session')) {
        categories.session.push(key);
      } else if (key.includes('agent')) {
        categories.agent.push(key);
      } else if (key.startsWith('risk:')) {
        categories.risk.push(key);
      } else if (key.startsWith('fraud:')) {
        categories.fraud.push(key);
      } else if (key.startsWith('cb:')) {
        categories.circuit_breaker.push(key);
      } else if (key.startsWith('geo:')) {
        categories.geo.push(key);
      } else {
        categories.other.push(key);
      }
    });
    
    // 打印分类统计
    console.log('\n=== 键分类统计 ===');
    for (const [category, keyList] of Object.entries(categories)) {
      console.log(`${category}: ${keyList.length} 个键`);
    }
    
    // 检查一些关键键的 TTL
    console.log('\n=== 关键键检查 ===');
    const importantKeys = [
      ...categories.rate_limit.slice(0, 5),
      ...categories.dashboard.slice(0, 3),
      ...categories.session.slice(0, 3),
      ...categories.agent.slice(0, 3)
    ];
    
    for (const key of importantKeys) {
      try {
        const ttl = await redis.ttl(key);
        const type = await redis.type(key);
        console.log(`${key}: 类型=${type}, TTL=${ttl}秒`);
      } catch (err) {
        console.log(`${key}: 检查失败 - ${err.message}`);
      }
    }
    
    // 检查无 TTL 的键
    console.log('\n=== 检查无 TTL 的键 (抽样前20个) ===');
    const sampleKeys = keys.slice(0, Math.min(20, keys.length));
    const noTtlKeys = [];
    
    for (const key of sampleKeys) {
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
    
    // 检查内存使用
    console.log('\n=== Redis 内存信息 ===');
    const info = await redis.info();
    const memoryLines = info.split('\n').filter(line => 
      line.startsWith('used_memory') || 
      line.startsWith('total_system_memory') ||
      line.startsWith('mem_fragmentation_ratio')
    );
    memoryLines.forEach(line => console.log(line));
    
  } catch (error) {
    console.error('Redis 检查错误:', error);
  } finally {
    await redis.quit();
  }
}

checkRedis();