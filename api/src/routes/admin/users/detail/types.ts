import type { FastifyReply } from "fastify";

/**
 * 解析并验证用户 ID 参数。
 * 无效时自动回复 400 并返回 null。
 */
export function validateUserId(id: string, reply: FastifyReply): number | null {
  const userId = parseInt(id, 10);
  if (isNaN(userId)) {
    reply.status(400).send({ code: 400, data: null, message: "无效的用户 ID" });
    return null;
  }
  return userId;
}

/**
 * 通用的分页/游标查询参数解析。
 */
export interface PageQuery {
  page?: string;
  pageSize?: string;
  cursor?: string;
}

export interface CallLogsQuery extends PageQuery {
  startDate?: string;
  endDate?: string;
  modelName?: string;
  status?: string;
}

export interface CallStatsQuery {
  startDate?: string;
  endDate?: string;
}

export interface CallTrendsQuery {
  days?: string;
  granularity?: string;
}
