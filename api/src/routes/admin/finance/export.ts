// ============================================================
//  3cloud (3C) — 财务报表导出路由（CSV/JSON/PDF）
//  POST /api/v1/admin/finance/export/:type  — 导出
//  GET  /api/v1/admin/finance/export/download/:fileId — 下载
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, sql, gte, lte, desc } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { authenticateJWT, requirePerm, Perm } from "../../../middleware/auth.js";
import { AppError } from "../../../services/auth-service/index.js";
import { auditLogs, rechargeOrders, withdrawOrders, users, commissionLogs } from "../../../db/schema.js";
import { generateInvoicePdf } from "../../../services/billing-pdf.js";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// ══════════════════════════════════════════════════════════════
//  Helpers
// ══════════════════════════════════════════════════════════════

const EXPORT_DIR = path.join(os.tmpdir(), "3cloud-exports");
const BINARY_EXTENSIONS = new Set(["pdf"]);

function makeCsv(rows: Record<string, any>[], columns: string[]): string {
  const header = columns.map(c => JSON.stringify(c)).join(",");
  const data = rows.map(r =>
    columns.map(c => {
      const v = r[c];
      if (v === null || v === undefined) return "";
      const s = String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? JSON.stringify(s)
        : s;
    }).join(",")
  );
  return [header, ...data].join("\n");
}

function makeJson(rows: any[]): string {
  return JSON.stringify(rows, null, 2);
}

function serializeResult(rows: Record<string, any>[], columns: string[], format: "csv" | "json"): string {
  return format === "csv" ? makeCsv(rows, columns) : makeJson(rows);
}

// ══════════════════════════════════════════════════════════════
//  Export implementations
// ══════════════════════════════════════════════════════════════

async function exportRecharge(params: { dateRange: { start: string; end: string }; format: "csv" | "json" }) {
  const db = getDb();
  const start = new Date(params.dateRange.start);
  const end = new Date(params.dateRange.end);

  const rows = await db
    .select({
      id: rechargeOrders.id,
      userId: rechargeOrders.userId,
      email: sql<string>`coalesce(u.email, '')`,
      amount: sql<string>`${rechargeOrders.amount}::decimal`,
      channel: rechargeOrders.channel,
      status: rechargeOrders.status,
      remark: rechargeOrders.remark,
      createdAt: rechargeOrders.createdAt,
      paidAt: rechargeOrders.paidAt,
    })
    .from(rechargeOrders)
    .leftJoin(sql`users u`, sql`u.id = ${rechargeOrders.userId}`)
    .where(and(gte(rechargeOrders.createdAt, start), lte(rechargeOrders.createdAt, end)))
    .orderBy(desc(rechargeOrders.createdAt));

  const columns = ["ID", "用户ID", "邮箱", "金额", "支付渠道", "状态", "备注", "创建时间", "支付时间"];
  const mapped = rows.map(r => ({
    "ID": r.id, "用户ID": r.userId, "邮箱": r.email, "金额": r.amount,
    "支付渠道": r.channel, "状态": r.status, "备注": r.remark ?? "",
    "创建时间": new Date(r.createdAt).toLocaleString("zh-CN"),
    "支付时间": r.paidAt ? new Date(r.paidAt).toLocaleString("zh-CN") : "",
  }));

  return { content: serializeResult(mapped, columns, params.format), extension: params.format === "csv" ? "csv" : "json", recordCount: rows.length };
}

async function exportWithdraw(params: { dateRange: { start: string; end: string }; format: "csv" | "json" }) {
  const db = getDb();
  const start = new Date(params.dateRange.start);
  const end = new Date(params.dateRange.end);

  const rows = await db
    .select({
      id: withdrawOrders.id,
      agentId: withdrawOrders.agentId,
      userId: withdrawOrders.userId,
      email: sql<string>`coalesce(u.email, '')`,
      nickname: sql<string>`coalesce(u.nickname, '')`,
      amount: sql<string>`${withdrawOrders.amount}::decimal`,
      status: withdrawOrders.status,
      rejectReason: withdrawOrders.rejectReason,
      createdAt: withdrawOrders.createdAt,
    })
    .from(withdrawOrders)
    .leftJoin(sql`users u`, sql`u.id = ${withdrawOrders.userId}`)
    .where(and(gte(withdrawOrders.createdAt, start), lte(withdrawOrders.createdAt, end)))
    .orderBy(desc(withdrawOrders.createdAt));

  const columns = ["ID", "代理ID", "用户邮箱", "昵称", "金额", "状态", "拒绝原因", "创建时间"];
  const mapped = rows.map(r => ({
    "ID": r.id, "代理ID": r.agentId, "用户邮箱": r.email, "昵称": r.nickname,
    "金额": r.amount, "状态": r.status, "拒绝原因": r.rejectReason ?? "",
    "创建时间": new Date(r.createdAt).toLocaleString("zh-CN"),
  }));

  return { content: serializeResult(mapped, columns, params.format), extension: params.format === "csv" ? "csv" : "json", recordCount: rows.length };
}

