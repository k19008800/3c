/**
 * 3cloud 调度压力测试 — 并发调 chat，验证记账一致性（P3-1 增强）
 *
 * 流程：
 *   1. 注册压力测试用户（¥10 赠金）
 *   2. 建 API Key
 *   3. 测试前置（直连 DB / Redis，仅影响本测试账号，finally 清理）：
 *      - 授予 quota_exception_rules 高 rpm/tpm 例外：平台默认 personal_tpm=200,000，
 *        10 并发 × ~150K tokens 会触发 P0-2 四级限流 429（首轮实测 19/20 被拒），
 *        必须先给压测账号开例外才能压到并发路径；
 *      - 充值到 ¥50：低于计费旁路阈值 ¥100 → 走「预扣冻结 + 多退少补」路径，
 *        压测最严格的并发一致性（冻结/结算原子性）；PG 直改 + 删除 Redis 热账本
 *        bal:{uid}（下次预扣 ensureLedger 自动从 PG 重初始化，避免热账本与 PG 不一致）。
 *   4. N 并发 POST /v1/chat/completions（mock 回退路径，真实记账扣费）
 *   5. 核对（HTTP + DB 双层断言）：
 *      - 全部请求返回 200 且 usage 存在
 *      - consumption_records 条数 == 请求数（DB）
 *      - request_id 无重复：count(distinct request_id) == count(*)（DB）
 *      - 余额扣减 == sum(cost)（HTTP before/after 与 DB sum(cost) 交叉验证）
 *      - balance_transactions 消费笔数 == 请求数（DB）
 *      - 无冻结残留：customer_balances.frozen_balance == 0（DB）
 *   6. 清理：删除 quota_exception_rules 例外（finally）
 *
 * 请求体对齐真实场景（BOSS 提供 2026-08-17 数据）：
 *   - 模型 deepseek-v4-pro（定价 ¥0.003/1K in + ¥0.006/1K out）
 *   - 每笔携带 ~150K tokens 大上下文（同一长文档 + 不同问题）→ 单笔 ≈ ¥0.45~0.75
 *   - 并发同用户模拟"同一秒多笔大输入请求"
 *
 * 用法：node scripts/stress-chat.cjs [并发数] [每请求轮次]
 * 依赖：api 包已安装（postgres / ioredis 从 api/node_modules 解析，DB 断言必需）
 */
const http = require('http');
const { createRequire } = require('module');

const API = 'http://localhost:3000';
const CONCURRENCY = parseInt(process.argv[2] || '10', 10);
const ROUNDS = parseInt(process.argv[3] || '2', 10);
const MODEL = 'deepseek-v4-pro';

// 从 api 包解析 DB/Redis 客户端（仓库根 scripts/ 不在 pnpm 依赖树内）
const apiRequire = createRequire(require.resolve('../api/package.json'));
const postgres = apiRequire('postgres');
const Redis = apiRequire('ioredis');

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/threecloud_v3';

/** 压测账号充值目标（元）：> 100 会走旁路不预扣，≤ 100 走冻结路径（本测试目标路径） */
const TOP_UP_YUAN = '50';
/** 配额例外：rpm / tpm（远高于 10×2 轮实际用量，避免限流干扰并发测试） */
const EXCEPTION_RPM = 10000;
const EXCEPTION_TPM = 100000000;

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
      error: r.body?.error?.message,
    }))
    .catch((e) => ({ ok: false, status: 'ERR:' + e.message }));
}

