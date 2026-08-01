// §27 在线客服 冒烟测试（REST + WebSocket）
const API = "http://localhost:3000/api/v1";
const WS = "ws://localhost:3000/api/v1/ws";
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
  const r = await fetch(API + path, opts);
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j };
}

// 登录 admin（作为客服 + 作为用户测试）
const login = await req("POST", "/auth/login", { email: "admin@3cloud.io", password: "seed-admin" });
const token = login.j?.token ?? login.j?.data?.token;
const userId = login.j?.user?.id ?? 6;
console.log("admin 登录:", login.status, "userId:", userId);

// 1. 创建测试用户（用于聊天双方）
const reg = await req("POST", "/auth/register", { email: `chat_${Date.now()}@test.io`, password: "test123456", username: "chatuser" });
const userToken = reg.j?.token ?? reg.j?.data?.token;
const testUserId = reg.j?.user?.id ?? (reg.j?.data?.user?.id);
check("创建测试用户", !!userToken, JSON.stringify(reg.j).slice(0, 120));

// 2. REST: 用户发起聊天（可能排队或连接）
const r1 = await req("POST", "/me/chat/start", {}, userToken ?? token);
check("发起聊天 200", r1.status === 200, JSON.stringify(r1.j).slice(0, 120));
console.log("   start result:", JSON.stringify(r1.j?.data).slice(0, 100));

// 3. 聊天历史
const hist = await req("GET", "/me/chat/history", null, userToken ?? token);
check("聊天历史 200", hist.status === 200, JSON.stringify(hist.j).slice(0, 80));

// 4. 管理端队列 + 活动会话
const q = await req("GET", "/admin/chat/queue", null, token);
check("等待队列 200", q.status === 200, JSON.stringify(q.j).slice(0, 80));
const d1 = await req("GET", "/admin/chat/active", null, token);
check("活动会话 200", d1.status === 200, JSON.stringify(d1.j).slice(0, 80));

// 5. 预设消息 CRUD
const p1 = await req("POST", "/admin/chat/presets", { type: "welcome", title: "欢迎语", content: "您好，欢迎来到 3Cloud 客服中心", sortOrder: 1 }, token);
check("创建预设消息 200", p1.status === 200, JSON.stringify(p1.j).slice(0, 80));
const presetId = p1.j?.data?.id;
const p2 = await req("GET", "/admin/chat/presets", null, token);
check("预设消息列表 200", p2.status === 200, JSON.stringify(p2.j).slice(0, 80));
check("列表含刚建", (p2.j?.data?.list ?? []).some((x) => x.id === presetId));

// 6. 客服状态
const st = await req("POST", "/admin/chat/status", { status: "online" }, token);
check("客服状态 200", st.status === 200, JSON.stringify(st.j).slice(0, 80));

// 7. 客服在线状态列表
const sts = await req("GET", "/admin/chat/staff-status", null, token);
check("客服状态列表 200", sts.status === 200, JSON.stringify(sts.j).slice(0, 80));

// 8. 关闭/转工单
const sessList = d1.j?.data?.list ?? q.j?.data?.list ?? [];
if (sessList[0]) {
  const sid = sessList[0].session_id;
  const transfer = await req("POST", `/admin/chat/sessions/${sid}/transfer`, null, token);
  check("转工单 200", transfer.status === 200, JSON.stringify(transfer.j).slice(0, 120));
  check("转工单返回ticket_no", !!transfer.j?.data?.ticket_no, JSON.stringify(transfer.j).slice(0, 80));
}

// 9. 满意度评价
const feedback = await req("POST", "/me/chat/feedback", { session_id: sessList[0]?.session_id ?? 1, rating: 3, comment: "满意" }, userToken ?? token);
check("满意度评价 200", feedback.status === 200, JSON.stringify(feedback.j).slice(0, 80));

// 10. WebSocket 用户端连接测试
let wsOk = false;
try {
  const { default: Ws } = await import("ws");
  const wsUser = new Ws(`${WS}/chat?token=${token}`);
  wsOk = await new Promise((resolve) => {
    wsUser.on("open", () => resolve(true));
    wsUser.on("error", () => resolve(false));
    setTimeout(() => resolve(false), 5000);
  });
  wsUser.close();
} catch {
  wsOk = false;
}
check("用户 WS 连接", wsOk);

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
