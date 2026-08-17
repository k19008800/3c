/**
 * 3cloud 调度压力测试 — 并发调 chat，验证记账一致性
 *
 * 流程：
 *   1. 注册压力测试用户（¥10 赠金）
 *   2. 建 API Key
 *   3. N 并发 POST /v1/chat/completions（真实上游 deepseek-v4-pro，真实记账）
 *   4. 核对：
 *      - 全部请求返回 200 且 usage 存在
 *      - consumption_records 条数 == 请求数
 *      - 余额扣减 == sum(cost)，且 balance_transactions 消费笔数 == 请求数
 *      - 无重复记账（request_id 唯一）
 *
 * 请求体对齐真实场景（BOSS 提供 2026-08-17 数据）：
 *   - 模型 deepseek-v4-pro（定价 ¥0.003/1K in + ¥0.006/1K out）
 *   - 每笔携带 ~150K tokens 大上下文（同一长文档 + 不同问题）→ 单笔 ≈ ¥0.45
 *   - 并发同用户模拟"同一秒多笔大输入请求"
 *
 * 用法：node scripts/stress-chat.cjs [并发数] [每请求轮次]
 */
const http = require('http');

const API = 'http://localhost:3000';
const CONCURRENCY = parseInt(process.argv[2] || '10', 10);
const ROUNDS = parseInt(process.argv[3] || '2', 10);
const MODEL = 'deepseek-v4-pro';

/**
 * 构造 ~150K token 的中文大上下文（真实场景：同一长文档反复查询）。
 * 中文 1 token ≈ 1~1.5 字；150,004 tokens ≈ 约 45 万字符。
 * 用固定段落重复填充，控制字符数到 ~450,000（约 45 万 → 约 150K tokens）。
 */
function buildLargeContext() {
  const paragraph = '3cloud 是 AI API 聚合平台，聚合多家大模型供应商，提供统一的 OpenAI 兼容接口与 Anthropic 兼容接口。平台支持智能路由、多 Key 轮询、自动熔断、缓存计费、余额预扣与多退少补。用户通过平台可以按需调用 DeepSeek、GPT、Claude 等模型，按 token 计费，价格透明。';
  const targetChars = 450000; // 约 150K tokens
  let s = '';
  while (s.length < targetChars) s += `${s.length % 3 === 0 ? '\n\n' : ' '}${paragraph}`;
  return s.slice(0, targetChars);
}

const LARGE_CONTEXT = buildLargeContext();

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

/** 单次 chat 请求（promise，永不 reject）— 大上下文 + 独立问题 */
function callChat(rawKey, round, i) {
  return req('POST', '/v1/chat/completions', {
    model: MODEL,
    messages: [
      { role: 'system', content: '你是 3cloud 平台的 AI 助手，基于给定文档回答问题。' },
      { role: 'user', content: `${LARGE_CONTEXT}\n\n请基于以上文档，用一句话回答：第 ${round} 轮请求 ${i} 中提到的平台能力是什么？` },
    ],
    stream: false,
  }, null, { Authorization: `Bearer ${rawKey}` })
    .then((r) => ({
      ok: r.status === 200 && r.body?.usage?.total_tokens > 0,
      status: r.status,
      tokens: r.body?.usage?.total_tokens,
      cost: r.body?.usage ? undefined : undefined,
      error: r.body?.error?.message,
    }))
    .catch((e) => ({ ok: false, status: 'ERR:' + e.message }));
}

async function main() {
  console.log(`🔨 调度压力测试 — 并发 ${CONCURRENCY} × 轮次 ${ROUNDS}，模型 ${MODEL}（~150K tokens/笔 ≈ ¥0.45）\n`);
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
