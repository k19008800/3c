// §28 智能客服辅助 + 测试工具 冒烟测试
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

// 1. 意图识别
const i1 = await req("POST", "/admin/support/assist/intent", { text: "我充值了100块钱，但余额没有增加" }, token);
check("意图识别 200", i1.status === 200, JSON.stringify(i1.j).slice(0, 100));
check("识别到充值未到账意图", i1.j?.data?.intent === "充值未到账", JSON.stringify(i1.j?.data).slice(0, 100));
check("有建议动作", (i1.j?.data?.suggested_actions ?? []).length > 0);

const i2 = await req("POST", "/admin/support/assist/intent", { text: "我的 API 一直返回 401" }, token);
check("识别到API鉴权", i2.j?.data?.intent === "API鉴权失败", JSON.stringify(i2.j?.data).slice(0, 80));

const i3 = await req("POST", "/admin/support/assist/intent", { text: "随便聊聊天气不错" }, token);
check("无匹配意图返回 null", i3.j?.data?.intent === null, JSON.stringify(i3.j).slice(0, 80));

// 2. 自动诊断
const d1 = await req("GET", `/admin/support/assist/diagnose/${userId}`, null, token);
check("自动诊断 200", d1.status === 200, JSON.stringify(d1.j).slice(0, 100));
check("诊断含用户信息", !!d1.j?.data?.user, JSON.stringify(d1.j?.data).slice(0, 100));
check("诊断含调用分析", !!d1.j?.data?.analysis, JSON.stringify(d1.j?.data?.analysis).slice(0, 100));
check("诊断含Key状态", Array.isArray(d1.j?.data?.api_keys));
check("诊断含余额预警字段", "balance_warning" in (d1.j?.data ?? {}));

// 3. 临时测试 Key
const tk1 = await req("POST", "/admin/support/test-key", { associated_user_id: userId, name: "测试Key冒烟" }, token);
check("生成测试Key 200", tk1.status === 200 && !!tk1.j?.data?.key, JSON.stringify(tk1.j).slice(0, 120));
const testKey = tk1.j?.data?.key;
check("测试Key前缀 sk-test", testKey?.startsWith("sk-test-"), testKey);

const tk2 = await req("GET", "/admin/support/test-keys", null, token);
check("测试Key列表 200", tk2.status === 200, JSON.stringify(tk2.j).slice(0, 80));
check("列表含刚建的Key", (tk2.j?.data?.list ?? []).some((x) => x.name === "测试Key冒烟"));

// 4. 模拟调用
const sc = await req("POST", "/admin/support/simulate-call", { userId, model: "deepseek-chat", messages: [{ role: "user", content: "hi" }] }, token);
check("模拟调用 200", sc.status === 200, JSON.stringify(sc.j).slice(0, 120));
check("模拟含用户环境", !!sc.j?.data?.user && Array.isArray(sc.j?.data?.active_keys));

// 5. 客服绩效统计
const st = await req("GET", "/admin/support/stats?period=month", null, token);
check("绩效统计 200", st.status === 200, JSON.stringify(st.j).slice(0, 100));
check("统计含团队概览", !!st.j?.data?.team_overview, JSON.stringify(st.j?.data).slice(0, 120));

// 6. 客服操作审计
const au = await req("GET", "/admin/support/audit-logs", null, token);
check("审计日志 200", au.status === 200, JSON.stringify(au.j).slice(0, 80));
check("含模拟调用记录", (au.j?.data?.list ?? []).some((o) => o.action === "simulate_call"));

// 7. 撤销测试Key
const rev = await req("POST", `/admin/support/test-key/${tk1.j?.data?.id}/revoke`, {}, token);
check("撤销测试Key 200", rev.status === 200, JSON.stringify(rev.j).slice(0, 80));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
