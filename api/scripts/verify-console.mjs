/**
 * Console 三大模块端到端冒烟测试
 * 覆盖：充值中心 / 账单中心 / 代理设置（后端 API 层面）
 * 用法: node scripts/verify-console.mjs （需后端 dev server 在 :3000）
 */
const BASE = process.env.API_BASE ?? "http://localhost:3000/api/v1";

async function req(path, { method = "GET", token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* noop */ }
  return { status: res.status, json, text };
}

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
}

const em = `console_${Date.now()}@t.com`;
console.log("=== Console 三大模块冒烟测试 ===\n");

// 注册
const reg = await req("/auth/register", { method: "POST", body: { email: em, password: "test123456", username: "consoletest" } });
const token = reg.json?.token;
check("注册成功", !!token, reg.text);
const uid = reg.json?.user?.id;

console.log("\n--- 充值中心 ---");
const rc = await req("/me/recharge", { method: "POST", token, body: { amount: 88, payment_method: "wechat" } });
const oid = rc.json?.data?.order_id;
check("创建充值订单", !!oid, rc.text);
check("扫码返回二维码", !!rc.json?.data?.qr_code_url, rc.text);
const cb = await req("/me/recharge/callback", { method: "POST", body: { order_id: oid, trade_no: "c_tx", pay_amount: 88, status: "success" } });
check("支付回调成功", cb.json?.data?.success === true, cb.text);
const bal = await req("/me/balance", { token });
check("余额+88", bal.json?.data?.balance === 88, bal.text);
const tx = await req("/me/transactions?page=1", { token });
check("消费明细有记录", tx.json?.data?.list?.length >= 1, tx.text);
const promo = await req("/me/promotions", { token });
check("优惠列表", Array.isArray(promo.json?.data?.list), promo.text);

console.log("\n--- 账单中心 ---");
const bcur = await req("/me/billing/current", { token });
check("当前周期摘要", !!bcur.json?.data?.period, bcur.text);
const bhist = await req("/me/billing/history", { token });
check("历史账单列表", Array.isArray(bhist.json?.data?.list), bhist.text);

console.log("\n--- 代理设置 ---");
const prof = await req("/me/agent/profile", { token });
check("代理信息(自动建档)", prof.json?.data?.level, prof.text);
check("含邀请码", !!prof.json?.data?.referral_code, prof.text);
const wd = await req("/me/agent/withdraw-settings", { method: "PUT", token, body: { account: "622200", bank: "招行", name: "测试" } });
check("保存提现设置", wd.json?.data?.ok === true, wd.text);
const np = await req("/me/agent/notif-prefs", { method: "PUT", token, body: { customer_alert: true } });
check("保存通知偏好", np.json?.data?.ok === true, np.text);
const prefGet = await req("/me/agent/notif-prefs", { token });
check("读回通知偏好", prefGet.json?.data?.customer_alert === true, prefGet.text);
const rules = await req("/me/agent/commission-rules", { token });
check("佣金规则三级", rules.json?.data?.rules?.length === 3, rules.text);
const ref = await req("/me/agent/referral", { token });
check("邀请链接", !!ref.json?.data?.invite_url, ref.text);

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
