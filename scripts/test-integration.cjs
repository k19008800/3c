/**
 * 3cloud 集成测试 — 覆盖 MVP 可用链路
 *
 * 链路：注册（赠金）→ 登录 → /me → 建 Key → 列表/禁用/启用 → chat（mock 回退）
 *       → 消费记账 + 余额扣减 → 日志/统计/账单可见
 *
 * 依赖：api@3000、web-console@5175、web-portal@5177 已启动
 */
const http = require('http');

const API = 'http://localhost:3000';
const EMAIL = `integ-${Date.now()}@test.com`;

function req(method, path, data, token, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(API + path);
    const opts = {
      hostname: u.hostname, port: u.port, path: u.pathname,
      method, headers: { 'Content-Type': 'application/json', ...headers },
    };
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
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

async function main() {
  const results = [];
  const check = (name, ok, detail) => {
    results.push([name, ok, detail]);
    console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  };

  console.log('🔍 3cloud Integration Test (MVP chain)\n');

  // 1. Health
  const h = await req('GET', '/health');
  check('Health', h.status === 200 && h.body.status === 'ok', h.body.status);

  // 2. Register（建余额 + 赠金）
  const reg = await req('POST', '/api/v1/auth/register', {
    email: EMAIL, password: 'Test1234!', name: 'Integ',
  });
  const registered = reg.status === 201;
  check('Register', registered, reg.body.user?.email || reg.body.message);
  if (!registered) { summarize(results); process.exit(1); }
  const token = reg.body.accessToken;

  // 3. Login
  const login = await req('POST', '/api/v1/auth/login', { email: EMAIL, password: 'Test1234!' });
  const loggedIn = login.status === 200;
  check('Login', loggedIn, login.body.user?.email);
  const loginToken = login.body.accessToken || token;

  // 4. /me（用户端契约：直接返回 user，含 balance）
  const me = await req('GET', '/api/v1/me', null, loginToken);
  const meOk = me.status === 200 && typeof me.body.balance === 'number' && me.body.email === EMAIL;
  check('Me /api/v1/me', meOk, meOk ? `balance=¥${me.body.balance}` : JSON.stringify(me.body).slice(0, 80));
  const welcomeOk = meOk && me.body.balance > 0;
  check('Welcome balance', welcomeOk, welcomeOk ? `¥${me.body.balance}` : 'no balance');

  // 5. 创建 API Key（POST → { key: rawString }）
  const key = await req('POST', '/api/v1/me/api-keys', { name: 'Test' }, loginToken);
  const keyOk = key.status === 201 && typeof key.body.key === 'string' && key.body.key.startsWith('3c_');
  check('Create API Key', keyOk, keyOk ? `${key.body.key.slice(0, 16)}...` : JSON.stringify(key.body).slice(0, 80));
  const rawKey = keyOk ? key.body.key : null;

  // 6. 列表（GET → { list: [...] }）
  const list = await req('GET', '/api/v1/me/api-keys', null, loginToken);
  const listOk = list.status === 200 && Array.isArray(list.body.list) && list.body.list.length >= 1;
  check('List API Keys', listOk, listOk ? `${list.body.list.length} keys` : JSON.stringify(list.body).slice(0, 80));
  const keyId = listOk ? list.body.list[0].id : null;

  // 7. 禁用 / 启用（PATCH）
  const dis = await req('PATCH', `/api/v1/me/api-keys/${keyId}`, { status: 'disabled' }, loginToken);
  check('Disable Key', dis.status === 200, dis.body?.message || '');
  const en = await req('PATCH', `/api/v1/me/api-keys/${keyId}`, { status: 'active' }, loginToken);
  check('Enable Key', en.status === 200, en.body?.message || '');

  // 8. 调 chat（mock 回退，走 OpenAI 兼容路径）→ 记账 + 扣费
  if (rawKey) {
    const chat = await req('POST', '/v1/chat/completions', {
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: '你好，介绍一下 3cloud' }],
      stream: false,
    }, null, { Authorization: `Bearer ${rawKey}` });
    const chatOk = chat.status === 200 && chat.body.choices?.[0]?.message?.content && chat.body.usage?.total_tokens > 0;
    check('Chat completions (mock)', chatOk, chatOk
      ? `${chat.body.usage.total_tokens} tokens · ${(chat.body.usage.completion_tokens)} out`
      : JSON.stringify(chat.body).slice(0, 120));
  } else {
    check('Chat completions (mock)', false, 'no raw key');
  }

  // 9. 消费日志（/me/logs）
  const logs = await req('GET', '/api/v1/me/logs?limit=10', null, loginToken);
  const logsOk = logs.status === 200 && Array.isArray(logs.body.list) && logs.body.list.length >= 1;
  check('Call logs', logsOk, logsOk ? `${logs.body.list.length} records, total ¥${logs.body.list.reduce((s, r) => s + Number(r.cost), 0).toFixed(4)}` : JSON.stringify(logs.body).slice(0, 80));

  // 10. 余额扣减 + 统计（/me/stats）
  const stats = await req('GET', '/api/v1/me/stats', null, loginToken);
  const statsOk = stats.status === 200 && typeof stats.body.balance === 'number';
  const deducted = statsOk && stats.body.balance < (me.body.balance ?? 0);
  check('Balance deducted', deducted, statsOk ? `¥${me.body.balance} → ¥${stats.body.balance}` : 'no stats');
  check('Today stats', statsOk && stats.body.todayCost > 0 && stats.body.todayCallCount >= 1, statsOk ? `${stats.body.todayCallCount} calls, ¥${stats.body.todayCost.toFixed(4)}` : '');

  // 11. 账单（/me/billing/current）
  const bill = await req('GET', '/api/v1/me/billing/current', null, loginToken);
  const billOk = bill.status === 200 && bill.body.data?.period && bill.body.data.total_cost > 0;
  check('Billing current', billOk, billOk ? `${bill.body.data.period} ¥${bill.body.data.total_cost.toFixed(4)} (${bill.body.data.bill_count} bills)` : JSON.stringify(bill.body).slice(0, 80));

  // 12. Web（统一入口 5177 → 代理到 web-console 5175；跟随 Next 尾斜杠 308）
  await new Promise((resolve) => {
    const checkWeb = (url, hops = 0) => {
      const u = new URL(url);
      const r = http.get({ hostname: u.hostname, port: u.port, path: u.pathname, headers: { 'Accept': 'text/html' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 3) {
          res.resume();
          checkWeb(new URL(res.headers.location, url).href, hops + 1);
        } else {
          check('Web (5177/app)', res.statusCode === 200, `HTTP ${res.statusCode}`);
          res.resume();
          resolve();
        }
      });
      r.on('error', () => { check('Web (5177/app)', false, 'no response'); resolve(); });
    };
    checkWeb('http://localhost:5177/app/');
  });

  // 13. OpenAI 兼容经统一入口（5177/v1 → 3000/v1）
  if (rawKey) {
    await new Promise((resolve) => {
      const u = new URL('http://localhost:5177/v1/models');
      const r = http.get({ hostname: u.hostname, port: u.port, path: u.pathname, headers: { 'Authorization': `Bearer ${rawKey}` } }, (res) => {
        let body = '';
        res.on('data', (c) => body += c);
        res.on('end', () => {
          let ok = false, n = 0;
          try { const j = JSON.parse(body); ok = Array.isArray(j.data); n = j.data.length; } catch {}
          check('OpenAI via portal /v1/models', ok && res.statusCode === 200, ok ? `${n} models` : `HTTP ${res.statusCode}`);
          resolve();
        });
      });
      r.on('error', () => { check('OpenAI via portal /v1/models', false, 'no response'); resolve(); });
    });
  } else {
    check('OpenAI via portal /v1/models', false, 'no raw key');
  }

  // 14. Public Pricing
  const pricing = await req('GET', '/api/v1/public/pricing');
  check('Public Pricing', pricing.status === 200 && Array.isArray(pricing.body?.pricing), Array.isArray(pricing.body?.pricing) ? `${pricing.body.pricing.length} models` : 'no data');

  summarize(results);
}

function summarize(results) {
  console.log('\n📊 Summary:');
  let pass = 0, fail = 0;
  for (const [name, ok] of results) { if (ok) pass++; else fail++; }
  console.log(`🎯 ${pass}/${pass + fail} passed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
