// PERF: 移除了 @ts-nocheck，使用显式类型断言解决 Drizzle 泛型约束
// ============================================================
//  3cloud (3C) — 通用分页查询辅助
//  消除 invoice-service / refund-service / agent-core 等
//  10 个服务文件中的重复分页逻辑。
// ============================================================

import { getDb } from "../db/index.js";
import { and, desc, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { PaginatedResult } from "../middleware/response.js";

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
  where?: SQL[];
  orderBy?: ReturnType<typeof desc>;
  /** 是否返回 count（默认 true），设为 false 跳过总数查询 */
  withCount?: boolean;
}

/**
 * 通用分页查询 —— 封装 select + count + offset/limit
 *
 * @example
 * const result = await paginate(db, invoiceRequests, {
 *   page: 1, pageSize: 20,
 *   where: [eq(invoiceRequests.status, 'pending')],
 *   orderBy: desc(invoiceRequests.createdAt),
 * })
 * // result = { list, total, page, pageSize }
 */
export async function paginate(
  table: any,
  options: PaginationOptions,
): Promise<PaginatedResult<any>> {
  const db = getDb();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  const whereClause = options.where?.length ? and(...options.where) : undefined;
  const orderClause = options.orderBy ?? undefined;

  // PERF: 使用 $dynamic() + 类型断言解决 Drizzle 泛型链式调用问题
  const query = (db.select().from(table as any).$dynamic() as any);
  if (whereClause) query.where(whereClause);
  if (orderClause) query.orderBy(orderClause);
  query.limit(pageSize).offset(offset);

  const rows = await query;

  let total = 0;
  if (options.withCount !== false) {
    // PERF: 使用 COUNT(*)（大写）语义更清晰，PostgreSQL 无性能差异但更规范
    const countQuery = (db
      .select({ count: sql<number>`COUNT(*)` })
      .from(table as any)
      .$dynamic() as any);
    if (whereClause) countQuery.where(whereClause);

    const [countResult] = await countQuery;
    total = Number(countResult?.count ?? 0);
  }

  return { list: rows as any, total, page, pageSize };
}
