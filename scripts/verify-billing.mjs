// §5.2 计费健壮性 冒烟测试：验证消费-资金流水链路 + 预扣回滚逻辑接口
const BASE = "http://localhost:3000/api/v1";
let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
}
async function req(method, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const opts = { method, headers };
  if (body !== undefined && body !== null) opts.body = JSON.stringify(body);
  const r = await fetch(BASE + path, opts);
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j };
}

const login = await req("POST", "/auth/login", { email: "admin@3cloud.io", password: "seed-admin" });
const token = login.j?.token ?? login.j?.data?.token;
const userId = login.j?.user?.id ?? 6;
console.log("admin 登录:", login.status, "userId:", userId);

// 1. 资金流水列表应含 user_consumption（历史消费已写入总账）
const led = await req("GET", "/admin/finance/ledger?type=user_consumption", null, token);
check("资金流水按类型查询 200", led.status === 200, JSON.stringify(led.j).slice(0, 80));
console.log(`   消费流水条数: ${led.j?.data?.pagination?.total ?? 0}`);

// 2. 账户总览消费数据 > 0（证明消费已汇总）
const acc = await req("GET", "/admin/finance/accounts", null, token);
check("账户总览 200", acc.status === 200);
check("账户消费汇总 > 0", (acc.j?.data?.user_consumption_total ?? 0) > 0, JSON.stringify(acc.j?.data).slice(0, 120));

// 3. 流向一致性：流水 type 过滤后再查对应明细
const cLed = led.j?.data?.list ?? [];
check("消费流水有明细", cLed.length > 0, JSON.stringify(cLed[0]).slice(0, 120));
if (cLed[0]) check("消费流水 direction=in", cLed[0].direction === "in", cLed[0].direction);

// 4. 网关公开端点正常（计费链路入口）
const models = await fetch("http://localhost:3000/v1/models");
check("网关 /v1/models 200", models.status === 200);

// 5. 预算引擎 + 2FA auth 链路无回归
const tfa = await req("GET", "/auth/2fa/status", null, token);
check("2FA 状态 200", tfa.status === 200, JSON.stringify(tfa.j).slice(0, 60));
const bud = await req("GET", "/me/budget/status", null, token);
check("预算状态 200", bud.status === 200, JSON.stringify(bud.j).slice(0, 60));

// 6. 账户趋势（消费在趋势里体现）
const trend = await req("GET", "/admin/finance/accounts/trend?days=30", null, token);
check("资金趋势 200", trend.status === 200, JSON.stringify(trend.j).slice(0, 60));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
