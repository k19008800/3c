// §20 用户端安全与预算 冒烟测试
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
  return { status: r.status, j, text: () => r.text() };
}

const login = await req("POST", "/auth/login", { email: "admin@3cloud.io", password: "seed-admin" });
const token = login.j?.token ?? login.j?.data?.token;
console.log("admin 登录:", login.status);

// 1. 预算设置
const b1 = await req("GET", "/me/budget/settings", null, token);
check("获取预算设置 200", b1.status === 200, JSON.stringify(b1.j).slice(0, 100));

const b2 = await req("PUT", "/me/budget/settings", { monthlyBudget: 500, dailyBudget: 100, budgetType: "hard", alertThresholds: [50, 80, 90], autoBlock: true }, token);
check("更新预算 200", b2.status === 200, JSON.stringify(b2.j).slice(0, 100));
check("预算保存成功", b2.j?.code === 0);

const b3 = await req("GET", "/me/budget/status", null, token);
check("预算状态 200", b3.status === 200, JSON.stringify(b3.j).slice(0, 120));
check("状态含 blocked", b3.j?.data?.blocked === false);

// 2. 2FA 流程
const t1 = await req("GET", "/auth/2fa/status", null, token);
check("2FA 状态 200", t1.status === 200, JSON.stringify(t1.j).slice(0, 100));

const t2 = await req("POST", "/auth/2fa/setup", {}, token);
check("2FA setup 200", t2.status === 200, JSON.stringify(t2.j).slice(0, 120));
const secret = t2.j?.data?.secret;
check("setup 返回密钥", !!secret, String(secret).slice(0, 8));

// 用 otplib 生成正确验证码
if (secret) {
  const { authenticator } = await import("@otplib/preset-default");
  const code = authenticator.generate(secret);
  const t3 = await req("POST", "/auth/2fa/verify", { code }, token);
  check("2FA verify 成功", t3.status === 200, JSON.stringify(t3.j).slice(0, 120));
  check("verify 返回恢复码", (t3.j?.data?.recovery_codes ?? []).length === 10);

  // 错误验证码
  const tBad = await req("POST", "/auth/2fa/verify", { code: "000000" }, token);
  check("错误验证码返回 400", tBad.status === 400, JSON.stringify(tBad.j).slice(0, 80));

  // 登录时 2FA 拦截
  const t4 = await req("POST", "/auth/login", { email: "admin@3cloud.io", password: "seed-admin" });
  check("2FA 登录返回 needTwoFactor", t4.j?.needTwoFactor === true, JSON.stringify(t4.j).slice(0, 120));
  const tempToken = t4.j?.tempToken;
  check("返回临时 token", !!tempToken);

  // 用正确码完成 2FA 登录
  const code2 = authenticator.generate(secret);
  const t5 = await req("POST", "/auth/2fa/login", { tempToken, code: code2 });
  check("2FA login 成功", t5.status === 200 && !!t5.j?.token, JSON.stringify(t5.j).slice(0, 100));

  // 恢复码登录
  const recCode = t3.j.data.recovery_codes[0];
  const t6 = await req("POST", "/auth/login", { email: "admin@3cloud.io", password: "seed-admin" });
  const t6b = await req("POST", "/auth/2fa/login", { tempToken: t6.j.tempToken, recoveryCode: recCode });
  check("恢复码 2FA 登录成功", t6b.status === 200 && !!t6b.j?.token, JSON.stringify(t6b.j).slice(0, 100));

  // 禁用 2FA（用验证码）
  const code3 = authenticator.generate(secret);
  const t7 = await req("POST", "/auth/2fa/disable", { code: code3 }, token);
  check("2FA disable 成功", t7.status === 200, JSON.stringify(t7.j).slice(0, 100));
}

// 3. 设备管理
const d1 = await req("GET", "/me/devices", null, token);
check("设备列表 200", d1.status === 200, JSON.stringify(d1.j).slice(0, 80));

// 4. Key 权限
const keys = await req("GET", "/me/api-keys", null, token);
const keyId = keys.j?.data?.list?.[0]?.id ?? keys.j?.list?.[0]?.id;
check("获取 Key 列表", !!keyId, JSON.stringify(keys.j).slice(0, 80));
if (keyId) {
  const k1 = await req("GET", `/me/api-keys/${keyId}/permissions`, null, token);
  check("Key 权限 200", k1.status === 200, JSON.stringify(k1.j).slice(0, 100));
  const k2 = await req("PUT", `/me/api-keys/${keyId}/permissions`, { modelPermissions: ["deepseek-chat"], ipWhitelist: ["192.168.1.0/24"] }, token);
  check("Key 权限更新 200", k2.status === 200, JSON.stringify(k2.j).slice(0, 100));
  const k3 = await req("GET", `/me/api-keys/${keyId}/permissions/history`, null, token);
  check("Key 权限历史 200", k3.status === 200, JSON.stringify(k3.j).slice(0, 80));
}

// 5. 登录历史 + 安全汇总
const l1 = await req("GET", "/me/login-history", null, token);
check("登录历史 200", l1.status === 200, JSON.stringify(l1.j).slice(0, 80));
const s1 = await req("GET", "/me/security/summary", null, token);
check("安全汇总 200", s1.status === 200, JSON.stringify(s1.j).slice(0, 120));

// 6. 管理端
const m1 = await req("GET", "/admin/budgets", null, token);
check("管理员预算列表 200", m1.status === 200, JSON.stringify(m1.j).slice(0, 80));
const m2 = await req("GET", "/admin/2fa/status", null, token);
check("管理员 2FA 状态 200", m2.status === 200, JSON.stringify(m2.j).slice(0, 80));
const m3 = await req("GET", "/admin/budgets/block-logs", null, token);
check("熔断历史 200", m3.status === 200, JSON.stringify(m3.j).slice(0, 80));
const m4 = await req("PUT", "/admin/2fa/policy", { policy: "optional" }, token);
check("2FA 策略 200", m4.status === 200, JSON.stringify(m4.j).slice(0, 80));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
