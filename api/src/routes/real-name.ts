import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db, pool } from "../db/index";
import { realNameRecords, maskId } from "../db/schema/real-name-records";
import { users } from "../db/schema/users";

/**
 * 实名认证模块
 * 对齐 flowcharts/03-real-name-review.md
 * 用户端：提交实名 / 查询我的实名
 * 管理端：待审列表 / 审核通过/驳回 / 直接确认
 * 状态机: unverified → pending_review → approved / rejected
 */

const STATUS_LABEL: Record<string, string> = {
  unverified: "未认证",
  pending_review: "待审核",
  approved: "已认证",
  rejected: "已驳回",
};
const TYPE_LABEL: Record<string, string> = { individual: "个人", enterprise: "企业" };

function requireAuth(app: FastifyInstance) {
  return async (req: any, reply: any) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const decoded = app.jwt.verify(token as string);
      req.user = decoded;
    } catch {
      return reply.code(401).send({ code: 401, error: "UNAUTHORIZED", message: "未认证或凭证已失效" });
    }
  };
}
function requireAdmin(app: FastifyInstance) {
  return async (req: any, reply: any) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const decoded = app.jwt.verify(token as string);
      req.user = decoded;
      const role = (decoded as any).role;
      if (role !== "admin" && role !== "super_admin") {
        return reply.code(403).send({ code: 403, error: "FORBIDDEN", message: "需要管理员权限" });
      }
    } catch (e: any) {
      if (e?.statusCode === 403) return;
      return reply.code(401).send({ code: 401, error: "UNAUTHORIZED" });
    }
  };
}

