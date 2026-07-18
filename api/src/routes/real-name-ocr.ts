// ============================================================
//  3cloud (3C) — OCR 识别路由（用户端）
//  POST /api/v1/auth/real-name/ocr
//  上传证件文件后调用 OCR 识别
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT } from "../middleware/auth.js";
import { AppError } from "../services/auth-service/index.js";
import { getFileAbsolutePath, getMimeType } from "../services/real-name-service.js";
import { OcrProviderFactory } from "../services/real-name-ocr/provider.js";
import "../services/real-name-ocr/deepseek.js";  // 注册 DeepSeek 供应商
import fs from "node:fs";
import path from "node:path";

function readImageAsBase64(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return buffer.toString('base64');
}

export async function realNameOcrRoutes(app: FastifyInstance) {
  // ── OCR 识别证件信息 ──
  // POST /api/v1/auth/real-name/ocr
  // Body: { filePath: string, fileType: "id_front" | "id_back" | "business_license" }
  app.post("/api/v1/auth/real-name/ocr", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      const userId = request.user!.userId;

      try {
        const body = request.body as {
          filePath?: string;
          fileType?: string;
        };

        if (!body.filePath || !body.fileType) {
          reply.status(400).send({ code: 400, data: null, message: "缺少 filePath 或 fileType" });
          return;
        }

        if (!["id_front", "id_back", "business_license"].includes(body.fileType)) {
          reply.status(400).send({ code: 400, data: null, message: "无效的 fileType，支持: id_front, id_back, business_license" });
          return;
        }

        // 校验文件路径是否属于当前用户（安全）
        const fileParts = body.filePath.split('/');
        const fileUserId = parseInt(fileParts[2], 10);
        if (isNaN(fileUserId) || fileUserId !== userId) {
          reply.status(403).send({ code: 403, data: null, message: "无权访问该文件" });
          return;
        }

        // 获取文件绝对路径
        const absolutePath = getFileAbsolutePath(body.filePath);

        if (!fs.existsSync(absolutePath)) {
          reply.status(404).send({ code: 404, data: null, message: "文件不存在，请重新上传" });
          return;
        }

        // 读取图片为 base64
        const imageBase64 = readImageAsBase64(absolutePath);

        // 调用 OCR 识别
        const provider = OcrProviderFactory.create('deepseek');
        const result = await provider.recognize(imageBase64, body.fileType);

        reply.status(200).send({
          code: 0,
          data: result,
          message: "ok",
        });

      } catch (err: any) {
        if (err instanceof AppError) {
          reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
          return;
        }

        // DeepSeek API 错误
        if (err.message?.includes('DeepSeek API 错误') || err.message?.includes('DeepSeek 返回空结果')) {
          reply.status(502).send({ code: 502, data: null, message: err.message });
          return;
        }

        console.error(`[OCR] 识别失败 (userId=${userId}):`, err);
        reply.status(500).send({ code: 500, data: null, message: "OCR 识别失败: " + (err.message || "未知错误") });
      }
    },
  });
}
