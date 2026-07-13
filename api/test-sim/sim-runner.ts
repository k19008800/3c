// ============================================================
//  3cloud (3C) — 全链路仿真测试主入口
//  执行: npx tsx test-sim/sim-runner.ts
//
//  环境变量:
//    SKIP_PHASES=0,5  - 跳过指定阶段
//    ONLY_PHASE=5     - 只执行指定阶段
//    API_BASE=...     - API 地址（默认 http://localhost:3000）
// ============================================================

import "dotenv/config";
import { ApiClient } from "./api-client.js";
import { CONFIG } from "./config.js";
import { VerificationReport, writeCsvReport } from "./utils/verify.js";

// 阶段导入
import { phase0Seed } from "./phases/0-seed.js";
import { phase1Register } from "./phases/1-register.js";
import { phase2RealName } from "./phases/2-real-name.js";
import { phase3Recharge } from "./phases/3-recharge.js";
import { phase4Agent } from "./phases/4-agent.js";
import { phase5Tokens } from "./phases/5-tokens.js";
import { phase6Commission } from "./phases/6-commission.js";
import { phase7Withdraw } from "./phases/7-withdraw.js";
import { phase8Verify } from "./phases/8-verify.js";

async function main() {
  const skipPhases = (process.env.SKIP_PHASES || "").split(",").map(Number).filter((n) => !isNaN(n));
  const onlyPhase = process.env.ONLY_PHASE ? parseInt(process.env.ONLY_PHASE) : undefined;

  console.log(`
╔═══════════════════════════════════════════════════╗
║       3cloud (3C) — 全链路仿真测试                ║
║       目标: 10 万+ Token 调度数据                 ║
║       API: ${CONFIG.apiBase.padEnd(35)}║
╚═══════════════════════════════════════════════════╝
`);

  const overallStart = Date.now();
  const client = new ApiClient(CONFIG.apiBase);

  // 阶段状态
  let adminToken = "";
  let personalUsers: any[] = [];
  let enterpriseUsers: any[] = [];
  let allUsers: any[] = [];
  let agents: any[] = [];

  const allReports: VerificationReport[] = [];
  let hasError = false;

  // ── 阶段 0: 种子数据 ──
  const runPhase0 = (onlyPhase === undefined || onlyPhase === 0) && !skipPhases.includes(0);
  if (runPhase0) {
    try {
      const result = await phase0Seed(client);
      adminToken = result.adminToken;
    } catch (err: any) {
      console.error(`\n  ❌ 阶段 0 失败: ${err.message}`);
      hasError = true;
    }
  } else {
    console.log("  ⏭️  跳过阶段 0");
    // 尝试用配置登录获取 token
    try {
      const loginRes = await client.login(CONFIG.admin.email, CONFIG.admin.password);
      adminToken = loginRes.data.accessToken;
    } catch {
      // 等后续阶段再尝试
    }
  }

  // ── 阶段 1: 注册 ──
  const runPhase1 = (onlyPhase === undefined || onlyPhase === 1) && !skipPhases.includes(1) && !hasError;
  if (runPhase1) {
    try {
      const result = await phase1Register(client);
      personalUsers = result.personalUsers;
      enterpriseUsers = result.enterpriseUsers;
      allUsers = result.allUsers;
      allReports.push(result.report);
    } catch (err: any) {
      console.error(`\n  ❌ 阶段 1 失败: ${err.message}`);
      hasError = true;
    }
  } else {
    console.log("  ⏭️  跳过阶段 1");
  }

  // ── 阶段 2: 实名 ──
  const runPhase2 = (onlyPhase === undefined || onlyPhase === 2) && !skipPhases.includes(2) && !hasError;
  if (runPhase2 && adminToken) {
    try {
      const report = await phase2RealName(client, personalUsers, enterpriseUsers, adminToken);
      allReports.push(report);
    } catch (err: any) {
      console.error(`\n  ❌ 阶段 2 失败: ${err.message}`);
      hasError = true;
    }
  } else {
    console.log("  ⏭️  跳过阶段 2");
  }

  // ── 阶段 3: 充值 ──
  const runPhase3 = (onlyPhase === undefined || onlyPhase === 3) && !skipPhases.includes(3) && !hasError;
  if (runPhase3 && adminToken) {
    try {
      const report = await phase3Recharge(client, personalUsers, enterpriseUsers, adminToken);
      allReports.push(report);
    } catch (err: any) {
      console.error(`\n  ❌ 阶段 3 失败: ${err.message}`);
      hasError = true;
    }
  } else {
    console.log("  ⏭️  跳过阶段 3");
  }

  // ── 阶段 4: 代理商 ──
  const runPhase4 = (onlyPhase === undefined || onlyPhase === 4) && !skipPhases.includes(4) && !hasError;
  if (runPhase4 && adminToken) {
    try {
      const result = await phase4Agent(client, personalUsers, enterpriseUsers, adminToken);
      agents = result.agents;
      allReports.push(result.report);
    } catch (err: any) {
      console.error(`\n  ❌ 阶段 4 失败: ${err.message}`);
      hasError = true;
    }
  } else {
    console.log("  ⏭️  跳过阶段 4");
  }

  // ── 阶段 5: Token 调用 ──
  const runPhase5 = (onlyPhase === undefined || onlyPhase === 5) && !skipPhases.includes(5) && !hasError;
  if (runPhase5) {
    try {
      const report = await phase5Tokens(client, allUsers, agents);
      allReports.push(report);
    } catch (err: any) {
      console.error(`\n  ❌ 阶段 5 失败: ${err.message}`);
      hasError = true;
    }
  } else {
    console.log("  ⏭️  跳过阶段 5");
  }

  // ── 阶段 6: 佣金结算 ──
  const runPhase6 = (onlyPhase === undefined || onlyPhase === 6) && !skipPhases.includes(6) && !hasError;
  if (runPhase6 && adminToken) {
    try {
      const report = await phase6Commission(client, agents, adminToken);
      allReports.push(report);
    } catch (err: any) {
      console.error(`\n  ❌ 阶段 6 失败: ${err.message}`);
      hasError = true;
    }
  } else {
    console.log("  ⏭️  跳过阶段 6");
  }

  // ── 阶段 7: 提现 ──
  const runPhase7 = (onlyPhase === undefined || onlyPhase === 7) && !skipPhases.includes(7) && !hasError;
  if (runPhase7 && adminToken) {
    try {
      const report = await phase7Withdraw(client, agents, adminToken);
      allReports.push(report);
    } catch (err: any) {
      console.error(`\n  ❌ 阶段 7 失败: ${err.message}`);
      hasError = true;
    }
  } else {
    console.log("  ⏭️  跳过阶段 7");
  }

  // ── 阶段 8: 对账审计 ──
  const runPhase8 = (onlyPhase === undefined || onlyPhase === 8) && !skipPhases.includes(8) && !hasError;
  if (runPhase8 && adminToken) {
    try {
      const report = await phase8Verify(client, adminToken);
      allReports.push(report);
    } catch (err: any) {
      console.error(`\n  ❌ 阶段 8 失败: ${err.message}`);
      hasError = true;
    }
  } else {
    console.log("  ⏭️  跳过阶段 8");
  }

  // ── 最终报告 ──
  const overallElapsed = ((Date.now() - overallStart) / 1000).toFixed(1);
  const totalPassed = allReports.reduce((s, r) => s + r.passed, 0);
  const totalFailed = allReports.reduce((s, r) => s + r.failed, 0);
  const totalPoints = totalPassed + totalFailed;
  const passRate = totalPoints > 0 ? ((totalPassed / totalPoints) * 100).toFixed(1) : "N/A";

  console.log(`
╔═══════════════════════════════════════════════════╗
║              测试完成 — 最终报告                    ║
╠═══════════════════════════════════════════════════╣
║  总耗时: ${overallElapsed.padStart(7)}s                        ║
║  验证点: ${String(totalPoints).padStart(4)}                          ║
║  通过:   ${String(totalPassed).padStart(4)}  ✅                      ║
║  失败:   ${String(totalFailed).padStart(4)}  ❌                      ║
║  通过率: ${passRate.padStart(7)}%                         ║
╚═══════════════════════════════════════════════════╝
`);

  // 输出所有失败点
  const allFailed = allReports.flatMap((r) => r.failedPoints());
  if (allFailed.length > 0) {
    console.log("  ❌ 失败验证点:");
    for (const f of allFailed) {
      console.log(`    · ${f.name}${f.detail ? ` — ${f.detail}` : ""}`);
    }
    console.log("");
  }

  // 写入 CSV 报告
  const summaryRows = allReports.flatMap((r) =>
    r.points.map((p) => ({
      name: p.name,
      passed: p.passed ? "YES" : "NO",
      detail: p.detail,
    }))
  );
  writeCsvReport("verification-results.csv", summaryRows);

  // 输出每个阶段的报告
  for (const r of allReports) {
    console.log(r.summary());
  }

  process.exit(hasError ? 1 : 0);
}

main().catch((err) => {
  console.error("严重错误:", err);
  process.exit(1);
});
