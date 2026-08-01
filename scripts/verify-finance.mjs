// §29 资金与对账 冒烟测试
const BASE = "http://localhost:3000/api/v1";

async function req(method, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const opts = { method, headers };
  if (body !== undefined && body !== null) opts.body = JSON.stringify(body);
  const r = await fetch(BASE + path, opts);
  let j = null;
  try { j = await r.json(); } catch { }
  return { status: r.status, j };
}

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
}

// 1. 登录 admin
const login = await req("POST", "/auth/login", { email: "admin@3cloud.io", password: "seed-admin" });
const token = login.j?.token ?? login.j?.data?.token;
console.log("登录:", login.status, token ? "OK" : JSON.stringify(login.j).slice(0, 120));
check("admin 登录", !!token);

// 2. 资金流水列表
const led = await req("GET", "/admin/finance/ledger", null, token);
check("资金流水列表 200", led.status === 200, JSON.stringify(led.j).slice(0, 100));
check("流水有 summary", led.j?.data?.summary); 

// 3. 内部调账（+50）
const adj = await req("POST", "/admin/finance/ledger/adjust", { amount: 50, remark: "测试调账" }, token);
check("内部调账成功", adj.status === 200, JSON.stringify(adj.j).slice(0, 120));
const serialNo = adj.j?.data?.serial_no;

// 4. 流水详情
if (serialNo) {
  const det = await req("GET", `/admin/finance/ledger/${serialNo}`, null, token);
  check("流水详情 200", det.status === 200, JSON.stringify(det.j).slice(0, 100));
}

// 5. 资金账户总览
const acc = await req("GET", "/admin/finance/accounts", null, token);
console.log("账户总览:", JSON.stringify(acc.j?.data).slice(0, 200));
check("账户总览 200", acc.status === 200);

// 6. 资金趋势
const trend = await req("GET", "/admin/finance/accounts/trend?days=7", null, token);
check("资金趋势 200", trend.status === 200, JSON.stringify(trend.j).slice(0, 80));

// 7. 对账差异列表
const diffs = await req("GET", "/admin/finance/reconciliation/differences", null, token);
check("对账差异列表 200", diffs.status === 200, JSON.stringify(diffs.j).slice(0, 80));

// 8. 手动触发对账
const run = await req("POST", "/admin/finance/reconciliation/run", { period: new Date().toISOString().slice(0, 7) }, token);
check("触发对账 200", run.status === 200, JSON.stringify(run.j).slice(0, 100));

// 9. 结账状态
const closeStatus = await req("GET", "/admin/finance/close/status", null, token);
check("结账状态 200", closeStatus.status === 200, JSON.stringify(closeStatus.j).slice(0, 80));

// 10. 结账历史
const hist = await req("GET", "/admin/finance/close/history", null, token);
check("结账历史 200", hist.status === 200);

// 11. 逾期列表
const od = await req("GET", "/admin/finance/overdue/list", null, token);
check("逾期列表 200", od.status === 200, JSON.stringify(od.j).slice(0, 80));

// 12. 结账执行（本月）— 幂等：可能已锁账
const closeRun = await req("POST", "/admin/finance/close/execute", { period: new Date().toISOString().slice(0, 7) }, token);
check("执行结账 200/409", [200, 409].includes(closeRun.status), JSON.stringify(closeRun.j).slice(0, 80));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
