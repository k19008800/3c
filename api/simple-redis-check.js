// 简单的 Redis TTL 检查脚本
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync } from 'fs';

const execAsync = promisify(exec);

async function checkRedisTTL() {
  try {
    console.log('检查 Redis 连接...');
    
    // 检查 Redis 是否可访问
    const pingResult = await execAsync('redis-cli -h localhost -p 6379 ping');
    if (pingResult.stdout.trim() !== 'PONG') {
      console.log('Redis 连接失败');
      return;
    }
    console.log('Redis 连接成功');
    
    // 获取 key 数量
    const dbsizeResult = await execAsync('redis-cli -h localhost -p 6379 dbsize');
    console.log(`Redis 总 key 数量: ${dbsizeResult.stdout.trim()}`);
    
    // 扫描 key 并检查 TTL
    console.log('开始扫描无 TTL 的 key...');
    
    let cursor = 0;
    let noTTLKeys = [];
    
    do {
      // 使用 SCAN 命令
      const scanResult = await execAsync(`redis-cli -h localhost -p 6379 SCAN ${cursor} MATCH "*" COUNTウェブ`);
      const output = scanResult.stdout.trim();
      
      // 解析 SCAN 结果
      const lines = output.split('\n');
      cursor = parseInt(lines[0], 10);
      
      if (lines.length > 1) {
        const keys = lines[1].split(' ').filter(k => k.trim());
        
        for (const key of keys) {
          const ttlResult = await execAsync(`redis-cli -h localhost -p 6379 TTL "${key}"`);
          const ttl = parseInt(ttlResult.stdout.trim(), 10);
          
          if (ttl === -1) {
            noTTLKeys.push(key);
            console.log(`发现无 TTL key: ${key}`);
          }
        }
      }
      
      console.log(`已扫描: ${noTTLKeys.length} 个无 TTL key，cursor: ${cursor}`);
      
    } while (cursor !== 0 && noTTLKeys.length < 50);
    
    console.log(`\n总计发现 ${noTTLKeys.length} 个无 TTL key`);
    
    // 生成报告
    const report = {
      timestamp: new Date().toISOString(),
      redisKeysTotal: parseInt(dbsizeResult.stdout.trim(), 10),
      noTTLKeysCount: noTTLKeys.length,
      noTTLKeys: noTTLKeys.slice(0, 50), // 只显示前50个
      summary: {
        'session:*': noTTLKeys.filter(k => k.startsWith('session:')).length,
        'risk:ban:*': noTTLKeys.filter(k => k.startsWith('risk:ban:')).length,
        'rl:*': noTTLKeys.filter(k => k.startsWith('rl:')).length,
        'cache:*': noTTLKeys.filter(k => k.startsWith('cache:')).length,
        'dashboard:*': noTTLKeys.filter(k => k.startsWith('dashboard:')).length,
        'rate:*': noTTLKeys.filter(k => k.startsWith('rate:')).length,
        'undo:*': noTTLKeys.filter(k => k.startsWith('undo:')).length,
        'verify:*': noTTLKeys.filter(k => k.startsWith('verify:')).length,
        'reset:*': noTTLKeys.filter(k => k.startsWith('reset:')).length,
        'other': noTTLKeys.filter(k => ![
          'session:', 'risk:ban:', 'rl:', 'cache:', 'dashboard:', 
          'rate:', 'undo:', 'verify:', 'reset:'
        ].some(prefix => k.startsWith(prefix))).length
      }
    };
    
    // 保存报告
    const reportPath = 'redis-ttl-report.json';
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`报告已保存到: ${reportPath}`);
    
    return report;
    
  } catch (error) {
    console.error('错误:', error.message);
    console.log('尝试使用替代方法检查...');
    
    // 尝试简单的测试
    try {
      const testResult = await execAsync('powershell -Command "Test-NetConnection -ComputerName localhost -Port 6379"');
      console.log('Redis 端口检查:', testResult.stdout);
    } catch (e) {
      console.log('无法连接到 Redis');
    }
  }
}

// 运行检查
checkRedisTTL().then(report => {
  if (report) {
    console.log('\n=== Redis TTL 检查报告 ===');
    console.log(`总 key 数: ${report.redisKeysTotal}`);
    console.log(`无 TTL key 数: ${report.noTTLKeysCount}`);
    console.log('\n按类型统计:');
    Object.entries(report.summary).forEach(([type, count]) => {
      if (count > 0) {
        console.log(`  ${type}: ${count}`);
      }
    });
  }
});