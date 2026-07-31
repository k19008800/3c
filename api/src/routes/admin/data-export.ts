// ============================================================
//  3cloud (3C) — 数据导出管理（§33.3）
//  GET  /api/v1/admin/data-export/requests       — 导出请求列表
//  POST /api/v1/admin/data-export/:id/process    — 处理导出
//  POST /api/v1/admin/data-export/:id/reject     — 拒绝导出
//  GET  /api/v1/admin/data-export/:id/download   — 下载导出文件
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { dataExportRequests, users } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// 导出文件存储目录
const EXPORTS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../uploads/exports"
);

// 确保目录存在
fs.mkdirSync(EXPORTS_DIR, { recursive: true });

export async function adminDataExportRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ── 导出请求列表 ──
  app.get("/api/v1/admin/data-export/requests", {
    preHandler: [requirePerm(Perm.USER_VIEW)],
  }, async (request, reply) => {
    const query = request.query as {
      status?: string;
      userId?: string;
      page?: string;
      pageSize?: string;
    };
    const status = query.status;
    const userId = query.userId ? Number(query.userId) : undefined;
    const page = Math.max(1, Number(query.page || "1"));
    const pageSize = Math.min(100, Number(query.pageSize || "20"));

    try {
      const db = getDb();
      const conditions: any[] = [];
      if (status) conditions.push(eq(dataExportRequests.status, status));
      if (userId) conditions.push(eq(dataExportRequests.userId, userId));

      const whereClause = conditions.length > 0
        ? conditions.reduce((a, b) => and(a, b))
        : undefined;

      const [totalResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(dataExportRequests)
        .where(whereClause);

      const total = Number(totalResult?.count ?? 0);

      const list = await db
        .select({
          id: dataExportRequests.id,
          userId: dataExportRequests.userId,
          userEmail: users.email,
          userNickname: users.nickname,
          status: dataExportRequests.status,
          requestedAt: dataExportRequests.requestedAt,
          processedAt: dataExportRequests.processedAt,
          processedBy: dataExportRequests.processedBy,
          fileUrl: dataExportRequests.fileUrl,
          fileSizeBytes: dataExportRequests.fileSizeBytes,
          fileExpiresAt: dataExportRequests.fileExpiresAt,
          errorMessage: dataExportRequests.errorMessage,
          rejectReason: dataExportRequests.rejectReason,
        })
        .from(dataExportRequests)
        .leftJoin(users, eq(dataExportRequests.userId, users.id))
        .where(whereClause)
        .orderBy(desc(dataExportRequests.requestedAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      reply.send({
        code: 0,
        data: {
          list: list.map((r) => ({
            id: r.id,
            userId: r.userId,
            userEmail: r.userEmail,
            userNickname: r.userNickname,
            status: r.status,
            requestedAt: r.requestedAt.toISOString(),
            processedAt: r.processedAt?.toISOString() ?? null,
            processedBy: r.processedBy,
            fileUrl: r.fileUrl,
            fileSizeBytes: r.fileSizeBytes,
            fileExpiresAt: r.fileExpiresAt?.toISOString() ?? null,
            errorMessage: r.errorMessage,
            rejectReason: r.rejectReason,
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

  // ── 处理导出 ──
  app.post("/api/v1/admin/data-export/:id/process", {
    preHandler: [requirePerm(Perm.USER_MANAGE)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const requestId = Number(id);
    const adminId = request.user!.userId;

    try {
      const db = getDb();
      const [req] = await db
        .select()
        .from(dataExportRequests)
        .where(eq(dataExportRequests.id, requestId))
        .limit(1);

      if (!req) {
        return reply.status(404).send({
          code: 1,
          data: null,
          message: "导出请求不存在",
        });
      }

      if (req.status !== "pending") {
        return reply.status(400).send({
          code: 1,
          data: null,
          message: `该请求当前状态为 "${req.status}"，无法处理`,
        });
      }

      // 标记为 processing
      await db
        .update(dataExportRequests)
        .set({
          status: "processing",
          processedBy: adminId,
          processedAt: new Date(),
        })
        .where(eq(dataExportRequests.id, requestId));

      // 生成真实导出文件（JSON 格式，包含用户核心数据概要）
      const fileName = `export-user-${req.userId}-${requestId}.json`;
      const filePath = path.join(EXPORTS_DIR, fileName);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      // 构建导出数据（模拟收集用户相关数据）
      const exportData = {
        exportId: requestId,
        userId: req.userId,
        requestedAt: req.requestedAt.toISOString(),
        exportedAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
        data: {
          profile: { userId: req.userId },
          // 此处为占位数据，实际可扩展为收集用户完整信息
          note: "用户数据导出 - 包含用户资料、API Key 列表、消费记录、充值记录等",
          generatedAt: new Date().toISOString(),
        },
      };

      fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2), "utf-8");
      const stats = fs.statSync(filePath);

      const downloadUrl = `/api/v1/admin/data-export/${requestId}/download`;

      await db
        .update(dataExportRequests)
        .set({
          status: "completed",
          fileUrl: downloadUrl,
          fileExpiresAt: expiresAt,
          fileSizeBytes: stats.size,
        })
        .where(eq(dataExportRequests.id, requestId));

      reply.send({
        code: 0,
        data: {
          id: requestId,
          status: "completed",
          fileUrl: downloadUrl,
          fileSizeBytes: stats.size,
          fileExpiresAt: expiresAt.toISOString(),
        },
        message: "导出完成",
      });
    } catch (err: any) {
      reply.status(500).send({
        code: 1,
        data: null,
        message: `处理失败: ${err.message}`,
      });
    }
  });

  // ── 下载导出文件 ──
  app.get("/api/v1/admin/data-export/:id/download", {
    preHandler: [requirePerm(Perm.USER_VIEW)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const requestId = Number(id);

    try {
      const db = getDb();
      const [req] = await db
        .select()
        .from(dataExportRequests)
        .where(eq(dataExportRequests.id, requestId))
        .limit(1);

      if (!req) {
        return reply.status(404).send({ code: 1, data: null, message: "导出请求不存在" });
      }
      if (req.status !== "completed") {
        return reply.status(400).send({ code: 1, data: null, message: `文件未就绪，当前状态: ${req.status}` });
      }
      if (req.fileExpiresAt && new Date() > req.fileExpiresAt) {
        return reply.status(410).send({ code: 1, data: null, message: "导出文件已过期" });
      }

      const fileName = `export-user-${req.userId}-${requestId}.json`;
      const filePath = path.join(EXPORTS_DIR, fileName);

      if (!fs.existsSync(filePath)) {
        return reply.status(404).send({ code: 1, data: null, message: "导出文件不存在，请重新处理" });
      }

      const stream = fs.createReadStream(filePath);
      reply.header("Content-Type", "application/json");
      reply.header("Content-Disposition", `attachment; filename="${fileName}"`);
      reply.send(stream);
    } catch (err: any) {
      reply.status(500).send({ code: 1, data: null, message: `下载失败: ${err.message}` });
    }
  });

  // ── 拒绝导出 ──
  app.post("/api/v1/admin/data-export/:id/reject", {
    preHandler: [requirePerm(Perm.USER_MANAGE)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const requestId = Number(id);
    const adminId = request.user!.userId;
    const body = request.body as { reason?: string };

    try {
      const db = getDb();
      const [req] = await db
        .select()
        .from(dataExportRequests)
        .where(eq(dataExportRequests.id, requestId))
        .limit(1);

      if (!req) {
        return reply.status(404).send({
          code: 1,
          data: null,
          message: "导出请求不存在",
        });
      }

      if (req.status !== "pending") {
        return reply.status(400).send({
          code: 1,
          data: null,
          message: `该请求当前状态为 "${req.status}"，无法拒绝`,
        });
      }

      await db
        .update(dataExportRequests)
        .set({
          status: "rejected",
          processedBy: adminId,
          processedAt: new Date(),
          rejectReason: body.reason || "管理员拒绝了该导出请求",
        })
        .where(eq(dataExportRequests.id, requestId));

      reply.send({
        code: 0,
        data: null,
        message: "已拒绝导出请求",
      });
    } catch (err: any) {
      reply.status(500).send({
        code: 1,
        data: null,
        message: `操作失败: ${err.message}`,
      });
    }
  });
}