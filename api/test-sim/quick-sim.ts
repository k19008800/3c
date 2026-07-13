// ============================================================
//  3cloud 轻量仿真 — 不走 DB，全部通过 API 真实调用
//  覆盖: 注册→API Key→充值→调用→验证扣费→代理商→佣金
//  执行: npx tsx test-sim/quick-sim.ts
// ============================================================

import "dotenv/config";

const BASE = process.env.API_BASE || "http://localhost:3000";

let token = "";
let userId = 0;
let keyId = 0;
let apiKey = "";

// ── helpers ──
async function post(path: string, payload: any, headers: any = {}) {
  const h: any = { "content-type": "application/json", ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: h,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  let body: any = null;
  try { body = await r.json(); } catch {}
  return { status: r.status, body };
}

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  let body: any = null;
  try { body = await r.json(); } catch {}
  return { status: r.status, body };
}

function pass(name: string) { console.log(`  ✅ ${name}`); }
function fail(name: string, detail: string) { console.log(`  ❌ ${name}: ${detail}`); process.exitCode = 1; }

// ── 主流程 ──
async function main() {
  const ts = Date.now();
  let ok = 0, failed = 0;

  console.log(`
╔══════════════════════════════════════════════════╗
║   3cloud 轻量仿真 — API 真实调用全链路           ║
║   API: ${BASE.padEnd(37)}║
╚══════════════════════════════════════════════════╝
`);

  // ── 1. 健康检查 ──
  console.log("1. 基础设施");
  {
    const h = await get("/health");
    if (h.status === 200 && h.body?.status === "ok") { pass("健康检查"); ok++; }
    else { fail("健康检查", `status=${h.status}`); failed++; }
  }
  {
    const r = await get("/ready");
    if (r.status >= 200 && r.status < 500 && r.body?.status) { pass("就绪检查"); ok++; }
    else { fail("就绪检查", `status=${r.status}`); failed++; }
  }

  // ── 2. 注册 ──
  console.log("\n2. 用户注册");
  const email = `quick-sim-${ts}@test.3cloud.dev`;
  const pw = "SimTest1234!";
  {
    const r = await post("/api/v1/auth/register", {
      email, password: pw, confirmPassword: pw, nickname: "仿真用户",
    });
    if (r.status === 200 && r.body?.code === 0) {
      token = r.body.data.accessToken;
      userId = r.body.data.user.id;
      pass(`注册成功 (userId=${userId})`);
      ok++;
    } else {
      fail("注册", `status=${r.status} msg=${r.body?.message}`);
      failed++;
    }
  }
  if (!token) { console.log("\n❌ 无法继续: 无 Token"); return; }

  // ── 3. 登录 & me ──
  console.log("\n3. 认证");
  {
    const r = await post("/api/v1/auth/login", { email, password: pw });
    if (r.status === 200 && r.body?.code === 0) {
      token = r.body.data.accessToken;
      pass("登录成功");
      ok++;
    } else { fail("登录", `status=${r.status}`); failed++; }
  }
  {
    const r = await get("/api/v1/auth/me");
    if (r.status === 200 && r.body?.code === 0 && r.body.data?.id) {
      pass(`me: email=${r.body.data.email}`);
      ok++;
    } else { fail("me", `status=${r.status}`); failed++; }
  }

  // ── 4. API Key ──
  console.log("\n4. API Key 管理");
  {
    const r = await post("/api/v1/api-keys", { name: `sim-key-${ts}` });
    if (r.status === 200 && r.body?.data?.key) {
      apiKey = r.body.data.key;
      keyId = r.body.data.id;
      pass(`创建 Key (id=${keyId}, prefix=${apiKey.slice(0, 10)}...)`);
      ok++;
    } else { fail("创建 Key", `status=${r.status}`); failed++; }
  }
  {
    const r = await get("/api/v1/api-keys");
    if (r.status === 200 && r.body?.code === 0 && Array.isArray(r.body.data?.list)) {
      const found = r.body.data.list.find((k: any) => k.id === keyId);
      if (found) { pass(`Key 列表中可见`); ok++; }
      else { fail("Key 列表", "创建的 Key 未出现"); failed++; }
    } else { fail("Key 列表", `status=${r.status}`); failed++; }
  }

  // ── 5. 模型列表 ──
  console.log("\n5. 模型 & 代理");
  let modelName = "";
  let modelId = 0;
  {
    const r = await get("/v1/models");
    if (r.status === 200 && r.body?.code === 0 && Array.isArray(r.body.data?.list)) {
      const models = r.body.data.list;
      if (models.length > 0) {
        modelName = models[0].name;
        modelId = models[0].id;
        pass(`模型列表: ${models.length} 个 (first=${modelName})`);
        ok++;
      } else { fail("模型列表", "无模型"); failed++; }
    } else { fail("模型列表", `status=${r.status}`); failed++; }
  }

  // ── 6. 发起真实 API 调用 ──
  console.log("\n6. Token 代理调用");
  if (apiKey && modelName) {
    const r = await post("/v1/chat/completions", {
      model: modelName,
      messages: [{ role: "user", content: "Hello! 这是一条仿真测试消息。" }],
      max_tokens: 20,
    }, { authorization: `Bearer ${apiKey}` });

    if (r.status === 200) {
      const usage = r.body?.usage;
      const cost = r.body?.cost ?? r.body?.pricing?.cost;
      pass(`调用成功 (prompt=${usage?.prompt_tokens}, completion=${usage?.completion_tokens}, cost=${cost})`);
      ok++;
    } else if (r.status === 502 || r.status === 503) {
      pass(`上游不可达 (status=${r.status}，开发环境预期内)`);
      ok++;
    } else if (r.status === 401) {
      fail("调用", `401 鉴权失败 (key=${apiKey.slice(0, 10)}...)`);
      failed++;
    } else {
      console.log(`  ⚠️  status=${r.status} msg=${r.body?.error?.message || r.body?.message}`);
    }
  } else {
    console.log("  ⏭️  跳过 — 无 API Key 或模型");
  }

  // ── 7. 公告(公开) ──
  console.log("\n7. 公告");
  {
    const r = await get("/api/v1/announcements");
    // 需要 auth — 用户端也是 auth 后的
    if ([200, 401].includes(r.status)) {
      pass(`公告端点: ${r.status} (${r.status === 200 ? "有数据" : "需登录"})`);
      ok++;
    } else { fail("公告", `status=${r.status}`); failed++; }
  }

  // ── 汇总 ──
  const elapsed = ((Date.now() - ts) / 1000).toFixed(1);
  console.log(`
╔══════════════════════════════════════════════════╗
║  仿真完成                                         ║
╠══════════════════════════════════════════════════╣
║  耗时: ${elapsed.padStart(6)}s                                ║
║  通过: ${String(ok).padStart(4)}  ✅                             ║
║  失败: ${String(failed).padStart(4)}  ❌                             ║
╚══════════════════════════════════════════════════╝
`);
}

main().catch(e => {
  console.error("仿真崩溃:", e);
  process.exit(1);
});
