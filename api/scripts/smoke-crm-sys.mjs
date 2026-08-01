#!/usr/bin/env node
import { Pool } from "pg";
import { request } from "http";

const BASE = "http://localhost:3000/api/v1";

function req(method, url, token, body) {
  return new Promise((resolve) => {
    const headers = { "content-type": "application/json" };
    if (token) headers["authorization"] = "Bearer " + token;
    const opts = { method, headers };
    const r = request(url, opts, (res) => {
      let data = "";
      res.on("data", (c) => data += c);
      res.on("end", () => resolve({ ok: res.statusCode < 400, status: res.statusCode, body: JSON.parse(data || "{}") }));
    });
    r.on("error", (e) => resolve({ ok: false, body: { error: e.message } }));
    if (body !== undefined) r.write(JSON.stringify(body));
    r.end();
  });
}

async function main() {
  console.log("=== §11 CRM + §12 冒烟 ===\n");

  let r = await req("POST", BASE + "/auth/login", null, { email: "admin@3cloud.io", password: "seed-admin" });
  if (!r.ok) { console.error("x login", r.body); process.exit(1); }
  const token = r.body.token;

  // my id
  r = await req("GET", BASE + "/auth/me", token);
  const myId = r.body?.user?.id || 6;
  console.log("✓ login as userId:", myId);

  // seed customer for user 6 (admin self)
  const pool = new Pool({ connectionString: "postgres://postgres:postgres@localhost:5432/threecloud_v2" });
  await pool.query("INSERT INTO customers (user_id, salesperson_id, status) VALUES ($1,$2,'trial') ON CONFLICT (user_id) DO UPDATE SET salesperson_id=$2", [6, myId]);
  await pool.end();
  console.log("✓ seeded customer for userId=6");

  // §11 CRM
  r = await req("POST", BASE + "/me/customers/6/assign", token, {});
  console.log(r.ok ? "✓ assign" : "x assign", JSON.stringify(r.body).slice(0,100));

  r = await req("GET", BASE + "/me/customers/6", token);
  console.log(r.ok ? "✓ detail" : "x detail", JSON.stringify(r.body).slice(0,100));

  r = await req("PUT", BASE + "/me/customers/6/status", token, { status: "active", reason: "smoke" });
  console.log(r.ok ? "✓ status active" : "x status", JSON.stringify(r.body).slice(0,100));

  r = await req("POST", BASE + "/me/customers/6/contacts", token, { method: "phone", summary: "test" });
  console.log(r.ok ? "✓ contact" : "x contact", JSON.stringify(r.body).slice(0,100));

  r = await req("GET", BASE + "/me/customer-tags", token);
  console.log(r.ok ? "✓ tags count=" + (r.body?.data?.list?.length ?? 0) : "x tags");

  r = await req("PUT", BASE + "/me/customers/6/tags", token, { tag_ids: [1, 2] });
  console.log(r.ok ? "✓ tags update" : "x tags", JSON.stringify(r.body).slice(0,100));

  r = await req("GET", BASE + "/me/follow-reminders", token);
  console.log(r.ok ? "✓ reminders" : "x reminders", JSON.stringify(r.body).slice(0,100));

  r = await req("POST", BASE + "/me/follow-reminders", token, { user_id: 6, title: "test", due_at: "2026-08-05T00:00:00Z" });
  console.log(r.ok ? "✓ reminder create" : "x reminder", JSON.stringify(r.body).slice(0,100));

  r = await req("GET", BASE + "/me/sales-performance", token);
  console.log(r.ok ? "✓ perf" : "x perf", JSON.stringify(r.body).slice(0,100));

  r = await req("GET", BASE + "/admin/customers", token);
  console.log(r.ok ? "✓ admin customers" : "x admin customers", JSON.stringify(r.body).slice(0,100));

  r = await req("GET", BASE + "/admin/sales-persons", token);
  console.log(r.ok ? "✓ sales-persons" : "x", JSON.stringify(r.body).slice(0,100));

  // §12
  console.log("\n--- §12 ---");
  r = await req("GET", BASE + "/admin/sys/db/schema", token);
  console.log(r.ok ? "✓ db schema tables=" + (r.body?.data?.tables?.length ?? 0) : "x");

  r = await req("GET", BASE + "/admin/sys/cache/keys", token);
  console.log(r.ok ? "✓ cache keys count=" + (r.body?.data?.count ?? 0) : "x");

  r = await req("GET", BASE + "/admin/sys/version", token);
  console.log(r.ok ? "✓ version " + (r.body?.data?.version || "") : "x");

  r = await req("GET", BASE + "/admin/sys/migrations", token);
  console.log(r.ok ? "✓ migrations count=" + (r.body?.data?.list?.length ?? 0) : "x");

  r = await req("GET", BASE + "/admin/sys/logs", token);
  console.log(r.ok ? "✓ logs" : "delta logs");

  r = await req("POST", BASE + "/admin/sys/db/query", token, { sql: "SELECT count(*)::int c FROM users" });
  console.log(r.body?.error === "FORBIDDEN" ? "✓ db/query blocked (correct)" : "delta", JSON.stringify(r.body).slice(0, 80));

  console.log("\n=== DONE ===");
}

main().catch((e) => { console.error(e); process.exit(1); });
