/**
 * §33 合规法务与成本分析 冒烟测试
 * 流程：admin 发布隐私政策/服务条款 → 用户确认 → 用户申请数据导出 → admin 处理(生成ZIP) → 用户下载
 * 前提：API 已启动，DB 可写
 */
import pg from "pg";
import "dotenv/config";

const BASE = "http://localhost:3000/api/v1";
const CONN = process.env.DATABASE_URL || "postgres://postgres:***@localhost:5432/threecloud_v2";
const pool = new pg.Pool({ connectionString: CONN });
const stamp = Date.now();
const ADMIN_EMAIL = `admin33_${stamp}@t.com`;
const USER_EMAIL = `user33_${stamp}@t.com`;
const PASS = "pass123456";
let failures = 0;
const ok = (name, cond) => { console.log(`${cond ? "✅" : "❌"} ${name}`); if (!cond) failures++; };

async function api(method, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const isBodylessMethod = method === "GET" || method === "DELETE";
  const hasBody = !isBodylessMethod;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: hasBody ? JSON.stringify(body ?? {}) : undefined,
  });
  let json;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}

async function main() {
  // 建 admin + 注册 user
  const bcrypt = (await import("bcryptjs")).default;
  await pool.query(
    `INSERT INTO users (email, password_hash, username, role, status) VALUES ($1,$2,'admin33','admin','active') ON CONFLICT (email) DO NOTHING`,
    [ADMIN_EMAIL, await bcrypt.hash(PASS, 10)],
  );
  const ru = await api("POST", "/auth/register", { email: USER_EMAIL, password: PASS, username: "u33" });
  ok("注册用户", ru.status === 201);
  const la = await api("POST", "/auth/login", { email: ADMIN_EMAIL, password: PASS });
  const lu = await api("POST", "/auth/login", { email: USER_EMAIL, password: PASS });
  const adminTok = la.json.token;
  const userTok = lu.json.token;
  ok("admin+user 登录", !!adminTok && !!userTok);

  // 1. admin 创建并发布隐私政策
  const pv = await api("POST", "/admin/settings/privacy-policy/versions", { version: "v1.0", content: "## 隐私政策内容 v1" }, adminTok);
  ok("创建隐私政策草稿", pv.status === 200 && pv.json.data?.id > 0);
  const pid = pv.json.data?.id;
  const pub = await api("POST", `/admin/settings/privacy-policy/versions/${pid}/publish`, {}, adminTok);
  ok("发布隐私政策", pub.status === 200 && pub.json.data?.published === true);

  // 2. admin 创建并发布服务条款
  const tv = await api("POST", "/admin/settings/terms-of-service/versions", { version: "v1.0", content: "## 服务条款 v1" }, adminTok);
  const tid = tv.json.data?.id;
  await api("POST", `/admin/settings/terms-of-service/versions/${tid}/publish`, {}, adminTok);

  // 3. 用户确认状态（应 both_pending）
  const st = await api("GET", "/me/consent/status", {}, userTok);
  ok("用户待确认状态 both_pending", st.status === 200 && st.json.data?.status === "both_pending");

  // 4. 用户同意两个
  await api("POST", "/me/consent/privacy", {}, userTok);
  const cty = await api("POST", "/me/consent/terms", {}, userTok);
  ok("同意条款后状态 none", cty.status === 200 && cty.json.data?.status === "none");

  // 5. 同意统计
  const vlist = await api("GET", "/admin/settings/privacy-policy/versions", {}, adminTok);
  ok("同意统计 consent_count=1", vlist.status === 200 && vlist.json.data?.list?.some((v) => v.id === pid && v.consent_count >= 1));

  // 6. 用户申请数据导出
  const req = await api("POST", "/me/data-export/request", {}, userTok);
  ok("用户申请导出", req.status === 200 && req.json.data?.request_id > 0);
  const requestId = req.json.data?.request_id;

  // 7. admin 处理导出（生成 ZIP）
  const proc = await api("POST", `/admin/data-export/${requestId}/process`, {}, adminTok);
  console.log("  [诊断] process status =", proc.status, "body =", JSON.stringify(proc.json));
  ok("admin 处理导出生成ZIP", proc.status === 200 && proc.json.data?.status === "completed" && proc.json.data?.file_count > 0 && (proc.json.data?.file_size_bytes || 0) > 0);

  // 8. 导出请求记录可见
  const myReq = await api("GET", "/me/data-export/requests", {}, userTok);
  ok("用户查看导出记录", myReq.status === 200 && myReq.json.data?.list?.some((r) => r.id === requestId && r.status === "completed"));

  // 9. ZIP 文件真实存在（数据库 file_url + 本地文件）
  const recRows = (await pool.query(`SELECT file_url, file_size_bytes FROM data_export_requests WHERE id=$1`, [requestId])).rows;
  console.log("  [诊断] db rows =", JSON.stringify(recRows));
  const rec = recRows[0];
  const fs = await import("node:fs");
  const path = await import("node:path");
  const dir = process.env.DATA_EXPORT_DIR || path.join(process.cwd(), "data-exports");
  const fileName = path.basename(rec.file_url);
  const fp = path.join(dir, fileName);
  ok("ZIP 文件已生成到磁盘", fs.existsSync(fp) && rec.file_size_bytes > 0);

  // 10. 状态统计
  const stats = await api("GET", "/admin/data-export/stats", {}, adminTok);
  ok("导出状态统计", stats.status === 200 && stats.json.data?.completed >= 1);

  // 清理（删除测试请求 + 导出文件 + 测试用户）
  await pool.query(`DELETE FROM user_export_jobs WHERE request_id=$1`, [requestId]);
  await pool.query(`DELETE FROM data_export_requests WHERE id=$1`, [requestId]);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  await pool.query(`DELETE FROM user_privacy_consents WHERE user_id=(SELECT id FROM users WHERE email=$1)`, [USER_EMAIL]);
  await pool.query(`DELETE FROM user_tos_consents WHERE user_id=(SELECT id FROM users WHERE email=$1)`, [USER_EMAIL]);
  await pool.query(`DELETE FROM users WHERE email=$1`, [USER_EMAIL]);

  console.log(`\n===== §33 冒烟: ${failures === 0 ? "全部通过 ✅" : failures + " 项失败 ❌"} =====`);
  await pool.end();
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error("冒烟异常:", e); process.exit(1); });
