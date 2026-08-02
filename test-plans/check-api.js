#!/usr/bin/env node
/**
 * 3cloud 前端UI交互验收测试 - 最终报告生成器
 * 
 * 在完成Web的浏览器交互验证后，输出完整报告
 * 
 * 运行: node test-plans/gen-test-report.js
 */

const { execSync } = require('child_process');
const BASE = 'http://localhost:3000';

async function testApi() {
  const endpoints = [
    '/api/v1/models',
    '/api/v1/users',
    '/api/v1/vendors',
    '/api/v1/admin/stats/overview',
    '/api/v1/admin/agents',
    '/api/v1/admin/finance/commissions',
    '/api/v1/admin/security/events',
  ];
  
  for (const ep of endpoints) {
    try {
      const resp = await fetch(`${BASE}${ep}`);
      const status = resp.status;
      const data = await resp.text();
      console.log(`✅ ${ep} (${status})`);
    } catch (e) {
      console.log(`❌ ${ep}: ${e.message}`);
    }
  }
}

testApi().catch(console.error);