async function exportBalance(params: { dateRange: { start: string; end: string }; format: "csv" | "json" }) {
  const db = getDb();
  const start = new Date(params.dateRange.start);
  const end = new Date(params.dateRange.end);

  const rows = await db.execute(sql`
    SELECT bl.id, bl.user_id, bl.amount, bl.type, bl.remark,
           COALESCE(u.email, '') as email, COALESCE(u.nickname, '') as nickname, bl.created_at
    FROM balance_logs bl
    LEFT JOIN users u ON u.id = bl.user_id
    WHERE bl.created_at >= ${start} AND bl.created_at <= ${end}
    ORDER BY bl.created_at DESC
  `);

  const rawRows = rows.rows || [];
  const columns = ["ID", "用户ID", "邮箱", "昵称", "金额", "类型", "备注", "时间"];
  const mapped = rawRows.map((r: any) => ({
    "ID": r.id, "用户ID": r.user_id, "邮箱": r.email, "昵称": r.nickname,
    "金额": r.amount, "类型": r.type, "备注": r.remark ?? "",
    "时间": new Date(r.created_at).toLocaleString("zh-CN"),
  }));

  return { content: serializeResult(mapped, columns, params.format), extension: params.format === "csv" ? "csv" : "json", recordCount: rawRows.length };
}

async function exportCommission(params: { dateRange: { start: string; end: string }; format: "csv" | "json" }) {
  const db = getDb();
  const start = new Date(params.dateRange.start);
  const end = new Date(params.dateRange.end);

  const rows = await db
    .select({
      id: commissionLogs.id,
      agentId: commissionLogs.agentId,
      userId: commissionLogs.userId,
      email: sql<string>`coalesce(u.email, '')`,
      nickname: sql<string>`coalesce(u.nickname, '')`,
      callCost: sql<string>`${commissionLogs.callCost}::decimal`,
      commissionAmount: sql<string>`${commissionLogs.commissionAmount}::decimal`,
      rate: commissionLogs.rate,
      status: commissionLogs.status,
      commissionType: commissionLogs.commissionType,
      createdAt: commissionLogs.createdAt,
      settledAt: commissionLogs.settledAt,
    })
    .from(commissionLogs)
    .leftJoin(sql`users u`, sql`u.id = ${commissionLogs.userId}`)
    .where(and(gte(commissionLogs.createdAt, start), lte(commissionLogs.createdAt, end)))
    .orderBy(desc(commissionLogs.createdAt));

  const columns = ["ID", "代理ID", "用户邮箱", "昵称", "消费金额", "佣金金额", "费率", "状态", "类型", "创建时间", "结算时间"];
  const mapped = rows.map(r => ({
    "ID": r.id, "代理ID": r.agentId, "用户邮箱": r.email, "昵称": r.nickname,
    "消费金额": r.callCost, "佣金金额": r.commissionAmount, "费率": r.rate ?? "",
    "状态": r.status, "类型": r.commissionType ?? "",
    "创建时间": new Date(r.createdAt).toLocaleString("zh-CN"),
    "结算时间": r.settledAt ? new Date(r.settledAt).toLocaleString("zh-CN") : "",
  }));

  return { content: serializeResult(mapped, columns, params.format), extension: params.format === "csv" ? "csv" : "json", recordCount: rows.length };
}

// ══════════════════════════════════════════════════════════════
//  PDF 账单导出
// ══════════════════════════════════════════════════════════════

async function exportSummaryPdf(params: { dateRange: { start: string; end: string }; format: string }) {
  const db = getDb();
  const start = new Date(params.dateRange.start);
  const end = new Date(params.dateRange.end);

  const [totalRow] = await db.execute(sql`
    SELECT coalesce(sum(total_tokens), 0)::bigint as total_tokens, count(*)::int as total_calls
    FROM call_logs
    WHERE created_at >= ${start} AND created_at <= ${end}
  `);
  const tr = (totalRow as any) || { total_tokens: 0, total_calls: 0 };

  const modelSummaryRes = await db.execute(sql`
    SELECT model, sum(total_tokens)::bigint as tokens
    FROM call_logs
    WHERE created_at >= ${start} AND created_at <= ${end}
    GROUP BY model ORDER BY tokens DESC LIMIT 20
  `);
  const modelRows = (modelSummaryRes.rows || modelSummaryRes) as any[];
  const totalTokens = (tr as any).total_tokens || 0;
  const totalCalls = (tr as any).total_calls || 0;

  const modelSummary = modelRows.map((r: any) => {
    const tokens = parseFloat(r.tokens) || 0;
    const pct = totalTokens > 0 ? ((tokens / totalTokens) * 100).toFixed(1) + "%" : "0%";
    return { model: r.model, amount: tokens * 0.000001, pct };
  });

  const dailyRes = await db.execute(sql`
    SELECT date(created_at) as day, sum(cast(input_tokens as bigint) + cast(output_tokens as bigint))::bigint as tokens
    FROM call_logs WHERE created_at >= ${start} AND created_at <= ${end}
    GROUP BY date(created_at) ORDER BY day
  `);
  const dailyRows = (dailyRes.rows || dailyRes) as any[];
  const dailySummary = dailyRows.map((r: any) => ({ date: r.day, amount: (parseFloat(r.tokens) || 0) * 0.000001 }));

  const pdfBuffer = await generateInvoicePdf({
    userName: "管理员", userId: 0,
    periodStart: params.dateRange.start, periodEnd: params.dateRange.end,
    generatedAt: new Date().toLocaleString("zh-CN"),
    totalSpend: modelSummary.reduce((s, r) => s + r.amount, 0),
    totalCalls, totalTokens, modelSummary, dailySummary,
  });

  return { content: pdfBuffer.toString("base64"), extension: "pdf", recordCount: modelRows.length, isBinary: true };
}

