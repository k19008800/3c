import { db, pool } from "../db/index";
import { customers, customerContacts, customerStatusLogs, followReminders } from "../db/schema/sales-crm";


// ============ CRM 客户管理 ============

export async function listMyCustomers(salespersonId: number, q?: { status?: string; tag?: string; search?: string; minRevenue?: number; page?: number; pageSize?: number }) {
  const page = Math.max(1, q?.page || 1);
  const pageSize = Math.min(100, q?.pageSize || 20);
  const offset = (page - 1) * pageSize;
  let where = "WHERE c.salesperson_id=$1";
  const params: any[] = [salespersonId];
  let idx = 2;
  if (q?.status && q.status !== "all") { params.push(q.status); where += " AND c.status=$" + idx++; }
  if (q?.search) { params.push("%" + q.search + "%"); where += " AND (u.email ILIKE $" + idx + " OR u.username ILIKE $" + idx + ")"; idx++; }
  const total = (await pool.query("SELECT count(*)::int c FROM customers c JOIN users u ON u.id=c.user_id " + where, params)).rows[0].c;
  const rows = await pool.query(
    "SELECT c.*, u.email, u.username, u.balance, u.role, u.status AS user_status, u.created_at AS user_created_at" +
    " FROM customers c JOIN users u ON u.id=c.user_id " + where +
    " ORDER BY c.updated_at DESC LIMIT " + pageSize + " OFFSET " + offset,
    params,
  );
  return { list: rows.rows, pagination: { page, page_size: pageSize, total } };
}

export async function getCustomerDetail(userId: number, salespersonId: number) {
  const c = (await pool.query(
    "SELECT c.*, u.email, u.username, u.balance, u.role, u.status AS user_status, u.created_at AS user_created_at, u.real_name_status" +
    " FROM customers c JOIN users u ON u.id=c.user_id WHERE c.user_id=$1 AND c.salesperson_id=$2 LIMIT 1",
    [userId, salespersonId],
  )).rows[0];
  if (!c) return null;
  const contacts = await pool.query(
    "SELECT * FROM customer_contacts WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20",
    [userId],
  );
  const statusLogs = await pool.query(
    "SELECT * FROM customer_status_logs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10",
    [userId],
  );
  const tags = c.tags?.length ? (await pool.query(
    "SELECT * FROM customer_tag_defs WHERE id = ANY($1::int[])",
    [c.tags],
  )).rows : [];
  return { customer: c, contacts: contacts.rows, statusLogs: statusLogs.rows, tags };
}

export async function updateCustomerStatus(userId: number, salespersonId: number, toStatus: string, reason?: string) {
  const c = (await pool.query("SELECT status FROM customers WHERE user_id=$1 AND salesperson_id=$2 LIMIT 1", [userId, salespersonId])).rows[0];
  const fromStatus = c?.status;
  await pool.query("UPDATE customers SET status=$1, updated_at=NOW() WHERE user_id=$2 AND salesperson_id=$3", [toStatus, userId, salespersonId]);
  await db.insert(customerStatusLogs).values({ userId, salespersonId, fromStatus: fromStatus || null, toStatus: toStatus as any, reason: reason || null });
  return { fromStatus, toStatus };
}

export async function addContact(userId: number, salespersonId: number, data: { method: string; summary: string; nextFollowUp?: Date }) {
  const r = await db.insert(customerContacts).values({ userId, salespersonId, method: data.method as any, summary: data.summary, nextFollowUp: data.nextFollowUp ?? null }).returning();
  return r[0];
}

export async function assignCustomer(userId: number, salespersonId: number) {
  const existing = await pool.query("SELECT id FROM customers WHERE user_id=$1 LIMIT 1", [userId]);
  if (existing.rows[0]) {
    await pool.query("UPDATE customers SET salesperson_id=$1, updated_at=NOW() WHERE user_id=$2", [salespersonId, userId]);
    return { assigned: true, updated: true };
  }
  await db.insert(customers).values({ userId, salespersonId }).returning();
  return { assigned: true, updated: false };
}

// ============ 标签管理 ============

export async function listTags() {
  return (await pool.query("SELECT * FROM customer_tag_defs ORDER BY is_preset DESC, name ASC")).rows;
}

export async function setCustomerTags(userId: number, salespersonId: number, tagIds: number[]) {
  // 验证最多5个标签
  if (tagIds.length > 5) throw new Error("MAX_TAGS: 最多5个标签");
  await pool.query("UPDATE customers SET tags=$1, updated_at=NOW() WHERE user_id=$2 AND salesperson_id=$3", [tagIds, userId, salespersonId]);
  return tagIds;
}

// ============ 跟进提醒 ============

export async function listReminders(salespersonId: number, status?: string) {
  let where = "WHERE salesperson_id=$1";
  const params: any[] = [salespersonId];
  if (status) { params.push(status); where += " AND status=$2"; }
  return (await pool.query("SELECT * FROM follow_reminders " + where + " ORDER BY due_at ASC", params)).rows;
}

export async function createReminder(salespersonId: number, data: { userId: number; title: string; description?: string; dueAt: Date }) {
  const r = await db.insert(followReminders).values({ userId: data.userId, salespersonId, title: data.title, description: data.description ?? null, dueAt: data.dueAt }).returning();
  return r[0];
}

export async function completeReminder(id: number, salespersonId: number) {
  await pool.query("UPDATE follow_reminders SET status='completed', completed_at=NOW() WHERE id=$1 AND salesperson_id=$2", [id, salespersonId]);
  return { ok: true };
}

// ============ 业绩看板 ============

export async function getPerformance(salespersonId: number, periodStart?: string, periodEnd?: string) {
  // 汇总本月业绩
  const now = new Date();
  const start = periodStart || new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const end = periodEnd || now.toISOString();
  const perf = (await pool.query(
    "SELECT * FROM sales_performance WHERE salesperson_id=$1 AND period_start>=$2 AND period_end<=$3 ORDER BY period_start DESC LIMIT 1",
    [salespersonId, start, end],
  )).rows[0];
  // 实时统计
  const stats = (await pool.query(
    "SELECT count(*)::int AS customer_count, count(*) FILTER (WHERE status='active')::int AS active_count FROM customers WHERE salesperson_id=$1",
    [salespersonId],
  )).rows[0];
  return { performance: perf || null, stats };
}

export async function listAllSalesPersons() {
  return (await pool.query(
    "SELECT id, email, username FROM users WHERE role IN ('admin','super_admin','sales') ORDER BY id",
  )).rows;
}
