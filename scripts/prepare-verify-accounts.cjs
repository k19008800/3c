/**
 * 全流程验证账号准备 — 生成可留存的三角色账号（幂等）
 *
 *   verify-user@3cloud.dev   customer（普通用户）—— 注册/充值/调度
 *   verify-agent@3cloud.dev  agent（代理商）      —— 注册后赋权 agent + 补 agents 记录
 *   admin@3cloud.dev         super_admin（后台）  —— 由 db:seed 提供
 *
 * 全部密码固定为：Verify@2026!
 * 用法：node scripts/prepare-verify-accounts.cjs
 */
const http = require('http');
const { execSync } = require('child_process');

const API = 'http://localhost:3000';
const PASSWORD = 'Verify@2026!';
const CUSTOMER = { email: 'verify-user@3cloud.dev', name: '核实用户' };
const AGENT = { email: 'verify-agent@3cloud.dev', name: '核实代理商' };

function req(method, path, data, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(API + path);
    const r = http.request(u, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(body) }); } catch { resolve({ status: res.statusCode, body }); } });
    });
    r.on('error', reject);
    if (data) r.write(JSON.stringify(data));
    r.end();
  });
}

/** 注册，若已存在则跳过 */
async function ensureUser(u) {
  const r = await req('POST', '/api/v1/auth/register', { email: u.email, password: PASSWORD, name: u.name });
  if (r.status === 201) return { created: true, userId: r.body.user.id };
  if (r.status === 409) return { created: false, userId: null };
  throw new Error(`注册 ${u.email} 失败: ${r.status} ${JSON.stringify(r.body).slice(0, 80)}`);
}

/** 查询 user id（通过登录 token 的 /me） */
async function getUserId(email) {
  const login = await req('POST', '/api/v1/auth/login', { email, password: PASSWORD });
  if (login.status !== 200) throw new Error(`登录 ${email} 失败: ${login.status}`);
  const me = await req('GET', '/api/v1/me', null, login.body.accessToken);
  return { userId: me.body.id, token: login.body.accessToken };
}

async function main() {
  console.log('🔐 准备全流程验证账号\n');

  // 1. customer
  const cu = await ensureUser(CUSTOMER);
  const cuId = cu.created ? cu.userId : (await getUserId(CUSTOMER.email)).userId;
  console.log(`${cu.created ? '🆕' : '✅'} ${CUSTOMER.email} (customer) id=${cuId}`);

  // 2. agent — 注册后赋权 + 补 agents 记录
  const ag = await ensureUser(AGENT);
  let agId = ag.created ? ag.userId : null;
  if (!agId) agId = (await getUserId(AGENT.email)).userId;

  // 幂等：用 SQL 把 role 改为 agent + upsert agents 记录
  execSync(
    `"C:/Program Files/PostgreSQL/17/bin/psql" -h localhost -U postgres -d threecloud_v3 -v ON_ERROR_STOP=1 -t -A -c "` +
    `UPDATE users SET role='agent', name='核实代理商' WHERE email='${AGENT.email}';` +
    `INSERT INTO agents (user_id, level, commission_rate, total_earnings, available_balance, status, invite_code) ` +
    `SELECT id, 'senior', 15.00, 0, 0, 'active', 'INVITE-AGENT-001' FROM users WHERE email='${AGENT.email}' ` +
    `ON CONFLICT (user_id) DO UPDATE SET level='senior', commission_rate=15.00, status='active';"`,
    { stdio: 'ignore' },
  );
  console.log(`${ag.created ? '🆕' : '✅'} ${AGENT.email} (agent, senior 15%) id=${agId}`);

  // 3. admin（seed 提供）
  console.log(`${'✅'} admin@3cloud.dev (super_admin) — 由 db:seed 提供`);

  console.log('\n📋 账号清单（密码均为 Verify@2026!）：');
  console.log(`  ${CUSTOMER.email}  customer  — 用户/充值/调度/消费`);
  console.log(`  ${AGENT.email}     agent     — 代理工作台`);
  console.log('  admin@3cloud.dev  super_admin — 后台审核/财务');
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
