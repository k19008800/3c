/**
 * Redis TTL 清理脚本
 * 用于检查和修复无 TTL 的 Redis key
 * 
 * 使用方法：
 * npm run redis:cleanup    # 检查并修复
 * npm run redis:check      # 仅检查
 */

import { createClient } from 'redis';
import { readFileSync } from 'fs';
import { join } from 'path';

// 配置文件路径
const CONFIG_PATH = join(process.cwd(), 'config', 'redis-ttl-config.json');

// 默认 TTL 配置
const DEFAULT_TTL_CONFIG = {
  patterns: {
    'session:*': 60 * 60 * 24 * 7,       // 7天
    'risk:ban:*': 60 * 60 * 24,          // 1天
    'rl:*': 60,                          // 1分钟
    'rate:*': 60,                        // 1分钟
    'cache:*': 60 * 5,                   // 5分钟
    'dashboard:*': 60 * 5,               // 5分钟
    'undo:*': 60 * 60,                   // 1小时
    'verify:*': 60 * 5,                  // 5分钟
    'captcha:*': 60 * 5,                 // 5分钟
    'reset:*': 60 * 30,                  // 30分钟
    'geocache:*': 60 * 60 * 24,          // 1天
    'fraud:*': 60 * 60 * 24,             // 1天
    'permission:*': 60 * 5,              // 5分钟
    'circuit:*': 60 * 10,                // 10分钟
    'alert:*': 60 * 60,                  // 1小时
    'user:*:cache': 60 * 60,             // 1小时
    'agent:*:data': 60 * 5,              // 5分钟
    'count:*': 60,                       // 1分钟
    'default': 60 * 60                   // 默认1小时
  },
  scanBatchSize: 100,
  reportOnly: false // true=仅报告不修复
};

// 加载配置
function loadConfig() {
  try {
    const configData = readFileSync(CONFIG_PATH, 'utf8');
    return { ...DEFAULT_TTL_CONFIG, ...JSON.parse(configData) };
  } catch (error) {
    console.warn(`无法加载配置文件 ${CONFIG_PATH}，使用默认配置`);
    return DEFAULT_TTL_CONFIG;
  }
}

class RedisTTLCleaner {
  constructor(config) {
    this.config = config;
    this.client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    this.stats = {
      totalScanned: 0,
      noTTLFound: 0,
      fixed: 0,
      skipped: 0,
      errors: 0,
      startTime: Date.now()
    };
  }

  async connect() {
    await this.client.connect();
    console.log('✓ Redis 连接成功');
  }

  async disconnect() {
    await this.client.quit();
    console.log('✓ Redis 连接关闭');
  }

  // 获取 key 的建议 TTL
  getSuggestedTTL(key) {
    for (const [pattern, ttl] of Object.entries(this.config.patterns)) {
      if (pattern === 'default') continue;
      
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      if (regex.test(key)) {
        return ttl;
      }
    }
    return this.config.patterns.default;
  }

  // 扫描无 TTL 的 key
  async scanNoTTLKeys() {
    console.log('开始扫描无 TTL 的 Redis key...');
    
    let cursor = '0';
    const noTTLKeys = [];
    
    do {
      const reply = await this.client.scan(cursor, {
        MATCH: '*',
        COUNT: this.config.scanBatchSize
      });
      
      cursor = reply.cursor;
      const keys = reply.keys;
      this.stats.totalScanned += keys.length;
      
      for (const key of keys) {
        const ttl = await this.client.ttl(key);
        if (ttl === -1) {
          noTTLKeys.push({
            key,
            suggestedTTL: this.getSuggestedTTL(key),
            type: await this.client.type(key)
          });
        }
      }
      
      console.log(`已扫描: ${this.stats.totalScanned} 个 key，发现: ${noTTLKeys.length} 个无 TTL key`);
      
    } while (cursor !== '0');
    
    this.stats.noTTLFound = noTTLKeys.length;
    return noTTLKeys;
  }

