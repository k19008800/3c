// §26 工单系统 冒烟测试
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

// admin 登录（admin 也是客服/用户）
const login = await req("POST", "/auth/login", { email: "admin@3cloud.io", password: "seed-admin" });
const token = login.j?.token ?? login.j?.data?.token;
const userId = login.j?.user?.id ?? 6;
console.log("admin 登录:", login.status, "userId:", userId);

// 1. 创建工单
const t1 = await req("POST", "/me/tickets", { title: "充值未到账测试", category: "billing", priority: "normal", description: "充值 100 元但余额未增加，请核实" }, token);
check("创建工单 200", t1.status === 200, JSON.stringify(t1.j).slice(0, 100));
const ticketId = t1.j?.data?.id;
const ticketNo = t1.j?.data?.ticket_no;
check("返回工单号", !!ticketNo, String(ticketNo).slice(0, 20));

// 2. 重复提交拦截
const dup = await req("POST", "/me/tickets", { title: "充值未到账测试", category: "billing", description: "重复内容" }, token);
check("重复提交被拦截 409", dup.status === 409, JSON.stringify(dup.j).slice(0, 80));

// 3. 我的工单列表
const list = await req("GET", "/me/tickets", null, token);
check("工单列表 200", list.status === 200, JSON.stringify(list.j).slice(0, 80));
check("列表含刚建工单", (list.j?.data?.list ?? []).some((x) => x.ticket_no === ticketNo));

// 4. 工单详情
const det = await req("GET", `/me/tickets/${ticketId}`, null, token);
check("工单详情 200", det.status === 200, JSON.stringify(det.j).slice(0, 80));
check("状态待处理", det.j?.data?.ticket?.status === "pending");

// 5. 客服队列（admin 视角）
const queue = await req("GET", "/admin/tickets?status=pending", null, token);
check("客服队列 200", queue.status === 200, JSON.stringify(queue.j).slice(0, 100));
check("队列含工单", (queue.j?.data?.list ?? []).some((x) => x.ticket_no === ticketNo));
check("队列 stats 含 pending", queue.j?.data?.stats?.pending >= 1);

// 6. 客服回复
const rep = await req("POST", `/admin/tickets/${ticketId}/reply`, { content: "您好，已核实您的充值记录，请稍等。" }, token);
check("客服回复 200", rep.status === 200, JSON.stringify(rep.j).slice(0, 80));

// 7. 客服变更状态为处理中 → 已解决
const st1 = await req("POST", `/admin/tickets/${ticketId}/status`, { status: "processing" }, token);
check("状态处理中 200", st1.status === 200);
const st2 = await req("POST", `/admin/tickets/${ticketId}/status`, { status: "resolved" }, token);
check("状态已解决 200", st2.status === 200);

// 8. 分配 + 标签 + 优先级
const asg = await req("POST", `/admin/tickets/${ticketId}/assign`, { assignee_id: userId }, token);
check("分配 200", asg.status === 200);
const tag = await req("POST", `/admin/tickets/${ticketId}/tags`, { add: "充值" }, token);
check("添加标签 200", tag.status === 200, JSON.stringify(tag.j).slice(0, 80));
const pri = await req("POST", `/admin/tickets/${ticketId}/priority`, { priority: "high" }, token);
check("优先级变更 200", pri.status === 200);

// 9. 用户查看回复 + 满意度评价
const det2 = await req("GET", `/me/tickets/${ticketId}`, null, token);
check("详情含客服回复", (det2.j?.data?.replies ?? []).some((r) => r.is_staff));
const sat = await req("POST", `/me/tickets/${ticketId}/satisfaction`, { rating: 5, comment: "服务很好" }, token);
check("满意度评价 200", sat.status === 200, JSON.stringify(sat.j).slice(0, 80));

// 10. 工单统计
const stats = await req("GET", "/admin/tickets/stats", null, token);
check("工单统计 200", stats.status === 200, JSON.stringify(stats.j).slice(0, 100));
check("统计含总工单", (stats.j?.data?.total ?? 0) >= 1);

// 11. 导出
const exp = await fetch(BASE + "/admin/tickets/export", { headers: { Authorization: `Bearer ${token}` } });
const expText = await exp.text();
check("导出 CSV 200", exp.status === 200, String(exp.status));
check("导出含工单号", expText.includes(ticketNo));

// 12. 操作日志
const det3 = await req("GET", `/admin/tickets/${ticketId}`, null, token);
check("详情含操作日志", (det3.j?.data?.operation_logs ?? []).length >= 4, JSON.stringify(det3.j?.data?.operation_logs ?? []).slice(0, 80));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
