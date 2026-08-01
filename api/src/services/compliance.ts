import { pool } from "../db/index";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** 数据导出根目录（本地文件系统，TTL 7 天清理） */
const EXPORT_DIR = process.env.DATA_EXPORT_DIR || path.join(process.cwd(), "data-exports");

/**
 * 合规法务与成本分析 服务层（§33）
 * 对齐 SPEC-§33-合规法务与成本分析.md
 * - consent 状态解析（隐私政策/服务条款）
 * - 用户数据导出 ZIP 生成（GDPR 数据可携带权）
 */

/** 解析用户当前协议确认状态（none/privacy_pending/tos_pending/both_pending）*/
export async function resolveConsentStatus(userId: number): Promise<string> {
  const [privacy, tos, u] = await Promise.all([
    pool.query(`SELECT id, status FROM privacy_policy_versions WHERE status='published' ORDER BY published_at DESC LIMIT 1`),
    pool.query(`SELECT id, status FROM terms_of_service_versions WHERE status='published' ORDER BY published_at DESC LIMIT 1`),
    pool.query(`SELECT consent_status FROM users WHERE id=$1`, [userId]),
  ]);
  const curPrivacy = privacy.rows[0];
  const curTos = tos.rows[0];
  const prevStatus = u.rows[0]?.consent_status ?? "none";

  // 无任何已发布协议 → none
  if (!curPrivacy && !curTos) {
    if (prevStatus !== "none") {
      await pool.query(`UPDATE users SET consent_status='none' WHERE id=$1`, [userId]);
    }
    return "none";
  }

  // 检查用户是否已同意当前已发布版本
  let privacyPending = false;
  let tosPending = false;

  if (curPrivacy) {
    const c = await pool.query(
      `SELECT 1 FROM user_privacy_consents WHERE user_id=$1 AND version_id=$2 LIMIT 1`,
      [userId, curPrivacy.id],
    );
    privacyPending = c.rows.length === 0;
  }
  if (curTos) {
    const c = await pool.query(
      `SELECT 1 FROM user_tos_consents WHERE user_id=$1 AND version_id=$2 LIMIT 1`,
      [userId, curTos.id],
    );
    tosPending = c.rows.length === 0;
  }

  const status = privacyPending && tosPending ? "both_pending" : privacyPending ? "privacy_pending" : tosPending ? "tos_pending" : "none";
  if (status !== prevStatus) {
    await pool.query(`UPDATE users SET consent_status=$1 WHERE id=$2`, [status, userId]);
  }
  return status;
}

/**
 * 生成用户数据导出 ZIP（§33.3）
 * 说明：本环境无 OSS，导出文件写入本地 data-exports/ 目录，下载走受保护端点（7 天 TTL）
 * 返回 { fileUrl(相对下载路径), fileSizeBytes, fileCount, files }
 */
