// ============================================================
//  3cloud (3C) — 生产数据填充脚本
//  Phase 1: 核心业务数据补全
//  Phase 2A: 代理商专线数据
//  运行：npx tsx src/db/seed-prod-data.ts
// ============================================================

import "dotenv/config";
import { createDb, closeDb } from "./index.js";
import { sql, eq, and } from "drizzle-orm";
import {
  users, agents, agentClients, agentCustomerConsumption,
  commissionLogs, withdrawOrders, userNotifications,
  userDiscounts, userIpWhitelist, userNotes,
  apiKeys, userQuotas, keyQuotas, rechargeOrders,
  balanceLogs, redemptionCodes, redemptionLogs,
  redemptionBatches, models, vendorModels, vendors,
} from "./schema.js";

async function main() {
  const db = createDb();

  // ── Phase 1: 基础数据补全 ──────────────────────────────

  console.log("=== Phase 1: 核心业务数据 ===");

  // 1.1 给 30 个活跃用户补余额（随机 5~2000 元）
  console.log("\n[1.1] 补充用户余额...");
  const activeUsers = await db.execute(sql.raw(`
    SELECT id, role FROM "users"
    WHERE status = 'active' AND balance::numeric < 5
    ORDER BY balance ASC
    LIMIT 30
  `));
  for (const u of activeUsers.rows) {
    const amount = (Math.random() * 1995 + 5).toFixed(6);
    await db.execute(sql.raw(
      `UPDATE "users" SET balance = '${amount}' WHERE id = ${u.id}`
    ));
    // 记录 balance_logs
    const isAgent = u.role === 'agent';
    await db.execute(sql.raw(`
      INSERT INTO "balance_logs" (user_id, amount, balance_after, type, description, "created_at")
      VALUES (${u.id}, '${amount}', '${amount}', 'admin_adjust',
        '${isAgent ? '代理商启动余额' : '体验金充值'}',
        NOW() - INTERVAL '${Math.floor(Math.random() * 14)} days')
    `));
  }
  console.log(`  ✅ ${activeUsers.rows.length} 个用户补充了余额`);

  // 1.2 用户折扣记录（8 条）
  console.log("\n[1.2] 填充用户折扣表...");
  const discountTargets = await db.execute(sql.raw(`
    SELECT id FROM "users" WHERE role = 'agent' AND status = 'active' LIMIT 4
  `));
  const discountUsers = await db.execute(sql.raw(`
    SELECT id FROM "users" WHERE role = 'user' AND status = 'active' AND real_name_status = 'approved' LIMIT 4
  `));
  const allDiscount = [...discountTargets.rows, ...discountUsers.rows];
  for (let i = 0; i < allDiscount.length; i++) {
    const rate = (0.70 + Math.random() * 0.25).toFixed(4);
    await db.execute(sql.raw(`
      INSERT INTO "user_discounts" (user_id, discount_rate, effective_from, effective_until, created_by, "created_at")
      VALUES (${allDiscount[i].id}, '${rate}',
        NOW() - INTERVAL '30 days',
        NOW() + INTERVAL '${Math.floor(Math.random() * 60 + 30)} days',
        1, NOW() - INTERVAL '30 days')
      ON CONFLICT (user_id) DO UPDATE SET
        discount_rate = EXCLUDED.discount_rate,
        effective_from = EXCLUDED.effective_from,
        effective_until = EXCLUDED.effective_until
    `));
  }
  console.log(`  ✅ ${allDiscount.length} 条折扣记录`);

  // 1.3 提现补单（pending_first_review + pending_second_review）
  console.log("\n[1.3] 补充待审提现...");
  const agentIds = await db.execute(sql.raw(`SELECT id FROM "agents" ORDER BY id`));
  const withdrawAgents = agentIds.rows.filter((a: any) => String(a.id) !== "5" && String(a.id) !== "41");
  // pending_first_review
  for (let i = 0; i < 6 && i < withdrawAgents.length; i++) {
    const amtNum = Math.random() * 900 + 100;
    const amt = amtNum.toFixed(6);
    const daysAgo = Math.floor(Math.random() * 10) + 1;
    await db.execute(sql.raw(`
      INSERT INTO "withdraw_orders"
        (agent_id, amount, status, bank_card_no, bank_name, bank_voucher_url,
         audit_level, fee_amount, actual_amount, created_at, updated_at)
      VALUES
        (${withdrawAgents[i].id}, '${amt}', 'pending_first_review',
         '622202${Math.floor(10000000 + Math.random() * 90000000).toString()}',
         '${['中国银行', '工商银行', '建设银行', '招商银行', '农业银行'][Math.floor(Math.random() * 5)]}',
         NULL, 2, '${(amtNum * 0.001).toFixed(6)}', '${(amtNum * 0.999).toFixed(6)}',
         NOW() - INTERVAL '${daysAgo} days', NOW() - INTERVAL '${daysAgo} days')
    `));
  }
  // pending_second_review
  for (let i = 3; i < 8 && i < withdrawAgents.length; i++) {
    const amtNum = Math.random() * 800 + 200;
    const amt = amtNum.toFixed(6);
    const daysAgo = Math.floor(Math.random() * 5) + 3;
    await db.execute(sql.raw(`
      INSERT INTO "withdraw_orders"
        (agent_id, amount, status, bank_card_no, bank_name, bank_voucher_url,
         audit_level, fee_amount, actual_amount,
         first_auditor_id, first_audited_at, created_at, updated_at)
      VALUES
        (${withdrawAgents[i].id}, '${amt}', 'pending_second_review',
         '622202${Math.floor(10000000 + Math.random() * 90000000).toString()}',
         '${['中信银行', '浦发银行', '民生银行', '兴业银行'][Math.floor(Math.random() * 4)]}',
         NULL, 2, '${(amtNum * 0.001).toFixed(6)}', '${(amtNum * 0.999).toFixed(6)}',
         1, NOW() - INTERVAL '${daysAgo - 1} days',
         NOW() - INTERVAL '${daysAgo} days', NOW() - INTERVAL '${daysAgo} days')
    `));
  }
  console.log(`  待初审 6 条 + 待二审 5 条`);

  // 1.4 通知补全（100 条混合类型）
  console.log("\n[1.4] 补充混合类型通知...");
  const notifUsers = await db.execute(sql.raw(`
    SELECT id FROM "users" WHERE status = 'active' ORDER BY random() LIMIT 15
  `));
  const notifyTypes = [
    { type: 'balance_low', title: '余额不足提醒', content: '您的账户余额已低于 ¥50，请及时充值以免影响服务使用' },
    { type: 'quota_warning', title: '月额度即将用尽', content: '您本月的 API 调用额度已使用 80%，请注意控制用量' },
    { type: 'quota_exceeded', title: '月额度已超限', content: '您本月的 API 调用额度已超限，部分请求将被限制' },
    { type: 'commission_settled', title: '佣金已结算', content: '您的最新一笔佣金已结算到账，请查收' },
    { type: 'withdraw_result', title: '提现处理结果', content: '您的提现申请已处理，请查看详情' },
    { type: 'new_model', title: '新模型上线', content: '平台已上线 GPT-5.4、Claude Opus 4.8 等新模型，欢迎体验' },
    { type: 'system_announcement', title: '系统维护通知', content: '平台将于本周日凌晨 02:00-04:00 进行系统升级维护' },
    { type: 'real_name_approved', title: '实名认证已通过', content: '恭喜，您的实名认证已通过审核' },
    { type: 'redemption_success', title: '兑换码激活成功', content: '您已成功激活兑换码，¥{amount} 已充入账户余额' },
    { type: 'agent_client_event', title: '新客户绑定', content: '您有一名新客户通过您的推广链接完成注册绑定' },
  ];
  let notifCount = 0;
  const userNotifIds: number[] = notifUsers.rows.map((u: any) => u.id);
  for (let i = 0; i < 100; i++) {
    const nt = notifyTypes[Math.floor(Math.random() * notifyTypes.length)];
    const uid = userNotifIds[Math.floor(Math.random() * userNotifIds.length)];
    const daysAgo = Math.floor(Math.random() * 15);
    let content = nt.content;
    if (nt.type === 'redemption_success') content = content.replace('{amount}', (Math.random() * 100 + 10).toFixed(2));
    await db.execute(sql.raw(`
      INSERT INTO "user_notifications" (user_id, type, title, content, created_at)
      VALUES (${uid}, '${nt.type}', '${nt.title}', '${content}', NOW() - INTERVAL '${daysAgo} days')
    `));
    notifCount++;
  }
  console.log(`  ✅ ${notifCount} 条通知`);

  // 1.5 IP 白名单
  console.log("\n[1.5] 填充 IP 白名单...");
  const wlUsers = await db.execute(sql.raw(`
    SELECT id FROM "users" WHERE status = 'active' ORDER BY random() LIMIT 5
  `));
  const ipPools = ['192.168.1.100', '10.0.0.50', '172.16.0.10', '114.114.114.114', '8.8.8.8',
    '203.0.113.42', '198.51.100.7', '192.0.2.88'];
  for (const u of wlUsers.rows) {
    const ipCount = Math.floor(Math.random() * 2) + 1;
    for (let j = 0; j < ipCount; j++) {
      const ip = ipPools[Math.floor(Math.random() * ipPools.length)];
      await db.execute(sql.raw(`
        INSERT INTO "user_ip_whitelist" (user_id, ip, description, enabled)
        VALUES (${u.id}, '${ip}', '${['办公室网络', 'VPN 出口', '开发环境', '家庭宽带'][Math.floor(Math.random() * 4)]}', true)
        ON CONFLICT (user_id, ip) DO NOTHING
      `));
    }
  }
  console.log(`  ✅ ${wlUsers.rows.length} 个用户配置了白名单`);

  // 1.6 用户备注
  console.log("\n[1.6] 填充用户备注...");
  const noteUsers = await db.execute(sql.raw(`
    SELECT id FROM "users" WHERE status = 'active' ORDER BY random() LIMIT 10
  `));
  const noteTemplates = [
    '企业客户，已签署年度合同，合同编号 CON-{n}',
    '代理商客户，佣金比例 15%，需关注月度业绩',
    '该客户使用量大，建议关注余额变动',
    '高价值客户，优先技术支持',
    '新注册用户，已发放免费体验额度',
    '客户反馈积极，已升级为企业账户',
    '大客户跟进中，潜在月消费 ¥{n}+',
  ];
  for (const u of noteUsers.rows) {
    const tpl = noteTemplates[Math.floor(Math.random() * noteTemplates.length)];
    const content = tpl.replace('{n}', String(Math.floor(Math.random() * 9000 + 1000)));
    await db.execute(sql.raw(`
      INSERT INTO "user_notes" (user_id, content, created_by, created_at)
      VALUES (${u.id}, '${content}', 1, NOW() - INTERVAL '${Math.floor(Math.random() * 20)} days')
    `));
  }
  console.log(`  ✅ 10 条用户备注`);

  // 1.7 页面内容
  console.log("\n[1.7] 填充页面内容...");
  const pages = [
    { slug: 'terms', titleZh: '服务条款', content: '## 服务条款\n\n欢迎使用 3cloud 平台。使用本平台即表示您同意以下条款...\n\n### 1. 服务说明\n3cloud 提供 AI API 聚合服务...\n\n### 2. 用户责任\n用户应妥善保管账户密码...' },
    { slug: 'privacy', titleZh: '隐私政策', content: '## 隐私政策\n\n我们重视您的隐私。本政策说明我们如何收集、使用和保护您的个人信息...' },
    { slug: 'api_docs', titleZh: 'API 文档', content: '## API 文档\n\n### 基础 URL\n\n`https://api.unmisa.com/v1`\n\n### 认证\n\n使用 Bearer Token...' },
    { slug: 'about', titleZh: '关于我们', content: '## 关于 3cloud\n\n3cloud 是新一代 AI API 聚合平台，对接多家顶级模型供应商...' },
    { slug: 'faq', titleZh: '常见问题', content: '## 常见问题\n\n### 如何注册?\n\n...\n\n### 如何充值?\n\n...' },
  ];
  for (const p of pages) {
    await db.execute(sql.raw(`
      INSERT INTO "page_contents" (slug, title_zh, title_en, content_markdown_zh, content_markdown_en, status, updated_by, created_at)
      VALUES ('${p.slug}', '${p.titleZh}', '${p.titleZh}', '${p.content}', '${p.content}', true, 1, NOW())
      ON CONFLICT (slug) DO UPDATE SET
        title_zh = EXCLUDED.title_zh,
        content_markdown_zh = EXCLUDED.content_markdown_zh,
        updated_by = EXCLUDED.updated_by
    `));
  }
  console.log(`  ✅ ${pages.length} 个页面内容`);

  // ── Phase 2A: 代理商专线数据 ──────────────────────────

  console.log("\n\n=== Phase 2A: 代理商专线数据 ===");

  // 2A.1 建立多级代理树
  // 找已有带余额且有客户的 agent 作为顶级代理，或者创建新的
  console.log("\n[2A.1] 建立多级代理树...");

  // 获取可用作 top 代理的已有用户（取出非 163 的 agent 账户）
  const existingTopAgents = await db.execute(sql.raw(`
    SELECT a.id, u.id as user_id, u.nickname, u.role FROM agents a JOIN users u ON a.user_id = u.id
    WHERE u.role = 'agent' ORDER BY a.id
  `));
  console.log(`  可用代理基础: ${existingTopAgents.rows.length} 个`);

  // 显示代理列表了解 id
  const agentList = existingTopAgents.rows.map((r: any) => ({ agentId: r.id, userId: r.user_id }));
  console.log(`  Agent list (id:userId): ${JSON.stringify(agentList)}`);

  // 从运行时代理列表:
  // agentId=3 (userId=1, factory-normal@3cloud.ai)
  // agentId=1 (userId=6, 163@163.com)
  // agentId=5-8 (userId=52-55, user01-04@test.local)
  // Top-level: agent 3 (factory-normal) → Level 2: agent 1 (163) → Level 3: user01~user04
  
  await db.execute(sql.raw(`UPDATE "agents" SET parent_agent_id = 3, team_depth = 1 WHERE id = 1`));
  await db.execute(sql.raw(`UPDATE "agents" SET parent_agent_id = 1, team_depth = 2 WHERE id = 5`));
  await db.execute(sql.raw(`UPDATE "agents" SET parent_agent_id = 1, team_depth = 2 WHERE id = 6`));
  await db.execute(sql.raw(`UPDATE "agents" SET parent_agent_id = 1, team_depth = 2 WHERE id = 7`));
  await db.execute(sql.raw(`UPDATE "agents" SET parent_agent_id = 1, team_depth = 2 WHERE id = 8`));
  console.log(`  ✅ 代理树建立: factory-normal → 163 → user01~user04`);

  // 2A.2 三级代理打标签 + 更新余额、生成有意义的佣金轨迹
  console.log("\n[2A.2] 三级代理佣金（pending + cancelled）...");

  // 给 163 追加 pending commission（上月至今跨 7 天）
  const commissionTypes = ['sale', 'renewal', 'sale'];
  const callCostRange = [0.5, 50];
  const commRate = 0.15;

  // pending commissions for agent 1 (163) - 15 records
  for (let i = 0; i < 15; i++) {
    const callCost = (callCostRange[0] + Math.random() * (callCostRange[1] - callCostRange[0])).toFixed(6);
    const commAmount = (parseFloat(callCost) * commRate).toFixed(6);
    const daysAgo = Math.floor(Math.random() * 7);
    const ctype = commissionTypes[Math.floor(Math.random() * commissionTypes.length)];
    await db.execute(sql.raw(`
      INSERT INTO "commission_logs"
        (agent_id, client_call_log_id, call_cost, commission_amount, status,
         commission_type, fee_rate, fee_amount, net_amount, created_at)
      VALUES
        (1, NULL, '${callCost}', '${commAmount}', 'pending',
         '${ctype}', '0.0300', '${(parseFloat(commAmount) * 0.03).toFixed(6)}',
         '${(parseFloat(commAmount) * 0.97).toFixed(6)}',
         NOW() - INTERVAL '${daysAgo} days')
    `));
  }
  // pending for user01-04 (agent id 5,6,7,8) - 16 more
  const childAgentIds = [5, 6, 7, 8];
  for (const aid of childAgentIds) {
    for (let i = 0; i < 4; i++) {
      const callCost = (callCostRange[0] + Math.random() * (callCostRange[1] - callCostRange[0])).toFixed(6);
      const commAmount = (parseFloat(callCost) * commRate).toFixed(6);
      const daysAgo = Math.floor(Math.random() * 7);
      const ctype = commissionTypes[Math.floor(Math.random() * commissionTypes.length)];
      await db.execute(sql.raw(`
        INSERT INTO "commission_logs"
          (agent_id, client_call_log_id, call_cost, commission_amount, status,
           commission_type, fee_rate, fee_amount, net_amount, created_at)
        VALUES
          (${aid}, NULL, '${callCost}', '${commAmount}', 'pending',
           '${ctype}', '0.0300', '${(parseFloat(commAmount) * 0.03).toFixed(6)}',
           '${(parseFloat(commAmount) * 0.97).toFixed(6)}',
           NOW() - INTERVAL '${daysAgo} days')
      `));
    }
  }
  // cancelled commissions for agent 1 - 5 records
  for (let i = 0; i < 5; i++) {
    const callCost = (callCostRange[0] + Math.random() * (callCostRange[1] - callCostRange[0])).toFixed(6);
    const commAmount = (parseFloat(callCost) * commRate).toFixed(6);
    const daysAgo = Math.floor(Math.random() * 14) + 7;
    await db.execute(sql.raw(`
      INSERT INTO "commission_logs"
        (agent_id, client_call_log_id, call_cost, commission_amount, status,
         commission_type, fee_rate, fee_amount, net_amount, created_at)
      VALUES
        (1, NULL, '${callCost}', '${commAmount}', 'cancelled',
         'sale', '0.0300', '${(parseFloat(commAmount) * 0.03).toFixed(6)}',
         '${(parseFloat(commAmount) * 0.97).toFixed(6)}',
         NOW() - INTERVAL '${daysAgo} days')
    `));
  }

  const totalPending = 15 + childAgentIds.length * 4;
  console.log(`  ✅ ${totalPending} 条 pending + 5 条 cancelled`);

  // 2A.3 增强客户消费快照（跨 30 天）
  console.log("\n[2A.3] 增强客户消费快照...");
  const existingClients = await db.execute(sql.raw(`
    SELECT ac.agent_id, ac.client_user_id, u.nickname
    FROM agent_clients ac JOIN users u ON ac.client_user_id = u.id
    ORDER BY ac.agent_id LIMIT 15
  `));
  const clientRows = existingClients.rows;
  // 对每个已绑定的客户，追加 2-4 条跨 30 天的消费记录
  for (const cl of clientRows) {
    const daysBack = Math.floor(Math.random() * 25) + 3;
    await db.execute(sql.raw(`
      INSERT INTO "agent_customer_consumption"
        (agent_id, customer_user_id, customer_name, bind_at,
         total_amount, month_amount, commission_amount, order_count, last_order_at,
         created_at, updated_at)
      VALUES
        (${cl.agent_id}, ${cl.client_user_id}, '${cl.nickname || '客户'}',
         NOW() - INTERVAL '${daysBack + 10} days',
         '${(Math.random() * 200 + 10).toFixed(6)}',
         '${(Math.random() * 50 + 5).toFixed(6)}',
         '${(Math.random() * 30 + 3).toFixed(6)}',
         ${Math.floor(Math.random() * 20 + 3)},
         NOW() - INTERVAL '${Math.floor(Math.random() * 7)} days',
         NOW() - INTERVAL '${daysBack + 10} days',
         NOW())
      ON CONFLICT (agent_id, customer_user_id) DO UPDATE SET
        total_amount = EXCLUDED.total_amount,
        month_amount = EXCLUDED.month_amount,
        order_count = agent_customer_consumption.order_count + EXCLUDED.order_count,
        last_order_at = EXCLUDED.last_order_at
    `));
  }
  console.log(`  ✅ ${clientRows.length} 条消费快照增强`);

  // 2A.4 给多个代理配置 API Key + 额度
  console.log("\n[2A.4] 代理 API Key + 额度...");
  const keyAgents = [{ agentId: 3, nickname: 'factory-normal' }, { agentId: 1, nickname: '163' },
    { agentId: 5, nickname: 'user01' }, { agentId: 6, nickname: 'user02' }];
  for (const ka of keyAgents) {
    const agentRec = await db.execute(sql.raw(
      `SELECT user_id FROM "agents" WHERE id = ${ka.agentId}`
    ));
    if (agentRec.rows.length === 0) continue;
    const userId = agentRec.rows[0].user_id;
    // 1 API Key per agent
    const keyName = `${ka.nickname}-prod-key`;
    await db.execute(sql.raw(`
      INSERT INTO "api_keys" (user_id, name, key_hash, key_prefix, status)
      VALUES (${userId}, '${keyName}', 'sk-prod-${ka.nickname}-${Math.random().toString(36).slice(2, 10)}',
        'sk-${ka.nickname.slice(0, 4)}', true)
    `));
    // 1 quota per key
    const apiKeyRec = await db.execute(sql.raw(
      `SELECT id FROM "api_keys" WHERE user_id = ${userId} AND name = '${keyName}' ORDER BY id DESC LIMIT 1`
    ));
    if (apiKeyRec.rows.length > 0) {
      await db.execute(sql.raw(`
        INSERT INTO "key_quotas" (api_key_id, quota_amount, used_amount, alert_percent, period_start, period_end)
        VALUES (${apiKeyRec.rows[0].id}, '5000.000000', '${(Math.random() * 3000).toFixed(6)}',
          80, NOW() - INTERVAL '30 days', NOW() + INTERVAL '${30 + Math.floor(Math.random() * 30)} days')
      `));
    }
  }
  console.log(`  ✅ ${keyAgents.length} 个代理配置了 API Key 和额度`);

  // 2A.5 补充充值 pending 双审（bank_transfer 有 first_confirmed 但缺 second）
  console.log("\n[2A.5] 充值双审补单...");
  // 找已有的 bank_transfer pending 订单，设 first_confirmed
  const bankTransfers = await db.execute(sql.raw(`
    SELECT id, user_id, amount FROM "recharge_orders"
    WHERE channel = 'bank_transfer' AND status = 'pending' AND first_confirmed_by IS NULL
    LIMIT 5
  `));
  for (const bt of bankTransfers.rows) {
    await db.execute(sql.raw(`
      UPDATE "recharge_orders" SET
        first_confirmed_by = 1,
        first_confirmed_at = NOW() - INTERVAL '1 day',
        voucher_image = '/uploads/vouchers/demo-${String(bt.id).padStart(4, '0')}.jpg',
        voucher_no = 'V${String(bt.id).padStart(6, '0')}',
        payer_account_name = '测试付款人',
        payer_account_no = '6222********${String(bt.id).padStart(4, '0')}',
        transfer_remark = '对公转账-${bt.amount}',
        status = 'confirmed'
      WHERE id = ${bt.id}
    `));
    // 记录 audit
    await db.execute(sql.raw(`
      INSERT INTO "audit_logs" (operator_id, action, target_type, target_id, description, created_at)
      VALUES (1, 'recharge_first_confirm', 'recharge_order', ${bt.id},
        '初审确认银行转账 ¥${bt.amount}', NOW() - INTERVAL '1 day')
    `));
  }
  // 再找 3 条 confirmed 设 second_confirm（模拟完整双审）
  const confirmedOrders = await db.execute(sql.raw(`
    SELECT id, user_id, amount FROM "recharge_orders"
    WHERE status = 'confirmed' AND second_confirmed_by IS NULL AND first_confirmed_by IS NOT NULL
    LIMIT 3
  `));
  for (const co of confirmedOrders.rows) {
    await db.execute(sql.raw(`
      UPDATE "recharge_orders" SET
        second_confirmed_by = 5,
        second_confirmed_at = NOW() - INTERVAL '6 hours',
        status = 'paid',
        paid_at = NOW() - INTERVAL '6 hours'
      WHERE id = ${co.id}
    `));
    // Add balance
    await db.execute(sql.raw(`
      UPDATE "users" SET balance = balance + ${co.amount} WHERE id = ${co.user_id}
    `));
    await db.execute(sql.raw(`
      INSERT INTO "balance_logs" (user_id, amount, balance_after, type, ref_type, ref_id, description, created_at)
      VALUES (${co.user_id}, '${co.amount}',
        (SELECT balance FROM "users" WHERE id = ${co.user_id}),
        'recharge', 'order', ${co.id}, '银行转账到账（双审确认）', NOW() - INTERVAL '6 hours')
    `));
    await db.execute(sql.raw(`
      INSERT INTO "audit_logs" (operator_id, action, target_type, target_id, description, created_at)
      VALUES (5, 'recharge_second_confirm', 'recharge_order', ${co.id},
        '二审确认银行转账 ¥${co.amount}', NOW() - INTERVAL '6 hours')
    `));
  }
  console.log(`  ✅ ${bankTransfers.rows.length + confirmedOrders.rows.length} 条充值双审处理`);

  // ── Phase 2: 剩余数据 ──────────────────────────────

  console.log("\n\n=== Phase 2: 边缘场景数据 ===");

  // 2.1 API Key 多样性（禁用 + 过期）
  console.log("\n[2.1] API Key 状态多样性...");
  const allApiKeys = await db.execute(sql.raw(`
    SELECT id, user_id FROM "api_keys" WHERE status = true ORDER BY random() LIMIT 20
  `));
  // 10 个禁用
  for (let i = 0; i < 10 && i < allApiKeys.rows.length; i++) {
    await db.execute(sql.raw(`
      UPDATE "api_keys" SET status = false WHERE id = ${allApiKeys.rows[i].id}
    `));
  }
  // 10 个过期
  for (let i = 10; i < 20 && i < allApiKeys.rows.length; i++) {
    await db.execute(sql.raw(`
      UPDATE "api_keys" SET expires_at = NOW() - INTERVAL '5 days' WHERE id = ${allApiKeys.rows[i].id}
    `));
  }
  console.log(`  ✅ 10 个禁用 + 10 个过期 Key`);

  // 2.2 Key 级额度（补充已有 key）
  console.log("\n[2.2] 补充 Key 级额度...");
  const activeKeys = await db.execute(sql.raw(`
    SELECT ak.id, ak.user_id FROM "api_keys" ak
    WHERE ak.status = true ORDER BY random() LIMIT 10
  `));
  for (const k of activeKeys.rows) {
    await db.execute(sql.raw(`
      INSERT INTO "key_quotas" (api_key_id, quota_amount, used_amount, alert_percent, period_start, period_end)
      VALUES (${k.id}, '${(Math.random() * 1000 + 100).toFixed(6)}',
        '${(Math.random() * 500).toFixed(6)}', 80,
        NOW() - INTERVAL '30 days', NOW() + INTERVAL '30 days')
    `));
  }
  console.log(`  ✅ 10 条 Key 级额度`);

  // 2.3 用户总/Key 额度（补充 non-monthly 类型）
  console.log("\n[2.3] 补充 non-monthly 额度...");
  const quotaUsers = await db.execute(sql.raw(`
    SELECT id FROM "users" WHERE status = 'active' ORDER BY random() LIMIT 10
  `));
  const quotaTypes = ['total', 'per_key'];
  let quotaCount = 0;
  for (const u of quotaUsers.rows) {
    const qt = quotaTypes[Math.floor(Math.random() * quotaTypes.length)];
    const amt = (Math.random() * 5000 + 500).toFixed(6);
    await db.execute(sql.raw(`
      INSERT INTO "user_quotas" (user_id, quota_type, quota_amount, used_amount, alert_percent,
        period_start, period_end, set_by, set_by_role, reason)
      VALUES (${u.id}, '${qt}', '${amt}', '${(Math.random() * parseFloat(amt) * 0.7).toFixed(6)}',
        80, NOW() - INTERVAL '30 days', NOW() + INTERVAL '30 days',
        1, 'admin', '${['运营配额的', '促销活动', '客户关怀'][Math.floor(Math.random() * 3)]}')
    `));
    quotaCount++;
  }
  console.log(`  ✅ ${quotaCount} 条 non-monthly 额度`);

  // 2.4 通知补全（第二轮 - 给所有活跃用户发一条）
  console.log("\n[2.4] 批量通知...");
  // 给有代理角色的用户发系统通知
  const agentUsersForNotif = await db.execute(sql.raw(`
    SELECT u.id FROM "users" u JOIN agents a ON u.id = a.user_id WHERE u.status = 'active'
  `));
  for (const au of agentUsersForNotif.rows) {
    await db.execute(sql.raw(`
      INSERT INTO "user_notifications" (user_id, type, title, content, created_at)
      VALUES (${au.id}, 'system_announcement', '代理商月报已生成',
        '您本月的佣金报表已生成，请登录后台查看详情。', NOW() - INTERVAL '1 day')
    `));
  }
  console.log(`  ✅ ${agentUsersForNotif.rows.length} 条代理商通知`);

  // 2.5 兑换码使用 + 日志
  console.log("\n[2.5] 兑换码使用...");
  const unusedCodes = await db.execute(sql.raw(`
    SELECT rc.id, rc.code, rc.amount, rc.batch_id, rb.creator_id
    FROM "redemption_codes" rc
    JOIN "redemption_batches" rb ON rc.batch_id = rb.id
    WHERE rc.status = 'unused'
    LIMIT 30
  `));
  const redeemUsers = await db.execute(sql.raw(`
    SELECT id FROM "users" WHERE status = 'active' ORDER BY random() LIMIT 15
  `));
  let usedCount = 0;
  for (const code of unusedCodes.rows) {
    const ru = redeemUsers.rows[usedCount % redeemUsers.rows.length];
    const daysAgo = Math.floor(Math.random() * 10);
    // 更新 code 状态
    await db.execute(sql.raw(`
      UPDATE "redemption_codes"
      SET status = 'used', used_at = NOW() - INTERVAL '${daysAgo} days'
      WHERE id = ${code.id}
    `));
    // redemption_logs
    await db.execute(sql.raw(`
      INSERT INTO "redemption_logs" (code_id, user_id, amount, batch_id, ip, created_at)
      VALUES (${code.id}, ${ru.id}, '${code.amount}', ${code.batch_id},
        '${['114.114.114.114', '203.0.113.42', '198.51.100.7'][Math.floor(Math.random() * 3)]}',
        NOW() - INTERVAL '${daysAgo} days')
    `));
    // 加余额
    await db.execute(sql.raw(`
      UPDATE "users" SET balance = balance + '${code.amount}' WHERE id = ${ru.id}
    `));
    // balance_logs
    await db.execute(sql.raw(`
      INSERT INTO "balance_logs" (user_id, amount, balance_after, type, description, created_at)
      VALUES (${ru.id}, '${code.amount}',
        (SELECT balance FROM "users" WHERE id = ${ru.id}),
        'redemption_refund', '兑换码 ${code.code} 激活 ¥${code.amount}',
        NOW() - INTERVAL '${daysAgo} days')
    `));
    // 更新 batch used count
    await db.execute(sql.raw(`
      UPDATE "redemption_batches" SET used_count = used_count + 1 WHERE id = ${code.batch_id}
    `));
    usedCount++;
  }
  console.log(`  ✅ ${usedCount} 个兑换码已使用 + 日志生成`);

  // 2.6 系统公告
  console.log("\n[2.6] 补充系统公告...");
  const announcements = [
    { title: '【维护通知】系统升级维护', content: '平台将于本周末凌晨进行数据库升级，预计影响时间为 2 小时。', type: 'maintenance', priority: 1 },
    { title: '【新功能】代理商管理后台已上线', content: '代理商用户现在可以在后台查看佣金报表、管理客户和发起提现。', type: 'new_feature', priority: 0 },
    { title: '【更新】价格调整公告', content: '自下月起，部分模型价格将进行调整，具体方案请查看价格页面。', type: 'policy', priority: 2 },
    { title: '【活动】新用户充值赠金', content: '新注册用户充值任意金额即赠 10% 额外额度，活动截止本月底。', type: 'promotion', priority: 0 },
    { title: '【通知】HTTPS 证书升级', content: '平台已完成 SSL 证书升级，即日起所有接口强制 HTTPS。请更新您的客户端配置。', type: 'system_announcement', priority: 0 },
  ];
  for (let i = 0; i < announcements.length; i++) {
    const a = announcements[i];
    const daysAgo = Math.floor(Math.random() * 20) + 1;
    await db.execute(sql.raw(`
      INSERT INTO "announcements" (title, content, type, status, priority, created_by, created_at, updated_at)
      VALUES ('${a.title}', '${a.content}', '${a.type}', true, ${a.priority}, 1,
        NOW() - INTERVAL '${daysAgo} days', NOW() - INTERVAL '${daysAgo} days')
    `));
  }
  console.log(`  ✅ ${announcements.length} 条公告`);

  // ── 汇总 ────────────────────────────────────────────
  console.log("\n\n");
  console.log("┌──────────────────────────────────────────────┐");
  console.log("│  生产数据填充完成                              │");
  console.log("│                                              │");
  console.log("│  Phase 1:  用户余额 + 折扣 + 提现 + 通知      │");
  console.log("│            白名单 + 备注 + 页面内容            │");
  console.log("│  Phase 2A: 代理层级 + 佣金 + 消费 + Key       │");
  console.log("│            充值双审                           │");
  console.log("│  Phase 2:  Key 多样性 + 额度 + 兑换码 + 公告   │");
  console.log("└──────────────────────────────────────────────┘");

  await closeDb();
}

main().catch((e) => {
  console.error("❌ 脚本执行失败:", e);
  process.exit(1);
});