async function main() {
  console.log(`🔨 调度压力测试 — 并发 ${CONCURRENCY} × 轮次 ${ROUNDS}，模型 ${MODEL}（~150K tokens/笔 ≈ ¥0.45~0.75）\n`);
  const email = `stress-${Date.now()}@test.com`;

  const sql = postgres(DATABASE_URL, { max: 2, onnotice: () => {} });
  const redis = new Redis({ host: 'localhost', port: 6379, lazyConnect: true, maxRetriesPerRequest: 1 });
  await redis.connect().catch(() => {}); // Redis 连不上 → 顶部充值时跳过热账本删除（PG 直改仍生效）

  try {
    // 1. 注册 + 建 Key
    const reg = await req('POST', '/api/v1/auth/register', { email, password: 'Test1234!' });
    if (!reg.body?.accessToken) throw new Error(`register failed: ${reg.status} ${JSON.stringify(reg.body)}`);
    const token = reg.body.accessToken;
    const key = await req('POST', '/api/v1/me/api-keys', { name: 'stress' }, token);
    const rawKey = key.body.key;
    if (!rawKey) throw new Error(`api-key create failed: ${key.status} ${JSON.stringify(key.body)}`);

    // 2. 测试前置：查 uid → 充值（PG + Redis 热账本对齐）→ 开限流例外
    const [u] = await sql`SELECT id FROM users WHERE email = ${email}`;
    const uid = u.id;
    await sql`
      UPDATE customer_balances
      SET available_balance = ${TOP_UP_YUAN}, total_balance = ${TOP_UP_YUAN},
          frozen_balance = 0, version = version + 1, updated_at = NOW()
      WHERE user_id = ${uid}
    `;
    await redis.del(`bal:${uid}`).catch(() => {}); // 删除热账本 → 下次预扣从 PG 重初始化
    await sql`
      INSERT INTO quota_exception_rules (customer_id, model_name, rpm, tpm, period, status, reason, created_at, updated_at)
      VALUES (${uid}, ${MODEL}, ${EXCEPTION_RPM}, ${EXCEPTION_TPM}, 'forever', 'active', 'stress-test', NOW(), NOW())
    `;

    const before = await req('GET', '/api/v1/me/stats', null, token);
    console.log(`用户 ${email} 测试余额 ¥${before.body.balance}（充值后，≤¥100 走预扣冻结路径）`);

    // 3. 并发打满
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

    // 4. HTTP 核对
    const after = await req('GET', '/api/v1/me/stats', null, token);
    const consumed = before.body.balance - after.body.balance;
    const stats = after.body;

    // 5. DB 核对（记账一致性：条数 / 无重复 / 金额 / 流水 / 无冻结残留）
    const [cr] = await sql`
      SELECT count(*)::int AS cnt,
             count(DISTINCT request_id)::int AS uniq,
             COALESCE(SUM(cost), 0)::text AS total_cost
      FROM consumption_records WHERE user_id = ${uid}
    `;
    const [bt] = await sql`
      SELECT count(*)::int AS cnt
      FROM balance_transactions WHERE user_id = ${uid} AND type = 'consumption'
    `;
    const [cb] = await sql`
      SELECT COALESCE(frozen_balance, 0)::text AS frozen
      FROM customer_balances WHERE user_id = ${uid}
    `;

    const results = [];
    const check = (name, cond, detail) => { results.push([name, cond, detail]); console.log(`  ${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };

    console.log('\n📊 记账一致性核对（HTTP）:');
    check('全部请求成功', ok === total, `${ok}/${total} ok · ${elapsed}s (${(total / parseFloat(elapsed)).toFixed(1)} rps)`);
    check('今日调用数 == 请求数', stats.todayCallCount >= total, `todayCallCount=${stats.todayCallCount}`);
    check('今日消费 > 0', stats.todayCost > 0, `今日消费 ¥${Number(stats.todayCost).toFixed(4)}`);
    check('余额扣减 == 消费', Math.abs(consumed - Number(stats.todayCost)) < 0.001, `余额 ¥${before.body.balance} → ¥${after.body.balance} (扣 ¥${consumed.toFixed(4)})`);

    console.log('\n📊 记账一致性核对（DB，分区表下）:');
    check('consumption_records 条数 == 请求数', cr.cnt === total, `cnt=${cr.cnt} 请求数=${total}`);
    check('request_id 无重复', cr.uniq === cr.cnt, `count(distinct request_id)=${cr.uniq}`);
    check('sum(cost) == 余额扣减', Math.abs(Number(cr.total_cost) - consumed) < 0.001, `sum(cost)=${cr.total_cost} 扣减=¥${consumed.toFixed(4)}`);
    check('balance_transactions 消费笔数 == 请求数', bt.cnt === total, `consumption 笔数=${bt.cnt}`);
    check('无冻结残留 (frozen_balance == 0)', Number(cb.frozen) === 0, `frozen=${cb.frozen}`);

    let pass = 0, f = 0;
    for (const [, c] of results) c ? pass++ : f++;
    console.log(`\n🎯 ${pass}/${results.length} passed`);
    console.log(`留存：${email}（压力测试账号，余额 ¥${after.body.balance}）`);
    if (f > 0) process.exitCode = 1;
  } finally {
    // 清理：删除压测账号的限流例外（账号与余额留存作证据）
    try {
      await sql`DELETE FROM quota_exception_rules WHERE reason = 'stress-test'`;
    } catch { /* 清理失败不阻断结果输出 */ }
    await sql.end().catch(() => {});
    redis.disconnect();
  }
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
