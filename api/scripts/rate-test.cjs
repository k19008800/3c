const http = require('http');

const API_KEY = 'sk-3c-ac788b0e98e0115e0b45f4b101ef439256f91b6ab5c059dc';
const HOST = 'localhost';
const PORT = 3000;
const PATH = '/v1/chat/completions';

function sendRequest(body, label) {
  return new Promise((resolve) => {
    const start = Date.now();
    const data = JSON.stringify(body);
    
    const options = {
      hostname: HOST,
      port: PORT,
      path: PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Length': Buffer.byteLength(data),
      },
    };
    
    const req = http.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => {
        const elapsed = Date.now() - start;
        const retryAfter = res.headers['retry-after'];
        resolve({
          label,
          status: res.statusCode,
          headers: { 'retry-after': retryAfter },
          body: responseBody.substring(0, 500),
          elapsed,
        });
      });
    });
    
    req.on('error', (err) => {
      resolve({ label, status: 0, headers: {}, body: err.message, elapsed: 0 });
    });
    
    req.write(data);
    req.end();
  });
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runTests() {
  console.log('============================================================');
  console.log('  3cloud 限流引擎测试');
  console.log('  用户 5 (超级管理员) | RPM=5 override | TPM=1000 override');
  console.log('============================================================');
  console.log();
  
  // ── RPM Test ──
  console.log('─── RPM 限流测试 ───');
  console.log(`发送 10 次请求（预期：前 5 次 200，后 5 次 429）\n`);
  
  const rpmResults = [];
  for (let i = 1; i <= 10; i++) {
    const result = await sendRequest({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 10,
    }, `RPM Req ${i}`);
    rpmResults.push(result);
    
    const statusStr = result.status === 429 ? '❌ 429 RATE_LIMITED' : `✅ ${result.status}`;
    console.log(`  ${result.label}: ${statusStr} (${result.elapsed}ms)`);
    if (result.status === 429) {
      try {
        const parsed = JSON.parse(result.body);
        console.log(`     Response: ${JSON.stringify(parsed)}`);
      } catch {
        console.log(`     Response: ${result.body.substring(0, 200)}`);
      }
    }
  }
  
  // Check Retry-After
  const rateLimited = rpmResults.filter(r => r.status === 429);
  if (rateLimited.length > 0) {
    const first429 = rateLimited[0];
    console.log(`\n  Retry-After header: ${first429.headers['retry-after'] || 'NOT PRESENT ❌'}`);
    console.log(`  429 响应样例 (第一个): ${first429.body.substring(0, 300)}`);
  }
  
  // Count results
  const rpm200 = rpmResults.filter(r => r.status === 200).length;
  const rpm429 = rateLimited.length;
  console.log(`\n  RPM 结果: ${rpm200} 成功, ${rpm429} 被限流\n`);
  
  // Check: RPM limit is 5, so first 5 should be 200, next 5 should be 429
  let rpmPass = (rpmResults[0].status === 200 && rpmResults[4].status === 200 && rpmResults[5].status === 429);
  console.log(`  RPM 测试: ${rpmPass ? '✅ PASS' : '❌ FAIL (预期 5 OK + 5 429)'}`);
  console.log();
  
  // Wait for rate limit window to expire
  console.log('─── 等待窗口过期 (65秒) ───');
  await sleep(65000);
  console.log('  等待完成\n');
  
  // ── Recovery Test ──
  console.log('─── 恢复测试 ───');
  console.log('  发送 1 次请求检查是否恢复...\n');
  const recoveryResult = await sendRequest({
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: 'hi' }],
    max_tokens: 10,
  }, '恢复测试');
  console.log(`  ${recoveryResult.label}: ${recoveryResult.status === 200 ? '✅ 已恢复 (200)' : `❌ 未恢复 (${recoveryResult.status})`}`);
  console.log();
  
  // ── TPM Test ──
  console.log('─── TPM 限流测试 ───');
  console.log('  发送单次高 Token 消耗请求 (max_tokens=500)');
  console.log('  由于 TPM=1000, 预期可记录 ~130 tokens, 不会触发\n');
  
  // First request with large tokens
  console.log('  发送 max_tokens=500 请求...');
  const bigResult1 = await sendRequest({
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: 'Write a paragraph about AI technology in detail' }],
    max_tokens: 500,
  }, 'TPM Big-1');
  console.log(`  ${bigResult1.label}: ${bigResult1.status === 200 ? `✅ ${bigResult1.status}` : `❌ ${bigResult1.status}`}`);
  
  let tokenCount = 0;
  try {
    const parsed = JSON.parse(bigResult1.body);
    tokenCount = parsed.usage?.total_tokens || 0;
    console.log(`  消耗 tokens: ${tokenCount}`);
  } catch {}
  
  console.log();
  console.log('  发送 max_tokens=2000 请求触发 TPM...');
  const bigResult2 = await sendRequest({
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: 'Write a very long essay about the history of artificial intelligence, covering major milestones from Turing to GPT-4 and beyond, discussing key breakthroughs, ethical considerations, and future prospects. Be thorough and detailed.' }],
    max_tokens: 2000,
  }, 'TPM Big-2');
  console.log(`  ${bigResult2.label}: ${bigResult2.status === 200 ? `✅ ${bigResult2.status}` : `❌ ${bigResult2.status}`}`);
  
  if (bigResult2.status === 429) {
    try {
      const parsed = JSON.parse(bigResult2.body);
      console.log(`  429 响应: ${JSON.stringify(parsed)}`);
    } catch {}
  }
  
  console.log();
  
  // ── Summary ──
  console.log('============================================================');
  console.log('  测试总结');
  console.log('============================================================');
  console.log(`  [RPM] 前 5 次 200, 后 5 次 429: ${rpmPass ? '✅' : '❌'}`);
  console.log(`  [RPM] 429 次数: ${rpm429}/5`);
  console.log(`  [RPM] Retry-After header: ${rateLimited[0]?.headers['retry-after'] || '❌ 缺失'}`);
  console.log(`  [恢复] 等待后恢复正常: ${recoveryResult.status === 200 ? '✅' : '❌'}`);
  console.log(`  [TPM] 大 Token 请求: ${bigResult2.status === 429 ? '✅ 触发限流' : bigResult2.status === 200 ? '结果正常' : `状态: ${bigResult2.status}`}`);
  console.log();
}

runTests().catch(err => console.error(err));
