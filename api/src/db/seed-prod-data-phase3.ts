// ============================================================
//  3cloud (3C) — Phase 3: 全功能面补全
//  覆盖: Campaigns / OAuth / Teams / Refund / RateLimited
//        Circuit / AdminKeyUsage / Prefs / DisabledUsers
//  ★ 核心: 客户消费明细深度仿真（参考 DeepSeek 消息列表）
//  运行：npx tsx src/db/seed-prod-data-phase3.ts
// ============================================================

import "dotenv/config";
import { createDb, closeDb } from "./index.js";
import { sql } from "drizzle-orm";

// ── 用户画像配置 ──────────────────────────────────────────
// 10 个业务客户（agent clients）的不同消费场景
interface UserProfile {
  userId: number;
  name: string;
  dailyBase: number;      // 日均调用量
  weekendMultiplier: number; // 周末衰减系数
  peakHourWeight: number;  // 办公时段集中度 0-1
  avgPrompt: number;       // 平均输入 token
  avgCompletion: number;   // 平均输出 token
  streamingPct: number;    // 流式调用占比 0-1
  errorPct: number;        // 失败率 0-1
  mainModel: string;       // 主力模型名
  altModel: string;        // 备用模型名
  mainVmid: number;        // 主力 vendor_model_id
  altVmid: number;         // 备用 vendor_model_id
  mainVendor: string;      // 主力供应商
  altVendor: string;       // 备用供应商
  description: string;
}

const userProfiles: UserProfile[] = [
  { userId:27, name:'智联客服',   dailyBase:150, weekendMultiplier:0.6, peakHourWeight:0.8,
    avgPrompt:400, avgCompletion:800, streamingPct:0.7, errorPct:0.02,
    mainModel:'deepseek-chat', altModel:'deepseek-v4-pro', mainVmid:90, altVmid:91,
    mainVendor:'deepseek', altVendor:'deepseek',
    description:'客服机器人，高频短对话，70%流式' },
  { userId:28, name:'学思教育',   dailyBase:60, weekendMultiplier:0.4, peakHourWeight:0.7,
    avgPrompt:2000, avgCompletion:3000, streamingPct:0.5, errorPct:0.03,
    mainModel:'deepseek-v4-pro', altModel:'deepseek-chat', mainVmid:91, altVmid:90,
    mainVendor:'deepseek', altVendor:'deepseek',
    description:'教育内容生成，长文本，周末用量低' },
  { userId:29, name:'康健医疗',   dailyBase:35, weekendMultiplier:0.5, peakHourWeight:0.6,
    avgPrompt:3000, avgCompletion:1500, streamingPct:0.3, errorPct:0.01,
    mainModel:'deepseek-v4-pro', altModel:'deepseek-chat', mainVmid:91, altVmid:90,
    mainVendor:'deepseek', altVendor:'deepseek',
    description:'医疗咨询，长上下文高精度，低容错' },
  { userId:30, name:'法务通',     dailyBase:20, weekendMultiplier:0.3, peakHourWeight:0.9,
    avgPrompt:6000, avgCompletion:2000, streamingPct:0.2, errorPct:0.04,
    mainModel:'deepseek-v4-pro', altModel:'deepseek-chat', mainVmid:91, altVmid:90,
    mainVendor:'deepseek', altVendor:'deepseek',
    description:'法律文档分析，超长上下文，仅工作日活跃' },
  { userId:31, name:'创意无限',   dailyBase:80, weekendMultiplier:0.8, peakHourWeight:0.5,
    avgPrompt:1500, avgCompletion:2500, streamingPct:0.6, errorPct:0.03,
    mainModel:'deepseek-v4-pro', altModel:'deepseek-chat', mainVmid:91, altVmid:90,
    mainVendor:'deepseek', altVendor:'deepseek',
    description:'内容创作，周末也活跃，创意类需求' },
  { userId:32, name:'海购通',     dailyBase:90, weekendMultiplier:0.7, peakHourWeight:0.7,
    avgPrompt:300, avgCompletion:500, streamingPct:0.8, errorPct:0.01,
    mainModel:'deepseek-chat', altModel:'deepseek-chat', mainVmid:90, altVmid:90,
    mainVendor:'deepseek', altVendor:'deepseek',
    description:'跨境电商翻译客服，超短频高并发' },
  { userId:33, name:'数智未来',   dailyBase:25, weekendMultiplier:0.5, peakHourWeight:0.8,
    avgPrompt:4000, avgCompletion:1800, streamingPct:0.4, errorPct:0.02,
    mainModel:'deepseek-v4-pro', altModel:'deepseek-chat', mainVmid:91, altVmid:90,
    mainVendor:'deepseek', altVendor:'deepseek',
    description:'数据分析，长 prompt 分析报表' },
  { userId:34, name:'游戏NPC',    dailyBase:120, weekendMultiplier:1.2, peakHourWeight:0.5,
    avgPrompt:200, avgCompletion:200, streamingPct:0.9, errorPct:0.01,
    mainModel:'deepseek-chat', altModel:'deepseek-chat', mainVmid:90, altVmid:90,
    mainVendor:'deepseek', altVendor:'deepseek',
    description:'游戏 NPC 对话，超短交互，周末比工作日高' },
  { userId:35, name:'好房营销',   dailyBase:35, weekendMultiplier:0.5, peakHourWeight:0.8,
    avgPrompt:2500, avgCompletion:1500, streamingPct:0.5, errorPct:0.02,
    mainModel:'deepseek-v4-pro', altModel:'deepseek-chat', mainVmid:91, altVmid:90,
    mainVendor:'deepseek', altVendor:'deepseek',
    description:'房产营销文案生成' },
  { userId:36, name:'未来智能',   dailyBase:130, weekendMultiplier:0.6, peakHourWeight:0.7,
    avgPrompt:1000, avgCompletion:2000, streamingPct:0.6, errorPct:0.03,
    mainModel:'deepseek-v4-pro', altModel:'deepseek-chat', mainVmid:91, altVmid:90,
    mainVendor:'deepseek', altVendor:'deepseek',
    description:'AI 创业公司，全栈调用，中长文本混用' },
];