export async function generateUserExport(requestId: number, userId: number): Promise<{
  fileUrl: string;
  fileSizeBytes: number;
  fileCount: number;
  files: string[];
}> {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });

  // 1. 收集各类型数据（JSON Lines）—— 单个数据源失败不阻塞整个导出（容错）
  const files: Array<{ name: string; lines: unknown[] }> = [];
  const safe = async (fn: () => Promise<void>) => { try { await fn(); } catch (e: any) { console.error(`[合规导出] 数据源跳过: ${e?.message}`); } };

  // 个人资料（必需）
  const user = (await pool.query(`SELECT id,email,username,phone,role,status,real_name_status,consent_status,created_at FROM users WHERE id=$1`, [userId])).rows[0];
  if (!user) throw new Error("用户不存在");
  files.push({ name: "personal-info.json", lines: [user] });

  // API Key 列表（不含完整 Key，显示前缀）
  await safe(async () => {
    const apiKeys = (await pool.query(`SELECT name, key_prefix AS prefix, status, created_at FROM api_keys WHERE user_id=$1 AND deleted_at IS NULL`, [userId])).rows;
    if (apiKeys.length) files.push({ name: "api-keys.json", lines: apiKeys });
  });

  // 调用日志（按日聚合，最近 180 天）
  await safe(async () => {
    const callLogs = (await pool.query(
      `SELECT date_trunc('day', created_at)::date AS day, model_id, count(*) AS calls, sum(cost) AS total_cost
       FROM call_logs WHERE user_id=$1 AND created_at > now() - interval '180 days'
       GROUP BY 1,2 ORDER BY 1`,
      [userId],
    )).rows;
    if (callLogs.length) files.push({ name: "call-logs.json", lines: callLogs });
  });

  // 充值记录
  await safe(async () => {
    const recharges = (await pool.query(`SELECT id, amount, pay_amount, actual_amount, payment_method, status, paid_at, created_at FROM recharge_orders WHERE user_id=$1`, [userId])).rows;
    if (recharges.length) files.push({ name: "recharge-records.json", lines: recharges });
  });

  // 余额变动
  await safe(async () => {
    const balances = (await pool.query(`SELECT id, amount, type, description, balance_before, balance_after, created_at FROM balance_logs WHERE user_id=$1`, [userId])).rows;
    if (balances.length) files.push({ name: "balance-history.json", lines: balances });
  });

  // 交易记录（billing）
  await safe(async () => {
    const billing = (await pool.query(`SELECT id, call_log_id, actual_cost, estimated_cost, status, created_at FROM billing_logs WHERE user_id=$1`, [userId])).rows;
    if (billing.length) files.push({ name: "transactions.json", lines: billing });
  });

  // 发票
  await safe(async () => {
    const invoices = (await pool.query(`SELECT id, invoice_no, amount, total_amount, status, title, created_at FROM invoices WHERE user_id=$1`, [userId])).rows;
    if (invoices.length) files.push({ name: "invoices.json", lines: invoices });
  });

  // 兑换码
  await safe(async () => {
    const redemptions = (await pool.query(`SELECT batch_id, code, amount, created_at FROM redemption_logs WHERE user_id=$1`, [userId])).rows;
    if (redemptions.length) files.push({ name: "redemption-records.json", lines: redemptions });
  });

  // 代理信息
  await safe(async () => {
    const agent = (await pool.query(`SELECT level, commission_rate::float AS commission_rate, verify_status, created_at FROM agent_profiles WHERE user_id=$1`, [userId])).rows[0];
    if (agent) files.push({ name: "agent-info.json", lines: [agent] });
  });

  // 授权设备 / 登录历史
  await safe(async () => {
    const devices = (await pool.query(`SELECT device_name, device_type, os, browser, last_active_at, risk_level FROM user_devices WHERE user_id=$1`, [userId])).rows;
    if (devices.length) files.push({ name: "user-devices.json", lines: devices });
  });

  // 安全事件（monitoring 无 user_id，改查登录历史承载安全事件）
  await safe(async () => {
    const loginHistory = (await pool.query(`SELECT ip, city, country, device_name, first_seen_at, last_active_at, risk_level FROM user_devices WHERE user_id=$1`, [userId])).rows;
    if (loginHistory.length) files.push({ name: "login-history.json", lines: loginHistory });
  });

  // 通知偏好
  await safe(async () => {
    const notif = (await pool.query(`SELECT type, channel, notify_enabled, created_at FROM notification_subscriptions WHERE user_id=$1`, [userId])).rows;
    if (notif.length) files.push({ name: "notification-preferences.json", lines: notif });
  });

  // 隐私/条款同意历史
  const consentHistory: any[] = [];
  const pc = (await pool.query(`SELECT v.version, v.status, c.consented_at FROM user_privacy_consents c JOIN privacy_policy_versions v ON v.id=c.version_id WHERE c.user_id=$1`, [userId])).rows;
  const tc = (await pool.query(`SELECT v.version, v.status, c.consented_at FROM user_tos_consents c JOIN terms_of_service_versions v ON v.id=c.version_id WHERE c.user_id=$1`, [userId])).rows;
  if (pc.length) pc.forEach((r) => consentHistory.push({ type: "privacy", ...r }));
  if (tc.length) tc.forEach((r) => consentHistory.push({ type: "tos", ...r }));
  if (consentHistory.length) files.push({ name: "consent-history.json", lines: consentHistory });

  // 2. 写临时目录
  const tmpDir = path.join(EXPORT_DIR, `tmp_${requestId}_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const manifestFiles: Array<{ name: string; records: number; sizeBytes: number }> = [];

  for (const f of files) {
      const content: string = f.lines.map((l) => JSON.stringify(l)).join("\n");
      const fp = path.join(tmpDir, f.name);
    fs.writeFileSync(fp, content, "utf8");
    manifestFiles.push({ name: f.name, records: f.lines.length, sizeBytes: Buffer.byteLength(content, "utf8") });
  }

  // MANIFEST.json
  const manifest = {
    exportId: `exp-${requestId}`,
    userId,
    requestedAt: new Date().toISOString(),
    exportedAt: new Date().toISOString(),
    totalFiles: manifestFiles.length,
    totalRecords: manifestFiles.reduce((s, f) => s + f.records, 0),
    totalSizeBytes: manifestFiles.reduce((s, f) => s + f.sizeBytes, 0),
    files: manifestFiles,
    dataFreshness: "exportedAt 时刻的存量数据快照",
    format: "JSON Lines (每行一个 JSON 对象, UTF-8)",
    supportContact: "support@3cloud.io",
  };
  fs.writeFileSync(path.join(tmpDir, "MANIFEST.json"), JSON.stringify(manifest, null, 2), "utf8");

  // README.txt
  fs.writeFileSync(
    path.join(tmpDir, "README.txt"),
    "3Cloud 用户数据导出\n\n本文件包含您在 3Cloud 平台上的数据。\n所有 JSON 文件为 JSON Lines 格式（每行一个 JSON 对象，UTF-8 编码）。\nSTRUCTURE 说明见 MANIFEST.json。\n\n如有疑问请联系客服：support@3cloud.io\n",
    "utf8",
  );

  // 3. 打包 ZIP（优先系统 zip 命令，回退 node 压缩）。用 zip 命令 linux/mac；Windows 用 powershell Compress-Archive 简化
  const zipName = `export-${userId}-${requestId}-${Date.now()}.zip`;
  const zipPath = path.join(EXPORT_DIR, zipName);

  const isWin = os.platform() === "win32";
  if (isWin) {
    // 用 tar.exe (Windows 自带) 创建 zip
    const { spawnSync } = await import("node:child_process");
    const r = spawnSync("tar", ["-a", "-c", "-f", zipPath, "-C", tmpDir, "."], { encoding: "utf8" });
    if (r.status !== 0) throw new Error("ZIP 打包失败: " + r.stderr);
  } else {
    if (fs.existsSync(EXPORT_DIR)) {
      // 尝试系统 zip
      try {
        await execFileAsync("zip", ["-rj", zipPath, path.join(tmpDir, "*")]);
      } catch {
        // 回退：使用 node zlib 手动（简化：仅打包单目录内文件为 tar 不做了，直接报错留给调用方）
        throw new Error("系统缺少 zip 命令，打包失败");
      }
    }
  }

  // 4. 清理临时目录
  fs.rmSync(tmpDir, { recursive: true, force: true });

  const fileSizeBytes = fs.statSync(zipPath).size;
  return {
    fileUrl: `/api/v1/admin/data-export/files/${requestId}/${zipName}`,
    fileSizeBytes,
    fileCount: manifestFiles.length,
    files: manifestFiles.map((f) => f.name),
  };
}

/** 数据导出请求到期状态升级 + 过期文件清理（供 cron 或启动时调用）*/
export async function markOverdueExports(): Promise<number> {
  const r = await pool.query(
    `UPDATE data_export_requests SET status='overdue'
     WHERE status IN ('pending','processing') AND deadline IS NOT NULL AND deadline < now()`,
  );
  return r.rowCount ?? 0;
}

/** 清理过期导出文件（文件 TTL 7 天） */
export async function cleanupExpiredFiles(): Promise<number> {
  const r = await pool.query(
    `SELECT id, file_url FROM data_export_requests WHERE file_expires_at IS NOT NULL AND file_expires_at < now() AND status='completed'`,
  );
  let removed = 0;
  for (const row of r.rows) {
    if (row.file_url && row.file_url.includes("/")) {
      const name = row.file_url.split("/").pop();
      const fp = path.join(EXPORT_DIR, name);
      try { if (fs.existsSync(fp)) { fs.unlinkSync(fp); removed++; } } catch { /* ignore */ }
    }
  }
  return removed;
}

/** 生成下载 token（含用户 + 请求 + 过期，HMAC 签名）*/
export function signDownloadToken(requestId: number, userId: number, secret: string, expiresAt: number): string {
  const payload = `${requestId}.${userId}.${expiresAt}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex").slice(0, 32);
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

export function verifyDownloadToken(token: string, secret: string): { requestId: number; userId: number; expiresAt: number } | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2 || !parts[0] || !parts[1]) return null;
    const [b64, sig] = parts;
    const payload = Buffer.from(b64, "base64url").toString("utf8");
    const [requestId, userId, expiresAt] = payload.split(".").map(Number);
    if (!requestId || !userId || !expiresAt) return null;
    const expect = crypto.createHmac("sha256", secret).update(payload).digest("hex").slice(0, 32);
    if (expect !== sig) return null;
    if (expiresAt < Date.now()) return null;
    return { requestId, userId, expiresAt };
  } catch {
    return null;
  }
}
