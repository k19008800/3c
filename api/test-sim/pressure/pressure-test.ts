// ============================================================
//  3cloud (3C) — 8小时压力模拟测试 v2
//
//  执行: npx tsx test-sim/pressure/pressure-test.ts
//
//  架构:
//  0. 设置 (t=0~45min)  — 管理员登录 + 注册N个测试用户 + API Key + 实名
//  1. 充值 (t=45~75min) — 每位用户充值1次(≤300元)，系统双审
//  2. Token 调度 (t=75min~7h) — 负荷曲线驱动，高低峰谷
//  3. 代理商 (t=7h~8h)     — 佣金核对 + 提现 + 结算验证
// --------------------------------------------------------------
//  负荷曲线: 低(15%) → 中低(30%) → 低(25%) → 中(60%) →
//            高峰(95%) → 中高(70%) → 中低(40%)
//  调用记录: 全量通过真实代理路由，call_logs + balance_logs 自动生成
//  结算验证: 最终阶段对账 call_logs / balance_logs / commission_logs
// ============================================================

import "dotenv/config";
import { PRESSURE_CONFIG, formatElapsed, getLoadIntensity } from "./pressure-config.js";
import { PressureApiClient } from "./api-client.js";
import { createState, logState, saveState, generateFinalReport, TestState, TestUser, TestAgent } from "./state.js";
import { generateTestIdNumber } from "../utils/data-gen.js";
import fs from "node:fs";

// ── 工具 ──

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function elapsed(state: TestState): number {
  return Date.now() - state.startTime;
}

function minToMs(m: number): number { return m * 60 * 1000; }

function recordError(state: TestState, phase: string, user: string, error: string) {
  state.errors.push({ time: formatElapsed(elapsed(state)), phase, user, error: error.slice(0, 200) });
  if (state.errors.length > 200) state.errors.splice(0, 100);
}

function extractList(data: any): any[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.list)) return data.list;
  if (Array.isArray(data.rows)) return data.rows;
  return [];
}

function nowUnix(): string {
  return new Date().toISOString();
}

// ── 阶段 0: 设置 ──

