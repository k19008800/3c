// ============================================================
//  3cloud (3C) — 富文本图片上传 API
//  POST /api/v1/admin/upload/rich-image — 上传富文本图片
//  POST /api/v1/admin/upload/rich-image-base64 — Base64 图片上传
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT } from "../../../middleware/auth.js";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join, extname } from "path";
import { config } from "../../../config.js";
import sharp from "sharp";
import { nanoid } from "nanoid";

// ── 类型定义 ──

interface UploadResponse {
  code: number;
  data?: {
    url: string;
    filename: string;
    size: number;
    width?: number;
    height?: number;
  };
  message: string;
}

// ── 确保上传目录存在 ──

function ensureUploadDir(): string {
  const uploadDir = join(config.uploadDir || "uploads", "rich-text");
  if (!existsSync(uploadDir)) {
    mkdirSync(uploadDir, { recursive: true });
  }
  return uploadDir;
}

// ── 验证图片类型 ──

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

function validateImage(mimetype: string, size: number): { valid: boolean; error?: string } {
  if (!ALLOWED_MIME_TYPES.includes(mimetype)) {
    return { valid: false, error: "仅支持 JPEG、PNG、GIF、WebP 格式" };
  }
  if (size > MAX_FILE_SIZE) {
    return { valid: false, error: "图片大小不能超过 5MB" };
  }
  return { valid: true };
}

// ── 路由 ──

export async function uploadRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ── POST /api/v1/admin/upload/rich-image — Multipart 图片上传 ──
  app.post("/api/v1/admin/upload/rich-image", async (request, reply) => {
    try {
      const data = await request.file();
      
      if (!data) {
        reply.status(400).send({
          code: 1,
          message: "未找到上传文件",
        } as UploadResponse);
        return;
      }

      // 验证文件
      const validation = validateImage(data.mimetype, data.file.bytesRead);
      if (!validation.valid) {
        reply.status(400).send({
          code: 1,
          message: validation.error!,
        } as UploadResponse);
        return;
      }

      // 生成文件名
      const ext = extname(data.filename || "image.jpg");
      const filename = `${nanoid(12)}${ext}`;
      const uploadDir = ensureUploadDir();
      const filepath = join(uploadDir, filename);

      // 处理图片（压缩、获取尺寸）
      const buffer = await data.toBuffer();
      const imageInfo = await sharp(buffer).metadata();
      
      // 限制最大尺寸 2000px
      let processedBuffer = buffer;
      if (imageInfo.width && imageInfo.width > 2000) {
        processedBuffer = await sharp(buffer)
          .resize(2000, undefined, { fit: "inside" })
          .toBuffer();
      }

      // 写入文件
      writeFileSync(filepath, processedBuffer);

      // 构建 URL
      const baseUrl = config.publicUrl || `http://localhost:${config.port}`;
      const url = `${baseUrl}/uploads/rich-text/${filename}`;

      reply.send({
        code: 0,
        data: {
          url,
          filename,
          size: processedBuffer.length,
          width: imageInfo.width,
          height: imageInfo.height,
        },
        message: "上传成功",
      } as UploadResponse);
    } catch (err: any) {
      app.log.error({ err }, "富文本图片上传失败");
      reply.status(500).send({
        code: 1,
        message: `上传失败: ${err.message}`,
      } as UploadResponse);
    }
  });

  // ── POST /api/v1/admin/upload/rich-image-base64 — Base64 图片上传 ──
  app.post("/api/v1/admin/upload/rich-image-base64", async (request, reply) => {
    try {
      const body = request.body as {
        image: string; // data:image/png;base64,xxxxx
        filename?: string;
      };

      if (!body.image || !body.image.startsWith("data:image/")) {
        reply.status(400).send({
          code: 1,
          message: "无效的 Base64 图片数据",
        } as UploadResponse);
        return;
      }

      // 解析 Base64
      const matches = body.image.match(/^data:(image\/\w+);base64,(.+)$/);
      if (!matches) {
        reply.status(400).send({
          code: 1,
          message: "Base64 格式解析失败",
        } as UploadResponse);
        return;
      }

      const mimetype = matches[1];
      const base64Data = matches[2];
      const buffer = Buffer.from(base64Data, "base64");

      // 验证文件
      const validation = validateImage(mimetype, buffer.length);
      if (!validation.valid) {
        reply.status(400).send({
          code: 1,
          message: validation.error!,
        } as UploadResponse);
        return;
      }

      // 生成文件名
      const ext = mimetype.split("/")[1];
      const filename = `${nanoid(12)}.${ext}`;
      const uploadDir = ensureUploadDir();
      const filepath = join(uploadDir, filename);

      // 处理图片
      const imageInfo = await sharp(buffer).metadata();
      let processedBuffer = buffer;
      if (imageInfo.width && imageInfo.width > 2000) {
        processedBuffer = await sharp(buffer)
          .resize(2000, undefined, { fit: "inside" })
          .toBuffer();
      }

      // 写入文件
      writeFileSync(filepath, processedBuffer);

      // 构建 URL
      const baseUrl = config.publicUrl || `http://localhost:${config.port}`;
      const url = `${baseUrl}/uploads/rich-text/${filename}`;

      reply.send({
        code: 0,
        data: {
          url,
          filename,
          size: processedBuffer.length,
          width: imageInfo.width,
          height: imageInfo.height,
        },
        message: "上传成功",
      } as UploadResponse);
    } catch (err: any) {
      app.log.error({ err }, "Base64 图片上传失败");
      reply.status(500).send({
        code: 1,
        message: `上传失败: ${err.message}`,
      } as UploadResponse);
    }
  });

  // ── DELETE /api/v1/admin/upload/rich-image/:filename — 删除图片 ──
  app.delete("/api/v1/admin/upload/rich-image/:filename", async (request, reply) => {
    try {
      const { filename } = request.params as { filename: string };
      const uploadDir = ensureUploadDir();
      const filepath = join(uploadDir, filename);

      // 安全检查：防止路径遍历
      if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
        reply.status(400).send({
          code: 1,
          message: "无效的文件名",
        });
        return;
      }

      const { unlinkSync } = await import("fs");
      if (existsSync(filepath)) {
        unlinkSync(filepath);
      }

      reply.send({
        code: 0,
        message: "删除成功",
      });
    } catch (err: any) {
      app.log.error({ err }, "删除图片失败");
      reply.status(500).send({
        code: 1,
        message: `删除失败: ${err.message}`,
      });
    }
  });
}
