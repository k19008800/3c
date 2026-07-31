// ============================================================
//  3cloud (3C) — 用户数据导出（§33.3）
//  POST /api/v1/me/data-export/request  — 申请导出
//  GET  /api/v1/me/data-export/requests — 导出请求记录
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, desc } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { dataExportRequests } from "../../db/schema.js";
import { authenticateJWT } from "../../middleware/auth.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const EXPORTS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../uploads/exports"
);

export async function meDataExportRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ── 申请导出 ──
  app.post("/api/v1/me/data-export/request", async (request, reply) => {
    const userId = request.user!.userId;

    try {
      // 检查是否有正在处理中的请求
      const existing = await getDb()
        .select({ id: dataExportRequests.id })
        .from(dataExportRequests)
        .where(
          eq(dataExportRequests.userId, userId)
        )
        .limit(1);

      if (existing.length > 0) {
        const active = await getDb()
          .select({ id: dataExportRequests.id })
          .from(dataExportRequests)
          .where(
            eq(dataExportRequests.userId, userId) &&
            eq(dataExportRequests.status, "pending") ||
            eq(dataExportRequests.status, "processing")
          )
          .limit(1);

        if (active.length > 0) {
          return reply.status(400).send({
            code: 1,
            data: null,
            message: "您已有正在处理中的导出请求，请等待处理完成后再申请",
          });
        }
      }

      const [result] = await getDb()
        .insert(dataExportRequests)
        .values({ userId })
        .returning({ id: dataExportRequests.id });

      reply.send({
        code: 0,
        data: { id: result.id },
        message: "申请成功，请等待管理员处理",
      });
    } catch (err: any) {
      reply.status(500).send({
        code: 1,
        data: null,
        message: `申请失败: ${err.message}`,
      });
    }
  });

  // ── 查询导出请求记录 ──
  app.get("/api/v1/me/data-export/requests", async (request, reply) => {
    const userId = request.user!.userId;
    const query = request.query as { page?: string; pageSize?: string };
    const page = Math.max(1, Number(query.page || "1"));
    const pageSize = Math.min(50, Number(query.pageSize || "20"));

    try {
      const db = getDb();
      const [totalResult] = await db
        .select({ count: db.$count(dataExportRequests) })
        .from(dataExportRequests)
        .where(eq(dataExportRequests.userId, userId));

      const total = Number(totalResult?.count ?? 0);

      const list = await db
        .select()
        .from(dataExportRequests)
        .where(eq(dataExportRequests.userId, userId))
        .orderBy(desc(dataExportRequests.requestedAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      reply.send({
        code: 0,
        data: {
          list: list.map((r) => ({
            id: r.id,
            status: r.status,
            fileUrl: r.fileUrl,
            fileSizeBytes: r.fileSizeBytes,
            fileExpiresAt: r.fileExpiresAt?.toISOString() ?? null,
            errorMessage: r.errorMessage,
            rejectReason: r.rejectReason,
            requestedAt: r.requestedAt.toISOString(),
            processedAt: r.processedAt?.toISOString() ?? null,
          })),
          total,
          page,
          pageSize,
        },
        message: "ok",
      });
    } catch (err: any) {
      reply.status(500).send({
        code: 1,
        data: null,
        message: `查询失败: ${err.message}`,
      });
    }
  });

  // ── 用户下载导出文件 ──
  app.get("/api/v1/me/data-export/:id/download", async (request, reply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };
    const requestId = Number(id);

    try {
      const db = getDb();
      const [req] = await db
        .select()
        .from(dataExportRequests)
        .where(eq(dataExportRequests.id, requestId))
        .limit(1);

      if (!req || req.userId !== userId) {
        return reply.status(404).send({ code: 1, data: null, message: "导出请求不存在" });
      }
      if (req.status !== "completed") {
        return reply.status(400).send({ code: 1, data: null, message: `文件未就绪，当前状态: ${req.status}` });
      }

      const fileName = `export-user-${userId}-${requestId}.json`;
      const filePath = path.join(EXPORTS_DIR, fileName);

      if (!fs.existsSync(filePath)) {
        return reply.status(404).send({ code: 1, data: null, message: "导出文件不存在，请联系管理员" });
      }

      const stream = fs.createReadStream(filePath);
      reply.header("Content-Type", "application/json");
      reply.header("Content-Disposition", `attachment; filename="${fileName}"`);
      reply.send(stream);
    } catch (err: any) {
      reply.status(500).send({ code: 1, data: null, message: `下载失败: ${err.message}` });
    }
  });
}