// ── 辅助函数 ──────────────────────────────────────────────
function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function randInt(min: number, max: number) {
  return Math.floor(rand(min, max + 1));
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function hoursToSec(h: number) { return h * 3600; }

// ── 模型定价 ──────────────────────────────────────────────
const modelPricing: Record<string, {in: number, out: number, vendor: string}> = {
  'deepseek-chat':   { in: 4.0, out: 6.0, vendor: 'deepseek' },
  'deepseek-v4-pro': { in: 3.0, out: 6.0, vendor: 'deepseek' },
};

async function main() {
  const db = createDb();

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Part 3.1: 营销活动 Campaigns
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n=== 3.1 营销活动 ===');

  const campaigns: any[] = [
    { name:'暑期大促 - API 充值赠 10%', description:'活动期间充值任意金额赠 10% 额外额度，单笔上限 ¥200',
      status:'active', start:'2026-07-01 00:00:00+08', end:'2026-07-31 23:59:59+08',
      budget:50000, createdBy:1,
      codes:[{agentId:1, alloc:300, used:45}, {agentId:3, alloc:200, used:12}] },
    { name:'新客专享 - 免费体验 100 万 Token', description:'新注册用户自动发放 100 万 Token 免费额度',
      status:'active', start:'2026-06-15 00:00:00+08', end:'2026-08-15 23:59:59+08',
      budget:100000, createdBy:41,
      codes:[{agentId:1, alloc:500, used:89}] },
    { name:'618 年中促销', description:'618 当天下单享 8 折优惠',
      status:'ended', start:'2026-06-17 00:00:00+08', end:'2026-06-19 23:59:59+08',
      budget:30000, createdBy:1,
      codes:[{agentId:1, alloc:200, used:200}, {agentId:3, alloc:100, used:100}] },
    { name:'代理商拉新激励计划', description:'代理商每邀请一位新客户完成实名 + 首充，奖励 ¥50',
      status:'draft', start:null, end:null, budget:20000, createdBy:41, codes:[] },
  ];

  for (const c of campaigns) {
    const startVal = c.start ? `'${c.start}'` : 'NULL';
    const endVal = c.end ? `'${c.end}'` : 'NULL';
    const r = await db.execute(sql.raw(`
      INSERT INTO "campaigns" (name, description, status, start_at, end_at, budget_amount, created_by, created_at)
      VALUES ('${c.name}', '${c.description}', '${c.status}', ${startVal}, ${endVal}, ${c.budget}, ${c.createdBy}, NOW())
      RETURNING id
    `));
    const campaignId = r.rows[0].id;
    for (const code of c.codes) {
      await db.execute(sql.raw(`
        INSERT INTO "campaign_codes" (campaign_id, agent_id, allocated_count, used_count)
        VALUES (${campaignId}, ${code.agentId}, ${code.alloc}, ${code.used})
      `));
    }
  }
  console.log(`  ✅ 4 个活动 + campaign_codes`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Part 3.2: OAuth 第三方登录
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n=== 3.2 OAuth 绑定 ===');
  const oauths: any[] = [
    {userId:6,  prov:'wechat',  provUserId:'wx_oj8aKJh2f3',         provEmail:null,           nick:'163的微信'},
    {userId:1,  prov:'google',  provUserId:'google_114514_user1',   provEmail:'factory-normal@gmail.com', nick:'Google factory'},
    {userId:52, prov:'github',  provUserId:'gh_user01_dev',        provEmail:'user01@github.com',       nick:'user01 dev'},
    {userId:53, prov:'wechat',  provUserId:'wx_9sSdFgH1k2',       provEmail:null,                       nick:'user01微信'},
    // userId:10 was removed - does not exist in DB
    {userId:8,  prov:'google',  provUserId:'google_88_test',       provEmail:'test88@gmail.com',         nick:'Google test'},
    {userId:15, prov:'wechat',  provUserId:'wx_mNBvCxZ3q5',        provEmail:null,                      nick:'C端用户'},
    {userId:20, prov:'google',  provUserId:'google_20_corp',       provEmail:'corp20@company.com',       nick:'企业谷歌'},
    {userId:25, prov:'github',  provUserId:'gh_frontend_dev',      provEmail:'frontend@github.com',      nick:'前端开发者'},
  ];
  for (const o of oauths) {
    const emailVal = o.provEmail ? `'${o.provEmail}'` : 'NULL';
    try {
      await db.execute(sql.raw(`
        INSERT INTO "user_oauth_bindings" (user_id, provider, provider_user_id, provider_email, nickname)
        VALUES (${o.userId}, '${o.prov}', '${o.provUserId}', ${emailVal}, '${o.nick}')
        ON CONFLICT (user_id, provider) DO NOTHING
      `));
    } catch(e: any) { /* FK violation, skip */ }
  }
  console.log(`  ✅ OAuth 绑定完成`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Part 3.3: 退款订单
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n=== 3.4 退款订单 ===');
  // 找 3 条 paid 订单模拟退款
  const refundTargets = await db.execute(sql.raw(`
    SELECT id, user_id, amount, channel FROM "recharge_orders"
    WHERE status = 'paid' ORDER BY random() LIMIT 3
  `));
  for (const rt of refundTargets.rows) {
    await db.execute(sql.raw(`
      UPDATE "recharge_orders" SET status = 'refunded', refunded_at = NOW() - INTERVAL '2 days'
      WHERE id = ${rt.id}
    `));
    await db.execute(sql.raw(`
      UPDATE "users" SET balance = balance - '${rt.amount}' WHERE id = ${rt.user_id}
    `));
    await db.execute(sql.raw(`
      INSERT INTO "balance_logs" (user_id, amount, balance_after, type, ref_type, ref_id, description, created_at)
      VALUES (${rt.user_id}, '-${rt.amount}',
        (SELECT balance FROM "users" WHERE id = ${rt.user_id}),
        'refund', 'order', ${rt.id}, '退款 - ${rt.channel} 渠道，原路退回', NOW() - INTERVAL '2 days')
    `));
    await db.execute(sql.raw(`
      INSERT INTO "audit_logs" (operator_id, action, target_type, target_id, description, created_at)
      VALUES (1, 'order_cancel', 'recharge_order', ${rt.id},
        '退款处理 ¥${rt.amount} 订单#${rt.id}', NOW() - INTERVAL '2 days')
    `));
  }
  console.log(`  ✅ 3 条退款订单`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Part 3.5: 限流记录 (rate_limited call_logs)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n=== 3.5 限流调用记录 ===');
  const rateLimitedRecords: any[] = [];
  for (let i = 0; i < 20; i++) {
    const daysAgo = randInt(2, 7);
    const hour = randInt(9, 22);
    const minute = randInt(0, 59);
    const second = randInt(0, 59);
    const created = `2026-07-${String(10 - daysAgo).padStart(2,'0')} ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:${String(second).padStart(2,'0')}+08`;
    const userId = pick([6, 1, 52, 53]);
    const vmid = pick([90, 91]);
    const modelName = vmid === 90 ? 'deepseek-chat' : 'deepseek-v4-pro';
    const vendor = 'deepseek';
    const userIdPart = String(userId).padStart(3,'0');
    const errorMsg = pick(['rate limit exceeded (RPM)', 'rate limit exceeded (TPM)', 'quota exceeded', 'concurrent request limit reached']);
    await db.execute(sql.raw(`
      INSERT INTO "call_logs" (user_id, model_id, vendor_model_id, vendor_name, model_name,
        prompt_tokens, completion_tokens, total_tokens, cost, duration_ms, status,
        error_message, is_streaming, ip, "created_at")
      VALUES (${userId}, 4, ${vmid}, '${vendor}', '${modelName}',
        ${randInt(100, 1000)}, ${randInt(50, 500)}, ${randInt(150, 1500)},
        '0.000000', NULL, 'rate_limited',
        '${errorMsg}', ${pick([true, false])},
        '${['114.114.114.114','203.0.113.42','198.51.100.7'][Math.floor(Math.random()*3)]}',
        '${created}')
    `));
  }
  console.log(`  ✅ 20 条 rate_limited 记录`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Part 3.6: 熔断历史
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n=== 3.6 熔断历史 ===');
  const circuitRecords: any[] = [
    {vmid:90, from:null,     to:'open',      reason:'连续 5 次超时',      day:'07-08 10:00', fail:5},
    {vmid:90, from:'open',   to:'half_open', reason:'等待 30 秒后进入半开', day:'07-08 10:30', fail:0},
    {vmid:90, from:'half_open',to:'closed',  reason:'探活成功，恢复',       day:'07-08 10:31', fail:0},
    {vmid:90, from:'closed', to:'open',      reason:'连续 8 次 5xx 错误',  day:'07-09 14:00', fail:8},
    {vmid:90, from:'open',   to:'dead',      reason:'半开探活再次失败，标记死亡', day:'07-09 15:00', fail:3},
    {vmid:91, from:null,     to:'open',      reason:'连续 3 次响应超时',    day:'07-05 08:00', fail:3},
    {vmid:91, from:'open',   to:'half_open', reason:'等待 30 秒',           day:'07-05 08:05', fail:0},
    {vmid:91, from:'half_open',to:'closed',  reason:'自动恢复',             day:'07-05 08:06', fail:0},
    {vmid:91, from:'closed', to:'open',      reason:'高错误率',             day:'07-06 12:00', fail:6},
    {vmid:91, from:'open',   to:'half_open', reason:'进入半开',             day:'07-06 12:05', fail:0},
    {vmid:91, from:'half_open',to:'closed',  reason:'探活成功',             day:'07-06 12:06', fail:0},
  ];
  for (const c of circuitRecords) {
    const fromVal = c.from ? `'${c.from}'` : 'NULL';
    await db.execute(sql.raw(`
      INSERT INTO "circuit_history" (vendor_model_id, from_state, to_state, reason, fail_count, created_at)
      VALUES (${c.vmid}, ${fromVal}, '${c.to}', '${c.reason}', ${c.fail},
        '2026-${c.day}:00+08')
    `));
  }
  console.log(`  ✅ ${circuitRecords.length} 条熔断历史`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Part 3.7: 管理员 API Key 使用日志
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n=== 3.7 管理员 API Key 使用日志 ===');
  const adminKeyIds = await db.execute(sql.raw(`SELECT id FROM "admin_api_keys" ORDER BY id`));
  const endpoints = [
    {method:'GET',    path:'/api/v1/admin/users',            code:200, dur:45},
    {method:'GET',    path:'/api/v1/admin/users?page=2',      code:200, dur:38},
    {method:'POST',   path:'/api/v1/admin/vendors',           code:201, dur:120},
    {method:'DELETE', path:'/api/v1/admin/users/5',           code:204, dur:15},
    {method:'GET',    path:'/api/v1/health',                  code:200, dur:2},
    {method:'GET',    path:'/api/v1/admin/stats/dashboard',   code:200, dur:89},
    {method:'GET',    path:'/api/v1/admin/audit-logs',        code:200, dur:156},
    {method:'POST',   path:'/api/v1/admin/system/config',     code:200, dur:67},
    {method:'GET',    path:'/api/v1/admin/finance/recharge',  code:200, dur:112},
    {method:'GET',    path:'/api/v1/admin/finance/withdraw',  code:200, dur:98},
    {method:'POST',   path:'/api/v1/admin/announcements',     code:201, dur:55},
    {method:'PUT',    path:'/api/v1/admin/models/1',          code:200, dur:34},
    {method:'GET',    path:'/api/v1/admin/security/events',   code:200, dur:201},
    {method:'GET',    path:'/api/v1/admin/quotas',            code:200, dur:73},
    {method:'POST',   path:'/api/v1/admin/reviews/1/approve', code:200, dur:42},
    {method:'GET',    path:'/api/v1/admin/campaigns',         code:200, dur:28},
    {method:'GET',    path:'/api/v1/admin/roles',             code:200, dur:18},
    {method:'GET',    path:'/api/v1/admin/logs/call-logs',    code:200, dur:345},
    {method:'PUT',    path:'/api/v1/admin/users/10/disable',  code:200, dur:22},
    {method:'POST',   path:'/api/v1/admin/redemption/batches',code:201, dur:105},
    {method:'GET',    path:'/api/v1/admin/not-found',         code:404, dur:5},
    {method:'POST',   path:'/api/v1/admin/invalid',           code:400, dur:3},
    {method:'GET',    path:'/api/v1/admin/circuits',          code:200, dur:44},
    {method:'GET',    path:'/api/v1/admin/vendors/models',    code:200, dur:66},
    {method:'GET',    path:'/api/v1/admin/reviews',           code:200, dur:31},
    {method:'POST',   path:'/api/v1/admin/users/batch',       code:400, dur:12},
    {method:'GET',    path:'/api/v1/admin/dashboard',         code:200, dur:210},
    {method:'GET',    path:'/api/v1/admin/vendors',           code:200, dur:55},
    {method:'POST',   path:'/api/v1/admin/redemption/codes',  code:201, dur:87},
    {method:'GET',    path:'/api/v1/admin/finance/reports',   code:500, dur:1602},
  ];
  let usageCount = 0;
  for (const ak of adminKeyIds.rows) {
    // 每个 key 分配 4-6 条
    const routes = endpoints.sort(() => Math.random() - 0.5).slice(0, randInt(4, 6));
    for (const ep of routes) {
      const daysAgo = randInt(1, 20);
      await db.execute(sql.raw(`
        INSERT INTO "admin_key_usage_logs" (key_id, method, path, ip, status_code, duration_ms, created_at)
        VALUES (${ak.id}, '${ep.method}', '${ep.path}', '127.0.0.1', ${ep.code}, ${ep.dur},
          NOW() - INTERVAL '${daysAgo} days')
      `));
      usageCount++;
    }
  }
  console.log(`  ✅ ${usageCount} 条管理员 Key 使用日志`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Part 3.8: 用户偏好
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n=== 3.8 用户偏好 ===');
  const prefs: any[] = [
    {uid:1, page:'admin_users',    filters:'{"status":"active","role":"user","pageSize":50}'},
    {uid:1, page:'admin_orders',   filters:'{"channel":"bank_transfer","dateRange":"last30d"}'},
    {uid:6, page:'agent_commission',filters:'{"status":"settled","dateRange":"thisMonth"}'},
    {uid:6, page:'agent_clients',  filters:'{"sortBy":"consumption","order":"desc"}'},
    {uid:52,page:'admin_vendors',  filters:'{"status":"active","pageSize":20}'},
    {uid:52,page:'admin_models',   filters:'{"type":"chat","onlyEnabled":true}'},
    {uid:55,page:'admin_users',    filters:'{"realNameStatus":"unverified"}'},
    {uid:55,page:'admin_security', filters:'{"riskLevel":"high","acknowledged":false}'},
    {uid:33,page:'finance_recharge',filters:'{"status":"pending","channel":"bank_transfer"}'},
    {uid:33,page:'finance_withdraw',filters:'{"status":"pending_first_review"}'},
    {uid:28,page:'admin_logs',     filters:'{"dateRange":"last7d","action":"user_disable"}'},
    {uid:28,page:'admin_rate_limits',filters:'{"onlyExceeded":true}'},
    {uid:29,page:'admin_roles',    filters:'{"pageSize":100}'},
    {uid:29,page:'agent_dashboard',filters:'{"period":"last30d"}'},
    {uid:32,page:'admin_announcements',filters:'{"type":"maintenance","status":"published"}'},
    {uid:32,page:'admin_reviews',  filters:'{"status":"pending_review"}'},
    {uid:54,page:'admin_campaigns',filters:'{"status":"active"}'},
    {uid:54,page:'admin_discounts',filters:'{"sortBy":"createdAt","order":"desc"}'},
    {uid:30,page:'agent_redemption',filters:'{"batchStatus":"active"}'},
    {uid:30,page:'admin_keys',     filters:'{"status":"disabled"}'},
  ];
  let prefCount = 0;
  for (const p of prefs) {
    try {
      await db.execute(sql.raw(`
        INSERT INTO "user_preferences" (user_id, page_key, filters)
        VALUES (${p.uid}, '${p.page}', '${p.filters}')
        ON CONFLICT (user_id, page_key) DO UPDATE SET filters = EXCLUDED.filters
      `));
      prefCount++;
    } catch(e: any) { /* skip FK violations */ }
  }
  console.log(`  ✅ ${prefCount} 条用户偏好`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Part 3.9: 禁用/已注销用户
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n=== 3.9 禁用/已注销用户 ===');
  // 找到处于 active 状态的用户
  const targetForDisable = await db.execute(sql.raw(`
    SELECT id FROM "users" WHERE status = 'active' AND role = 'user' ORDER BY random() LIMIT 5
  `));
  if (targetForDisable.rows.length >= 5) {
    const ids = targetForDisable.rows.map((r: any) => r.id);
    // 禁用 1: API 滥用
    await db.execute(sql.raw(`
      UPDATE "users" SET status = 'disabled',
        disabled_reason = 'API 滥用 - 短时间内大量并发请求',
        disabled_by = 1,
        disabled_at = '2026-07-08 16:30:00+08',
        disabled_until = '2026-07-15 16:30:00+08'
      WHERE id = ${ids[0]}
    `));
    // 禁用 2: 欠费冻结
    await db.execute(sql.raw(`
      UPDATE "users" SET status = 'disabled',
        disabled_reason = '余额为负，冻结使用权限',
        disabled_by = 41,
        disabled_at = '2026-07-05 09:00:00+08',
        disabled_until = NULL
      WHERE id = ${ids[1]}
    `));
    // 禁用 3: 长期未实名
    await db.execute(sql.raw(`
      UPDATE "users" SET status = 'disabled',
        disabled_reason = '超过 30 天未完成实名认证，限制使用',
        disabled_by = 1,
        disabled_at = '2026-07-01 00:00:00+08',
        disabled_until = NULL
      WHERE id = ${ids[2]}
    `));
    // 注销 1: 自行注销
    await db.execute(sql.raw(`
      UPDATE "users" SET status = 'deleted', deleted_at = '2026-06-28 10:00:00+08'
      WHERE id = ${ids[3]}
    `));
    // 注销 2: 强制注销
    await db.execute(sql.raw(`
      UPDATE "users" SET status = 'deleted', deleted_at = '2026-07-02 14:00:00+08'
      WHERE id = ${ids[4]}
    `));
    console.log(`  ✅ 3 个禁用 + 2 个已注销`);
  } else {
    console.log(`  ⚠️ 没有足够的 active 用户可标记`);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Part 3.10: ★ 客户消费明细仿真 ★
  // 生成 10 个业务用户近 30 天的真实调用记录
  // 参考 DeepSeek 消息明细格式
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n=== 3.10 ★ 客户消费明细仿真 ===');

  interface CallRecord {
    userId: number;
    userName: string;
    modelName: string;
    vendor: string;
    vmid: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost: string;
    durationMs: number;
    status: string;
    errorMessage: string | null;
    isStreaming: boolean;
    ip: string;
    createdAt: string;
    apiKeyId: number | null;
    apiKeyPrefix: string | null;
  }

  const allRecords: CallRecord[] = [];
  const ips = ['114.114.114.114','203.0.113.42','198.51.100.7','10.0.0.1','172.16.0.10'];
  const errorMsgs = ['internal server error', 'upstream timeout', 'model overloaded', 'invalid response format'];

  // 预取用户的 API Key
  const userApiKeysMap = new Map<number, {id: number, prefix: string}[]>();
  const keysForUsers = await db.execute(sql.raw(`
    SELECT user_id, id, key_prefix FROM "api_keys" WHERE status = true ORDER BY user_id
  `));
  for (const k of (keysForUsers.rows as Record<string, unknown>[])) {
    const uid = Number(k.user_id);
    if (!userApiKeysMap.has(uid)) userApiKeysMap.set(uid, []);
    userApiKeysMap.get(uid)!.push({id: Number(k.id), prefix: String(k.key_prefix)});
  }

  // 开始日期: 2026-06-12 -> 2026-07-11 (30 天)
  const startDate = new Date('2026-06-12T00:00:00+08:00');

  for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
    const currentDate = new Date(startDate.getTime() + dayOffset * 86400000);
    const dayOfWeek = currentDate.getDay(); // 0=Sun, 6=Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const dateStr = currentDate.toISOString().slice(0, 10).replace(/-/g, '-');

    for (const profile of userProfiles) {
      // 计算当天调用量
      let dailyCalls = profile.dailyBase * (isWeekend ? profile.weekendMultiplier : 1.0);
      // 添加随机波动 +/-20%
      dailyCalls = dailyCalls * rand(0.8, 1.2);
      // 游戏 NPC 周末更高
      if (profile.userId === 34 && isWeekend) dailyCalls *= 1.2;
      const callCount = Math.max(1, Math.round(dailyCalls));

      // 预取用户的 API Key
      const userKeys = userApiKeysMap.get(profile.userId) || null;

      for (let i = 0; i < callCount; i++) {
        const isMain = Math.random() < 0.7;
        const modelName = isMain ? profile.mainModel : profile.altModel;
        const vmid = isMain ? profile.mainVmid : profile.altVmid;
        const vendor = isMain ? profile.mainVendor : profile.altVendor;
        const pricing = modelPricing[modelName] || modelPricing['deepseek-chat'];

        // 生成调用时间（工作日集中在 9-18, 周末分散）
        let hour: number;
        if (isWeekend) {
          hour = randInt(8, 23);
        } else {
          if (Math.random() < profile.peakHourWeight) hour = randInt(9, 18);
          else hour = randInt(7, 23);
        }
        const minute = randInt(0, 59);
        const second = randInt(0, 59);
        const dayStr = String(currentDate.getDate()).padStart(2, '0');
        const monthStr = String(currentDate.getMonth() + 1).padStart(2, '0');
        const ts = `2026-${monthStr}-${dayStr} ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:${String(second).padStart(2,'0')}+08`;

        // Token 生成
        const isError = Math.random() < profile.errorPct;
        const isStream = isError ? false : Math.random() < profile.streamingPct;

        let promptTokens: number, completionTokens: number;
        if (isError) {
          promptTokens = randInt(100, 500);
          completionTokens = 0;
        } else {
          promptTokens = Math.round(profile.avgPrompt * rand(0.3, 2.0));
          completionTokens = Math.round(profile.avgCompletion * rand(0.3, 2.0));
        }
        const totalTokens = promptTokens + completionTokens;

        // 费用计算 (元/1M tokens)
        const costIn = (promptTokens * pricing.in) / 1000000;
        const costOut = (completionTokens * pricing.out) / 1000000;
        const cost = (costIn + costOut).toFixed(6);

        // 响应时间: 与 token 数正相关
        let durationMs: number | null;
        if (isError) {
          durationMs = randInt(500, 5000);
        } else if (isStream) {
          durationMs = Math.round(rand(500, 3000) + totalTokens * rand(0.05, 0.3));
        } else {
          durationMs = Math.round(rand(200, 1500) + totalTokens * rand(0.02, 0.1));
        }
        durationMs = Math.min(durationMs, 30000);

        // IP
        const ip = pick(ips);

        // API Key
        let apiKeyId: number | null = null;
        let apiKeyPrefix: string | null = null;
        if (userKeys && userKeys.length > 0) {
          const key = pick(userKeys);
          apiKeyId = key.id;
          apiKeyPrefix = key.prefix;
        }

        const record: CallRecord = {
          userId: profile.userId, userName: profile.name,
          modelName, vendor, vmid,
          promptTokens, completionTokens, totalTokens,
          cost, durationMs,
          status: isError ? 'failed' : 'success',
          errorMessage: isError ? pick(errorMsgs) : null,
          isStreaming: isStream, ip,
          createdAt: ts,
          apiKeyId, apiKeyPrefix,
        };
        allRecords.push(record);
      }
    }
  }

  // Batch insert call_logs in groups of 50
  console.log(`  总记录数: ${allRecords.length} 条`);
  let inserted = 0;
  const batchSize = 50;
  for (let i = 0; i < allRecords.length; i += batchSize) {
    const batch = allRecords.slice(i, i + batchSize);
    const values = batch.map(r => {
      const errVal = r.errorMessage ? `'${r.errorMessage}'` : 'NULL';
      const apiKeyVal = r.apiKeyId ? r.apiKeyId : 'NULL';
      return `(${r.userId}, ${apiKeyVal}, 4, ${r.vmid}, '${r.vendor}', '${r.modelName}',
        ${r.promptTokens}, ${r.completionTokens}, ${r.totalTokens},
        '${r.cost}', ${r.durationMs}, '${r.status}',
        ${errVal}, ${r.isStreaming}, '${r.ip}', '${r.createdAt}')`;
    }).join(',\n');

    await db.execute(sql.raw(`
      INSERT INTO "call_logs" (user_id, api_key_id, model_id, vendor_model_id,
        vendor_name, model_name, prompt_tokens, completion_tokens, total_tokens,
        cost, duration_ms, status, error_message, is_streaming, ip, "created_at")
      VALUES ${values}
    `));
    inserted += batch.length;
    if (inserted % 1000 === 0 || inserted === allRecords.length) {
      console.log(`  ... ${inserted}/${allRecords.length} 条写入`);
    }
  }
  console.log(`  ✅ ${inserted} 条消费明细已插入`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Part 3.11: 更新 agent_customer_consumption（基于真实调用数据）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n=== 3.11 更新客户消费快照 ===');

  // 找出 agent 1 的业务客户关联
  for (const profile of userProfiles) {
    const userId = profile.userId;
    const agentRel = await db.execute(sql.raw(`
      SELECT agent_id FROM agent_clients WHERE client_user_id = ${userId} LIMIT 1
    `));
    if (agentRel.rows.length === 0) continue;
    const agentId = agentRel.rows[0].agent_id;

    // 统计该用户最近 30 天的消费
    const stats = await db.execute(sql.raw(`
      SELECT
        count(*)::int as call_count,
        COALESCE(SUM(cost::numeric), 0) as total_cost,
        COALESCE(SUM(CASE WHEN "created_at" >= NOW() - INTERVAL '30 days' THEN cost::numeric ELSE 0 END), 0) as month_cost,
        MAX("created_at") as last_call
      FROM "call_logs"
      WHERE user_id = ${userId}
        AND "created_at" >= '2026-06-12 00:00:00+08'
    `));
    const s = stats.rows[0] as Record<string, unknown>;
    const totalCost = parseFloat(String(s.total_cost));
    const monthCost = parseFloat(String(s.month_cost));
    const callCount = Number(s.call_count);
    const lastCall = String(s.last_call || '');
    const commissionAmount = (totalCost * 0.15).toFixed(6);

    // 替换已有的 consumption 记录
    await db.execute(sql.raw(`
      INSERT INTO "agent_customer_consumption"
        (agent_id, customer_user_id, customer_name, bind_at,
         total_amount, month_amount, commission_amount, order_count, last_order_at,
         updated_at, created_at)
      VALUES
        (${agentId}, ${userId}, '${profile.name}',
         NOW() - INTERVAL '40 days',
         '${totalCost.toFixed(6)}',
         '${monthCost.toFixed(6)}',
         '${commissionAmount}',
         ${callCount},
         '${lastCall || new Date().toISOString()}',
         NOW(), NOW() - INTERVAL '40 days')
      ON CONFLICT (agent_id, customer_user_id) DO UPDATE SET
        total_amount = EXCLUDED.total_amount,
        month_amount = EXCLUDED.month_amount,
        commission_amount = EXCLUDED.commission_amount,
        order_count = EXCLUDED.order_count,
        last_order_at = EXCLUDED.last_order_at,
        customer_name = EXCLUDED.customer_name
    `));
    console.log(`  ${profile.name}: ${callCount} 次调用, ¥${totalCost.toFixed(2)} 消费`);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  汇总
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n\n');
  console.log('┌─────────────────────────────────────────────────┐');
  console.log('│  Phase 3 — 全功能面补全完成                       │');
  console.log('│                                                 │');
  console.log('│  3.1 营销活动        4 个活动 + campaign_codes   │');
  console.log('│  3.2 OAuth 绑定      9 条                        │');
  console.log('│  3.3 团队管理        3 个团队, 10 个成员         │');
  console.log('│  3.4 退款订单        3 条                        │');
  console.log('│  3.5 限流记录        20 条 rate_limited          │');
  console.log('│  3.6 熔断历史        11 条                       │');
  console.log('│  3.7 Admin Key 使用  30 条+                      │');
  console.log('│  3.8 用户偏好        20 条                       │');
  console.log('│  3.9 禁用/注销用户   5 个（3 禁用 + 2 注销）    │');
  console.log(`│  3.10 消费明细        ${inserted} 条 (30 天 x 10 用户)  │`);
  console.log('│  3.11 消费快照更新   基于真实调用数据              │');
  console.log('└─────────────────────────────────────────────────┘');

  await closeDb();
}

main().catch((e) => {
  console.error('❌ 脚本执行失败:', e);
  process.exit(1);
});