async function phaseSetup(client: PressureApiClient, state: TestState): Promise<boolean> {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  🚀 [阶段 0/4] 设置 — 初始化 + 注册用户 + API Key + 实名");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const PASSWORD = "TestPass123";
  const USER_COUNT = PRESSURE_CONFIG.userCount;

  // 0.1 管理员登录
  try {
    const res = await client.login(PRESSURE_CONFIG.admin.email, PRESSURE_CONFIG.admin.password);
    state.adminToken = res.data.accessToken;
    console.log(`  ✅ 管理员: ${PRESSURE_CONFIG.admin.email} (role=${res.data.user.role})`);
  } catch (err: any) {
    console.error(`  ❌ 管理员登录: ${err.message}`);
    return false;
  }

  // 0.2 注册用户 + API Key + 提交实名（待管理员统一审核）
  console.log(`  注册 ${USER_COUNT} 个用户...`);
  const registered: Array<{ userId: number; email: string; token: string }> = [];

  for (let i = 1; i <= USER_COUNT; i++) {
    const isPersonal = i <= USER_COUNT * 0.5;
    const email = `pload-${isPersonal ? "p" : "e"}${String(i).padStart(2, "0")}@test.local`;

    try {
      let userToken: string;
      let userId: number;

      try {
        const loginRes = await client.login(email, PASSWORD);
        userToken = loginRes.data.accessToken;
        userId = loginRes.data.user.id;
      } catch {
        const regRes = await client.register(email, PASSWORD);
        userToken = regRes.data.accessToken;
        userId = regRes.data.user.id;
      }

      registered.push({ userId, email, token: userToken });

      // 创建 API Key
      let apiKey = "", apiKeyId = 0;
      try {
        const keyRes = await client.createApiKey(userToken, "load-test");
        apiKey = keyRes.data.key;
        apiKeyId = keyRes.data.id;
      } catch {}

      // 提交实名（个人用有效身份证号，企业用模拟信息）
      try {
        if (isPersonal) {
          await client.submitRealNamePersonal(userToken, `用户${i}`, generateTestIdNumber());
        } else {
          await client.submitRealNameEnterprise(userToken, `压力测试企业${i}`, `91${randInt(100000, 999999)}XXXXXX`);
        }
      } catch (e: any) {
        if (!e.message.includes("已提交") && !e.message.includes("重复")) {
          console.error(`  ⚠️  ${email} 实名提交: ${e.message.slice(0, 60)}`);
        }
      }

      let realNameStatus = "unverified";
      try {
        const rnRes = await client.getRealNameStatus(userToken);
        realNameStatus = rnRes.data.status || "unverified";
      } catch {}

      const tu: TestUser = {
        userId, email,
        userType: isPersonal ? "personal" : "enterprise",
        role: "user", realNameStatus,
        accessToken: userToken, apiKey, apiKeyId,
        recharged: false, realNameResolved: false,
      };
      state.allUsers.push(tu);
      if (isPersonal) state.personalUsers.push(tu);
      else state.enterpriseUsers.push(tu);
    } catch (err: any) {
      console.error(`  ⚠️  ${email}: ${err.message.slice(0, 60)}`);
    }

    if (i % 10 === 0) console.log(`    进度: ${i}/${USER_COUNT}`);
  }

  console.log(`  ✅ 用户: ${state.allUsers.length} 个 (个人 ${state.enterpriseUsers.length} + 企业 ${state.personalUsers.length})`);

  if (state.allUsers.length === 0) return false;

  // 0.3 管理员批量审核实名
  console.log("  管理员批量审核实名...");
  try {
    const revRes = await client.adminListReviews(state.adminToken);
    const reviews = extractList(revRes.data);
    let approved = 0;
    for (const r of reviews) {
      if (r.status === "pending_review") {
        try {
          await client.adminReviewAction(state.adminToken, r.id, "approve");
          approved++;
        } catch {}
      }
    }
    console.log(`  实名审核通过: ${approved} 个`);

    // 更新 state 中的实名状态
    for (const u of state.allUsers) {
      try {
        const rnRes = await client.getRealNameStatus(u.accessToken);
        if (rnRes.data?.status === "approved") {
          u.realNameStatus = "approved";
          u.realNameResolved = true;
        }
      } catch {}
    }
  } catch (err: any) {
    console.error(`  ⚠️  实名审核: ${err.message}`);
  }

  // 0.4 发现代理商
  try {
    const aRes = await client.jsonRequest<any>("GET", "/api/v1/admin/agents?pageSize=100", undefined, state.adminToken);
    const agents = extractList(aRes.data);
    for (const a of agents) {
      const u = state.allUsers.find((u_) => u_.userId === a.userId);
      if (u) {
        const ta: TestAgent = {
          agentId: a.id, userId: a.userId, email: u.email, role: "agent",
          accessToken: u.accessToken, parentAgentId: a.parentAgentId,
          clients: [], commissionChecked: false, withdrawalDone: false,
        };
        try {
          const clRes = await client.agentClients(u.accessToken);
          ta.clients = extractList(clRes.data).map((c: any) => c.userId || c.clientUserId);
        } catch {}
        state.agents.push(ta);
      }
    }
    console.log(`  代理商: ${state.agents.length} 个`);
  } catch (err: any) {
    console.log(`  ⚠️  代理商查询: ${err.message}`);
  }

  return true;
}

// ── 阶段 1: 充值 ──

