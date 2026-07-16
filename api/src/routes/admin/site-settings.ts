// ============================================================
//  3cloud (3C) — 站点基础信息管理路由（管理员）
//  GET    /api/v1/admin/site-settings           — 获取全量站点配置
//  PUT    /api/v1/admin/site-settings           — 批量更新站点配置
//  POST   /api/v1/admin/site-settings/upload    — 上传图片（Logo/二维码等）
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, sql, like } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { systemConfigs, auditLogs } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { pipeline } from "node:stream/promises";
import { createWriteStream, existsSync, mkdirSync, renameSync, unlinkSync } from "node:fs";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { ResizeOptions } from "sharp";

// ── 站点配置允许的 key 列表 ──
const SITE_KEYS = new Set([
  "site_name",
  "site_logo_url",
  "site_favicon_url",
  "site_icp",
  "site_icp_link",
  "site_police_icp",
  "site_copyright",
  "site_company_name",
  "site_contact_email",
  "site_contact_phone",
  "site_wechat_qr_url",
  "site_footer_html",
]);

// ── 上传目录（相对于项目根） ──
const UPLOAD_DIR = join(import.meta.dirname, "../../../public/uploads/site");
const UPLOAD_PREFIX = "/uploads/site";

// ── 不同字段的图片处理规则 ──
// 上传后自动缩放到显示尺寸，保持页面不失真
const PROCESS_RULES: Record<string, {
  label: string;
  maxW: number;
  maxH: number;
  fit: "inside" | "cover";
}> = {
  site_logo_url:      { label: "Logo",             maxW: 400,  maxH: 120,  fit: "inside" },
  site_favicon_url:   { label: "Favicon",          maxW: 32,   maxH: 32,   fit: "cover"  },
  site_wechat_qr_url: { label: "公众号二维码",    maxW: 300,  maxH: 300,  fit: "inside" },
};

// 通用上传限制
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME = new Set([
  "image/png", "image/jpeg", "image/jpg", "image/gif",
  "image/webp", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon",
]);

