// ============================================================
//  3cloud (3C) — Fastify Plugins & Middleware
// ============================================================

import type { FastifyInstance } from "fastify";
import { join } from "node:path";
import { config } from "../config.js";
import { authenticateAdminKey } from "../middleware/adminKeyAuth.js";

export async function registerPlugins(app: FastifyInstance): Promise<void> {
  // ── 允许空 body 的 application/json ──
  // JSON body 解析：空 body 解析为 null，无效 JSON 返回 400
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
    try {
      let buf: Buffer = body as Buffer;
      // 处理 UTF-8 BOM（Windows PowerShell/curl 等工具发送时可能带 BOM）
      if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
        buf = Buffer.from(buf.buffer, buf.byteOffset + 3, buf.length - 3);
      }
      // 进一步清除遗留的 BOM 字符（某些编码转换场景）
      let raw = buf.toString("utf-8").replace(/^\uFEFF/, "").trim();
      if (raw === "") {
        done(null, null); // 空 body -> null（DELETE/GET 无 body 不报错）
        return;
      }
      done(null, JSON.parse(raw));
    } catch (err) {
      // 无效 JSON 返回 400，避免路由层访问 null.something 产生 500
      const parseErr = new Error("请求体不是有效的 JSON");
      (parseErr as any).statusCode = 400;
      (parseErr as any).validation = [{ message: "请求体 JSON 解析失败" }];
      done(parseErr, undefined);
    }
  });

  // ── CORS ──
  await app.register(import("@fastify/cors"), {
    origin: config.cors.origin,
    credentials: true,
  });

  // ── Multipart 文件上传支持 ──
  await app.register(import("@fastify/multipart"), {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB，由业务层二次校验
      files: 1,
    },
  });

  // ── DB & Redis Decorate ──
  const { default: dbPlugin } = await import("../plugins/db.js");
  await app.register(dbPlugin, {});

  // ── 数据库查询超时保护（必须在 DB 插件之后注册）──
  const { default: queryTimeoutPlugin } = await import("../plugins/query-timeout.js");
  await app.register(queryTimeoutPlugin, {});

  // ── 响应压缩 ──
  const { default: compressPlugin } = await import("../plugins/compress.js");
  await app.register(compressPlugin, {});

  // ── 全局限流保护 ──
  const { default: rateLimitPlugin } = await import("../plugins/rate-limit.js");
  await app.register(rateLimitPlugin, {});

  // ── 静态文件服务（用于上传图片访问）──
  await app.register(import("@fastify/static"), {
    root: join(import.meta.dirname, "../public"),
    prefix: "/",
    decorateReply: false,
    wildcard: true,
  });

  // ── 钩子：请求日志 ──
  app.addHook("onRequest", async (request) => {
    request.log.info({ url: request.url, method: request.method }, "incoming request");
  });

  // ── 管理 API Key 全局鉴权（优先于 JWT）──
  // 如果 X-Admin-Key 存在则跳过 JWT，否则降级到 JWT
  app.addHook("onRequest", authenticateAdminKey);
}
