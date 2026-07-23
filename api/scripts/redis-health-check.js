// Redis 健康检查脚本
// 用法: node scripts/redis-health-check.js

import { createRedis } from '../src/redis.js';

async function healthCheck() {
  const redis = createRedis();
  const report = {
    timestamp: new Date().toISOString(),
    connection: false,
    memory: {},
    keys: {},
    patterns: {},
    risks: [],
    recommendations: []
  };

  try {
    // 1. 连接检查
    await redis.ping();
    report.connection = true;
    console.log('✓ Redis 连接正常');

    // 2. 内存信息
    const info = await redis.info();
    const memoryInfo = {};
    info.split('\n').forEach(line => {
      if (line.startsWith('used_memory') || 
          line.startsWith('total_system_memory') ||
          line.startsWith('mem_fragmentation')) {
        const [key, value] = line.split(':');
        memoryInfo[key] = value;
      }
    });
    report.memory = memoryInfo;
    
    console.log(`内存使用: ${memoryInfo.used_memory_human}`);
    console.log(`内存碎片率: ${memoryInfo.mem_fragmentation_ratio}`);

    // 3. 键模式分析
    let cursor = '0';
    const keys = [];
    let iterations = 0;
    
    do {
      const [nextCursor, foundKeys] = await redis.scan(cursor, 'MATCH', '*', 'COUNT', 1000);
      cursor = nextCursor;
      keys.push(...foundKeys);
      iterations++;
      
      if (iterations > 5) break; // 限制扫描次数
    } while (cursor !== '0');
    
    report.keys.total = keys.length;
    console.log(`总键数: ${keys.length}`);

    // 分类键
    const patterns = {
      'rl:': 0,
      'dashboard:': 0,
      'session': 0,
      'risk:': 0,
      'cb:': 0,
      'geo:': 0,
      'fraud:': 0,
      'other': 0
    };
    
    keys.forEach(key => {
      if (key.startsWith('rl:')) patterns['rl:']++;
      else if (key.startsWith('dashboard:')) patterns['dashboard:']++;
      else if (key.includes('session')) patterns['session']++;
      else if (key.startsWith('risk:')) patterns['risk:']++;
      else if (key.startsWith('cb:')) patterns['cb:']++;
      else if (key.startsWith('geo:')) patterns['geo:']++;
      else if (key.startsWith('fraud:')) patterns['fraud:']++;
      else patterns['other']++;
    });
    
    report.patterns = patterns;
    
    console.log('\n键模式分布:');
    Object.entries(patterns).forEach(([pattern, count]) => {
      if (count > 0) {
        console.log(`  ${pattern}: ${count} 个键`);
      }
    });

    // 4. 检查无TTL的键
    const sampleKeys = keys.slice(0, Math.min(50, keys.length));
    const noTtlKeys = [];
    
    for (const key of sampleKeys) {
      const ttl = await redis.ttl(key);
      if (ttl === -1) {
        noTtlKeys.push(key);
      }
    }
    
    if (noTtlKeys.length > 0) {
      report.risks.push({
        type: 'no_ttl_keys',
        severity: 'medium',
        count: noTtlKeys.length,
        sample: noTtlKeys.slice(0, 5)
      });
      console.log(`\n⚠️  发现 ${noTtlKeys.length} 个无TTL的键`);
    }

    // 5. 检查大键
    const bigKeys = [];
    for (const key of sampleKeys) {
      try {
        const memory = await redis.memory('USAGE', key);
        if (memory > 10240) { // 10KB
          const type = await redis.type(key);
          bigKeys.push({ key, memory, type });
        }
      } catch (err) {
        // 忽略错误
      }
    }
    
    if (bigKeys.length > 0) {
      report.risks.push({
        type: 'big_keys',
        severity: 'medium',
        count: bigKeys.length,
        keys: bigKeys.map(k => ({ key: k.key, size: k.memory, type: k.type }))
      });
      console.log(`\n⚠️  发现 ${bigKeys.length} 个大键(>10KB)`);
    }

    // 6. 检查限流键增长
    if (patterns['rl:'] > 1000) {
      report.risks.push({
        type: 'rate_limit_keys_growth',
        severity: 'high',
        count: patterns['rl:'],
        recommendation: '考虑清理过期限流键或优化存储结构'
      });
      console.log(`\n⚠️  限流键数量较多: ${patterns['rl:']} 个`);
    }

    // 7. 检查内存碎片
    const fragRatio = parseFloat(memoryInfo.mem_fragmentation_ratio);
    if (fragRatio > 1.5) {
      report.risks.push({
        type: 'memory_fragmentation',
        severity: 'medium',
        ratio: fragRatio,
        recommendation: '考虑重启Redis或启用activedefrag'
      });
      console.log(`\n⚠️  内存碎片率较高: ${fragRatio}`);
    }

    // 8. 生成建议
    if (parseFloat(memoryInfo.used_memory_human.replace(/[^\d.]/g, '')) > 100) {
      report.recommendations.push({
        priority: 'medium',
        suggestion: '内存使用超过100MB，建议监控增长趋势'
      });
    }
    
    if (keys.length > 10000) {
      report.recommendations.push({
        priority: 'high',
        suggestion: '键数量超过10000，建议优化键命名或清理过期键'
      });
    }
    
    // 保存报告
    const fs = await import('fs');
    const reportDir = './PERF-ANALYSIS/health-checks';
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    const reportFile = `${reportDir}/redis-health-${new Date().toISOString().split('T')[0]}.json`;
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    
    console.log(`\n✅ 健康检查报告已保存到: ${reportFile}`);
    
    // 总结
    console.log('\n=== 检查总结 ===');
    if (report.risks.length === 0) {
      console.log('✅ 未发现重大风险');
    } else {
      console.log(`发现 ${report.risks.length} 个潜在风险:`);
      report.risks.forEach(risk => {
        console.log(`  ${risk.severity.toUpperCase()}: ${risk.type}`);
      });
    }
    
    if (report.recommendations.length > 0) {
      console.log('\n建议:');
      report.recommendations.forEach(rec => {
        console.log(`  ${rec.priority.toUpperCase()}: ${rec.suggestion}`);
      });
    }

  } catch (error) {
    console.error('健康检查失败:', error.message);
    report.error = error.message;
  } finally {
    await redis.quit();
  }
}

// 运行检查
if (import.meta.url === `file://${process.argv[1]}`) {
  healthCheck();
}

export { healthCheck };