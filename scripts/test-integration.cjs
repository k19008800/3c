const http = require('http');

const API = 'http://localhost:3030';
const EMAIL = `integ-${Date.now()}@test.com`;

function req(method, path, data, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(API + path);
    const opts = {
      hostname: u.hostname, port: u.port, path: u.pathname,
      method, headers: { 'Content-Type': 'application/json' },
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
  console.log('🔍 3cloud Integration Test\n');

  // 1. Health
  const h = await req('GET', '/health');
  results.push(['Health', h.status === 200 && h.body.status === 'ok', h.body.status]);

  // 2. Register
  const reg = await req('POST', '/api/v1/auth/register', {
    email: EMAIL, password: 'Test1234!', name: 'Integ',
  });
  const registered = reg.status === 201;
  results.push(['Register', registered, reg.body.user?.email || reg.body.message]);

  // 3. Login
  const login = await req('POST', '/api/v1/auth/login', {
    email: EMAIL, password: 'Test1234!',
  });
  const loggedIn = login.status === 200;
  results.push(['Login', loggedIn, login.body.user?.email]);
  const token = login.body.accessToken;

  // 4. Me
  if (token) {
    const me = await req('GET', '/api/v1/auth/me', null, token);
    results.push(['Me', me.status === 200, me.body.user?.email]);
  } else {
    results.push(['Me', false, 'no token']);
  }

  // 5. API Key
  if (token) {
    const key = await req('POST', '/api/v1/customers/me/keys', { name: 'Test' }, token);
    results.push(['API Key', key.status === 201, key.body.key?.keyPrefix]);
  } else {
    results.push(['API Key', false, 'no token']);
  }

  // 6. Web（统一入口 5177 → 代理到 web-console 5175；跟随 Next 尾斜杠 308）
  await new Promise((resolve) => {
    const check = (url, hops = 0) => {
      const u = new URL(url);
      const r = http.get({ hostname: u.hostname, port: u.port, path: u.pathname, headers: { 'Accept': 'text/html' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 3) {
          res.resume();
          check(new URL(res.headers.location, url).href, hops + 1);
        } else {
          results.push(['Web (5177/app)', res.statusCode === 200, `HTTP ${res.statusCode}`]);
          res.resume();
          resolve();
        }
      });
      r.on('error', () => { results.push(['Web (5177/app)', false, 'no response']); resolve(); });
    };
    check('http://localhost:5177/app/');
  });

  // 7. Pricing
  const pricing = await req('GET', '/api/v1/public/pricing');
  results.push(['Public Pricing', pricing.status === 200, Array.isArray(pricing.body?.pricing) ? `${pricing.body.pricing.length} models` : 'no data']);

  // Summary
  console.log('\n📊 Results:');
  let pass = 0, fail = 0;
  for (const [name, ok, detail] of results) {
    const icon = ok ? '✅' : '❌';
    if (ok) pass++; else fail++;
    console.log(`  ${icon} ${name}: ${detail || ''}`);
  }
  console.log(`\n🎯 ${pass}/${pass+fail} passed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
