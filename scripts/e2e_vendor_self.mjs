const BASE = "http://localhost:3000/api/v1";
let pass = 0, fail = 0;
function ok(name, cond, extra = "") { if (cond) { pass++; console.log(`✅ ${name}`); } else { fail++; console.log(`❌ ${name} ${extra}`); } }

async function j(method, url, body, token) {
  const headers = {}; if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch { }
  return { status: res.status, data };
}

const run = async () => {
  // 1. admin 登录
  const al = await j("POST", "/auth/login", { email: "admin@3cloud.io", password: "seed-admin" });
  ok("admin登录", al.status === 200);
  const at = al.data?.token;

  // 2. 供应商注册
  const email = `vendor_${Date.now()}@test.io`;
  const reg = await j("POST", "/vendor/register", { name: "测试供应商", contact_name: "张三", contact_email: email, contact_phone: "13800138000", password: "Vendor123456", base_url: "https://api.test.com", api_auth_type: "bearer_token", commission_rate: 0.1 });
  ok("供应商注册(pending)", reg.status === 201 && reg.data?.data?.status === "pending", JSON.stringify(reg.data)?.slice(0, 120));
  const vid = reg.data?.data?.id;
  ok("注册返回供应商id", !!vid, String(vid));

  // 3. 重复邮箱注册被拒
  const dup = await j("POST", "/vendor/register", { name: "测试供应商2", contact_email: email, password: "Vendor123456" });
  ok("重复邮箱注册被拒", dup.status === 409, JSON.stringify(dup.data)?.slice(0, 80));

  // 4. pending 状态登录被拒
  const preLogin = await j("POST", "/vendor/login", { email, password: "Vendor123456" });
  ok("pending登录被拒(403)", preLogin.status === 403, JSON.stringify(preLogin.data)?.slice(0, 80));

  // 5. admin 审核通过
  const ap = await j("POST", `/admin/vendors/${vid}/approve`, {}, at);
  ok("admin审核通过", ap.status === 200 && ap.data?.data?.status === "active", JSON.stringify(ap.data)?.slice(0, 80));

  // 6. 供应商登录
  const vl = await j("POST", "/vendor/login", { email, password: "Vendor123456" });
  ok("供应商登录成功", vl.status === 200 && vl.data?.data?.token, JSON.stringify(vl.data)?.slice(0, 80));
  const vt = vl.data?.data?.token;

  // 7. profile
  const prof = await j("GET", "/vendor/profile", undefined, vt);
  ok("供应商profile", prof.status === 200 && prof.data?.data?.status === "active", JSON.stringify(prof.data)?.slice(0, 80));

  // 8. dashboard
  const dash = await j("GET", "/vendor/dashboard", undefined, vt);
  ok("供应商dashboard", dash.status === 200 && typeof dash.data?.data?.today === "object", JSON.stringify(dash.data)?.slice(0, 60));

  // 9. models（注册的供应商无模型，返回空列表不报错）
  const models = await j("GET", "/vendor/models", undefined, vt);
  ok("供应商模型列表", models.status === 200 && Array.isArray(models.data?.data?.list), JSON.stringify(models.data)?.slice(0, 60));

  // 10. stats
  const stats = await j("GET", "/vendor/stats?range=7d", undefined, vt);
  ok("供应商统计", stats.status === 200, JSON.stringify(stats.data)?.slice(0, 60));

  // 11. settlements（空）
  const settle = await j("GET", "/vendor/settlements", undefined, vt);
  ok("供应商结算列表", settle.status === 200 && Array.isArray(settle.data?.data?.list), JSON.stringify(settle.data)?.slice(0, 60));

  // 12. 用户 token 访问供应商接口被拒
  const userLogin = await j("POST", "/auth/login", { email: "admin@3cloud.io", password: "seed-admin" });
  const uToken = userLogin.data?.token;
  const forbidden = await j("GET", "/vendor/profile", undefined, uToken);
  ok("用户token访问供应商接口被拒", forbidden.status === 403 || forbidden.status === 401, JSON.stringify(forbidden.data)?.slice(0, 60));

  // 13. admin 审核拒绝路径（注册第二个）
  const email2 = `vendor2_${Date.now()}@test.io`;
  const reg2 = await j("POST", "/vendor/register", { name: "被拒供应商", contact_name: "李四", contact_email: email2, password: "Vendor123456" });
  const vid2 = reg2.data?.data?.id;
  const rj = await j("POST", `/admin/vendors/${vid2}/reject`, { reason: "资质不符" }, at);
  ok("admin审核拒绝", rj.status === 200 && rj.data?.data?.status === "rejected", JSON.stringify(rj.data)?.slice(0, 80));
  const rLogin = await j("POST", "/vendor/login", { email: email2, password: "Vendor123456" });
  ok("被拒供应商登录被拒", rLogin.status === 403 && rLogin.data?.error === "REJECTED", JSON.stringify(rLogin.data)?.slice(0, 80));

  console.log(`\n===== 供应商自助 E2E: ${pass} 通过, ${fail} 失败 =====`);
  process.exit(fail > 0 ? 1 : 0);
};
run().catch(e => { console.error(e); process.exit(1); });
