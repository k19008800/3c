/**
 * 充值模块端到端冒烟测试
 * 用法: node scripts/verify-recharge.mjs
 * 前置: 后端 dev server 运行在 :3000
 */
const BASE = process.env.API_BASE ?? "http://localhost:3000/api/v1";

async function req(path, { method = "GET", token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* noop */ }
  return { status: res.status, json, text };
}

let passCount = 0, failCount = 0;
function check(name, cond, extra = "") {
  if (cond) { passCount++; console.log(`  ✅ ${name}`); }
  else { failCount++; console.log(`  ❌ ${name} ${extra}`); }
}

const email = `verify_${Date.now()}@test.com`;
console.log("=== 充值模块冒烟测试 ===");

// 1. 注册
const reg = await req("/auth/register", { method: "POST", body: { email, password: "test123456", username: "verify" } });
const token = reg.json?.token;
check("注册成功", !!token, reg.text);

// 2. 初始余额 0
const bal0 = await req("/me/balance", { token });
check("初始余额为0", bal0.json?.data?.balance === 0, bal0.text);

// 3. 充值 ¥100
const rc = await req("/me/recharge", { method: "POST", token, body: { amount: 100, payment_method: "alipay" } });
const orderId = rc.json?.data?.order_id;
check("创建充值订单", !!orderId, rc.text);
check("返回二维码", !!rc.json?.data?.qr_code_url, rc.text);

// 4. 未支付订单详情为 pending
const orders = await req("/me/recharge-orders", { token });
check("充值记录含 pending", orders.json?.data?.list?.[0]?.status === "pending", orders.text);

// 5. 支付回调
const cb = await req("/me/recharge/callback", { method: "POST", body: { order_id: orderId, trade_no: "sim_cb", pay_amount: 100, status: "success" } });
check("支付回调成功", cb.json?.data?.success === true, cb.text);

// 6. 余额 +100
const bal1 = await req("/me/balance", { token });
check("余额变为100", bal1.json?.data?.balance === 100, bal1.text);

// 7. 消费明细有记录
const tx = await req("/me/transactions?page=1", { token });
check("消费明细含充值记录", tx.json?.data?.list?.length >= 1, tx.text);

// 8. 订单状态变 success
const orders2 = await req("/me/recharge-orders", { token });
check("订单状态 success", orders2.json?.data?.list?.[0]?.status === "success", orders2.text);

// 9. 幂等：重复回调不重复加钱
await req("/me/recharge/callback", { method: "POST", body: { order_id: orderId, trade_no: "dup", pay_amount: 100, status: "success" } });
const bal2 = await req("/me/balance", { token });
check("重复回调幂等(余额仍100)", bal2.json?.data?.balance === 100, bal2.text);

// 10. 订单详情
const oid = orders2.json?.data?.list?.[0]?.id;
const det = await req(`/me/recharge-orders/${oid}`, { token });
check("订单详情可查", det.json?.data?.amount === 100, det.text);

// 11. 优惠列表
const promo = await req("/me/promotions", { token });
check("优惠列表返回", Array.isArray(promo.json?.data?.list), promo.text);

console.log(`\n结果: ${passCount} 通过 / ${failCount} 失败`);
process.exit(failCount === 0 ? 0 : 1);
