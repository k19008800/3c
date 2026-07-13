#!/usr/bin/env tsx
console.log("=== 3cloud V2 测试数据填充种子 ===");

import { getDb, createDb } from "../index.js";
import { sql } from "drizzle-orm";
import { users, agents, vendors, models, vendorModels } from "../schema.js";

async function run() {
  await createDb();
  const db = getDb();

  // ── 1. 查找现有数据 ──
  const allUsers = await db.select({ id: users.id, email: users.email, role: users.role }).from(users).limit(10);
  const allAgents = await db.select({ id: agents.id, userId: agents.userId }).from(agents).limit(5);
  const allVendors = await db.select({ id: vendors.id, name: vendors.name }).from(vendors).limit(10);
  const allModels = await db.select({ id: models.id, name: models.name, type: models.type }).from(models).limit(10);
  const allVm = await db.select({ id: vendorModels.id, vendorId: vendorModels.vendorId, modelId: vendorModels.modelId, weight: vendorModels.weight }).from(vendorModels).limit(10);

  // 找非 agent 的普通用户
  const normalUser = allUsers.find(u => u.role === 'user');
  const agentUser = allUsers.find(u => u.role === 'agent');
  const adminUser = allUsers.find(u => ['super_admin', 'admin'].includes(u.role)) || allUsers[0];
  const firstAgent = allAgents[0];
  const firstVendor = allVendors[0];
  const firstVm = allVm[0];
  const secondVm = allVm[1];
  const thirdVm = allVm[2];

  const targetUser = normalUser || allUsers[0];
  const targetAgent = agentUser || allUsers[0];

  console.log(`\n选定: 用户 #${targetUser.id} [${targetUser.role}], 代理商 #${targetAgent.id}, 管理员 #${adminUser.id}`);

  // ── 2. 兑换码 ──
  console.log("\n--- 兑换码 ---");
  await db.execute(sql`
    INSERT INTO redemption_batches (creator_id, name, amount, total_count, used_count, status, note)
    VALUES (${targetAgent.id}, '新用户推广礼包', 10.000000, 100, 0, 'active', '2026年7月新用户注册送10元')
  `);
  await db.execute(sql`
    INSERT INTO redemption_batches (creator_id, name, amount, total_count, used_count, status, note)
    VALUES (${adminUser.id}, '管理员测试批次', 50.000000, 20, 2, 'active', '管理员内部测试')
  `);
  console.log("   redemption_batches: 2条");

  // 用随机码插入
  function randCode() { return Array.from({length:16},()=>"ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random()*32)]).join(""); }

  // 第一批次码
  for (let i = 0; i < 5; i++) {
    await db.execute(sql`
      INSERT INTO redemption_codes (batch_id, code, amount, uses_left, status)
      VALUES (1, ${randCode()}, 10.000000, ${i === 0 ? 0 : 1}, ${i === 0 ? 'used' : 'unused'})
    `);
  }
  // 第二批次码
  for (let i = 0; i < 3; i++) {
    await db.execute(sql`
      INSERT INTO redemption_codes (batch_id, code, amount, uses_left, status)
      VALUES (2, ${randCode()}, 50.000000, 1, 'unused')
    `);
  }
  console.log("   redemption_codes: 8条");

  // 兑换记录
  await db.execute(sql`
    INSERT INTO redemption_logs (code_id, user_id, amount)
    VALUES (1, ${targetUser.id}, 10.000000)
  `);
  await db.execute(sql`
    INSERT INTO redemption_logs (code_id, user_id, amount)
    VALUES (2, ${targetUser.id}, 10.000000)
  `);
  console.log("   redemption_logs: 2条");

  // ── 3. 管理 API Key ──
  console.log("\n--- 管理 API Key ---");
  // 生成 sha256 伪哈希
  function fakeHash() { return Array.from({length:64},()=>"0123456789abcdef"[Math.floor(Math.random()*16)]).join(""); }

  await db.execute(sql`
    INSERT INTO admin_api_keys (name, key_hash, key_prefix, permissions, created_by)
    VALUES ('运维只读Key', ${fakeHash()}, 'adm_', '["users:read","vendors:read","stats:read"]'::jsonb, ${adminUser.id})
  `);
  await db.execute(sql`
    INSERT INTO admin_api_keys (name, key_hash, key_prefix, permissions, created_by)
    VALUES ('财务查询Key', ${fakeHash()}, 'fin_', '["finance:read","stats:read"]'::jsonb, ${adminUser.id})
  `);
  await db.execute(sql`
    INSERT INTO admin_api_keys (name, key_hash, key_prefix, permissions, status, created_by)
    VALUES ('全权限管理Key', ${fakeHash()}, 'god_', '["*:*"]'::jsonb, true, ${adminUser.id})
  `);
  console.log("   admin_api_keys: 3条");

  // 使用日志
  await db.execute(sql`
    INSERT INTO admin_key_usage_logs (key_id, method, path, ip, status_code, duration_ms)
    VALUES (1, 'GET', '/api/v1/admin/users', '192.168.1.100', 200, 45)
  `);
  await db.execute(sql`
    INSERT INTO admin_key_usage_logs (key_id, method, path, ip, status_code, duration_ms)
    VALUES (1, 'GET', '/api/v1/admin/vendors', '192.168.1.100', 200, 32)
  `);
  console.log("   admin_key_usage_logs: 2条");

  // ── 4. 用户额度 ──
  console.log("\n--- 用户额度 ---");
  await db.execute(sql`
    INSERT INTO user_quotas (user_id, quota_type, quota_amount, used_amount, alert_percent, set_by, set_by_role, reason)
    VALUES (${targetUser.id}, 'monthly', 200.000000, 45.320000, 80, ${adminUser.id}, 'admin', '个人用户月额度')
  `);
  await db.execute(sql`
    INSERT INTO user_quotas (user_id, quota_type, quota_amount, used_amount, alert_percent, set_by, set_by_role, reason)
    VALUES (${targetAgent.id}, 'monthly', 500.000000, 412.880000, 90, ${adminUser.id}, 'admin', '代理商月度额度（已接近上限）')
  `);
  console.log("   user_quotas: 2条");

  // ── 5. 熔断器状态 ──
  console.log("\n--- 熔断器状态 ---");
  if (firstVm) {
    await db.execute(sql`
      UPDATE vendor_models
      SET circuit_state = 'half_open', circuit_fail_count = 8, circuit_opened_at = NOW() - INTERVAL '5 minutes', is_down = true
      WHERE id = ${firstVm.id}
    `);
    console.log(`   VM #${firstVm.id}: half_open (8次失败)`);
    await db.execute(sql`
      INSERT INTO circuit_history (vendor_model_id, from_state, to_state, reason)
      VALUES (${firstVm.id}, 'closed', 'half_open', '连续8次调用超时,触发二级熔断')
    `);
  }
  if (secondVm) {
    await db.execute(sql`
      UPDATE vendor_models
      SET circuit_state = 'closed', circuit_fail_count = 0, is_down = false
      WHERE id = ${secondVm.id}
    `);
    console.log(`   VM #${secondVm.id}: closed (正常)`);
  }
  if (thirdVm && thirdVm.id !== firstVm?.id && thirdVm.id !== secondVm?.id) {
    await db.execute(sql`
      UPDATE vendor_models
      SET circuit_state = 'dead', circuit_fail_count = 15, circuit_opened_at = NOW() - INTERVAL '30 minutes', is_down = true
      WHERE id = ${thirdVm.id}
    `);
    console.log(`   VM #${thirdVm.id}: dead (永久熔断)`);
    await db.execute(sql`
      INSERT INTO circuit_history (vendor_model_id, from_state, to_state, reason)
      VALUES (${thirdVm.id}, 'half_open', 'dead', '半开探测3次全部失败,触发三级永久熔断')
    `);
  }
  console.log("   circuit_history: 2条");

  // ── 6. 供应商 API Key ──
  if (firstVendor) {
    await db.execute(sql`
      INSERT INTO vendor_api_keys (vendor_id, key_hash, key_prefix, permissions, status)
      VALUES (${firstVendor.id}, ${fakeHash()}, 'vndr_', '["vendor:*"]'::jsonb, true)
    `);
    console.log(`\n--- 供应商 API Key ---`);
    console.log(`   供应商 #${firstVendor.id} "${firstVendor.name}": 已创建`);
  }

  // ── 7. 通知 ──
  console.log("\n--- 通知 ---");
  const notifs = [
    { type: 'quota_warning', title: '额度告警', content: `您的月度额度已使用超过80%，当前已用 ¥412.88/¥500.00` },
    { type: 'balance_low', title: '余额不足', content: `您的账户余额 ¥2.50 已不足 ¥10.00，请及时充值` },
    { type: 'redemption_success', title: '兑换码兑换成功', content: '成功兑换 ¥10.00 到账户余额' },
    { type: 'system', title: '新模型上线', content: '平台已支持 Rerank 模型，欢迎使用' },
    { type: 'system_announcement', title: '系统维护通知', content: '本周日凌晨 2:00-4:00 将进行系统升级维护' },
    { type: 'withdraw_result', title: '提现审核通过', content: '您申请的 ¥500.00 提现已审核通过，预计 1-3 个工作日到账' },
    { type: 'commission_settled', title: '佣金结算', content: '您 2026年7月 的佣金 ¥1,234.56 已结算' },
  ];
  for (const n of notifs) {
    if (n.type === 'system' || n.type === 'system_announcement') {
      await db.execute(sql`
        INSERT INTO user_notifications (user_id, type, title, content, read_at)
        VALUES (${targetUser.id}, ${n.type}, ${n.title}, ${n.content}, NOW())
      `);
    } else {
      await db.execute(sql`
        INSERT INTO user_notifications (user_id, type, title, content)
        VALUES (${targetUser.id}, ${n.type}, ${n.title}, ${n.content})
      `);
    }
  }
  console.log(`   user_notifications: ${notifs.length}条`);

  // ── 8. 验证 ──
  console.log("\n========================================");
  console.log("📊 验证新表数据");
  console.log("========================================");
  const tables = [
    "redemption_batches", "redemption_codes", "redemption_logs",
    "admin_api_keys", "admin_key_usage_logs",
    "user_quotas", "key_quotas",
    "circuit_history", "vendor_api_keys"
  ];
  for (const t of tables) {
    const r = await db.execute(sql`SELECT count(*)::int as c FROM ${sql.identifier(t)}`);
    const row0 = r.rows[0] as Record<string, unknown>;
    const icon = Number(row0.c) > 0 ? "✅" : "⚠️";
    console.log(`   ${icon} ${t}: ${row0.c} 条`);
  }
  const r2 = await db.execute(sql`SELECT count(*)::int as c FROM user_notifications WHERE created_at > NOW() - INTERVAL '1 hour'`);
  const r2row = r2.rows[0] as Record<string, unknown>;
  console.log(`   ✅ user_notifications(新): ${r2row.c} 条`);

  console.log("\n🎉 测试数据填充完成！");
  process.exit(0);
}
run().catch(e => { console.error("❌ 失败:", e.message, e.stack); process.exit(1); });
