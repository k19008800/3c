/**
 * 代理商后台主导版 冒烟测试
 * 流程：admin 建代理 → 代理报备客户 → admin 审核通过(自动划拨) → 校验归属 + 审计
 * 前提：API 已启动（redis 在跑），DB 可写
 */
import pg from "pg";
import "dotenv/config";

const BASE = "http://localhost:3000/api/v1";
const CONN = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/threecloud_v2";
const pool = new pg.Pool({ connectionString: CONN });

const stamp = Date.now();
const ADMIN_EMAIL = `admin_${stamp}@t.com`;
const AGENT_EMAIL = `agent_${stamp}@t.com`;
const CUSTOMER_EMAIL = `customer_${stamp}@t.com`;
const PASS = "pass123456";

let failures = 0;
const ok = (name, cond) => { console.log(`${cond ? "✅" : "❌"} ${name}`); if (!cond) failures++; };

async function api(method, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

async function main() {
  // 1. 直插 admin（登录用）
  const bcrypt = (await import("bcryptjs")).default;
  const ahash = await bcrypt.hash(PASS, 10);
  await pool.query(
    `INSERT INTO users (email, password_hash, username, role, status) VALUES ($1,$2,'admin','admin','active')
     ON CONFLICT (email) DO NOTHING`,
    [ADMIN_EMAIL, ahash],
  );

  // 注册 代理候选 + 客户
  const ra = await api("POST", "/auth/register", { email: AGENT_EMAIL, password: PASS, username: "agentX" });
  ok("注册代理候选", ra.status === 201);
  const rc = await api("POST", "/auth/register", { email: CUSTOMER_EMAIL, password: PASS, username: "custY" });
  ok("注册客户", rc.status === 201);

  // 登录 admin / agent / customer
  const la = await api("POST", "/auth/login", { email: ADMIN_EMAIL, password: PASS });
  ok("admin 登录", la.status === 200 && !!la.json.token);
  const agentToken = rc.json.token; // 用 customer 的 token 来登录 agent
  // 单独登录 agent
  const lag = await api("POST", "/auth/login", { email: AGENT_EMAIL, password: PASS });
  const agentTok = lag.json.token;
  const lac = await api("POST", "/auth/login", { email: CUSTOMER_EMAIL, password: PASS });
  const custTok = lac.json.token;
  const adminTok = la.json.token;

  // 2. admin 将 AGENT_EMAIL 用户设为代理商
  const agentUser = (await pool.query("SELECT id FROM users WHERE email=$1", [AGENT_EMAIL])).rows[0];
  const custUser = (await pool.query("SELECT id FROM users WHERE email=$1", [CUSTOMER_EMAIL])).rows[0];
  const assign = await api("POST", "/admin/agents/assign", { userId: agentUser.id, level: "level1" }, adminTok);
  ok("admin 设为代理商", assign.status === 200 && assign.json.data?.ok === true);

  // 3. 非代理用户不能调 /me/agent/withdraw-settings（返回 403 NOT_AGENT）
  const nonAgent = await api("PUT", "/me/agent/withdraw-settings", { account: "123", bank: "x", name: "y" }, custTok);
  ok("客户访问代理接口返回 403", nonAgent.status === 403 && nonAgent.json.error === "NOT_AGENT");

  // 4. 代理报备客户（agent 用目标客户邮箱）
  const report = await api("POST", "/agent/reports", { target_email: CUSTOMER_EMAIL, note: "smoke" }, agentTok);
  ok("代理提交报备", report.status === 200 && report.json.data?.status === "pending");
  const reportId = report.json.data?.report_id;

  // 5. 报备队列出现
  const queue = await api("GET", "/admin/agent-reports?status=pending", null, adminTok);
  ok("报备审核队列可见", queue.status === 200 && queue.json.data?.list?.some((r) => r.id === reportId));

  // 6. admin 审核通过 → 自动划拨
  const audit = await api("POST", `/admin/agent-reports/${reportId}/audit`, { action: "pass" }, adminTok);
  ok("审核通过并自动划拨", audit.status === 200 && audit.json.data?.status === "passed" && audit.json.data?.action === "bind");

  // 7. 校验归属绑定 + 审计日志
  const binding = (await pool.query(
    `SELECT agent_user_id, status FROM agent_customer_bindings WHERE customer_user_id=$1 AND status='active'`,
    [custUser.id],
  )).rows;
  ok("客户归属绑定 agent", binding.length === 1 && Number(binding[0].agent_user_id) === agentUser.id);
  const logs = (await pool.query(
    `SELECT action, to_agent_user_id FROM agent_binding_logs WHERE customer_user_id=$1`,
    [custUser.id],
  )).rows;
  ok("归属审计日志已写", logs.some((l) => l.action === "bind" && Number(l.to_agent_user_id) === agentUser.id));

  // 8. 归属唯一性：再划给第二个代理（本测试用 admin 自身？admin 无代理档案）→ 手动转移测试交给 admin transfer
  //    手工 transfer 到同一代理不可，改用 admin unbind
  const unbind = await api("POST", `/admin/agent-customers/${custUser.id}/unbind`, { reason: "test-unbind" }, adminTok);
  ok("admin 解除归属", unbind.status === 200 && unbind.json.data?.from_agent_user_id === agentUser.id);
  const afterUnbind = (await pool.query(
    `SELECT count(*)::int c FROM agent_customer_bindings WHERE customer_user_id=$1 AND status='active'`,
    [custUser.id],
  )).rows[0].c;
  ok("解除后无 active 归属", afterUnbind === 0);
  const unbindLog = (await pool.query(
    `SELECT action FROM agent_binding_logs WHERE customer_user_id=$1 AND action='unbind'`,
    [custUser.id],
  )).rows;
  ok("解绑审计日志", unbindLog.length === 1);

  // 清理测试用户（保留 admin 以便后续，仅删 agent/customer）
  await pool.query("DELETE FROM agent_customer_bindings WHERE customer_user_id=$1 OR agent_user_id=$1", [custUser.id]);
  await pool.query("DELETE FROM agent_binding_logs WHERE customer_user_id=$1", [custUser.id]);
  await pool.query("DELETE FROM agent_report_requests WHERE agent_user_id=$1", [agentUser.id]);

  console.log(`\n===== 冒烟结果: ${failures === 0 ? "全部通过 ✅" : failures + " 项失败 ❌"} =====`);
  await pool.end();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("冒烟异常:", e); process.exit(1); });