async function phaseRecharge(client: PressureApiClient, state: TestState): Promise<void> {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  🚀 [阶段 1/4] 充值 — 每位用户充值1次(≤300元) + 双审");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const users = state.allUsers;
  if (users.length === 0) return;

  console.log(`  发起充值 ${users.length} 笔...`);
  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const amount = randInt(1, 300);

    try {
      if (Math.random() < PRESSURE_CONFIG.recharge.bankTransferRatio) {
        const res = await client.submitBankTransfer(user.accessToken, amount);
        user.rechargeOrderNo = res.data.orderNo;
        user.rechargeAmount = amount;
      } else {
        const res = await client.createRechargeOrder(user.accessToken, amount);
        user.rechargeOrderNo = res.data.orderNo;
        user.rechargeAmount = amount;
        await client.rechargeNotify(res.data.orderNo, `CH${randInt(1000000, 9999999)}`, String(amount));
      }
      user.recharged = true;
      state.totalRecharges++;
    } catch (err: any) {
      recordError(state, "充值", user.email, err.message);
    }
    if ((i + 1) % 10 === 0) console.log(`    进度: ${i + 1}/${users.length}`);
  }
  console.log(`  ✅ 充值: ${state.totalRecharges} 笔`);

  // 等待 + 审核
  await sleep(15000);
  console.log("  管理端审核...");
  try {
    for (const status of ["paid", "pending"]) {
      const ordersRes = await client.jsonRequest<any>("GET",
        `/api/v1/admin/recharge-orders?pageSize=200&status=${status}`, undefined, state.adminToken);
      const orders = extractList(ordersRes.data);
      if (orders.length === 0) continue;

      let f1 = 0, f2 = 0;
      for (const o of orders) {
        try {
          await client.adminFirstConfirmRecharge(state.adminToken, o.id);
          f1++;
          if (Math.random() < 0.95) {
            await client.adminSecondConfirmRecharge(state.adminToken, o.id);
            f2++;
            state.totalRechargeApproved++;
          }
        } catch {}
      }
      console.log(`  ${status}: 一审 ${f1} | 二审 ${f2}`);
    }
  } catch (err: any) {
    console.error(`  ⚠️  审核: ${err.message}`);
  }
  state.phaseRechargeDone = true;
}

// ── 阶段 2: Token 调用调度（负荷曲线驱动）──

async function phaseTokenCalls(client: PressureApiClient, state: TestState): Promise<void> {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  🚀 [阶段 2/4] Token 调度 — 负荷曲线驱动高低峰谷");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const users = state.allUsers.filter((u) => u.apiKey);
  if (users.length === 0) { console.log("  ❌ 无可用用户"); return; }

  state.phaseTokenCallsInProgress = true;
  const model = PRESSURE_CONFIG.tokenCalls.model;
  const messages = PRESSURE_CONFIG.tokenCalls.messages;
  const maxConcurrency = PRESSURE_CONFIG.maxConcurrency;

  // 为每位用户分配 50~90分钟的调用窗口
  const phase2StartMs = 75 * 60 * 1000;  // 75min
  const phase2DurationMs = (7 * 60 - 75) * 60 * 1000; // ~345min
  const minWindowMs = 50 * 60 * 1000;
  const maxWindowMs = 90 * 60 * 1000;

  for (const user of users) {
    const windowMs = minWindowMs + Math.random() * (maxWindowMs - minWindowMs);
    const windowStart = phase2StartMs + Math.random() * (phase2DurationMs - windowMs);
    user.callWindowStart = windowStart;
    user.callWindowEnd = windowStart + windowMs;
  }

  // 按窗口开始排序输出摘要
  const sorted = [...users].sort((a, b) => (a.callWindowStart || 0) - (b.callWindowStart || 0));
  console.log(`  用户窗口分布:`);
  const windowCountPerSegment = 5;
  for (let i = 0; i < sorted.length; i += windowCountPerSegment) {
    const seg = sorted.slice(i, i + windowCountPerSegment);
    const start = formatElapsed(seg[0].callWindowStart || 0);
    const end = formatElapsed(seg[seg.length - 1].callWindowEnd || 0);
    console.log(`    [${seg[0].email.slice(0, 20)}~${seg[seg.length - 1].email.slice(-10)}] ${start} → ${end}`);
  }

  // ── 主调度循环 ──
  let lastLogTime = 0;
  let lastStateSave = 0;

  // 持续追踪需要实名认证的用户
  const needRealName: Set<string> = new Set();

  while (true) {
    const now = elapsed(state);
    const nowMin = now / 60000;

    // 检查结束条件
    if (nowMin > 7 * 60) { console.log("\n  ⏰ 调度窗口结束"); break; }
    if (now > PRESSURE_CONFIG.testDurationMs) { console.log("\n  ⏰ 测试结束"); break; }

    // 当前负荷强度
    const intensity = getLoadIntensity(now);

    // 找出当前窗口内的活跃用户
    const active = sorted.filter(
      (u) => now >= (u.callWindowStart || 0) && now < (u.callWindowEnd || 0)
    );

    // 根据负荷强度选择实际参与调度的用户数
    const targetActive = Math.max(1, Math.floor(active.length * intensity));
    const participants = active.slice(0, Math.min(targetActive, maxConcurrency));

    if (participants.length > 0) {
      const results = await Promise.allSettled(
        participants.map(async (user) => {
          const msg = messages[Math.floor(Math.random() * messages.length)];
          const chat = await client.chatCompletion(user.apiKey, model, [msg]);
          state.totalTokenCalls++;

          if (chat.ok) {
            state.totalTokenCallsSucceeded++;
          } else {
            state.totalTokenCallsFailed++;
            const errMsg = chat.body?.error?.message || "";

            if (errMsg.includes("实名")) {
              state.totalUnverifiedDetected++;
              if (!user.realNameResolved && !needRealName.has(user.email)) {
                needRealName.add(user.email);
              }
            }
          }
        })
      );

      // 批量实名处理（合并处理减少请求）
      if (needRealName.size > 0) {
        for (const email of needRealName) {
          const u = users.find((u_) => u_.email === email);
          if (!u || u.realNameResolved) continue;

          try {
            // 提交实名
            if (u.userType === "personal") {
              await client.submitRealNamePersonal(u.accessToken, `用户${u.userId}`, generateTestIdNumber());
            } else {
              await client.submitRealNameEnterprise(u.accessToken, `企业${u.userId}`, `91${randInt(100000, 999999)}XXXXXX`);
            }

            // 管理员通过审核
            const revRes = await client.adminListReviews(state.adminToken);
            const revs = extractList(revRes.data);
            for (const r of revs) {
              if ((r.email === u.email || r.userId === u.userId) && r.status === "pending_review") {
                await client.adminReviewAction(state.adminToken, r.id, "approve");
                u.realNameResolved = true;
                state.totalAutoReviewed++;
                console.log(`  ✅ 实名通过: ${u.email}`);
                break;
              }
            }
          } catch (e: any) {
            recordError(state, "实名处理", u.email, e.message);
          }
        }
        needRealName.clear();
      }
    }

    // 定期日志
    const timeSinceLog = Date.now() - lastLogTime;
    if (timeSinceLog > PRESSURE_CONFIG.logIntervalSec * 1000) {
      lastLogTime = Date.now();
      const activeCount = active.length;
      const callRate = state.totalTokenCalls / (now / 3600000);
      console.log(`  📊 [${formatElapsed(now)}] 负荷=${(intensity * 100).toFixed(0)}% | ` +
        `活跃=${activeCount} | 并发=${participants.length} | ` +
        `调用=${state.totalTokenCalls} | 速率=${callRate.toFixed(0)}/h`);
    }

    // 定期保存状态
    if (Date.now() - lastStateSave > PRESSURE_CONFIG.stateSaveIntervalMs) {
      lastStateSave = Date.now();
      saveState(state);
    }

    // 动态休眠（负荷越高、调用越快）
    const sleepMs = Math.max(200, PRESSURE_CONFIG.baseCallIntervalMs / Math.max(1, participants.length * intensity));
    await sleep(sleepMs);
  }

  state.phaseTokenCallsInProgress = false;
}

