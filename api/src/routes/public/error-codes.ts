// ============================================================
//  3cloud (3C) — 公开错误码参考文档 API
//  GET /api/v1/public/error-codes — 错误码列表
//  GET /api/v1/public/error-codes/:code — 错误码详情
// ============================================================

import { FastifyInstance } from "fastify";
import {
  ERROR_CODES,
  ERROR_CATEGORIES,
  getErrorCode,
  getErrorCodesByCategory,
  searchErrorCodes,
  type ErrorCodeDefinition,
} from "../../constants/error-codes.js";

interface ErrorCodeListResponse {
  code: number;
  data: {
    categories: typeof ERROR_CATEGORIES;
    errorCodes: ErrorCodeDefinition[];
    total: number;
  };
  message: string;
}

interface ErrorCodeDetailResponse {
  code: number;
  data: ErrorCodeDefinition;
  message: string;
}

export async function publicErrorCodesRoutes(app: FastifyInstance) {
  // ──────────────────────────────────────────────
  //  GET /api/v1/public/error-codes — 错误码列表
  //  Query: category, search, severity
  // ──────────────────────────────────────────────

  app.get<{
    Querystring: {
      category?: string;
      search?: string;
      severity?: 'error' | 'warning' | 'info';
    };
    Reply: ErrorCodeListResponse;
  }>("/api/v1/public/error-codes", async (request, reply) => {
    const { category, search, severity } = request.query;

    let errorCodes: ErrorCodeDefinition[];

    // 搜索优先
    if (search && search.trim()) {
      errorCodes = searchErrorCodes(search.trim());
    } else if (category) {
      errorCodes = getErrorCodesByCategory(category);
    } else {
      errorCodes = Object.values(ERROR_CODES);
    }

    // 按严重程度过滤
    if (severity) {
      errorCodes = errorCodes.filter((def) => def.severity === severity);
    }

    // 排序：按 code 升序
    errorCodes.sort((a, b) => a.code.localeCompare(b.code));

    reply.status(200).send({
      code: 0,
      data: {
        categories: [...ERROR_CATEGORIES],
        errorCodes,
        total: errorCodes.length,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/public/error-codes/:code — 错误码详情
  // ──────────────────────────────────────────────

  app.get<{
    Params: { code: string };
    Reply: ErrorCodeDetailResponse | { code: number; error: string; message: string };
  }>("/api/v1/public/error-codes/:code", async (request, reply) => {
    const { code } = request.params;

    const definition = getErrorCode(code);

    if (!definition) {
      reply.status(404).send({
        code: 1,
        error: `错误码 ${code} 不存在`,
        message: "Error code not found",
      });
      return;
    }

    reply.status(200).send({
      code: 0,
      data: definition,
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/public/error-codes/categories — 分类列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/public/error-codes/categories", async (_request, reply) => {
    // 统计每个分类的错误码数量
    const categoryStats = ERROR_CATEGORIES.map((cat) => {
      const codes = getErrorCodesByCategory(cat.key);
      return {
        ...cat,
        count: codes.length,
      };
    });

    reply.status(200).send({
      code: 0,
      data: {
        categories: categoryStats,
        total: Object.keys(ERROR_CODES).length,
      },
      message: "ok",
    });
  });
}