export function realNameRoutes(app: FastifyInstance) {
  const auth = requireAuth(app);
  const admin = requireAdmin(app);

  // ===== 1. 我的实名状态 =====
  app.get("/me/real-name", { onRequest: [auth] }, async (req) => {
    const userId = Number((req as any).user.sub);
    const u = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const rec = await db
      .select()
      .from(realNameRecords)
      .where(eq(realNameRecords.userId, userId))
      .orderBy(realNameRecords.createdAt)
      .limit(1);
    const r = rec[0];
    return {
      code: 0,
      data: {
        status: r?.status ?? "unverified",
        status_label: STATUS_LABEL[r?.status ?? "unverified"] ?? "未认证",
        real_name: r?.realName ? maskId(r.realName) : null,
        id_number: r?.idNumber ? maskId(r.idNumber) : null,
        type: r?.type,
        type_label: r?.type ? TYPE_LABEL[r.type] : null,
        reject_reason: r?.rejectReason ?? null,
        user_real_name_status: u[0]?.realNameStatus,
      },
      message: "ok",
    };
  });

  // ===== 2. 提交实名申请 =====
  app.post("/me/real-name", { onRequest: [auth] }, async (req, reply) => {
    const userId = Number((req as any).user.sub);
    const b = req.body as { type?: string; real_name: string; id_number: string; phone?: string; legal_person?: string; company_address?: string };
    if (!b.real_name?.trim()) return reply.code(400).send({ code: 400, error: "MISSING_NAME", message: "请填写真实姓名" });
    if (!b.id_number?.trim()) return reply.code(400).send({ code: 400, error: "MISSING_ID", message: "请填写证件号" });
    const type = b.type === "enterprise" ? "enterprise" : "individual";

    // 是否已有审核中/已通过的实名
    const exist = await db.select().from(realNameRecords).where(eq(realNameRecords.userId, userId)).limit(1);
    const cur = exist[0];
    if (cur && (cur.status === "pending_review" || cur.status === "approved")) {
      return reply.code(400).send({ code: 400, error: "EXISTS", message: "已有进行中或已通过的实名认证" });
    }

    // 基础校验：身份证 18 位
    const idNum = b.id_number.trim();
    if (idNum.length < 5 || idNum.length > 20) {
      return reply.code(400).send({ code: 400, error: "BAD_ID", message: "证件号格式有误" });
    }

    let recordId: number;
    const now = new Date();
    if (cur) {
      // 更新（重新提交）
      const upd = await db
        .update(realNameRecords)
        .set({ type, realName: b.real_name.trim(), idNumber: idNum, phone: b.phone ?? null, legalPerson: b.legal_person ?? null, companyAddress: b.company_address ?? null, status: "pending_review", reviewerId: null, rejectReason: null, reviewedAt: null, updatedAt: now })
        .where(eq(realNameRecords.id, cur.id))
        .returning({ id: realNameRecords.id });
      recordId = upd[0]!.id;
    } else {
      const created = await db
        .insert(realNameRecords)
        .values({ userId, type, realName: b.real_name.trim(), idNumber: idNum, phone: b.phone ?? null, legalPerson: b.legal_person ?? null, companyAddress: b.company_address ?? null, status: "pending_review" })
        .returning({ id: realNameRecords.id });
      recordId = created[0]!.id;
    }

    // 同步 users.real_name_status
    await db.update(users).set({ realNameStatus: "pending_review" }).where(eq(users.id, userId));

    return { code: 0, data: { id: recordId, status: "pending_review", status_label: "待审核" }, message: "实名认证申请已提交，等待审核" };
  });

  // ===== 3. 管理端：待审列表 =====
  app.get("/admin/real-name", { onRequest: [admin] }, async (req) => {
    const q = req.query as { page?: number; page_size?: number; status?: string; keyword?: string };
    const page = Math.max(Number(q.page ?? 1), 1);
    const pageSize = Math.min(Number(q.page_size ?? 20), 100);
    const offset = (page - 1) * pageSize;

    let where = "WHERE 1=1";
    const whereParams: any[] = [];
    const wp = (v: any) => { whereParams.push(v); return `$${whereParams.length}`; };
    if (q.status) where += ` AND r.status = ${wp(q.status)}`;
    if (q.keyword) where += ` AND (u.email ILIKE ${wp(`%${q.keyword}%`)} OR r.real_name ILIKE ${wp(`%${q.keyword}%`)})`;

    const pageParams = [...whereParams, pageSize, offset];
    const rows = await pool.query(
      `SELECT r.id, r.user_id, r.type, r.real_name, r.id_number, r.phone, r.status, r.reject_reason, r.created_at,
              u.email, u.username
       FROM real_name_records r JOIN users u ON u.id = r.user_id ${where}
       ORDER BY r.created_at DESC LIMIT $${whereParams.length + 1} OFFSET $${whereParams.length + 2}`,
      pageParams,
    );
    const total = await pool.query(`SELECT COUNT(*)::int AS total FROM real_name_records r JOIN users u ON u.id = r.user_id ${where}`, whereParams);
    return {
      code: 0,
      data: {
        list: rows.rows.map((r: any) => ({ ...r, id_number: maskId(r.id_number), status_label: STATUS_LABEL[r.status] ?? r.status, type_label: TYPE_LABEL[r.type] ?? r.type })),
        pagination: { page, page_size: pageSize, total: Number(total.rows[0]?.total ?? 0) },
      },
      message: "ok",
    };
  });

  // ===== 4. 审核 =====
  app.post("/admin/real-name/:id/review", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const reviewerId = Number((req as any).user.sub);
    const { action, reason } = req.body as { action: "approve" | "reject"; reason?: string };
    if (!["approve", "reject"].includes(action)) return reply.code(400).send({ code: 400, error: "BAD_ACTION" });

    const rec = await db.select().from(realNameRecords).where(eq(realNameRecords.id, id)).limit(1);
    if (!rec[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });

    const newStatus = action === "approve" ? "approved" : "rejected";
    await db
      .update(realNameRecords)
      .set({ status: newStatus, reviewerId, reviewedAt: new Date(), rejectReason: action === "reject" ? (reason ?? "资料有误") : null, updatedAt: new Date() })
      .where(eq(realNameRecords.id, id));
    // 同步 users.real_name_status
    await db.update(users).set({ realNameStatus: newStatus }).where(eq(users.id, rec[0].userId));

    return { code: 0, data: { ok: true, status: newStatus }, message: action === "approve" ? "实名已通过" : "实名已驳回" };
  });

  // ===== 5. 管理端：直接确认（绕过申请）=====
  app.post("/admin/real-name/:userId/confirm", { onRequest: [admin] }, async (req, reply) => {
    const userId = Number((req.params as any).userId);
    const u = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND", message: "用户不存在" });
    await db.update(users).set({ realNameStatus: "approved" }).where(eq(users.id, userId));
    // 若无记录则建一条
    const exist = await db.select().from(realNameRecords).where(eq(realNameRecords.userId, userId)).limit(1);
    if (!exist[0]) {
      await db.insert(realNameRecords).values({ userId, type: "individual", realName: u[0].username ?? "用户", idNumber: `MANUAL-${userId}`, status: "approved", reviewerId: reviewerOf(req), reviewedAt: new Date() });
    } else {
      await db.update(realNameRecords).set({ status: "approved", reviewerId: reviewerOf(req), reviewedAt: new Date(), rejectReason: null }).where(eq(realNameRecords.id, exist[0].id));
    }
    return { code: 0, data: { ok: true, status: "approved" }, message: "已直接确认实名" };
  });
}

function reviewerOf(req: any): number {
  return Number((req as any).user?.sub ?? 0);
}