export async function adminSiteSettingsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/site-settings — 获取全量站点配置
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/site-settings", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (_request, reply) => {
    const db = getDb();

    const rows = await db
      .select({
        key: systemConfigs.key,
        value: systemConfigs.value,
        description: systemConfigs.description,
        updatedAt: systemConfigs.updatedAt,
        updatedBy: systemConfigs.updatedBy,
      })
      .from(systemConfigs)
      .where(like(systemConfigs.key, "site_%"))
      .orderBy(systemConfigs.key);

    // 组装为 key-value 对象
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value ?? "";
    }

    reply.status(200).send({
      code: 0,
      data: {
        settings,
        // 返回完整列表供前端展示元信息
        meta: rows.map((r) => ({
          key: r.key,
          description: r.description,
          updatedAt: r.updatedAt?.toISOString() ?? null,
        })),
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  PUT /api/v1/admin/site-settings — 批量更新
  // ──────────────────────────────────────────────

  app.put("/api/v1/admin/site-settings", {
    preHandler: [requirePerm(Perm.CONFIG_EDIT)],
  }, async (request, reply) => {
    const db = getDb();
    const operatorId = request.user!.userId;
    const body = request.body as Record<string, string>;

    if (!body || typeof body !== "object") {
      reply.status(400).send({ code: 400, data: null, message: "请求体需为 JSON 对象" });
      return;
    }

    // 过滤只允许 site_* 的 key
    const updates: { key: string; value: string }[] = [];
    for (const [key, value] of Object.entries(body)) {
      if (SITE_KEYS.has(key)) {
        updates.push({ key, value: String(value ?? "") });
      }
    }

    if (updates.length === 0) {
      reply.status(400).send({ code: 400, data: null, message: "没有有效的站点配置字段" });
      return;
    }

    const beforeSnapshot: Record<string, string> = {};

    await db.transaction(async (tx) => {
      for (const u of updates) {
        // 读更新前值
        const [existing] = await tx
          .select({ value: systemConfigs.value })
          .from(systemConfigs)
          .where(eq(systemConfigs.key, u.key))
          .limit(1);

        if (existing) {
          beforeSnapshot[u.key] = existing.value ?? "";

          await tx
            .update(systemConfigs)
            .set({
              value: u.value,
              updatedBy: operatorId,
              updatedAt: sql`NOW()`,
            })
            .where(eq(systemConfigs.key, u.key));
        } else {
          // key 不存在则插入
          await tx.insert(systemConfigs).values({
            key: u.key,
            value: u.value,
            description: u.key.replace("site_", "").replace(/_/g, " "),
            updatedBy: operatorId,
          });
        }
      }

      // 审计日志
      await tx.insert(auditLogs).values({
        operatorId,
        action: "config_update",
        targetType: "config",
        targetId: 0,
        before: beforeSnapshot,
        after: Object.fromEntries(updates.map((u) => [u.key, u.value])),
        ip: request.ip,
        description: `批量更新站点配置: ${updates.length} 项`,
      });
    });

    reply.status(200).send({
      code: 0,
      data: { updated: updates.length },
      message: `已更新 ${updates.length} 项站点配置`,
    });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/site-settings/upload — 上传图片
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/site-settings/upload", {
    preHandler: [requirePerm(Perm.CONFIG_EDIT)],
  }, async (request, reply) => {
    // 确保上传目录存在
    if (!existsSync(UPLOAD_DIR)) {
      mkdirSync(UPLOAD_DIR, { recursive: true });
    }

    const data = await request.file();

    if (!data) {
      reply.status(400).send({ code: 400, data: null, message: "未上传文件" });
      return;
    }

    if (!ALLOWED_MIME.has(data.mimetype)) {
      reply.status(400).send({
        code: 400,
        data: null,
        message: `不支持的文件类型: ${data.mimetype}，仅允许图片文件`,
      });
      return;
    }

    // 校验文件大小
    if (data.file.bytesRead > MAX_SIZE_BYTES) {
      reply.status(400).send({
        code: 400,
        data: null,
        message: "文件大小不能超过 5MB",
      });
      return;
    }

    // 生成唯一文件名
    const ext = extname(data.filename) || ".png";
    const filename = `${randomUUID()}${ext}`;
    const filePath = join(UPLOAD_DIR, filename);

    // 写入文件
    const ws = createWriteStream(filePath);
    await pipeline(data.file, ws);

    // 获取 upload_type（multipart 非文件字段是 MultipartValue，通过 .value 读取）
    const fields = data.fields;
    const uploadType =
      fields?.upload_type && typeof fields.upload_type === "object" && "value" in (fields.upload_type as any)
        ? String((fields.upload_type as any).value)
        : undefined;
    const rule = uploadType ? PROCESS_RULES[uploadType] : undefined;

    let width = 0, height = 0, outputSize = 0;
    let actualFilePath = filePath;
    let actualFilename = filename;

    // SVG 无法被 sharp 处理，直接跳过
    const isVector = data.mimetype === "image/svg+xml" || data.mimetype === "image/x-icon";

    if (rule && !isVector) {
      // 统一输出为 .png，用临时文件避免 sharp 读写同一路径
      const pngFilename = filename.replace(/\.\w+$/, "") + ".png";
      const pngPath = join(UPLOAD_DIR, pngFilename);

      // 用临时文件做输出，再 rename 到最终路径
      const tmpPath = pngPath + ".tmp";

      const img = sharp(filePath);

      const resizeOpts: ResizeOptions = rule.fit === "cover"
        ? { width: rule.maxW, height: rule.maxH, fit: "cover", position: "centre", withoutEnlargement: true }
        : { width: rule.maxW, height: rule.maxH, fit: "inside", withoutEnlargement: true };

      // 缩放到临时文件
      await img.resize(resizeOpts).png({ quality: 90 }).toFile(tmpPath);

      // 删除原文件（已用不上），rename 临时文件到目标路径
      try { unlinkSync(filePath); } catch {}
      try { unlinkSync(pngPath); } catch {}
      renameSync(tmpPath, pngPath);

      actualFilePath = pngPath;
      actualFilename = pngFilename;

      const outMeta = await sharp(actualFilePath).metadata();
      width = outMeta.width ?? 0;
      height = outMeta.height ?? 0;
      outputSize = outMeta.size ?? 0;
    } else {
      // 无处理规则 / SVG → 仅获取尺寸信息
      try {
        const meta = await sharp(filePath).metadata();
        width = meta.width ?? 0;
        height = meta.height ?? 0;
        outputSize = (await sharp(filePath).toBuffer()).length;
      } catch { /* 忽略无法解析的格式 */ }
    }

    // 构造 URL
    const url = `${UPLOAD_PREFIX}/${actualFilename}`;

    reply.status(200).send({
      code: 0,
      data: {
        url,
        filename,
        width,
        height,
        size: outputSize || data.file.bytesRead,
        mimetype: "image/png",  // sharp 输出统一为 PNG
        originalSize: data.file.bytesRead,
        processed: !!rule,
      },
      message: "上传成功",
    });
  });
}