  // 修复无 TTL 的 key
  async fixNoTTLKeys(noTTLKeys) {
    console.log(`开始修复 ${noTTLKeys.length} 个无 TTL key...`);
    
    for (const item of noTTLKeys) {
      try {
        if (!this.config.reportOnly) {
          await this.client.expire(item.key, item.suggestedTTL);
          this.stats.fixed++;
          console.log(`✓ 修复: ${item.key} (TTL: ${item.suggestedTTL}s)`);
        } else {
          console.log(`⚠️ 发现: ${item.key} (建议TTL: ${item.suggestedTTL}s)`);
          this.stats.skipped++;
        }
      } catch (error) {
        console.error(`✗ 错误: ${item.key}`, error.message);
        this.stats.errors++;
      }
    }
  }

  // 生成报告
  generateReport(noTTLKeys) {
    const duration = Date.now() - this.stats.startTime;
    
    const report = {
      timestamp: new Date().toISOString(),
      stats: this.stats,
      durationMs: duration,
      summary: {},
      sampleKeys: noTTLKeys.slice(0, 20)
    };
    
    // 按 key 模式分类统计
    const patternStats = {};
    noTTLKeys.forEach(item => {
      let matchedPattern = 'other';
      
      for (const pattern of Object.keys(this.config.patterns)) {
        if (pattern === 'default') continue;
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        if (regex.test(item.key)) {
          matchedPattern = pattern;
          break;
        }
      }
      
      patternStats[matchedPattern] = (patternStats[matchedPattern] || 0) + 1;
    });
    
    report.summary = patternStats;
    
    console.log('\n' + '='.repeat(50));
    console.log('Redis TTL 清理报告');
    console.log('='.repeat(50));
    console.log(`扫描时间: ${new Date().toISOString()}`);
    console.log(`总扫描 key: ${this.stats.totalScanned}`);
    console.log(`发现无 TTL key: ${this.stats.noTTLFound}`);
    console.log(`修复成功: ${this.stats.fixed}`);
    console.log(`跳过: ${this.stats.skipped}`);
    console.log(`错误: ${this.stats.errors}`);
    console.log(`耗时: ${duration}ms`);
    
    console.log('\n按模式统计:');
    Object.entries(patternStats).forEach(([pattern, count]) => {
      console.log(`  ${pattern}: ${count}`);
    });
    
    if (noTTLKeys.length > 0) {
      console.log('\n示例 key（前20个）:');
      noTTLKeys.slice(0, 20).forEach(item => {
        console.log(`  - ${item.key} (建议TTL: ${item.suggestedTTL}s)`);
      });
    }
    
    console.log('\n建议:');
    if (this.stats.noTTLFound > 100) {
      console.log('⚠️  发现大量无 TTL key，建议检查代码');
    }
    if (this.stats.errors > 0) {
      console.log('⚠️  修复过程中出现错误，请检查 Redis 权限');
    }
    if (this.stats.noTTLFound === 0) {
      console.log('✓  未发现无 TTL key，状态良好');
    }
    
    return report;
  }

  async cleanup() {
    try {
      await this.connect();
      const noTTLKeys = await this.scanNoTTLKeys();
      await this.fixNoTTLKeys(noTTLKeys);
      const report = this.generateReport(noTTLKeys);
      return report;
    } catch (error) {
      console.error('清理过程出错:', error);
      throw error;
    } finally {
      await this.disconnect();
    }
  }
}

// 命令行接口
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'cleanup';
  
  const config = loadConfig();
  
  if (command === 'check') {
    config.reportOnly = true;
  }
  
  const cleaner = new RedisTTLCleaner(config);
  
  try {
    await cleaner.cleanup();
  } catch (error) {
    console.error('执行失败:', error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { RedisTTLCleaner, DEFAULT_TTL_CONFIG };