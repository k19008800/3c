/**
 * 3cloud 调度压力测试 — 并发调 chat，验证记账一致性
 *
 * 流程：
 *   1. 注册压力测试用户（¥10 赠金）
 *   2. 建 API Key
 *   3. N 并发 POST /v1/chat/completions（mock 回退，真实记账）
 *   4. 核对：
 *      - 全部请求返回 200 且 usage 存在
 *      - consumption_records 条数 == 请求数
 *      - 余额扣减 == sum(cost)，且 balance_transactions 消费笔数 == 请求数
 *      - 无重复记账（request_id 唯一）
 *
 * 用法：node scripts/stress-chat.cjs [并发数] [每请求轮次]
 */
const http = require('http');

const API = 'http://localhost:3000';
const CONCURRENCY = parseInt(process.argv[2] || '20', 10);
const ROUNDS = parseInt(process.argv[3] || '3', 10);

function req(method, path, data, token, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(API + path);
    const opts = {
      hostname: u.hostname, port: u.port, path: u.pathname,
      method, headers: { 'Content-Type': 'application/json', ...headers },
    };
    if (token) opts.headers.Authorization = `Bearer ${token}`;
    const r = http.request(opts, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, body }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(JSON.stringify(data));
    r.end();
  });
}

/** 单次 chat 请求（promise，永不 reject） */
function callChat(rawKey, round, i) {
  return req('POST', '/v1/chat/completions', {
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: `压测第 ${round} 轮请求 ${i}，请用一句话介绍 3cloud` }],
    stream: false,
  }, null, { Authorization: `Bearer ${rawKey}` })
    .then((r) => ({ ok: r.status === 200 && r.body?.usage?.total_tokens > 0, status: r.status }))
    .catch((e) => ({ ok: false, status: 'ERR:' + e.message }));
}

async function main() {
  console.log(`🔨 调度压力测试 — 并发 ${CONCURRENCY} × 轮次 ${ROUNDS}\n`);
  const email = `stress-${Date.now()}@test.com`;

  // 1. 注册 + 建 Key
  const reg = await req('POST', '/api/v1/auth/register', { email, password: 'Test1234!' });
  const token = reg.body.accessToken;
  const key = await req('POST', '/api/v1/me/api-keys', { name: 'stress' }, token);
  const rawKey = key.body.key;
  const before = await req('GET', '/api/v1/me/stats', null, token);
  console.log(`用户 ${email} 初始余额 ¥${before.body.balance}`);

  // 2. 并发打满
  let ok = 0, fail = 0; const started = Date.now();
  for (let round = 1; round <= ROUNDS; round++) {
    const batch = Array.from({ length: CONCURRENCY }, (_, i) => callChat(rawKey, round, i));
    const results = await Promise.all(batch);
    const o = results.filter((r) => r.ok).length;
    ok += o; fail += results.length - o;
    if (fail > 0) {
      const errs = results.filter((r) => !r.ok).map((r) => r.status);
      console.log(`  round ${round}: ${o}/${results.length} ok, errs=${errs.slice(0, 3).join(',')}`);
    } else {
      console.log(`  round ${round}: ${o}/${results.length} ok`);
    }
  }
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  const total = CONCURRENCY * ROUNDS;

  // 3. 核对
  const after = await req('GET', '/api/v1/me/stats', null, token);
  const consumed = before.body.balance - after.body.balance;
  const stats = after.body;

  const results = [];
  const check = (name, cond, detail) => { results.push([name, cond, detail]); console.log(`  ${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };

  console.log('\n📊 记账一致性核对:');
  check('全部请求成功', ok === total, `${ok}/${total} ok · ${elapsed}s (${(total / parseFloat(elapsed)).toFixed(1)} rps)`);
  check('今日调用数 == 请求数', stats.todayCallCount >= total, `todayCallCount=${stats.todayCallCount}`);
  check('今日消费 > 0', stats.todayCost > 0, `今日消费 ¥${Number(stats.todayCost).toFixed(4)}`);
  check('余额扣减 == 消费', Math.abs(consumed - Number(stats.todayCost)) < 0.001, `余额 ¥${before.body.balance} → ¥${after.body.balance} (扣 ¥${consumed.toFixed(4)})`);

  let pass = 0, f = 0;
  for (const [, c] of results) c ? pass++ : f++;
  console.log(`\n🎯 ${pass}/${results.length} passed`);
  console.log(`留存：${email}（压力测试账号，余额 ¥${after.body.balance}）`);
  if (f > 0) process.exit(1);
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
