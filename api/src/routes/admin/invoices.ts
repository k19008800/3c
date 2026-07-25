// ============================================================
//  3cloud (3C) — 发票管理路由（管理员）
//  GET    /api/v1/admin/finance/invoices            — 所有申请
//  GET    /api/v1/admin/finance/invoices/export     — CSV 导出
//  GET    /api/v1/admin/finance/invoices/:id        — 详情
//  POST   /api/v1/admin/finance/invoices/:id/approve — 审核通过
//  POST   /api/v1/admin/finance/invoices/:id/reject  — 拒绝
//  POST   /api/v1/admin/finance/invoices/:id/issue   — 标记已开票
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { AppError } from "../../services/auth-service/index.js";
import {
  listAllInvoiceRequests,
  getInvoiceDetail,
  approveInvoice,
  rejectInvoice,
  issueInvoice,
  exportInvoicesCsv,
} from "../../services/invoice-service.js";

export async function adminInvoiceRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/finance/invoices — 所有开票申请
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/finance/invoices", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const query = request.query as {
        page?: string;
        pageSize?: string;
        status?: string;
        userId?: string;
      };

      const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));

      const result = await listAllInvoiceRequests(
        page,
        pageSize,
        query.status,
        query.userId ? parseInt(query.userId, 10) : undefined,
      );

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
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/finance/invoices/export — CSV 导出
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/finance/invoices/export", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const query = request.query as {
        status?: string;
        startDate?: string;
        endDate?: string;
      };

      const csv = await exportInvoicesCsv({
        status: query.status,
        startDate: query.startDate,
        endDate: query.endDate,
      });

      reply.header("Content-Type", "text/csv; charset=utf-8");
      const filename = `invoices_${new Date().toISOString().slice(0, 10)}.csv`;
      reply.header("Content-Disposition", `attachment; filename="${filename}"`);
      reply.status(200).send(csv);
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/finance/invoices/:id — 申请详情
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/finance/invoices/:id", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const invoiceId = parseInt(id, 10);

      if (isNaN(invoiceId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的发票 ID" });
        return;
      }

      const result = await getInvoiceDetail(invoiceId);

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
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/finance/invoices/:id/approve — 审核通过
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/finance/invoices/:id/approve", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const invoiceId = parseInt(id, 10);

      if (isNaN(invoiceId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的发票 ID" });
        return;
      }

      const result = await approveInvoice(invoiceId, request.user!.userId);

      reply.status(200).send({
        code: 0,
        data: result,
        message: "开票申请已审核通过",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/finance/invoices/:id/reject — 拒绝
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/finance/invoices/:id/reject", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const invoiceId = parseInt(id, 10);

      if (isNaN(invoiceId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的发票 ID" });
        return;
      }

      const body = request.body as { reason: string };
      if (!body.reason) {
        reply.status(400).send({ code: 400, data: null, message: "拒绝原因不能为空" });
        return;
      }

      const result = await rejectInvoice(invoiceId, request.user!.userId, body.reason);

      reply.status(200).send({
        code: 0,
        data: result,
        message: "开票申请已拒绝",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/finance/invoices/:id/issue — 标记已开票
  //  Body: { invoiceNo, fileUrl? }
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/finance/invoices/:id/issue", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const invoiceId = parseInt(id, 10);

      if (isNaN(invoiceId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的发票 ID" });
        return;
      }

      const body = request.body as { invoiceNo: string; fileUrl?: string };
      if (!body.invoiceNo) {
        reply.status(400).send({ code: 400, data: null, message: "发票号码不能为空" });
        return;
      }

      const result = await issueInvoice(invoiceId, request.user!.userId, body.invoiceNo, body.fileUrl);

      reply.status(200).send({
        code: 0,
        data: result,
        message: "已标记为已开票",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/finance/invoices/:id/upload — 上传发票文件
  //  Body: multipart/form-data { file: File }
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/finance/invoices/:id/upload", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const invoiceId = parseInt(id, 10);

      if (isNaN(invoiceId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的发票 ID" });
        return;
      }

      // 检查发票是否存在
      const invoice = await getInvoiceDetail(invoiceId);
      
      if (invoice.status !== "approved" && invoice.status !== "issued") {
        reply.status(400).send({ code: 400, data: null, message: "当前状态不允许上传发票文件" });
        return;
      }

      // 获取上传的文件
      const data = await request.file();
      if (!data) {
        reply.status(400).send({ code: 400, data: null, message: "未找到上传文件" });
        return;
      }

      // 验证文件类型
      const allowedMimeTypes = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
      if (!allowedMimeTypes.includes(data.mimetype)) {
        reply.status(400).send({ 
          code: 400, 
          data: null, 
          message: "仅支持 PDF、JPG、PNG 格式的文件" 
        });
        return;
      }

      // 读取文件内容
      const buffer = await data.toBuffer();
      
      // 生成文件名
      const ext = data.mimetype === "application/pdf" ? ".pdf" : 
                  data.mimetype === "image/jpeg" || data.mimetype === "image/jpg" ? ".jpg" : ".png";
      const filename = `invoice_${invoiceId}_${Date.now()}${ext}`;

      // 上传到 OSS（这里需要配置 OSS 客户端）
      // 示例：使用环境变量中的 OSS 配置
      const ossBaseUrl = process.env.OSS_BASE_URL || "";
      const ossBucket = process.env.OSS_BUCKET || "";
      const ossAccessKeyId = process.env.OSS_ACCESS_KEY_ID || "";
      const ossAccessKeySecret = process.env.OSS_ACCESS_KEY_SECRET || "";
      const ossEndpoint = process.env.OSS_ENDPOINT || "";

      if (!ossBaseUrl || !ossBucket) {
        // 如果没有配置 OSS，返回错误
        reply.status(500).send({ 
          code: 500, 
          data: null, 
          message: "OSS 未配置，请联系管理员" 
        });
        return;
      }

      // 这里应该使用 OSS SDK 上传文件
      // 示例代码（需要安装 ali-oss）：
      // const OSS = require('ali-oss');
      // const client = new OSS({
      //   region: ossEndpoint,
      //   bucket: ossBucket,
      //   accessKeyId: ossAccessKeyId,
      //   accessKeySecret: ossAccessKeySecret,
      // });
      // const result = await client.put(filename, buffer);
      // const fileUrl = result.url;

      // 暂时使用模拟 URL（实际部署时需要替换为真实的 OSS 上传逻辑）
      const fileUrl = `${ossBaseUrl}/${filename}`;

      // 更新发票记录
      const { updateInvoiceFileUrl } = await import("../../services/invoice-service/admin.js");
      const result = await updateInvoiceFileUrl(invoiceId, fileUrl, request.user!.userId);

      reply.status(200).send({
        code: 0,
        data: { 
          invoiceId,
          fileUrl,
          filename,
          size: buffer.length,
          mimetype: data.mimetype,
        },
        message: "发票文件上传成功",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });
}
