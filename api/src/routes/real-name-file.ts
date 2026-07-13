// ============================================================
//  3cloud (3C) — 实名文件服务路由
//  GET /api/v1/admin/real-name/file/:userId/:filename
//  管理员审核时查看证件原图（审核完成后仍可查看）
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT, requirePerm, Perm } from "../middleware/auth.js";
import { getFileAbsolutePath, getMimeType } from "../services/real-name-service.js";
import fs from "node:fs";
import path from "node:path";
import { AppError } from "../services/auth-service.js";

export async function realNameFileRoutes(app: FastifyInstance) {
  // ── 管理员查看实名证件文件 ──
  // GET /api/v1/admin/real-name/file/{userId}/{filename}
  // 只有 admin / super_admin 可访问
  // 文件名格式: {version}_{type}.{ext}
  //   如: 3_id_front.jpg, 1_id_back.png, 2_business_license.pdf

  app.get("/api/v1/admin/real-name/file/:userId/:filename", {
    preHandler: [authenticateJWT, requirePerm(Perm.REVIEW_ACTION)],
    handler: async (request, reply) => {
      const params = request.params as {
        userId: string;
        filename: string;
      };
      const userId = parseInt(params.userId, 10);
      const filename = params.filename;

      if (isNaN(userId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的用户 ID" });
        return;
      }

      // 安全校验：防止路径穿越
      if (
        filename.includes("..") ||
        filename.includes("/") ||
        filename.includes("\\") ||
        !filename.match(/^\d+_(id_front|id_back|business_license)\.\w+$/)
      ) {
        reply.status(400).send({ code: 400, data: null, message: "非法文件名" });
        return;
      }

      try {
        const relativePath = `/real-name/${userId}/${filename}`;
        const filePath = getFileAbsolutePath(relativePath);

        if (!fs.existsSync(filePath)) {
          reply.status(404).send({ code: 404, data: null, message: "文件不存在" });
          return;
        }

        const ext = path.extname(filename).toLowerCase();
        reply.type(getMimeType(ext));
        reply.send(fs.createReadStream(filePath));
      } catch (err) {
        if (err instanceof AppError) {
          reply.status(err.statusCode).send({
            code: err.statusCode,
            data: null,
            message: err.message,
          });
          return;
        }
        throw err;
      }
    },
  });
}
