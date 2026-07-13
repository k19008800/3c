// ============================================================
//  阶段 5 - Token 调用调度 (100,000+ 条)
//   直接从 DB 查询真实 model/vendor_model IDs，处理缺失映射
// ============================================================

import { ApiClient } from "../api-client.js";
import { CONFIG } from "../config.js";
import { startPhase, endPhase, VerificationReport, progress, writeCsvReport } from "../utils/verify.js";
import { randInt, weightedPick } from "../utils/data-gen.js";
import type { RegisteredUser } from "./1-register.js";
import type { AgentInfo } from "./4-agent.js";
import { createDb, closeDb } from "../../src/db/index.js";
import { sql } from "drizzle-orm";

const STATUS_DIST: Array<{ value: string; weight: number }> = [
  { value: "success", weight: 88 },
  { value: "failed", weight: 6 },
  { value: "timeout", weight: 4 },
  { value: "cancelled", weight: 2 },
];

export async function phase5Tokens(
  client: ApiClient,
  allUsers: RegisteredUser[],
  agents: AgentInfo[],
): Promise<VerificationReport> {
  startPhase("5: Token 调用调度 (100,000+ 条)");
  const report = new VerificationReport();
  const db = createDb();

  const callUsers = allUsers.slice(0, 20);
  if (callUsers.length === 0) {
    report.add("调用用户", false, "无可用用户");
    closeDb();
    return report;
  }
  console.log(`  调用用户: ${callUsers.length} 个`);

  // ── 从 DB 查询真实模型数据 ──
  const mRes = await db.execute(sql.raw("SELECT id, name FROM models WHERE status = true ORDER BY id"));
  const allDbModels: Array<{ id: number; name: string }> = ((mRes as any).rows || []).map((r: any) => ({ id: r.id, name: r.name }));

  const vmRes = await db.execute(sql.raw("SELECT id, model_id, cost_price_input, cost_price_output, sell_price_input, sell_price_output FROM vendor_models WHERE status = true ORDER BY id"));
  const allDbVms: Array<{ id: number; modelId: number; costIn: number; costOut: number; sellIn: number; sellOut: number }> =
    ((vmRes as any).rows || []).map((r: any) => ({
      id: r.id, modelId: r.model_id,
      costIn: parseFloat(r.cost_price_input || "0"),
      costOut: parseFloat(r.cost_price_output || "0"),
      sellIn: parseFloat(r.sell_price_input || "0"),
      sellOut: parseFloat(r.sell_price_output || "0"),
    }));

  console.log(`  数据库: ${allDbModels.length} 个模型, ${allDbVms.length} 个厂商映射`);

  // 找出有 vendor_model 映射的模型 ID
  const modelIdsWithVm = new Set(allDbVms.map((v) => v.modelId));
  const usableModels = allDbModels.filter((m) => modelIdsWithVm.has(m.id));

  // 如果有些模型无映射，我们用它们的 model_id 但 vendor_model_id=null
  const modelNames = allDbModels.map((m) => m.name);
  const modelIdMap = new Map<number, number>(); // modelId → vendorModelId (or undefined)
  for (const vm of allDbVms) {
    if (!modelIdMap.has(vm.modelId)) modelIdMap.set(vm.modelId, vm.id);
  }

  console.log(`  可用模型: ${usableModels.length} 个有厂商映射, ${allDbModels.length} 个总模型`);

  // ── 代理商客户映射 ──
  const acRes = await db.execute(sql.raw("SELECT agent_id, client_user_id FROM agent_clients"));
  const acRows: any[] = (acRes as any).rows || [];
  const clientToAgent = new Map<number, number>();
  for (const ac of acRows) clientToAgent.set(ac.client_user_id, ac.agent_id);
  console.log(`  代理商客户映射: ${clientToAgent.size} 个`);

  // 用户余额跟踪
  const userBal = new Map<number, number>();
  for (const u of callUsers) userBal.set(u.userId, 0);

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - CONFIG.callDays);

  const BATCH = 2000;
  const totalB = Math.ceil(CONFIG.totalCallLogs / BATCH);
  let ins = 0;
  let ok = 0;

  console.log(`  写入 ${CONFIG.totalCallLogs.toLocaleString()} 条 (${totalB} 批)...`);

  for (let b = 0; b < totalB; b++) {
    const bs = Math.min(BATCH, CONFIG.totalCallLogs - ins);
    const callV: string[] = [];

    for (let i = 0; i < bs; i++) {
      const idx = ins + i;
      const user = callUsers[idx % callUsers.length];
      const uid = user.userId;

      // 轮流使用各个模型
      const dbModel = allDbModels[idx % allDbModels.length];
      const mid = dbModel.id;
      const vmId = modelIdMap.get(mid);
      const modelName = dbModel.name;
      const vendor = idx % 2 === 0 ? "openai" : "deepseek";

      const pt = randInt(100, 8000);
      const ct = randInt(50, 4000);
      const tt = pt + ct;
      const createdAt = new Date(startDate.getTime() + Math.random() * CONFIG.callDays * 86400000).toISOString();
      const st = weightedPick(STATUS_DIST);

      // 计费：用 sellPrice 或 fallback 价格
      let cost = 0;
      if (st === "success") {
        const vm = allDbVms.find((v) => v.id === vmId);
        if (vm) {
          cost = (pt * vm.sellIn + ct * vm.sellOut) / 1000;
        } else {
          // 无 vendor_model 的行，使用默认 0.01/0.04
          cost = (pt * 0.01 + ct * 0.04) / 1000;
        }
        if (user.userType === "enterprise") cost *= 0.95;
        cost = parseFloat(cost.toFixed(6));
      }

      const cb = userBal.get(uid) ?? 0;
      const ba = parseFloat((cb - cost).toFixed(6));
      userBal.set(uid, ba);

      const ip = `${randInt(1, 255)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 255)}`;

      // vmId may be undefined → use NULL
      const vmIdStr = vmId !== undefined ? String(vmId) : "NULL";
      callV.push(`(${uid}, ${mid}, ${vmIdStr}, '${vendor}', '${modelName}', ${pt}, ${ct}, ${tt}, ${cost}, ${randInt(100, 5000)}, '${st}', ${Math.random() > 0.5 ? 'true' : 'false'}, '${ip}', 'SimulationTest/1.0', '${createdAt}')`);
    }

    // 批量 INSERT call_logs
    try {
      await db.execute(sql.raw(`
        INSERT INTO call_logs (user_id, model_id, vendor_model_id, vendor_name, model_name, prompt_tokens, completion_tokens, total_tokens, cost, duration_ms, status, is_streaming, ip, user_agent, created_at)
        VALUES ${callV.join(",\n")}
      `));
      ok += callV.length;
    } catch (err: any) {
      // Try smaller batch
      for (const val of callV) {
        try {
          await db.execute(sql.raw(`
            INSERT INTO call_logs (user_id, model_id, vendor_model_id, vendor_name, model_name, prompt_tokens, completion_tokens, total_tokens, cost, duration_ms, status, is_streaming, ip, user_agent, created_at)
            VALUES ${val}
          `));
          ok++;
        } catch (e2: any) {
          if (e2.message?.includes("call_logs_pkey") || e2.message?.includes("duplicate")) {
            // 主键冲突跳过
          } else if (e2.message?.includes("foreign key") || e2.message?.includes("FK")) {
            // FK 冲突跳过
          } else {
            process.stdout.write(`x`);
          }
        }
      }
    }

    // balance_logs + commission_logs 逐个写入（量不大）
    for (let i = 0; i < bs; i++) {
      const idx = ins + i;
      const user = callUsers[idx % callUsers.length];
      const uid = user.userId;
      const dbModel = allDbModels[idx % allDbModels.length];
      const modelName = dbModel.name;
      const pt = randInt(100, 8000);
      const ct = randInt(50, 4000);
      const createdAt = new Date(startDate.getTime() + Math.random() * CONFIG.callDays * 86400000).toISOString();

      const vm = allDbVms.find((v) => v.modelId === dbModel.id);
      let cost = (pt * (vm?.sellIn || 0.01) + ct * (vm?.sellOut || 0.04)) / 1000;
      if (user.userType === "enterprise") cost *= 0.95;
      cost = parseFloat(cost.toFixed(6));

      if (cost > 0) {
        const cb = userBal.get(uid) ?? 0;
        const ba = parseFloat((cb - cost).toFixed(6));
        userBal.set(uid, ba);

        try {
          await db.execute(sql.raw(`
            INSERT INTO balance_logs (user_id, amount, balance_after, type, ref_type, description, created_at)
            VALUES (${uid}, ${-cost}, ${ba}, 'consumption', 'call', '仿真 ${modelName}', '${createdAt}')
          `));
        } catch { /* 忽略 */ }

        const agentId = clientToAgent.get(uid);
        if (agentId && cost > 0 && cost < 10000) {
          const cr = CONFIG.agentCommissionRules.sale;
          const ca = parseFloat((cost * cr).toFixed(6));
          const fee = parseFloat((ca * 0.01).toFixed(6));
          const net = parseFloat((ca - fee).toFixed(6));
          try {
            await db.execute(sql.raw(`
              INSERT INTO commission_logs (agent_id, commission_amount, call_cost, status, commission_type, source_customer_id, fee_rate, fee_amount, net_amount, created_at)
              VALUES (${agentId}, ${ca}, ${cost}, 'pending', 'sale', ${uid}, 0.0100, ${fee}, ${net}, '${createdAt}')
            `));
          } catch { /* 忽略 */ }
        }
      }
    }

    ins += bs;
    if (b % 5 === 0 || ins >= CONFIG.totalCallLogs) {
      process.stdout.write(`\r  进度: ${Math.floor(ins / CONFIG.totalCallLogs * 100)}% (${ins.toLocaleString()}/${CONFIG.totalCallLogs.toLocaleString()})`);
    }
  }
  process.stdout.write(`\r  进度: 100% (${CONFIG.totalCallLogs.toLocaleString()}/${CONFIG.totalCallLogs.toLocaleString()})\n`);

  // 验证
  try {
    const c = await db.execute(sql.raw("SELECT count(*) as cnt FROM call_logs"));
    const n = parseInt(((c as any).rows?.[0]?.cnt) || "0");
    console.log(`  call_logs: ${n.toLocaleString()}`);
    report.add("数据量达标", n >= CONFIG.totalCallLogs, `call_logs: ${n.toLocaleString()}`);
  } catch (err: any) {
    report.add("数据量达标", false, err.message);
  }

  // 佣金日汇总
  try {
    const cr = await db.execute(sql.raw("SELECT count(*) as cnt FROM commission_logs"));
    const cn = parseInt(((cr as any).rows?.[0]?.cnt) || "0");
    if (cn > 0) {
      await db.execute(sql.raw(`
        INSERT INTO commission_daily_rollup (agent_id, report_date, total_records, total_call_cost, total_commission_amount, total_fee_amount, total_net_amount)
        SELECT agent_id, to_char(created_at, 'YYYY-MM-DD'), count(*)::int, sum(call_cost::numeric), sum(commission_amount::numeric), coalesce(sum(fee_amount::numeric), 0), coalesce(sum(net_amount::numeric), 0)
        FROM commission_logs WHERE status = 'pending'
        GROUP BY agent_id, to_char(created_at, 'YYYY-MM-DD')
        ON CONFLICT (agent_id, report_date) DO UPDATE SET total_records = EXCLUDED.total_records, total_commission_amount = EXCLUDED.total_commission_amount
      `));
      console.log(`  佣金日志: ${cn} 条, 日汇总已生成`);
    }
  } catch { /* 跳过 */ }

  closeDb();
  endPhase("5: Token 调用");
  return report;
}