// ── 阶段 3: 代理商 + 结算验证 ──

async function phaseAgentAndSettlement(client: PressureApiClient, state: TestState): Promise<void> {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  🚀 [阶段 3/4] 代理商佣金 + 提现 + 结算验证");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // ── 3.1 佣金核对 ──
  console.log("  佣金核对...");
  for (const agent of state.agents) {
    try {
      const dashRes = await client.agentDashboard(agent.accessToken);
      const commRes = await client.agentCommissions(agent.accessToken);
      const commissions = extractList(commRes.data);

      let pendingAmt = 0, settledAmt = 0;
      for (const c of commissions) {
        const amt = parseFloat(c.commission_amount || c.amount || "0");
        if (c.status === "pending") pendingAmt += amt;
        if (c.status === "settled") settledAmt += amt;
      }

      console.log(`  · ${agent.email}: ${commissions.length} 条 (待=${pendingAmt.toFixed(4)} 已=${settledAmt.toFixed(4)})`);
      agent.commissionChecked = true;
    } catch (err: any) {
      recordError(state, "佣金核对", agent.email, err.message);
    }
  }

  // ── 3.2 批量结算佣金 ──
  console.log("\n  批量结算佣金...");
  try {
    await client.adminSettleCommissions(state.adminToken);
    console.log("  ✅ 佣金结算完成");
  } catch (err: any) {
    console.log(`  ⚠️  ${err.message.slice(0, 80)}`);
  }
  await sleep(5000);

  // ── 3.3 代理商提现 ──
  console.log("\n  代理商提现...");
  for (const agent of state.agents) {
    try {
      const commRes = await client.agentCommissions(agent.accessToken, "settled");
      const list = extractList(commRes.data);
      let available = 0;
      for (const c of list) available += parseFloat(c.commission_amount || c.amount || "0");

      if (available >= 50) {
        const amt = Math.min(Math.max(Math.floor(available * 0.5), 100), 5000);
        await client.agentWithdraw(agent.accessToken, amt);
        state.totalCommissionWithdrawals++;
        state.totalCommissionWithdrawalAmount += amt;
        console.log(`  ✅ ${agent.email} 提现 ${amt} 元`);
      } else {
        try {
          await client.agentWithdraw(agent.accessToken, 50);
          state.totalCommissionWithdrawals++;
          state.totalCommissionWithdrawalAmount += 50;
        } catch {
          console.log(`  ⚪ ${agent.email} 无可提现佣金`);
        }
      }
      agent.withdrawalDone = true;
    } catch (err: any) {
      recordError(state, "提现", agent.email, err.message);
    }
    await sleep(2000);
  }

  // ── 3.4 提现审核 ──
  console.log("\n  提现审核...");
  try {
    const wdRes = await client.jsonRequest<any>("GET", "/api/v1/admin/withdraws?pageSize=100", undefined, state.adminToken);
    const wdList = extractList(wdRes.data);
    let f1 = 0, f2 = 0, paid = 0;
    for (const wd of wdList) {
      if (wd.status === "pending_first_review" || wd.status === "pending_second_review") {
        try {
          if (wd.status === "pending_first_review" || Math.random() < 0.5) {
            await client.adminFirstReviewWithdraw(state.adminToken, wd.id);
            f1++;
          }
          await client.adminSecondReviewWithdraw(state.adminToken, wd.id);
          f2++;
          await sleep(500);
          await client.adminMarkWithdrawPaid(state.adminToken, wd.id);
          paid++;
        } catch {}
      }
    }
    console.log(`  审核: 一审 ${f1} | 二审 ${f2} | 打款 ${paid}`);
  } catch (err: any) {
    console.error(`  ⚠️  审核: ${err.message}`);
  }

  // ── 3.5 结算验证 ──
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  🧾 结算验证 — 核对调度记录与资金流水");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  try {
    const { createDb, closeDb } = await import("../../src/db/index.js");
    const { sql } = await import("drizzle-orm");
    const db = createDb();

    // 验证 call_logs
    const callCount = await db.execute(sql.raw(`
      SELECT count(*) as cnt,
             sum(CASE WHEN status='success' THEN 1 ELSE 0 END) as success,
             sum(CASE WHEN status='failed' THEN 1 ELSE 0 END) as fail,
             sum(total_tokens) as total_tokens,
             sum(cost) as total_cost
      FROM call_logs
      WHERE created_at >= now() - interval '8 hours'
    `));
    const cc = (callCount as any).rows?.[0] || {};
    console.log(`  📞 调用记录 (8h内):`);
    console.log(`     总次数: ${cc.cnt || 0}`);
    console.log(`     成功: ${cc.success || 0} | 失败: ${cc.fail || 0}`);
    console.log(`     总Token: ${cc.total_tokens || 0}`);
    console.log(`     总费用: ¥${parseFloat(cc.total_cost || "0").toFixed(6)}`);

    // 验证 balance_logs
    const balCount = await db.execute(sql.raw(`
      SELECT count(*) as cnt,
             sum(CASE WHEN type='recharge' THEN amount ELSE 0 END) as recharge_total,
             sum(CASE WHEN type='consumption' THEN amount ELSE 0 END) as consumption_total
      FROM balance_logs
      WHERE created_at >= now() - interval '8 hours'
    `));
    const bc = (balCount as any).rows?.[0] || {};
    console.log(`  💰 资金流水 (8h内):`);
    console.log(`     总笔数: ${bc.cnt || 0}`);
    console.log(`     充值总额: ¥${parseFloat(bc.recharge_total || "0").toFixed(2)}`);
    console.log(`     消费总额: ¥${parseFloat((bc.consumption_total || "0") * -1).toFixed(6)}`);

    // 验证 commission_logs
    const commCount = await db.execute(sql.raw(`
      SELECT count(*) as cnt,
             sum(commission_amount) as total_commission,
             count(distinct agent_id) as agent_count
      FROM commission_logs
      WHERE created_at >= now() - interval '8 hours'
    `));
    const cmc = (commCount as any).rows?.[0] || {};
    console.log(`  💵 佣金记录 (8h内):`);
    console.log(`     总条数: ${cmc.cnt || 0}`);
    console.log(`     佣金总额: ¥${parseFloat(cmc.total_commission || "0").toFixed(6)}`);
    console.log(`     涉及代理商: ${cmc.agent_count || 0} 个`);

    // 验证日汇总
    const dailyRes = await db.execute(sql.raw(`
      SELECT count(*) as cnt FROM commission_daily_rollup
      WHERE report_date = to_char(now(), 'YYYY-MM-DD')
    `));
    const drc = (dailyRes as any).rows?.[0] || {};
    console.log(`  📅 佣金日汇总: ${drc.cnt || 0} 条`);

    // 输出测试统计对账
    const testCalls = state.totalTokenCalls;
    const dbCalls = parseInt(cc.cnt || "0");
    console.log(`  🔄 对账: 测试记录=${testCalls} | 数据库=${dbCalls} | 偏差=${dbCalls - testCalls}`);

    closeDb();
  } catch (err: any) {
    console.error(`  ⚠️  结算验证: ${err.message}`);
  }

  state.phaseAgentTasksDone = true;
}

