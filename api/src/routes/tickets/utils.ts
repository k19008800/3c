// ============================================================
//  3cloud (3C) — 工单系统工具函数
//  工单号生成：TS + 日期(YYYYMMDD) + 4位序号
// ============================================================

import { getDb } from "../../db/index.js";
import { tickets } from "../../db/schema/tickets.js";
import { desc, sql } from "drizzle-orm";

export async function generateTicketNo(): Promise<string> {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const prefix = `TS${y}${m}${d}-`;

  const db = getDb();
  // 查找当天最大序号
  const last = await db
    .select({ ticketNo: tickets.ticketNo })
    .from(tickets)
    .where(sql`ticket_no LIKE ${prefix}%`)
    .orderBy(desc(tickets.ticketNo))
    .limit(1);

  let seq = 1;
  if (last.length > 0) {
    const lastSeq = parseInt(last[0].ticketNo.slice(-4), 10);
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return `${prefix}${String(seq).padStart(4, "0")}`;
}
