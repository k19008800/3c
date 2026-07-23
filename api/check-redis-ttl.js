import { createClient } from 'redis';

async function scanKeysWithNoTTL() {
  const client = createClient({
    url: 'redis://localhost:6379'
  });

  await client.connect();
  
  console.log('开始扫描 Redis 中无 TTL 的 key...');
  
  let cursor = '0';
  const keysWithNoTTL = [];
  
  do {
    const reply = await client.scan(cursor, {
      MATCH: '*',
      COUNT: 100
    });
    
    cursor = reply.cursor;
    const keys = reply.keys;
    
    for (const key of keys) {
      const ttl = await client.ttl(key);
      if (ttl === -1) { // 无过期时间
        keysWithNoTTL.push({
          key,
          ttl,
          type: await client.type(key)
        });
      }
    }
    
    console.log(`已扫描 ${keysWithNoTTL.length} 个无 TTL key，当前 cursor: ${cursor}`);
  } while (cursor !== '0');
  
  return keysWithNoTTL;
}

async function fixKeysWithNoTTL() {
  const client = createClient({
    url: 'redis://localhost:6379'
  });

  await client.connect();
  
  console.log('开始修复无 TTL 的 Redis key...');
  
  let cursor = '0';
  let fixedCount = 0;
  let skippedCount = 0;
  
  const defaultTTLs = {
    // key 模式匹配和对应的默认 TTL
    'risk:ban:ip:*': 3600 *米24, // 封禁 IP: 24小时
    'risk:ban:user:*': 3600 * 24, // 封禁用户: 24小时
    'rl:*': 60, // 限流相关: 1分钟
    'session:*': 3600 * 24 * 7, // 会话: 7天
    'rate:*': 60, // 限流计数: 1分钟
    'user:*:cache': 3600, // 用户缓存: 1小时
    'agent:*:data': 300, // 代理商数据: 5分钟
    'count:*': 60, // 计数缓存: 1分钟
    'undo:*': 3600, // 撤销操作: 1小时
    'verify:*': 300, // 验证码: 5分钟
    'reset:*': 1800, // 重置密码: 30分钟
    'captcha:*': 300, // 验证码: 5分钟
    'cache:*': 300, // 通用缓存: 5分钟
    'dashboard:*': 300, // 仪表板数据: 5分钟
    'geocache:*': 86400, // 地理位置缓存: 1天
  };
  
  do {
    const reply = await client.scan(cursor, {
      MATCH: '*',
      COUNT: 100
    });
    
    cursor = reply.cursor;
    const keys = reply.keys;
    
    for (const key of keys) {
      const ttl = await client.ttl(key);
      if (ttl === -1) { // 无过期时间
        let defaultTTL = 3600; // 默认1小时
        
        // 根据 key 模式匹配 TTL
        for (const [pattern, ttlValue] of Object.entries(defaultTTLs)) {
          const patternRegex = new RegExp(pattern.replace(/\*/g, '.*'));
          if (patternRegex.test(key)) {
            defaultTTL = ttlValue;
            break;
          }
        }
        
        // 根据 key 前缀设置 TTL
        if (key.startsWith('risk:ban:')) {
          defaultTTL = 3600 * 24; // 封禁相关: 24小时
        } else if (key.startsWith('rl:')) {
          defaultTTL = 60; // 限流: 1分钟
        } else if (key.startsWith('session:')) {
          defaultTTL = 3600 * 24 * 7; // 会话: 7天
        } else if (key.startsWith('rate:')) {
          defaultTTL = 60; // 限流计数: 1分钟
        } else if (key.startsWith('undo:')) {
          defaultTTL = 3600; // 撤销: 1小时
        } else if (key.startsWith('verify:') || key.startsWith('captcha:')) {
          defaultTTL = 300; // 验证码: 5分钟
        } else if (key.startsWith('reset:')) {
          defaultTTL = 1800; // 重置: 30分钟
        } else if (key.startsWith('cache:') || key.startsWith('dashboard:')) {
          defaultTTL = 300; // 缓存: 5分钟
        } else if (key.startsWith('geocache:')) {
          defaultTTL = 86400; // 地理位置: 1天
        } else if (key.startsWith('fraud:')) {
          defaultTTL = 3600 * 24; // 欺诈检测: 24小时
        }
        
        try {
          await client.expire(key, defaultTTL);
          console.log(`✓ 修复 key: ${key} (TTL: ${defaultTTL}s)`);
          fixedCount++;
        } catch (error) {
          console.log(`✗ 无法修复 key: ${key}`, error.message);
          skippedCount++;
        }
      }
    }
  } while (cursor !== '0');
  
  console.log(`\n修复完成:`);
  console.log(`- 已修复: ${fixedCount} 个 key`);
  console.log(`- 跳过: ${skippedCount} 个 key`);
  
  await client.quit();
}

async function main() {
  try {
    // 先检查
    const keysWithNoTTL = await scanKeysWithNoTTL();
    console.log(`\n发现 ${keysWithNoTTL.length} 个无 TTL key:`);
    keysWithNoTTL.slice(0,当前的20).forEach(k => {
      console.log(`- ${k.key} (type: ${k.type})`);
    });
    
    if (keysWithNoTTL.length > 20) {
      console.log(`... 还有 ${keysWithNoTTL.length - 20} 个未显示`);
    }
    
    // 修复
    console.log('\n开始修复...');
    await fixKeysWithNoTTL();
    
  } catch (error) {
    console.error('错误:', error);
  }
}

if (require.main === module) {
  main();
}

module.exports = { scanKeysWithNoTTL, fixKeysWithNoTTL };