import { db, pool } from "../db/index";
import { ticketOperationLogs } from "../db/schema/ticket-support";

/** 生成工单号 TS + 日期 + 4位序号 */
export async function nextTicketNo(): Promise<string> {
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `TS${ymd}`;
  const r = await pool.query(`SELECT COUNT(*)::int AS c FROM tickets WHERE ticket_no LIKE $1 || '%'`, [prefix]);
  const seq = (r.rows[0]?.c ?? 0) + 1;
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}

/** 写入工单操作日志 */
export async function logTicketOp(ticketId: number, operatorId: number | null, action: string, detail?: string) {
  await db.insert(ticketOperationLogs).values({ ticketId, operatorId, action, detail });
}

/** 检查用户是否短时间内重复提交相似工单（5分钟内同标题>90%相似） */
export async function isDuplicateTicket(userId: number, title: string): Promise<boolean> {
  const r = await pool.query(
    `SELECT title FROM tickets WHERE user_id=$1 AND created_at > NOW() - interval '5 minutes' ORDER BY created_at DESC LIMIT 3`,
    [userId],
  );
  for (const row of r.rows) {
    const prev = String(row.title ?? "");
    if (prev && similarity(prev, title) > 0.9) return true;
  }
  return false;
}

/** 简单字符级相似度（Levenshtein 近似） */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1;
  const editDist = levenshtein(longer, shorter);
  return 1 - editDist / longer.length;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n]!;
}