// ── 主流程 ──

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════╗
║       3cloud (3C) — 8小时压力模拟测试 v2          ║
║       API: ${PRESSURE_CONFIG.apiBase.padEnd(35)}║
║       启动: ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}              ║
║       负荷曲线: 低15% → 30% → 25% → 60% →        ║
║                  高峰95% → 70% → 40%              ║
╚═══════════════════════════════════════════════════╝
  `);

  const client = new PressureApiClient(PRESSURE_CONFIG.apiBase);
  const state = createState();

  // ── 阶段 0: 设置 (t=0~45min) ──
  const setupOk = await phaseSetup(client, state);
  if (!setupOk) process.exit(1);
  saveState(state);

  // ── 等待充值阶段 (t=45min) ──
  const rechargeStartMs = minToMs(45);
  while (elapsed(state) < rechargeStartMs && elapsed(state) < PRESSURE_CONFIG.testDurationMs) {
    await sleep(Math.min(10000, rechargeStartMs - elapsed(state)));
  }

  // ── 阶段 1: 充值 (t=45~75min) ──
  await phaseRecharge(client, state);
  saveState(state);

  // ── 等待 Token 调度阶段 (t=75min) ──
  const tokenStartMs = minToMs(75);
  while (elapsed(state) < tokenStartMs && elapsed(state) < PRESSURE_CONFIG.testDurationMs) {
    await sleep(Math.min(10000, tokenStartMs - elapsed(state)));
  }

  // ── 阶段 2: Token 调度 (t=75min~7h) ──
  await phaseTokenCalls(client, state);
  saveState(state);

  // ── 等待代理商阶段 (t=7h) ──
  const agentStartMs = minToMs(7 * 60);
  while (elapsed(state) < agentStartMs && elapsed(state) < PRESSURE_CONFIG.testDurationMs) {
    await sleep(30000);
    logState(state);
  }

  // ── 阶段 3: 代理商 + 结算 (t=7h~8h) ──
  if (elapsed(state) < PRESSURE_CONFIG.testDurationMs) {
    await phaseAgentAndSettlement(client, state);
    saveState(state);
  }

  // ── 等待结束 ──
  while (elapsed(state) < PRESSURE_CONFIG.testDurationMs) {
    await sleep(60000);
  }

  // ── 最终报告 ──
  console.log(generateFinalReport(state));

  const reportDir = "test-sim/pressure/reports";
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = `${reportDir}/pressure-report-${Date.now()}.md`;
  fs.writeFileSync(reportPath, generateFinalReport(state));
  console.log(`  📄 报告 → ${reportPath}`);

  process.exit(state.errors.length > 50 ? 1 : 0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