// ══════════════════════════════════════════════════════════════
//  File helpers
// ══════════════════════════════════════════════════════════════

async function saveExport(content: string, extension: string, userId: number): Promise<{ fileId: string; signature: string; filename: string }> {
  await mkdir(EXPORT_DIR, { recursive: true });
  const fileId = randomBytes(8).toString("hex");
  const filename = `export_${fileId}.${extension}`;
  await writeFile(path.join(EXPORT_DIR, filename), content, "utf-8");
  const signature = createHash("sha256").update(`${fileId}:${userId}:3cloud-export-secret-v1`).digest("hex").substring(0, 16);
  return { fileId, signature, filename };
}

async function saveExportBinary(content: string, extension: string, userId: number): Promise<{ fileId: string; signature: string; filename: string }> {
  await mkdir(EXPORT_DIR, { recursive: true });
  const fileId = randomBytes(8).toString("hex");
  const filename = `export_${fileId}.${extension}`;
  await writeFile(path.join(EXPORT_DIR, filename), Buffer.from(content, "base64"));
  const signature = createHash("sha256").update(`${fileId}:${userId}:3cloud-export-secret-v1`).digest("hex").substring(0, 16);
  return { fileId, signature, filename };
}

// ══════════════════════════════════════════════════════════════
//  Audit log
// ══════════════════════════════════════════════════════════════

async function logExport(operatorId: number, type: string, format: string, recordCount: number) {
  const db = getDb();
  await db.insert(auditLogs).values({
    operatorId, action: "finance_export" as any, targetType: "finance_export", targetId: null,
    description: JSON.stringify({ type, format, recordCount }), ip: null, createdAt: new Date(),
  });
}

// ══════════════════════════════════════════════════════════════
//  Routes
// ══════════════════════════════════════════════════════════════

export async function adminFinanceExportRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  const exportHandlers: Record<string, (params: any) => Promise<any>> = {
    recharge: exportRecharge, withdraw: exportWithdraw,
    commission: exportCommission, balance: exportBalance,
    summary: exportSummaryPdf,
  };

  app.post("/api/v1/admin/finance/export/:type", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const { type } = request.params as { type: string };
      const body = request.body as { dateRange?: { start: string; end: string }; format?: "csv" | "json" };

      if (!body.dateRange?.start || !body.dateRange?.end) throw new AppError(400, "请选择导出时间范围");

      const handler = exportHandlers[type];
      if (!handler) throw new AppError(400, `不支持的导出类型: ${type}`);

      const format = body.format || "csv";
      const result = await handler({ dateRange: body.dateRange, format });

      const isBinary = result.isBinary === true || BINARY_EXTENSIONS.has(result.extension);
      const { fileId, signature, filename } = isBinary
        ? await saveExportBinary(result.content, result.extension, request.user!.userId)
        : await saveExport(result.content, result.extension, request.user!.userId);

      await logExport(request.user!.userId, type, format, result.recordCount);

      reply.status(200).send({
        code: 0,
        data: { fileId, signature, filename, downloadUrl: `/api/v1/admin/finance/export/download/${fileId}?sig=${signature}`, recordCount: result.recordCount, format },
        message: "ok",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  app.get("/api/v1/admin/finance/export/download/:fileId", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const { fileId } = request.params as { fileId: string };

      for (const ext of [".csv", ".json", ".pdf"]) {
        const fp = path.join(EXPORT_DIR, `export_${fileId}${ext}`);
        try {
          const buffer = await readFile(fp);
          const mime = ext === ".csv" ? "text/csv; charset=utf-8"
            : ext === ".json" ? "application/json; charset=utf-8"
            : "application/pdf";

          reply.header("Content-Type", mime);
          reply.header("Content-Disposition", `attachment; filename="${encodeURIComponent(path.basename(fp))}"`);
          reply.header("Content-Length", buffer.length);
          reply.send(buffer);
          setTimeout(() => unlink(fp).catch(() => {}), 300_000);
          return;
        } catch { /* try next ext */ }
      }

      throw new AppError(404, "文件不存在或已过期");
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });
}
